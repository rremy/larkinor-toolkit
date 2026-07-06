# lc-userscript Design Spec
**Date:** 2026-07-06  
**Project:** lcenter / Larkinor mobile UI  
**Status:** Approved

---

## Overview

A ViolentMonkey userscript that replaces the aging Larkinor browser RPG UI with a mobile-first Preact-powered interface, without touching the game server. The game's original HTML forms remain in the DOM (hidden) and act as the controller; Preact renders the view.

---

## Stack

| Concern | Choice |
|---|---|
| Build tool | Vite + vite-plugin-monkey |
| UI framework | Preact |
| Language | TypeScript |
| Styling | CSS custom properties (matching lc-database dark-medieval theme) |
| Script hosting | Static file on own server or GitHub raw |
| Browser target | Firefox for Android + ViolentMonkey |

---

## Two-Script Architecture

### Configuration constant

`SCRIPT_URL` in the loader and `MONSTERS_JSON_URL` in `monsters.ts` are the only two values that need to be updated when changing hosting. Both are defined as top-level `const` strings — replace `<your-domain>` with the actual domain before deploying.

### Script 1 — Loader (`loader/larkinor-loader.user.js`)

Hand-written, no build step. Installed once in ViolentMonkey and rarely changed. Its only job is to fetch and execute the main script from the remote server.

```
// ==UserScript==
// @name         Larkinor UI Loader
// @namespace    https://lcenter.local/
// @version      1.0.0
// @description  Loads the Larkinor UI enhancement script from the remote server
// @match        https://larkinor.hu/*
// @match        https://l2.larkinor.hu/*
// @grant        GM_xmlhttpRequest
// @connect      <your-domain>
// @run-at       document-end
// ==/UserScript==

(function () {
  const SCRIPT_URL = 'https://<your-domain>/larkinor-ui.user.js';
  GM_xmlhttpRequest({
    method: 'GET',
    url: SCRIPT_URL + '?v=' + Date.now(),
    onload: function (r) {
      if (r.status === 200) eval(r.responseText);
    },
    onerror: function () {
      console.warn('[Larkinor UI Loader] Failed to load main script');
    },
  });
})();
```

**Why `GM_xmlhttpRequest` + `eval` over `@require`:** `@require` caches the remote script; `GM_xmlhttpRequest` with a cache-bust query param always fetches fresh, so deploying a new build on the server takes effect immediately without reinstalling the loader.

### Script 2 — Main Script (built by Vite)

Output: `dist/larkinor-ui.user.js` — single self-contained file including Preact, all components, and bundled CSS. Served statically.

**Userscript metadata block** (managed by vite-plugin-monkey):
```
// @name         Larkinor UI
// @namespace    https://lcenter.local/
// @version      0.1.0
// @match        https://larkinor.hu/*
// @match        https://l2.larkinor.hu/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      l2.larkinor.hu
// @connect      <your-domain>
// @run-at       document-end
```

---

## Development Workflow

```bash
# Install deps
cd lc-userscript
npm install

# Dev mode — vite generates a localhost-connected .user.js
# Install that in ViolentMonkey for hot-reload during development
npm run dev

# Production build — generates dist/larkinor-ui.user.js
npm run build

# Serve locally for testing
npm run serve   # python3 -m http.server 9000 --directory dist
```

---

## Project Structure

```
lc-userscript/
├── src/
│   ├── main.ts                 # Entry: page detection → mount Preact root
│   ├── pages/
│   │   ├── FreeMove.tsx        # Map navigation, stats, action grid
│   │   └── Battle.tsx          # Monster panel, narration, action button
│   ├── components/
│   │   ├── NavPad.tsx          # D-pad movement buttons (N/S/E/W + look)
│   │   ├── StatBar.tsx         # HP / Mana / Gold visual bars
│   │   ├── MonsterCard.tsx     # Monster detail drawer (slide-up panel)
│   │   └── NarrationPanel.tsx  # Narration text with tappable monster links
│   ├── data/
│   │   └── monsters.ts         # Fetch monsters.json + GM_setValue cache
│   ├── styles/
│   │   └── base.css            # Dark medieval CSS vars (--bg, --accent, etc.)
│   └── utils/
│       ├── pageDetector.ts     # URL/DOM → PageType enum
│       └── domExtract.ts       # Read game state from hidden original DOM
├── loader/
│   └── larkinor-loader.user.js # Hand-written loader, no build step
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## Page Detection

`pageDetector.ts` inspects `window.location` and key DOM elements to return a `PageType` enum value before any rendering occurs.

```typescript
enum PageType {
  FreeMove,
  Battle,
  Shop,
  Church,
  Unknown,
}
```

Detection strategy (in priority order):
1. Presence of specific DOM elements — this is the primary reliable signal since the game's URL structure is not fully mapped: a compass/arrow nav block → `FreeMove`; a monster image in the main panel → `Battle`; buy/sell form headers → `Shop`; healing/mana item form → `Church`
2. URL query params or path segments as a secondary signal if the game uses consistent params
3. Narration text patterns as a final fallback

**Note:** The exact DOM selectors for each page type must be verified against live game pages during implementation. The page detector should log unrecognised pages to the console rather than crashing.

---

## Proxy DOM Pattern

`domExtract.ts` is responsible for reading all needed game state from the original HTML **before** it is hidden. It returns typed objects:

```typescript
interface FreeMoveState {
  playerName: string;
  level: number;
  maxLevel: number;
  gold: number;
  hp: number;
  hpMax: number;
  mp: number;
  mpMax: number;
  locationImageUrl: string;
  availableDirections: Direction[];
  actions: Action[];        // e.g. [{label: 'kajálsz', formValue: '...'}]
  narration: string;
}

