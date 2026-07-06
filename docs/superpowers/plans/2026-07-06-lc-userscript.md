# lc-userscript Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Vite + Preact + TypeScript ViolentMonkey userscript that replaces the Larkinor browser RPG's aging UI with a mobile-first interface, served remotely and loaded via a tiny hand-written loader script.

**Architecture:** A proxy DOM pattern — the original game HTML is moved off-screen on load; Preact mounts a fresh UI that reads extracted game state and triggers hidden original elements for form submissions. A hand-written loader script is the only thing installed in ViolentMonkey; it fetches and evals the built main script from a remote server.

**Tech Stack:** Vite 5, vite-plugin-monkey 4, Preact 10, TypeScript 5, Vitest 1, @testing-library/preact 3, jsdom 24.

## Global Constraints

- All class names and IDs injected into the page must use the `lc-` prefix to avoid collisions with game CSS.
- CSS must use the custom properties defined in `src/styles/base.css` — never hardcoded hex values.
- All identifiers and comments must be in English (game text/labels are Hungarian and stay as-is).
- Target browser: Firefox for Android with ViolentMonkey extension. No iOS Safari support in v1.
- The original game DOM must never be permanently destroyed — it is moved off-screen and used for form submission.
- `SCRIPT_URL` in the loader and `MONSTERS_JSON_URL` in `monsters.ts` are the only deployment-specific constants.
- Shop, Church, Inventory, and other non-priority screens are out of scope for v1 — `PageType.Unknown` pages must not crash, just log to console.

---

## File Map

```
lc-userscript/
├── src/
│   ├── main.ts                       Create  Entry point
│   ├── pages/
│   │   ├── FreeMove.tsx              Create  Free movement screen
│   │   └── Battle.tsx                Create  Battle screen
│   ├── components/
│   │   ├── NavPad.tsx                Create  D-pad movement buttons
│   │   ├── StatBar.tsx               Create  HP/MP/Gold bars
│   │   ├── MonsterCard.tsx           Create  Bottom-drawer monster detail
│   │   └── NarrationPanel.tsx        Create  Narration text w/ monster links
│   ├── data/
│   │   └── monsters.ts               Create  Fetch + GM_setValue cache
│   ├── styles/
│   │   └── base.css                  Create  CSS custom properties + reset
│   └── utils/
│       ├── pageDetector.ts           Create  URL/DOM → PageType enum
│       └── domExtract.ts             Create  Read + hide original game DOM
├── tests/
│   ├── setup.ts                      Create  GM_* mocks, jsdom config
│   ├── pageDetector.test.ts          Create
│   ├── domExtract.test.ts            Create
│   ├── monsters.test.ts              Create
│   ├── StatBar.test.tsx              Create
│   ├── NavPad.test.tsx               Create
│   ├── NarrationPanel.test.tsx       Create
│   └── MonsterCard.test.tsx          Create
├── loader/
│   └── larkinor-loader.user.js       Create  Hand-written loader
├── vite.config.ts                    Create
├── tsconfig.json                     Create
└── package.json                      Create
```

---

## Task 1: Project scaffold

**Files:**
- Create: `lc-userscript/package.json`
- Create: `lc-userscript/tsconfig.json`
- Create: `lc-userscript/vite.config.ts`
- Create: `lc-userscript/tests/setup.ts`

**Interfaces:**
- Produces: `npm run dev`, `npm run build`, `npm test` commands that work

- [ ] **Step 1: Create the project directory and package.json**

```bash
mkdir -p /Users/robert.remenyi/Documents/Dev/lcenter/lc-userscript/src/{pages,components,data,styles,utils}
mkdir -p /Users/robert.remenyi/Documents/Dev/lcenter/lc-userscript/{tests,loader}
```

Create `lc-userscript/package.json`:
```json
{
  "name": "lc-userscript",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "serve": "python3 -m http.server 9000 --directory dist"
  },
  "dependencies": {
    "preact": "^10.23.0"
  },
  "devDependencies": {
    "@preact/preset-vite": "^2.8.2",
    "@testing-library/preact": "^3.2.4",
    "@testing-library/user-event": "^14.5.2",
    "@types/tampermonkey": "^4.20.0",
    "@types/node": "^20.14.0",
    "typescript": "^5.5.0",
    "vite": "^5.3.0",
    "vite-plugin-monkey": "^4.0.0",
    "vitest": "^1.6.0",
    "jsdom": "^24.1.0",
    "@vitest/coverage-v8": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

Create `lc-userscript/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "strict": true,
    "skipLibCheck": true,
    "lib": ["ES2020", "DOM"],
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src", "tests"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create vite.config.ts**

Create `lc-userscript/vite.config.ts`:
```typescript
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import monkey from 'vite-plugin-monkey';

export default defineConfig({
  resolve: {
    alias: { '@': '/src' },
  },
  plugins: [
    preact(),
    monkey({
      entry: 'src/main.ts',
      userscript: {
        name: 'Larkinor UI',
        namespace: 'https://lcenter.local/',
        version: '0.1.0',
        description: 'Mobile-friendly UI for Larkinor browser RPG',
        match: ['https://larkinor.hu/*', 'https://l2.larkinor.hu/*'],
        grant: [
          'GM_addStyle',
          'GM_getValue',
          'GM_setValue',
          'GM_xmlhttpRequest',
        ],
        connect: ['l2.larkinor.hu'],
        'run-at': 'document-end',
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
    globals: true,
  },
});
```

- [ ] **Step 4: Create tests/setup.ts — GM_* mocks**

Create `lc-userscript/tests/setup.ts`:
```typescript
import { vi } from 'vitest';

const gmStore: Record<string, string> = {};

// ViolentMonkey GM_* APIs are not available in jsdom — mock them globally
Object.assign(globalThis, {
  GM_addStyle: vi.fn(),
  GM_getValue: vi.fn((key: string, fallback?: string) => gmStore[key] ?? fallback ?? null),
  GM_setValue: vi.fn((key: string, value: string) => { gmStore[key] = value; }),
  GM_xmlhttpRequest: vi.fn(),
});
```

- [ ] **Step 5: Install dependencies**

```bash
cd /Users/robert.remenyi/Documents/Dev/lcenter/lc-userscript && npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 6: Verify test runner works**

```bash
cd /Users/robert.remenyi/Documents/Dev/lcenter/lc-userscript && npm test
```

Expected: `No test files found` (or 0 tests pass). Not an error — just empty.

- [ ] **Step 7: Commit**

```bash
cd /Users/robert.remenyi/Documents/Dev/lcenter/lc-userscript
git add package.json tsconfig.json vite.config.ts tests/setup.ts
git commit -m "feat: scaffold lc-userscript project (Vite + Preact + TS)"
```

---

## Task 2: Loader script

**Files:**
- Create: `lc-userscript/loader/larkinor-loader.user.js`

**Interfaces:**
- Produces: a ready-to-install ViolentMonkey userscript that fetches and evals the main script

- [ ] **Step 1: Create the loader script**

Create `lc-userscript/loader/larkinor-loader.user.js`:
```javascript
// ==UserScript==
// @name         Larkinor UI Loader
// @namespace    https://lcenter.local/
// @version      1.0.0
// @description  Loads the Larkinor UI enhancement script from the remote server
// @author       lcenter
// @match        https://larkinor.hu/*
// @match        https://l2.larkinor.hu/*
// @grant        GM_xmlhttpRequest
// @connect      YOUR_DOMAIN_HERE
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  // Replace with your actual hosting URL before installing
  const SCRIPT_URL = 'https://YOUR_DOMAIN_HERE/larkinor-ui.user.js';

  GM_xmlhttpRequest({
    method: 'GET',
    url: SCRIPT_URL + '?v=' + Date.now(),
    onload: function (response) {
      if (response.status === 200) {
        // eslint-disable-next-line no-eval
        eval(response.responseText);
      } else {
        console.warn('[Larkinor UI Loader] Unexpected status:', response.status);
      }
    },
    onerror: function () {
      console.warn('[Larkinor UI Loader] Failed to load main script from', SCRIPT_URL);
    },
  });
})();
```

- [ ] **Step 2: Verify the file is valid JS (no syntax errors)**

```bash
node --check /Users/robert.remenyi/Documents/Dev/lcenter/lc-userscript/loader/larkinor-loader.user.js
```

Expected: no output (exit 0 = valid syntax).

- [ ] **Step 3: Commit**

```bash
cd /Users/robert.remenyi/Documents/Dev/lcenter/lc-userscript
git add loader/larkinor-loader.user.js
git commit -m "feat: add hand-written ViolentMonkey loader script"
```

---

## Task 3: Base CSS + design tokens

**Files:**
- Create: `lc-userscript/src/styles/base.css`

**Interfaces:**
- Produces: CSS string importable by `main.ts` via `import styles from '@/styles/base.css?raw'` and applied with `GM_addStyle(styles)`

- [ ] **Step 1: Create base.css**

Create `lc-userscript/src/styles/base.css`:
```css
/* ================================================================
   Larkinor UI — injected styles
   All selectors scoped under #lc-root or .lc-* to avoid collisions
   ================================================================ */

