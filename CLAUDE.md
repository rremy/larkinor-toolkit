# CLAUDE.md — lcenter

Support tooling for [Larkinor](https://larkinor.hu), a Hungarian browser-based text RPG.

## Project structure

```
lcenter/
├── lc-database/          # Offline database explorer (plain HTML + JSON)
│   ├── explorer.html     # Main entry point — item/weapon/armor/monster browser
│   ├── map.html          # Interactive map viewer
│   ├── map-data.json     # Map cell data (districts, shops, monsters)
│   ├── map.md            # Map documentation and exploration notes
│   ├── item-shops.json   # Item shop inventory data
│   ├── weapon-shops.json # Weapon shop inventory data
│   └── db/
│       ├── items.json
│       ├── weapons.json
│       ├── armors.json
│       └── monsters.json
├── lc-userscript/        # ViolentMonkey userscript (to be created)
│   └── larkinor-ui.user.js
└── screenshots/          # Game screenshots for reference
```

## Module 1 — lc-database

A self-contained, zero-dependency HTML+JS database explorer. No build step, no server required — open directly in a browser.

**Stack**: Vanilla HTML/CSS/JavaScript, JSON data files loaded via `fetch`.

**Design system** (established in `explorer.html`):
- Dark medieval theme (`--bg: #1a1410`, `--accent: #d4a259`)
- CSS custom properties for all colors — always use variables, never hardcoded hex
- District tints: `--varos`, `--magus`, `--harcos`, `--kezdo`, `--sotet`, `--szikla`, etc.
- Responsive via flexbox; mobile viewport meta is set

**Data conventions**:
- All game data is stored as JSON under `lc-database/db/`
- Hungarian language throughout (game is Hungarian)
- Map coordinates: `imageId = row*10 + col`, row 0 = north, col 0 = west

## Module 2 — lc-userscript

A hosted ViolentMonkey userscript injected into `larkinor.hu` pages on mobile Firefox.

**Goal**: Modernize the game's aging HTML UI for mobile-friendly use without touching the server.

**Hosting**: Served from a local or remote HTTP server (URL configured in the `@downloadURL` / `@updateURL` header so ViolentMonkey can auto-update).

**Userscript metadata block** (`==UserScript==`):
```js
// @name         Larkinor UI
// @namespace    https://lcenter.local/
// @match        https://larkinor.hu/*
// @match        https://l2.larkinor.hu/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-end
```

**Design principles**:
- Inject CSS overrides via `GM_addStyle` — never alter page HTML unless necessary
- When altering layout is unavoidable, use `MutationObserver` or `DOMContentLoaded` hooks
- Replace `<select>` fields with mobile-friendly button groups where UX benefits
- All injected elements must have a namespaced class prefix (`lc-*`) to avoid collisions
- Keep the script modular: one IIFE per page section (navigation, shop, combat, etc.)
- Preserve game functionality — UI changes must not break form submissions or game logic

**Mobile targets**: Firefox for Android with ViolentMonkey extension.

## Development workflow

### lc-database

```bash
# Serve locally (Python 3)
python3 -m http.server 8080 --directory lc-database

# Or Node
npx serve lc-database
```

Open `http://localhost:8080/explorer.html` in a browser. No build step needed.

When adding new data: edit the relevant JSON under `lc-database/db/` and update `explorer.html` if new columns/tabs are needed.

### lc-userscript

```bash
# Serve the script file so ViolentMonkey can fetch/update it
python3 -m http.server 9000 --directory lc-userscript

# The script URL to paste into ViolentMonkey:
# http://<your-ip>:9000/larkinor-ui.user.js
```

For remote hosting, the script can be placed on any static file host (GitHub raw, personal server, etc.).

## Game context

- **Language**: Hungarian
- **Base URL**: `https://larkinor.hu` (game pages), `https://l2.larkinor.hu` (assets, map images)
- **Map image URL pattern**: `https://l2.larkinor.hu/tajk/<imageId>.gif`
- **Districts**: városközpont, mágus-negyed, harcos-negyed, kezdő-negyed, sötét-negyed, sziklabarlangok, erdő, mocsár, temető, démonok-földje
- **Shop types**: palota, vegyesbolt, erőd, fegyverbolt, ékszerész, templom, mágustorony, kocsma, piac, kaszinó, aréna

## Code standards

- Build tools, bundlers, and frameworks are allowed — pick the best fit for the task
- External CDN dependencies are fine (the game is online; network access is assumed)
- **Minification is optional** but the source must always be human-readable
- Follow the existing dark-theme CSS variable system when adding UI elements
- **All comments and identifiers must be in English**