interface BattleState {
  monsterName: string;
  monsterImageUrl: string;
  narration: string;
  actions: Action[];        // e.g. 'megtámadod', 'elmenekülsz', 'megpróbálod elkapni'
  hp: number;
  hpMax: number;
  mp: number;
  mpMax: number;
}
```

After extraction, the original game elements are moved into a hidden off-screen container (`position: absolute; left: -9999px; visibility: hidden`), then Preact mounts into a fresh `#lc-root` container appended to `document.body`. The original elements remain alive in the DOM so form submissions and link navigations still work.

`domExtract.ts` also exposes `submitAction(action)` which triggers the corresponding original element — either `.click()` on an `<a>` tag or `.submit()` on a `<form>`, depending on what the game uses for that action. Both cases are handled.

---

## Free Movement Screen

**Layout** (vertical, full-viewport):
```
┌──────────────────────────────┐
│  Location image (full-width) │
├──────────────────────────────┤
│  StatBar: ❤ HP  ✨ MP  💰 G  │
├──────────────────────────────┤
│        NavPad (D-pad)        │
│         [N]                  │
│      [W][ ][E]               │
│         [S]                  │
├──────────────────────────────┤
│  Action buttons (grid)       │
│  [kajálsz]  [...]            │
├──────────────────────────────┤
│  NarrationPanel              │
│  (narration text here)       │
└──────────────────────────────┘
```

- `NavPad` renders `<button>` elements; each click submits the corresponding direction via the hidden form
- Action dropdown replaced by a button grid, one button per available action
- `StatBar` shows HP and MP as visual fill bars in addition to numbers

---

## Battle Screen

**Layout**:
```
┌──────────────────────────────┐
│  Monster image (full-width)  │
├──────────────────────────────┤
│  Monster name  [Lvl badge]   │
├──────────────────────────────┤
│  NarrationPanel              │
│  (battle narration, monster  │
│   names are tappable links)  │
├──────────────────────────────┤
│  StatBar: ❤ HP  ✨ MP        │
├──────────────────────────────┤
│  [  megtámadod  ]            │
│  [  elmenekülsz ]            │
└──────────────────────────────┘
```

- Action buttons are full-width, large tap targets
- `NarrationPanel` parses battle text for monster names

---

## Monster Tooltip (NarrationPanel + MonsterCard)

### Data loading

`monsters.ts` fetches `monsters.json` from the server (same origin as the main script). The result is cached via `GM_setValue('monsters_cache', JSON.stringify(data))` with a `GM_setValue('monsters_cache_version', hash)` key. On subsequent loads, the cache is used unless the server returns a different ETag/hash.

### Name detection

On first load, a `Map<string, Monster>` is built keyed by lowercase monster name. A regex is constructed from all names sorted longest-first (to avoid partial matches):

```typescript
const pattern = new RegExp(
  `(${[...monsterMap.keys()]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex)
    .join('|')})`,
  'gi'
);
```

`NarrationPanel` splits the narration string on this regex and wraps matches in `<span class="lc-monster-link">`.

### MonsterCard drawer

Tapping a monster link sets a `selectedMonster` signal. `MonsterCard` renders as a bottom drawer (slides up) showing:
- Monster image (`https://l2.larkinor.hu/pic/szornyk/<img>`)
- Name, level
- HP / MP
- Attack type
- Debuff
- Drop list with quantities

Tap outside or a close button dismisses it.

---

## CSS Design System

Inherits the same CSS custom properties established in `lc-database/explorer.html`:

```css
:root {
  --bg: #1a1410;
  --panel: #25201b;
  --panel-2: #2f2922;
  --border: #3d342a;
  --text: #e8dcc5;
  --muted: #9d8e75;
  --accent: #d4a259;
  --bad: #c46161;
  --good: #6fb56f;
}
```

All injected elements use the `lc-` class prefix to avoid collisions with game CSS.

---

## Out of Scope (v1)

- Shop screens (buy/sell)
- Church / temple screen
- Inventory management
- Chat / social features
- Offline mode / service worker
- iOS Safari support (Firefox for Android only)