:root {
  --bg: #1a1410;
  --panel: #25201b;
  --panel-2: #2f2922;
  --border: #3d342a;
  --text: #e8dcc5;
  --muted: #9d8e75;
  --accent: #d4a259;
  --accent-dim: rgba(212, 162, 89, 0.18);
  --bad: #c46161;
  --good: #6fb56f;
}

/* Off-screen container for original game DOM (proxy DOM pattern) */
#lc-offscreen {
  position: absolute;
  left: -9999px;
  top: -9999px;
  width: 1px;
  height: 1px;
  overflow: hidden;
  visibility: hidden;
  pointer-events: none;
}

/* Root mount point */
#lc-root {
  font-family: -apple-system, 'Segoe UI', sans-serif;
  font-size: 16px;
  line-height: 1.5;
  background: var(--bg);
  color: var(--text);
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

#lc-root *,
#lc-root *::before,
#lc-root *::after {
  box-sizing: inherit;
}

/* Page layout wrapper */
.lc-page {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  max-width: 600px;
  margin: 0 auto;
  width: 100%;
}

/* Hero image (location / monster) */
.lc-hero-img {
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  display: block;
  border-bottom: 2px solid var(--border);
}

/* Section divider */
.lc-section {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}

/* Buttons */
.lc-btn {
  display: block;
  width: 100%;
  padding: 14px 16px;
  background: var(--panel);
  border: 1px solid var(--border);
  color: var(--text);
  font-size: 16px;
  font-family: inherit;
  cursor: pointer;
  border-radius: 4px;
  text-align: center;
  margin-bottom: 8px;
  transition: background 0.15s, border-color 0.15s;
}

.lc-btn:last-child {
  margin-bottom: 0;
}

.lc-btn:active {
  background: var(--accent-dim);
  border-color: var(--accent);
}

/* Monster link in narration text */
.lc-monster-link {
  color: var(--accent);
  text-decoration: underline dotted;
  cursor: pointer;
  font-weight: 600;
}

/* Bottom drawer overlay */
.lc-drawer-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 1000;
  display: flex;
  align-items: flex-end;
}

.lc-drawer {
  width: 100%;
  max-height: 80dvh;
  background: var(--panel);
  border-top: 2px solid var(--border);
  border-radius: 12px 12px 0 0;
  overflow-y: auto;
  padding: 16px;
  animation: lc-slide-up 0.2s ease-out;
}

@keyframes lc-slide-up {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}

.lc-drawer-close {
  position: absolute;
  top: 12px;
  right: 12px;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--muted);
  width: 32px;
  height: 32px;
  border-radius: 4px;
  font-size: 18px;
  cursor: pointer;
  line-height: 1;
  padding: 0;
}

.lc-drawer-close:active {
  color: var(--accent);
  border-color: var(--accent);
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/robert.remenyi/Documents/Dev/lcenter/lc-userscript
git add src/styles/base.css
git commit -m "feat: add base CSS design tokens and layout primitives"
```

---

## Task 4: pageDetector utility

**Files:**
- Create: `lc-userscript/src/utils/pageDetector.ts`
- Create: `lc-userscript/tests/pageDetector.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export enum PageType { FreeMove = 'FreeMove', Battle = 'Battle', Shop = 'Shop', Church = 'Church', Unknown = 'Unknown' }
  export function detectPage(doc: Document): PageType
  ```

> **Implementation note:** The exact DOM selectors depend on the live game HTML. The selectors below are best-guess heuristics based on screenshots of a 2000s PHP RPG. During manual testing (Task 14), verify these selectors against the live game and update if needed. The test fixtures use synthetic HTML that mirrors the expected structure.

- [ ] **Step 1: Write the failing tests**

Create `lc-userscript/tests/pageDetector.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { detectPage, PageType } from '../src/utils/pageDetector';

function makeDoc(bodyHtml: string): Document {
  return new JSDOM(`<html><body>${bodyHtml}</body></html>`).window.document;
}

describe('detectPage', () => {
  it('returns FreeMove when compass navigation is present', () => {
    // Game compass: a table with directional links (N/S/E/W)
    const doc = makeDoc(`
      <table class="irany">
        <tr><td><a href="?dir=north">É</a></td></tr>
        <tr><td><a href="?dir=west">Ny</a></td><td><a href="?dir=east">K</a></td></tr>
        <tr><td><a href="?dir=south">D</a></td></tr>
      </table>
      <select name="action"><option value="eat">kajálsz</option></select>
    `);
    expect(detectPage(doc)).toBe(PageType.FreeMove);
  });

  it('returns Battle when a monster image is present in the main panel', () => {
    const doc = makeDoc(`
      <img src="/pic/szornyk/moszkitoraj_k.gif" alt="szörny">
      <a href="?action=attack">megtámadod</a>
    `);
    expect(detectPage(doc)).toBe(PageType.Battle);
  });

  it('returns Shop when buy/sell headers are present', () => {
    const doc = makeDoc(`
      <td>Vétel</td>
      <td>Eladás</td>
      <select name="item_buy"></select>
    `);
    expect(detectPage(doc)).toBe(PageType.Shop);
  });

  it('returns Church when a healing/mana shop form is present', () => {
    const doc = makeDoc(`
      <td>Mágikus tárgy</td>
      <td>Negatív hatások:</td>
      <select name="magic_item"></select>
    `);
    expect(detectPage(doc)).toBe(PageType.Church);
  });

  it('returns Unknown and does not throw for unrecognised pages', () => {
    const doc = makeDoc(`<p>Valami ismeretlen oldal</p>`);
    expect(() => detectPage(doc)).not.toThrow();
    expect(detectPage(doc)).toBe(PageType.Unknown);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/robert.remenyi/Documents/Dev/lcenter/lc-userscript && npm test
```

Expected: 5 tests FAIL with `Cannot find module '../src/utils/pageDetector'`.

- [ ] **Step 3: Implement pageDetector.ts**

Create `lc-userscript/src/utils/pageDetector.ts`:
```typescript
export enum PageType {
  FreeMove = 'FreeMove',
  Battle = 'Battle',
  Shop = 'Shop',
  Church = 'Church',
  Unknown = 'Unknown',
}

export function detectPage(doc: Document): PageType {
  // FreeMove: directional navigation table present
  // The game uses a table with direction links (É/K/D/Ny = N/E/S/W in Hungarian)
  if (
    doc.querySelector('table.irany') !== null ||
    doc.querySelector('a[href*="dir=north"], a[href*="dir=south"], a[href*="dir=east"], a[href*="dir=west"]') !== null
  ) {
    return PageType.FreeMove;
  }

  // Battle: monster image from /pic/szornyk/ path
  if (doc.querySelector('img[src*="/pic/szornyk/"]') !== null) {
    return PageType.Battle;
  }

  // Shop: Vétel/Eladás (buy/sell) column headers
  const allText = doc.body?.textContent ?? '';
  if (allText.includes('Vétel') && allText.includes('Eladás')) {
    return PageType.Shop;
  }

  // Church: healing/mana shop — "Mágikus tárgy" + "Negatív hatások"
  if (allText.includes('Mágikus tárgy') && allText.includes('Negatív hatások')) {
    return PageType.Church;
  }

  console.warn('[Larkinor UI] Unrecognised page type — rendering skipped');
  return PageType.Unknown;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/robert.remenyi/Documents/Dev/lcenter/lc-userscript && npm test
```

Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/robert.remenyi/Documents/Dev/lcenter/lc-userscript
git add src/utils/pageDetector.ts tests/pageDetector.test.ts
git commit -m "feat: add pageDetector utility with full test coverage"
```

---

## Task 5: domExtract utility

**Files:**
- Create: `lc-userscript/src/utils/domExtract.ts`
- Create: `lc-userscript/tests/domExtract.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export type Direction = 'north' | 'south' | 'east' | 'west';
  export interface Action { label: string; trigger: () => void; }
  export interface FreeMoveState { playerName: string; level: number; maxLevel: number; gold: number; hp: number; hpMax: number; mp: number; mpMax: number; locationImageUrl: string; availableDirections: Direction[]; actions: Action[]; narration: string; }
  export interface BattleState { monsterName: string; monsterImageUrl: string; narration: string; actions: Action[]; hp: number; hpMax: number; mp: number; mpMax: number; }
  export function extractFreeMove(doc: Document): FreeMoveState
  export function extractBattle(doc: Document): BattleState
  export function hideOriginalDOM(doc: Document): void
  ```

> **Implementation note:** The stat parsing regex (`Életpont: 225 / 260`) is based on observed screenshot text. If the game uses different formatting, update the regex in `parseStatLine`. The `hideOriginalDOM` function moves `document.body`'s direct children into `#lc-offscreen` — it does not destroy them.

- [ ] **Step 1: Write the failing tests**

Create `lc-userscript/tests/domExtract.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  extractFreeMove,
  extractBattle,
  hideOriginalDOM,
} from '../src/utils/domExtract';

function makeDoc(bodyHtml: string): Document {
  return new JSDOM(`<html><body>${bodyHtml}</body></html>`).window.document;
}

const FREEMOVE_HTML = `
  <div>
    <div>Remy [3/5/300]</div>
    <div>Pénz: 587</div>
    <div>Életpont: 225 / 260</div>
    <div>Varázspont: 232 / 232</div>
    <img src="https://l2.larkinor.hu/tajk/12.gif" alt="táj">
    <table class="irany">
      <tr><td><a href="?dir=north">É</a></td></tr>
      <tr>
        <td><a href="?dir=west">Ny</a></td>
        <td></td>
        <td><a href="?dir=east">K</a></td>
      </tr>
      <tr><td><a href="?dir=south">D</a></td></tr>
    </table>
    <select name="action">
      <option value="eat">kajálsz</option>
      <option value="look">körülnézel</option>
    </select>
    <input type="submit" name="go" value="OK">
    <div class="stext">Egy macska fut át az úton.</div>
  </div>
`;

const BATTLE_HTML = `
  <div>
    <img src="/pic/szornyk/moszkitoraj_k.gif" alt="szörny">
    <div>Vérszomjas moszkitóraj</div>
    <div>Életpont: 200 / 225</div>
    <div>Varázspont: 100 / 232</div>
    <div class="stext">Ellenfeled közelébb jön!</div>
    <a href="?action=attack">megtámadod</a>
    <a href="?action=flee">elmenekülsz</a>
  </div>
`;

describe('extractFreeMove', () => {
  it('parses player stats correctly', () => {
    const state = extractFreeMove(makeDoc(FREEMOVE_HTML));
    expect(state.playerName).toBe('Remy');
    expect(state.gold).toBe(587);
    expect(state.hp).toBe(225);
    expect(state.hpMax).toBe(260);
    expect(state.mp).toBe(232);
    expect(state.mpMax).toBe(232);
  });

  it('parses location image URL', () => {
    const state = extractFreeMove(makeDoc(FREEMOVE_HTML));
    expect(state.locationImageUrl).toBe('https://l2.larkinor.hu/tajk/12.gif');
  });

  it('parses available directions', () => {
    const state = extractFreeMove(makeDoc(FREEMOVE_HTML));
    expect(state.availableDirections).toContain('north');
    expect(state.availableDirections).toContain('south');
    expect(state.availableDirections).toContain('east');
    expect(state.availableDirections).toContain('west');
  });

  it('parses actions from select options', () => {
    const state = extractFreeMove(makeDoc(FREEMOVE_HTML));
    expect(state.actions.map(a => a.label)).toContain('kajálsz');
    expect(state.actions.map(a => a.label)).toContain('körülnézel');
  });

  it('parses narration text', () => {
    const state = extractFreeMove(makeDoc(FREEMOVE_HTML));
    expect(state.narration).toContain('macska');
  });
});

describe('extractBattle', () => {
  it('parses monster name and image', () => {
    const state = extractBattle(makeDoc(BATTLE_HTML));
    expect(state.monsterName).toBe('Vérszomjas moszkitóraj');
    expect(state.monsterImageUrl).toContain('moszkitoraj_k.gif');
  });

  it('parses player HP and MP in battle', () => {
    const state = extractBattle(makeDoc(BATTLE_HTML));
    expect(state.hp).toBe(200);
    expect(state.hpMax).toBe(225);
    expect(state.mp).toBe(100);
    expect(state.mpMax).toBe(232);
  });

  it('parses battle actions from links', () => {
    const state = extractBattle(makeDoc(BATTLE_HTML));
    expect(state.actions.map(a => a.label)).toContain('megtámadod');
    expect(state.actions.map(a => a.label)).toContain('elmenekülsz');
  });
});

describe('hideOriginalDOM', () => {
  it('creates #lc-offscreen and moves content into it', () => {
    const dom = new JSDOM(`<html><body><div id="game">content</div></body></html>`);
    const doc = dom.window.document;
    hideOriginalDOM(doc);
    const offscreen = doc.getElementById('lc-offscreen');
    expect(offscreen).not.toBeNull();
    expect(doc.getElementById('game')).not.toBeNull(); // still in DOM
    expect(offscreen?.contains(doc.getElementById('game'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/robert.remenyi/Documents/Dev/lcenter/lc-userscript && npm test
```

Expected: tests FAIL with `Cannot find module '../src/utils/domExtract'`.

- [ ] **Step 3: Implement domExtract.ts**

Create `lc-userscript/src/utils/domExtract.ts`:
```typescript
export type Direction = 'north' | 'south' | 'east' | 'west';

export interface Action {
  label: string;
  trigger: () => void;
}

export interface FreeMoveState {
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
  actions: Action[];
  narration: string;
}

export interface BattleState {
  monsterName: string;
  monsterImageUrl: string;
  narration: string;
  actions: Action[];
  hp: number;
  hpMax: number;
  mp: number;
  mpMax: number;
}

function parseStatLine(text: string, label: string): [number, number] {
  const m = text.match(new RegExp(`${label}[:\\s]+(\\d+)\\s*/\\s*(\\d+)`));
  return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : [0, 0];
}

function parseGold(text: string): number {
  const m = text.match(/Pénz[:\\s]+(\\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

function parsePlayerName(text: string): { name: string; level: number; maxLevel: number } {
  // Format: "Remy [3/5/300]" — name [currentXP/level/maxXP] (approximate)
  const m = text.match(/^([A-Za-záéíóöőúüűÁÉÍÓÖŐÚÜŰ][\\w ]+?)\\s*\\[/);
  return { name: m?.[1]?.trim() ?? 'Unknown', level: 1, maxLevel: 100 };
}

export function extractFreeMove(doc: Document): FreeMoveState {
  const allText = doc.body.textContent ?? '';

  const { name, level, maxLevel } = parsePlayerName(allText);
  const gold = parseGold(allText);
  const [hp, hpMax] = parseStatLine(allText, 'Életpont');
  const [mp, mpMax] = parseStatLine(allText, 'Varázspont');

  // Location image: first img pointing to l2.larkinor.hu or /tajk/
  const locImg = doc.querySelector<HTMLImageElement>('img[src*="l2.larkinor.hu"], img[src*="/tajk/"]');
  const locationImageUrl = locImg?.src ?? '';

  // Directions: look for links with dir= parameter
  const dirMap: Record<string, Direction> = {
    north: 'north', south: 'south', east: 'east', west: 'west',
    'É': 'north', 'D': 'south', 'K': 'east', 'Ny': 'west',
  };
  const availableDirections: Direction[] = [];
  doc.querySelectorAll<HTMLAnchorElement>('a[href*="dir="]').forEach(a => {
    const m = a.href.match(/dir=(\w+)/);
    if (m) {
      const dir = dirMap[m[1]];
      if (dir && !availableDirections.includes(dir)) availableDirections.push(dir);
    }
  });
  // Also check by link text (É/D/K/Ny)
  doc.querySelectorAll<HTMLAnchorElement>('table.irany a').forEach(a => {
    const dir = dirMap[a.textContent?.trim() ?? ''];
    if (dir && !availableDirections.includes(dir)) availableDirections.push(dir);
  });

  // Actions: from <select name="action"> or similar
  const actions: Action[] = [];
  const select = doc.querySelector<HTMLSelectElement>('select[name="action"]');
  if (select) {
    Array.from(select.options).forEach(opt => {
      if (opt.value) {
        actions.push({
          label: opt.text.trim(),
          trigger: () => {
            select.value = opt.value;
            const form = select.closest('form');
            form ? form.submit() : select.form?.submit();
          },
        });
      }
    });
  }

  // Narration: look for .stext or the text area below the game panel
  const narrationEl = doc.querySelector('.stext, textarea[name="stext"], .szoveg');
  const narration = narrationEl?.textContent?.trim() ?? '';

  return { playerName: name, level, maxLevel, gold, hp, hpMax, mp, mpMax, locationImageUrl, availableDirections, actions, narration };
}

export function extractBattle(doc: Document): BattleState {
  const allText = doc.body.textContent ?? '';

  const [hp, hpMax] = parseStatLine(allText, 'Életpont');
  const [mp, mpMax] = parseStatLine(allText, 'Varázspont');

  // Monster image
  const monsterImg = doc.querySelector<HTMLImageElement>('img[src*="/pic/szornyk/"]');
  const monsterImageUrl = monsterImg
    ? (monsterImg.src.startsWith('http') ? monsterImg.src : `https://l2.larkinor.hu${monsterImg.getAttribute('src')}`)
    : '';

  // Monster name: the text node near the monster image (often in same table cell or sibling div)
  const monsterName = monsterImg?.closest('td, div')?.nextElementSibling?.textContent?.trim()
    ?? monsterImg?.alt
    ?? 'Ismeretlen szörny';

  // Narration
  const narrationEl = doc.querySelector('.stext, textarea[name="stext"], .szoveg');
  const narration = narrationEl?.textContent?.trim() ?? '';

  // Actions: combat action links
  const actions: Action[] = [];
  doc.querySelectorAll<HTMLAnchorElement>('a[href*="action="]').forEach(a => {
    const label = a.textContent?.trim() ?? '';
    if (label) {
      actions.push({ label, trigger: () => a.click() });
    }
  });
  // Also check submit buttons
  doc.querySelectorAll<HTMLInputElement>('input[type="submit"]').forEach(btn => {
    const label = btn.value?.trim() ?? '';
    if (label) {
      actions.push({ label, trigger: () => btn.click() });
    }
  });

  return { monsterName, monsterImageUrl, narration, actions, hp, hpMax, mp, mpMax };
}

export function hideOriginalDOM(doc: Document): void {
  const offscreen = doc.createElement('div');
  offscreen.id = 'lc-offscreen';
  // Move all existing body children into the offscreen container
  while (doc.body.firstChild) {
    offscreen.appendChild(doc.body.firstChild);
  }
  doc.body.appendChild(offscreen);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/robert.remenyi/Documents/Dev/lcenter/lc-userscript && npm test
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/robert.remenyi/Documents/Dev/lcenter/lc-userscript
git add src/utils/domExtract.ts tests/domExtract.test.ts
git commit -m "feat: add domExtract utility (proxy DOM pattern) with tests"
```

---

## Task 6: Monsters data layer

**Files:**
- Create: `lc-userscript/src/data/monsters.ts`
- Create: `lc-userscript/tests/monsters.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export interface Monster { id: number; name: string; image: string; level: number; hp: number; mp: number; attackType: string; debuff: string; magicWeapon: boolean; location: string; drops: Array<{qty: number; name: string; id: number}>; }
  export interface MonsterDatabase { byName: Map<string, Monster>; pattern: RegExp; getByName(name: string): Monster | undefined; }
  export async function loadMonsters(url: string): Promise<MonsterDatabase>
  ```
- Consumes: `GM_getValue(key: string, fallback?: string): string | null`, `GM_setValue(key: string, value: string): void`

- [ ] **Step 1: Write the failing tests**

Create `lc-userscript/tests/monsters.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildMonsterDatabase, type Monster } from '../src/data/monsters';

const SAMPLE_MONSTERS: Monster[] = [
  { id: 1, name: 'Vérszomjas moszkitóraj', image: '/pic/szornyk/moszkitoraj_k.gif', level: 1, hp: 6, mp: 4, attackType: 'Szúró/Vágó', debuff: 'fertőzés', magicWeapon: false, location: 'Larkinor', drops: [{ qty: 1, name: 'szúnyogszárny', id: 51 }] },
  { id: 2, name: 'Törpe csatasün', image: '/pic/szornyk/sun_k.gif', level: 1, hp: 8, mp: 6, attackType: 'Ütő/Zúzó', debuff: '-', magicWeapon: false, location: 'Larkinor', drops: [{ qty: 2, name: 'kaja', id: 1 }] },
  { id: 99, name: 'Hosszú nevű szörnyeteg király', image: '/pic/szornyk/king.gif', level: 10, hp: 500, mp: 200, attackType: 'Ütő', debuff: '-', magicWeapon: true, location: 'Démonok', drops: [] },
];

describe('buildMonsterDatabase', () => {
  it('builds a Map keyed by lowercased monster name', () => {
    const db = buildMonsterDatabase(SAMPLE_MONSTERS);
    expect(db.byName.has('vérszomjas moszkitóraj')).toBe(true);
    expect(db.byName.has('törpe csatasün')).toBe(true);
  });

  it('getByName is case-insensitive', () => {
    const db = buildMonsterDatabase(SAMPLE_MONSTERS);
    expect(db.getByName('Vérszomjas Moszkitóraj')?.id).toBe(1);
    expect(db.getByName('TÖRPE CSATASÜN')?.id).toBe(2);
  });

  it('getByName returns undefined for unknown names', () => {
    const db = buildMonsterDatabase(SAMPLE_MONSTERS);
    expect(db.getByName('Ismeretlen szörny')).toBeUndefined();
  });

  it('pattern matches longer names before shorter substring names', () => {
    const db = buildMonsterDatabase(SAMPLE_MONSTERS);
    const text = 'Egy Hosszú nevű szörnyeteg király áll előtted.';
    const matches = text.match(db.pattern);
    expect(matches?.[0]).toBe('Hosszú nevű szörnyeteg király');
  });

  it('pattern is case-insensitive', () => {
    const db = buildMonsterDatabase(SAMPLE_MONSTERS);
    const text = 'egy vérszomjas moszkitóraj támad rád';
    expect(db.pattern.test(text)).toBe(true);
    db.pattern.lastIndex = 0; // reset stateful regex
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/robert.remenyi/Documents/Dev/lcenter/lc-userscript && npm test
```

Expected: FAIL with `Cannot find module '../src/data/monsters'`.

- [ ] **Step 3: Implement monsters.ts**

Create `lc-userscript/src/data/monsters.ts`:
```typescript
const CACHE_KEY = 'lc_monsters_cache';
const CACHE_VERSION_KEY = 'lc_monsters_version';

export interface MonsterDrop {
  qty: number;
  name: string;
  id: number;
}

export interface Monster {
  id: number;
  name: string;
  image: string;
  level: number;
  hp: number;
  mp: number;
  attackType: string;
  debuff: string;
  magicWeapon: boolean;
  location: string;
  drops: MonsterDrop[];
}

export interface MonsterDatabase {
  byName: Map<string, Monster>;
  pattern: RegExp;
  getByName(name: string): Monster | undefined;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildMonsterDatabase(monsters: Monster[]): MonsterDatabase {
  const byName = new Map<string, Monster>();
  for (const m of monsters) {
    byName.set(m.name.toLowerCase(), m);
  }

  // Sort longest-first to prevent partial matches
  const sorted = [...byName.keys()].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`(${sorted.map(escapeRegex).join('|')})`, 'gi');

  return {
    byName,
    pattern,
    getByName(name: string): Monster | undefined {
      return byName.get(name.toLowerCase());
    },
  };
}

export async function loadMonsters(url: string): Promise<MonsterDatabase> {
  // Try cache first
  const cached = GM_getValue(CACHE_KEY, null);
  if (cached) {
    try {
      const monsters = JSON.parse(cached) as Monster[];
      return buildMonsterDatabase(monsters);
    } catch {
      // Cache corrupted — fall through to fetch
    }
  }

  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: 'GET',
      url,
      onload(response) {
        if (response.status !== 200) {
          reject(new Error(`Failed to load monsters.json: HTTP ${response.status}`));
          return;
        }
        try {
          const monsters = JSON.parse(response.responseText) as Monster[];
          GM_setValue(CACHE_KEY, response.responseText);
          resolve(buildMonsterDatabase(monsters));
        } catch (e) {
          reject(e);
        }
      },
      onerror() {
        reject(new Error('Network error loading monsters.json'));
      },
    });
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/robert.remenyi/Documents/Dev/lcenter/lc-userscript && npm test
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/robert.remenyi/Documents/Dev/lcenter/lc-userscript
git add src/data/monsters.ts tests/monsters.test.ts
git commit -m "feat: add monsters data layer with GM_setValue cache and tests"
```

---

## Task 7: StatBar component

**Files:**
- Create: `lc-userscript/src/components/StatBar.tsx`
- Create: `lc-userscript/tests/StatBar.test.tsx`

**Interfaces:**
- Produces:
  ```typescript
  export interface StatBarProps { hp: number; hpMax: number; mp: number; mpMax: number; gold?: number; }
  export function StatBar(props: StatBarProps): JSX.Element
  ```

- [ ] **Step 1: Write the failing tests**

Create `lc-userscript/tests/StatBar.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/preact';
import { StatBar } from '../src/components/StatBar';

describe('StatBar', () => {
  it('renders HP and MP values', () => {
    render(<StatBar hp={225} hpMax={260} mp={100} mpMax={232} />);
    expect(screen.getByText(/225\s*\/\s*260/)).toBeTruthy();
    expect(screen.getByText(/100\s*\/\s*232/)).toBeTruthy();
  });

  it('renders gold when provided', () => {
    render(<StatBar hp={100} hpMax={100} mp={50} mpMax={100} gold={587} />);
    expect(screen.getByText(/587/)).toBeTruthy();
  });

  it('does not render gold section when gold is undefined', () => {
    const { container } = render(<StatBar hp={100} hpMax={100} mp={50} mpMax={100} />);
    expect(container.querySelector('.lc-stat-gold')).toBeNull();
  });

  it('HP bar fill width reflects percentage', () => {
    const { container } = render(<StatBar hp={130} hpMax={260} mp={50} mpMax={100} />);
    const hpFill = container.querySelector<HTMLElement>('.lc-stat-bar-fill--hp');
    expect(hpFill?.style.width).toBe('50%');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/robert.remenyi/Documents/Dev/lcenter/lc-userscript && npm test
```

Expected: FAIL with `Cannot find module '../src/components/StatBar'`.

- [ ] **Step 3: Implement StatBar.tsx**

Create `lc-userscript/src/components/StatBar.tsx`:
```tsx
import { h } from 'preact';

export interface StatBarProps {
  hp: number;
  hpMax: number;
  mp: number;
  mpMax: number;
  gold?: number;
}

function Bar({ value, max, className }: { value: number; max: number; className: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div class="lc-stat-bar-track">
      <div
        class={`lc-stat-bar-fill ${className}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function StatBar({ hp, hpMax, mp, mpMax, gold }: StatBarProps) {
  return (
    <div class="lc-stat-bar lc-section">
      <div class="lc-stat-row">
        <span class="lc-stat-label lc-stat-label--hp">❤</span>
        <Bar value={hp} max={hpMax} className="lc-stat-bar-fill--hp" />
        <span class="lc-stat-value">{hp} / {hpMax}</span>
      </div>
      <div class="lc-stat-row">
        <span class="lc-stat-label lc-stat-label--mp">✨</span>
        <Bar value={mp} max={mpMax} className="lc-stat-bar-fill--mp" />
        <span class="lc-stat-value">{mp} / {mpMax}</span>
      </div>
      {gold !== undefined && (
        <div class="lc-stat-row lc-stat-gold">
          <span class="lc-stat-label">💰</span>
          <span class="lc-stat-value">{gold}</span>
        </div>
      )}
    </div>
  );
}
```

Add the StatBar styles to `src/styles/base.css` (append to the end of the file):
```css
/* StatBar */
.lc-stat-bar { display: flex; flex-direction: column; gap: 8px; }
.lc-stat-row { display: flex; align-items: center; gap: 10px; }
.lc-stat-label { font-size: 18px; width: 24px; text-align: center; flex-shrink: 0; }
.lc-stat-value { font-size: 13px; color: var(--muted); min-width: 80px; text-align: right; flex-shrink: 0; font-variant-numeric: tabular-nums; }
.lc-stat-bar-track { flex: 1; height: 8px; background: var(--panel-2); border-radius: 4px; overflow: hidden; border: 1px solid var(--border); }
.lc-stat-bar-fill { height: 100%; border-radius: 4px; transition: width 0.3s ease; }
.lc-stat-bar-fill--hp { background: var(--bad); }
.lc-stat-bar-fill--mp { background: #4a7acc; }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/robert.remenyi/Documents/Dev/lcenter/lc-userscript && npm test
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/robert.remenyi/Documents/Dev/lcenter/lc-userscript
git add src/components/StatBar.tsx src/styles/base.css tests/StatBar.test.tsx
git commit -m "feat: add StatBar component with fill bars and tests"
```

---

## Task 8: NavPad component

**Files:**
- Create: `lc-userscript/src/components/NavPad.tsx`
- Create: `lc-userscript/tests/NavPad.test.tsx`

**Interfaces:**
- Produces:
  ```typescript
  export interface NavPadProps { availableDirections: Direction[]; onDirection: (dir: Direction) => void; }
  export function NavPad(props: NavPadProps): JSX.Element
  ```
- Consumes: `Direction` from `@/utils/domExtract`

- [ ] **Step 1: Write the failing tests**

Create `lc-userscript/tests/NavPad.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { NavPad } from '../src/components/NavPad';

describe('NavPad', () => {
  it('renders only available direction buttons', () => {
    render(<NavPad availableDirections={['north', 'south']} onDirection={vi.fn()} />);
    expect(screen.getByRole('button', { name: /É|North|north/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /D|South|south/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /K|East|east/i })).toBeNull();
  });

  it('calls onDirection with the correct direction when tapped', () => {
    const onDir = vi.fn();
    render(<NavPad availableDirections={['north', 'east']} onDirection={onDir} />);
    fireEvent.click(screen.getByRole('button', { name: /É|North|north/i }));
    expect(onDir).toHaveBeenCalledWith('north');
  });

  it('renders a disabled centre cell (not a nav button)', () => {
    const { container } = render(<NavPad availableDirections={['north']} onDirection={vi.fn()} />);
    // The centre of the D-pad grid should not be a button
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(1); // only north
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/robert.remenyi/Documents/Dev/lcenter/lc-userscript && npm test
```

Expected: FAIL with `Cannot find module '../src/components/NavPad'`.

- [ ] **Step 3: Implement NavPad.tsx**

Create `lc-userscript/src/components/NavPad.tsx`:
```tsx
import { h } from 'preact';
import type { Direction } from '@/utils/domExtract';

export interface NavPadProps {
  availableDirections: Direction[];
  onDirection: (dir: Direction) => void;
}

const DIR_LABELS: Record<Direction, string> = {
  north: 'É',
  south: 'D',
  east: 'K',
  west: 'Ny',
};

function DirButton({ dir, available, onDirection }: { dir: Direction; available: boolean; onDirection: (d: Direction) => void }) {
  if (!available) return <div class="lc-navpad-cell lc-navpad-empty" aria-hidden="true" />;
  return (
    <button
      class="lc-navpad-btn"
      aria-label={dir}
      onClick={() => onDirection(dir)}
    >
      {DIR_LABELS[dir]}
    </button>
  );
}

export function NavPad({ availableDirections, onDirection }: NavPadProps) {
  const has = (d: Direction) => availableDirections.includes(d);
  return (
    <div class="lc-navpad lc-section">
      <div class="lc-navpad-grid">
        {/* Row 1: empty, north, empty */}
        <div class="lc-navpad-cell" />
        <DirButton dir="north" available={has('north')} onDirection={onDirection} />
        <div class="lc-navpad-cell" />
        {/* Row 2: west, centre, east */}
        <DirButton dir="west" available={has('west')} onDirection={onDirection} />
        <div class="lc-navpad-cell lc-navpad-centre" />
        <DirButton dir="east" available={has('east')} onDirection={onDirection} />
        {/* Row 3: empty, south, empty */}
        <div class="lc-navpad-cell" />
        <DirButton dir="south" available={has('south')} onDirection={onDirection} />
        <div class="lc-navpad-cell" />
      </div>
    </div>
  );
}
```

Append to `src/styles/base.css`:
```css
/* NavPad */
.lc-navpad { display: flex; justify-content: center; }
.lc-navpad-grid { display: grid; grid-template-columns: repeat(3, 64px); grid-template-rows: repeat(3, 64px); gap: 6px; }
.lc-navpad-cell { width: 64px; height: 64px; }
.lc-navpad-btn { width: 64px; height: 64px; background: var(--panel); border: 1px solid var(--border); color: var(--accent); font-size: 22px; font-weight: bold; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.1s; }
.lc-navpad-btn:active { background: var(--accent-dim); border-color: var(--accent); }
.lc-navpad-centre { background: var(--panel-2); border-radius: 50%; border: 1px solid var(--border); }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/robert.remenyi/Documents/Dev/lcenter/lc-userscript && npm test
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/robert.remenyi/Documents/Dev/lcenter/lc-userscript
git add src/components/NavPad.tsx src/styles/base.css tests/NavPad.test.tsx
git commit -m "feat: add NavPad D-pad component with direction filtering and tests"
```

---

## Task 9: NarrationPanel component

**Files:**
- Create: `lc-userscript/src/components/NarrationPanel.tsx`
- Create: `lc-userscript/tests/NarrationPanel.test.tsx`

**Interfaces:**
- Produces:
  ```typescript
  export interface NarrationPanelProps { text: string; db: MonsterDatabase | null; onMonsterClick: (monster: Monster) => void; }
  export function NarrationPanel(props: NarrationPanelProps): JSX.Element
  ```
- Consumes: `MonsterDatabase`, `Monster` from `@/data/monsters`

- [ ] **Step 1: Write the failing tests**

Create `lc-userscript/tests/NarrationPanel.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { NarrationPanel } from '../src/components/NarrationPanel';
import { buildMonsterDatabase, type Monster } from '../src/data/monsters';

const MONSTERS: Monster[] = [
  { id: 1, name: 'Vérszomjas moszkitóraj', image: '/pic/szornyk/moszkitoraj_k.gif', level: 1, hp: 6, mp: 4, attackType: 'Szúró', debuff: 'fertőzés', magicWeapon: false, location: 'Larkinor', drops: [] },
];

describe('NarrationPanel', () => {
  it('renders plain text when no monsters match', () => {
    const db = buildMonsterDatabase(MONSTERS);
    render(<NarrationPanel text="Egy macska fut át az úton." db={db} onMonsterClick={vi.fn()} />);
    expect(screen.getByText(/macska fut/)).toBeTruthy();
  });

  it('renders monster names as tappable spans', () => {
    const db = buildMonsterDatabase(MONSTERS);
    const { container } = render(
      <NarrationPanel text="Egy Vérszomjas moszkitóraj van a közelben!" db={db} onMonsterClick={vi.fn()} />
    );
    const link = container.querySelector('.lc-monster-link');
    expect(link).not.toBeNull();
    expect(link?.textContent).toBe('Vérszomjas moszkitóraj');
  });

  it('calls onMonsterClick with the matched monster when tapped', () => {
    const db = buildMonsterDatabase(MONSTERS);
    const handler = vi.fn();
    const { container } = render(
      <NarrationPanel text="Egy Vérszomjas moszkitóraj van a közelben!" db={db} onMonsterClick={handler} />
    );
    fireEvent.click(container.querySelector('.lc-monster-link')!);
    expect(handler).toHaveBeenCalledWith(MONSTERS[0]);
  });

  it('renders plain text when db is null', () => {
    render(<NarrationPanel text="Valami szöveg." db={null} onMonsterClick={vi.fn()} />);
    expect(screen.getByText(/Valami szöveg/)).toBeTruthy();
  });

  it('renders empty text gracefully', () => {
    const db = buildMonsterDatabase(MONSTERS);
    const { container } = render(<NarrationPanel text="" db={db} onMonsterClick={vi.fn()} />);
    expect(container.querySelector('.lc-narration')?.textContent).toBe('');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/robert.remenyi/Documents/Dev/lcenter/lc-userscript && npm test
```

Expected: FAIL with `Cannot find module '../src/components/NarrationPanel'`.

- [ ] **Step 3: Implement NarrationPanel.tsx**

Create `lc-userscript/src/components/NarrationPanel.tsx`:
```tsx
import { h, Fragment } from 'preact';
import type { MonsterDatabase, Monster } from '@/data/monsters';

export interface NarrationPanelProps {
  text: string;
  db: MonsterDatabase | null;
  onMonsterClick: (monster: Monster) => void;
}

export function NarrationPanel({ text, db, onMonsterClick }: NarrationPanelProps) {
  if (!db || !text) {
    return <div class="lc-narration lc-section">{text}</div>;
  }

  // Reset regex state before splitting (stateful global regex)
  db.pattern.lastIndex = 0;
  const parts = text.split(db.pattern);

  const nodes = parts.map((part, i) => {
    const monster = db.getByName(part);
    if (monster) {
      return (
        <span
          key={i}
          class="lc-monster-link"
          onClick={() => onMonsterClick(monster)}
        >
          {part}
        </span>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });

  return <div class="lc-narration lc-section">{nodes}</div>;
}
```

Append to `src/styles/base.css`:
```css
/* NarrationPanel */
.lc-narration { font-size: 15px; line-height: 1.6; color: var(--text); min-height: 60px; }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/robert.remenyi/Documents/Dev/lcenter/lc-userscript && npm test
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/robert.remenyi/Documents/Dev/lcenter/lc-userscript
git add src/components/NarrationPanel.tsx src/styles/base.css tests/NarrationPanel.test.tsx
git commit -m "feat: add NarrationPanel with regex monster link detection and tests"
```

---

## Task 10: MonsterCard drawer

**Files:**
- Create: `lc-userscript/src/components/MonsterCard.tsx`
- Create: `lc-userscript/tests/MonsterCard.test.tsx`

**Interfaces:**
- Produces:
  ```typescript
  export interface MonsterCardProps { monster: Monster | null; onClose: () => void; }
  export function MonsterCard(props: MonsterCardProps): JSX.Element | null
  ```
- Consumes: `Monster` from `@/data/monsters`

- [ ] **Step 1: Write the failing tests**

Create `lc-userscript/tests/MonsterCard.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { MonsterCard } from '../src/components/MonsterCard';
import type { Monster } from '../src/data/monsters';

const MONSTER: Monster = {
  id: 1,
  name: 'Vérszomjas moszkitóraj',
  image: '/pic/szornyk/moszkitoraj_k.gif',
  level: 1,
  hp: 6,
  mp: 4,
  attackType: 'Szúró/Vágó',
  debuff: 'fertőzés',
  magicWeapon: false,
  location: 'Larkinor',
  drops: [{ qty: 1, name: 'szúnyogszárny', id: 51 }],
};

describe('MonsterCard', () => {
  it('returns null when monster is null', () => {
    const { container } = render(<MonsterCard monster={null} onClose={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders monster name and level when a monster is provided', () => {
    render(<MonsterCard monster={MONSTER} onClose={vi.fn()} />);
    expect(screen.getByText('Vérszomjas moszkitóraj')).toBeTruthy();
    expect(screen.getByText(/Szint.*1|1.*szint/i)).toBeTruthy();
  });

  it('renders HP, MP, attack type, debuff, and drop list', () => {
    render(<MonsterCard monster={MONSTER} onClose={vi.fn()} />);
    expect(screen.getByText(/6/)).toBeTruthy();  // hp
    expect(screen.getByText('Szúró/Vágó')).toBeTruthy();
    expect(screen.getByText('fertőzés')).toBeTruthy();
    expect(screen.getByText(/szúnyogszárny/)).toBeTruthy();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<MonsterCard monster={MONSTER} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /bezár|close|×/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(<MonsterCard monster={MONSTER} onClose={onClose} />);
    fireEvent.click(container.querySelector('.lc-drawer-backdrop')!);
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/robert.remenyi/Documents/Dev/lcenter/lc-userscript && npm test
```

Expected: FAIL with `Cannot find module '../src/components/MonsterCard'`.

- [ ] **Step 3: Implement MonsterCard.tsx**

Create `lc-userscript/src/components/MonsterCard.tsx`:
```tsx
import { h } from 'preact';
import type { Monster } from '@/data/monsters';

export interface MonsterCardProps {
  monster: Monster | null;
  onClose: () => void;
}

const ASSET_BASE = 'https://l2.larkinor.hu';

export function MonsterCard({ monster, onClose }: MonsterCardProps) {
  if (!monster) return null;

  const imgUrl = monster.image.startsWith('http')
    ? monster.image
    : `${ASSET_BASE}${monster.image}`;

  function handleBackdropClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('lc-drawer-backdrop')) {
      onClose();
    }
  }

  return (
    <div class="lc-drawer-backdrop" onClick={handleBackdropClick}>
      <div class="lc-drawer" role="dialog" aria-label={monster.name}>
        <button class="lc-drawer-close" aria-label="bezár" onClick={onClose}>×</button>

        <div class="lc-mc-header">
          <img
            class="lc-mc-img"
            src={imgUrl}
            alt={monster.name}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <div>
            <h2 class="lc-mc-name">{monster.name}</h2>
            <span class="lc-mc-level">Szint {monster.level}</span>
            {monster.location && <span class="lc-mc-location"> — {monster.location}</span>}
          </div>
        </div>

        <dl class="lc-mc-stats">
          <dt>Életpont</dt><dd>{monster.hp}</dd>
          <dt>Varázspont</dt><dd>{monster.mp}</dd>
          <dt>Támadástípus</dt><dd>{monster.attackType}</dd>
          <dt>Debuff</dt><dd>{monster.debuff}</dd>
          <dt>Mágikus fegyver</dt><dd>{monster.magicWeapon ? 'Igen' : 'Nem'}</dd>
        </dl>

        {monster.drops.length > 0 && (
          <div class="lc-mc-drops">
            <h3>Zsákmány</h3>
            <ul>
              {monster.drops.map((drop, i) => (
                <li key={i}>{drop.qty}× {drop.name}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
```

Append to `src/styles/base.css`:
```css
/* MonsterCard */
.lc-mc-header { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 14px; padding-right: 36px; }
.lc-mc-img { width: 72px; height: 72px; object-fit: contain; border: 1px solid var(--border); border-radius: 6px; flex-shrink: 0; }
.lc-mc-name { margin: 0 0 4px; font-size: 18px; color: var(--accent); }
.lc-mc-level { font-size: 13px; color: var(--muted); }
.lc-mc-location { font-size: 13px; color: var(--muted); }
.lc-mc-stats { display: grid; grid-template-columns: 140px 1fr; gap: 4px 12px; font-size: 14px; margin: 0 0 14px; }
.lc-mc-stats dt { color: var(--muted); }
.lc-mc-stats dd { margin: 0; }
.lc-mc-drops h3 { font-size: 13px; color: var(--accent); text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 6px; }
.lc-mc-drops ul { list-style: none; padding: 0; margin: 0; font-size: 14px; }
.lc-mc-drops li { padding: 3px 0; border-bottom: 1px dashed var(--border); }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/robert.remenyi/Documents/Dev/lcenter/lc-userscript && npm test
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/robert.remenyi/Documents/Dev/lcenter/lc-userscript
git add src/components/MonsterCard.tsx src/styles/base.css tests/MonsterCard.test.tsx
git commit -m "feat: add MonsterCard bottom-drawer component with tests"
```

---

## Task 11: FreeMove page

**Files:**
- Create: `lc-userscript/src/pages/FreeMove.tsx`

**Interfaces:**
- Produces:
  ```typescript
  export interface FreeMoveProps { state: FreeMoveState; db: MonsterDatabase | null; }
  export function FreeMove(props: FreeMoveProps): JSX.Element
  ```
- Consumes:
  - `FreeMoveState`, `Direction` from `@/utils/domExtract`
  - `MonsterDatabase`, `Monster` from `@/data/monsters`
  - `NavPad` from `@/components/NavPad`
  - `StatBar` from `@/components/StatBar`
  - `NarrationPanel` from `@/components/NarrationPanel`
  - `MonsterCard` from `@/components/MonsterCard`

- [ ] **Step 1: Implement FreeMove.tsx**

Create `lc-userscript/src/pages/FreeMove.tsx`:
```tsx
import { h } from 'preact';
import { useState } from 'preact/hooks';
import type { FreeMoveState } from '@/utils/domExtract';
import type { MonsterDatabase, Monster } from '@/data/monsters';
import { NavPad } from '@/components/NavPad';
import { StatBar } from '@/components/StatBar';
import { NarrationPanel } from '@/components/NarrationPanel';
import { MonsterCard } from '@/components/MonsterCard';

export interface FreeMoveProps {
  state: FreeMoveState;
  db: MonsterDatabase | null;
}

export function FreeMove({ state, db }: FreeMoveProps) {
  const [selectedMonster, setSelectedMonster] = useState<Monster | null>(null);

  return (
    <div class="lc-page">
      {state.locationImageUrl && (
        <img class="lc-hero-img" src={state.locationImageUrl} alt="helyszín" />
      )}

      <StatBar
        hp={state.hp}
        hpMax={state.hpMax}
        mp={state.mp}
        mpMax={state.mpMax}
        gold={state.gold}
      />

      <NavPad
        availableDirections={state.availableDirections}
        onDirection={(dir) => {
          const action = state.actions.find(a =>
            a.label.toLowerCase().includes(dir) || dir === 'north'
          );
          // Find the direction trigger — domExtract wired this to the hidden anchor
          const dirTrigger = state.availableDirections.includes(dir)
            ? { trigger: () => {
                // Click the hidden directional link in #lc-offscreen
                const selector = `a[href*="dir=${dir}"]`;
                const link = document.querySelector<HTMLAnchorElement>(`#lc-offscreen ${selector}`);
                link?.click();
              }}
            : null;
          dirTrigger?.trigger();
        }}
      />

      {state.actions.length > 0 && (
        <div class="lc-section">
          {state.actions.map((action, i) => (
            <button key={i} class="lc-btn" onClick={() => action.trigger()}>
              {action.label}
            </button>
          ))}
        </div>
      )}

      <NarrationPanel
        text={state.narration}
        db={db}
        onMonsterClick={setSelectedMonster}
      />

      <MonsterCard monster={selectedMonster} onClose={() => setSelectedMonster(null)} />
    </div>
  );
}
```

- [ ] **Step 2: Verify the build compiles without errors**

```bash
cd /Users/robert.remenyi/Documents/Dev/lcenter/lc-userscript && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/robert.remenyi/Documents/Dev/lcenter/lc-userscript
git add src/pages/FreeMove.tsx
git commit -m "feat: add FreeMove page composing NavPad, StatBar, NarrationPanel, MonsterCard"
```

---

## Task 12: Battle page

**Files:**
- Create: `lc-userscript/src/pages/Battle.tsx`

**Interfaces:**
- Produces:
  ```typescript
  export interface BattleProps { state: BattleState; db: MonsterDatabase | null; }
  export function Battle(props: BattleProps): JSX.Element
  ```
- Consumes:
  - `BattleState` from `@/utils/domExtract`
  - `MonsterDatabase`, `Monster` from `@/data/monsters`
  - `StatBar` from `@/components/StatBar`
  - `NarrationPanel` from `@/components/NarrationPanel`
  - `MonsterCard` from `@/components/MonsterCard`

- [ ] **Step 1: Implement Battle.tsx**

Create `lc-userscript/src/pages/Battle.tsx`:
```tsx
import { h } from 'preact';
import { useState } from 'preact/hooks';
import type { BattleState } from '@/utils/domExtract';
import type { MonsterDatabase, Monster } from '@/data/monsters';
import { StatBar } from '@/components/StatBar';
import { NarrationPanel } from '@/components/NarrationPanel';
import { MonsterCard } from '@/components/MonsterCard';

export interface BattleProps {
  state: BattleState;
  db: MonsterDatabase | null;
}

export function Battle({ state, db }: BattleProps) {
  const [selectedMonster, setSelectedMonster] = useState<Monster | null>(null);

  const monsterFromDb = db?.getByName(state.monsterName) ?? null;

  return (
    <div class="lc-page">
      {state.monsterImageUrl && (
        <img
          class="lc-hero-img"
          src={state.monsterImageUrl}
          alt={state.monsterName}
        />
      )}

      <div class="lc-section lc-battle-header">
        <span
          class="lc-battle-monster-name"
          onClick={() => monsterFromDb && setSelectedMonster(monsterFromDb)}
          style={monsterFromDb ? { cursor: 'pointer', color: 'var(--accent)', textDecoration: 'underline dotted' } : undefined}
        >
          {state.monsterName}
        </span>
        {monsterFromDb && (
          <span class="lc-battle-level-badge">Szint {monsterFromDb.level}</span>
        )}
      </div>

      <NarrationPanel
        text={state.narration}
        db={db}
        onMonsterClick={setSelectedMonster}
      />

      <StatBar
        hp={state.hp}
        hpMax={state.hpMax}
        mp={state.mp}
        mpMax={state.mpMax}
      />

      <div class="lc-section">
        {state.actions.map((action, i) => (
          <button key={i} class="lc-btn" onClick={() => action.trigger()}>
            {action.label}
          </button>
        ))}
      </div>

      <MonsterCard monster={selectedMonster} onClose={() => setSelectedMonster(null)} />
    </div>
  );
}
```

Append to `src/styles/base.css`:
```css
/* Battle page */
.lc-battle-header { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.lc-battle-monster-name { font-size: 20px; font-weight: bold; color: var(--text); }
.lc-battle-level-badge { background: var(--panel-2); border: 1px solid var(--border); color: var(--muted); font-size: 12px; padding: 2px 8px; border-radius: 3px; }
```

- [ ] **Step 2: Verify the build compiles without errors**

```bash
cd /Users/robert.remenyi/Documents/Dev/lcenter/lc-userscript && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/robert.remenyi/Documents/Dev/lcenter/lc-userscript
git add src/pages/Battle.tsx src/styles/base.css
git commit -m "feat: add Battle page with monster header, narration, stats, and action buttons"
```

---

## Task 13: main.ts entry point

**Files:**
- Create: `lc-userscript/src/main.ts`

**Interfaces:**
- Consumes: all utils, data, and pages
- Produces: the executable entry that vite-plugin-monkey wraps as a userscript

- [ ] **Step 1: Implement main.ts**

Create `lc-userscript/src/main.ts`:
```typescript
import { h, render } from 'preact';
import { detectPage, PageType } from '@/utils/pageDetector';
import { extractFreeMove, extractBattle, hideOriginalDOM } from '@/utils/domExtract';
import { loadMonsters } from '@/data/monsters';
import { FreeMove } from '@/pages/FreeMove';
import { Battle } from '@/pages/Battle';
import baseStyles from '@/styles/base.css?raw';

// Replace with actual URL before deploying
const MONSTERS_JSON_URL = 'https://YOUR_DOMAIN_HERE/monsters.json';

async function boot() {
  const pageType = detectPage(document);

  if (pageType === PageType.Unknown) {
    return; // Unknown page — do nothing, original game UI stays
  }

  // Apply base styles
  GM_addStyle(baseStyles);

  // Move original game DOM off-screen (proxy DOM pattern)
  hideOriginalDOM(document);

  // Create Preact mount point
  const root = document.createElement('div');
  root.id = 'lc-root';
  document.body.appendChild(root);

  // Load monster database in parallel with page render
  // Render immediately with db=null, then re-render when db loads
  let db = null;

  if (pageType === PageType.FreeMove) {
    const state = extractFreeMove(document);
    render(h(FreeMove, { state, db }), root);
    loadMonsters(MONSTERS_JSON_URL).then(loadedDb => {
      db = loadedDb;
      render(h(FreeMove, { state, db }), root);
    }).catch(err => console.warn('[Larkinor UI] Failed to load monsters:', err));

  } else if (pageType === PageType.Battle) {
    const state = extractBattle(document);
    render(h(Battle, { state, db }), root);
    loadMonsters(MONSTERS_JSON_URL).then(loadedDb => {
      db = loadedDb;
      render(h(Battle, { state, db }), root);
    }).catch(err => console.warn('[Larkinor UI] Failed to load monsters:', err));
  }
}

boot();
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
cd /Users/robert.remenyi/Documents/Dev/lcenter/lc-userscript && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run all tests one final time**

```bash
cd /Users/robert.remenyi/Documents/Dev/lcenter/lc-userscript && npm test
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
cd /Users/robert.remenyi/Documents/Dev/lcenter/lc-userscript
git add src/main.ts
git commit -m "feat: add main.ts entry point wiring page detection, DOM proxy, and Preact render"
```

---

## Task 14: Production build + serve + manual smoke test

**Files:**
- No new files — validates that the full pipeline produces a working script

- [ ] **Step 1: Run the production build**

```bash
cd /Users/robert.remenyi/Documents/Dev/lcenter/lc-userscript && npm run build
```

Expected: `dist/larkinor-ui.user.js` created, no errors.

- [ ] **Step 2: Inspect the output for the userscript metadata block**

```bash
head -30 /Users/robert.remenyi/Documents/Dev/lcenter/lc-userscript/dist/larkinor-ui.user.js
```

Expected: `// ==UserScript==` block present with `@name Larkinor UI`, `@grant GM_addStyle`, etc.

- [ ] **Step 3: Serve the dist folder locally**

```bash
cd /Users/robert.remenyi/Documents/Dev/lcenter/lc-userscript && npm run serve
```

This starts `python3 -m http.server 9000 --directory dist`. Leave it running.

- [ ] **Step 4: Update loader for local testing**

In `loader/larkinor-loader.user.js`, temporarily change:
```javascript
const SCRIPT_URL = 'http://localhost:9000/larkinor-ui.user.js';
```
And update `@connect localhost`.

- [ ] **Step 5: Install the loader in ViolentMonkey and test on the live game**

1. Open ViolentMonkey dashboard → Add new script → paste contents of `loader/larkinor-loader.user.js`
2. Navigate to `https://larkinor.hu/`
3. Verify in DevTools console: no errors from `[Larkinor UI]`
4. Verify the page type is detected: check console for `[Larkinor UI] Unrecognised page type` — if this fires, the `pageDetector.ts` selectors need updating against the live DOM

- [ ] **Step 6: Verify page detection selectors against live game DOM**

Open DevTools → Elements tab on each game screen and confirm or update these selectors in `src/utils/pageDetector.ts`:

| Page | Selector to confirm |
|---|---|
| FreeMove | `table.irany` or `a[href*="dir="]` |
| Battle | `img[src*="/pic/szornyk/"]` |
| Shop | text content `Vétel` + `Eladás` |
| Church | text content `Mágikus tárgy` + `Negatív hatások` |

If selectors need updating: edit `pageDetector.ts`, re-run `npm test`, rebuild with `npm run build`.

- [ ] **Step 7: Verify FreeMove layout on mobile viewport**

In DevTools, enable mobile viewport (375px width). Check:
- Location image fills width
- StatBar bars are visible
- NavPad buttons are ≥ 44px tap target
- Action buttons are full-width
- Narration text is readable

- [ ] **Step 8: Verify Battle layout and monster tooltip**

Navigate to a battle screen. Check:
- Monster image fills width
- Action buttons ("megtámadod", "elmenekülsz") are large and tappable
- Tap a monster name in the narration text → MonsterCard drawer slides up
- MonsterCard shows correct stats from the database
- Tap outside the drawer → it closes

- [ ] **Step 9: Commit final state**

Revert the loader's `SCRIPT_URL` back to the production placeholder before committing:
```javascript
const SCRIPT_URL = 'https://YOUR_DOMAIN_HERE/larkinor-ui.user.js';
```

```bash
cd /Users/robert.remenyi/Documents/Dev/lcenter/lc-userscript
git add loader/larkinor-loader.user.js
git commit -m "chore: revert loader URL to production placeholder after smoke test"
```

---

## Self-review notes

- **Spec coverage check:**
  - ✅ Two-script architecture (loader + main)
  - ✅ Vite + vite-plugin-monkey + Preact + TS
  - ✅ Proxy DOM pattern (`hideOriginalDOM`, `domExtract`)
  - ✅ PageType enum + `detectPage`
  - ✅ `FreeMoveState` + `BattleState` extraction
  - ✅ Monsters data layer with `GM_setValue` cache
  - ✅ `NarrationPanel` with regex monster linking
  - ✅ `MonsterCard` bottom drawer
  - ✅ `StatBar` with fill bars
  - ✅ `NavPad` D-pad
  - ✅ `FreeMove` page composition
  - ✅ `Battle` page composition
  - ✅ `main.ts` entry wiring
  - ✅ CSS design tokens + `lc-` prefix
  - ✅ Production build + smoke test
  - ✅ `MONSTERS_JSON_URL` as deployment constant
  - ✅ `SCRIPT_URL` in loader as deployment constant

- **Type consistency confirmed:** `Direction`, `Action`, `FreeMoveState`, `BattleState`, `Monster`, `MonsterDatabase` are defined once and imported by name throughout.
