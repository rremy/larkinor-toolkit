# CLAUDE.md — lcenter

Support tooling for [Larkinor](https://larkinor.hu), a Hungarian browser-based text RPG.

## Project structure

```
lcenter/
├── lc-database/          # LEGACY — offline database explorer (plain HTML + JSON)
│   │                     # Pending deletion after manual testing
│   ├── explorer.html     # (archived)
│   ├── map.html          # (archived)
│   └── db/               # (archived)
├── lc-app/        # Vite + Preact + TS — unified userscript + standalone DB
│   ├── src/
│   │   ├── main.ts                       # Userscript entry: detect page → proxy DOM → mount Preact
│   │   ├── pages/                        # FreeMove.tsx, Battle.tsx, Dungeon.tsx, Login.tsx
│   │   ├── components/                   # StatBar, NavPad, NarrationPanel, MonsterCard, DatabaseOverlay
│   │   ├── hooks/                        # useHotkeyConfig
│   │   ├── utils/                        # pageDetector, domExtract, narration, hotkeys, config
│   │   ├── shared/
│   │   │   ├── data/
│   │   │   │   ├── types.ts              # Weapon, Armor, Item, Monster, MapCell, Shop (typed models)
│   │   │   │   ├── monsters.ts           # Monster DB + retrieval
│   │   │   │   ├── source.ts             # DataSource (gmSource for GM, httpSource for fetch)
│   │   │   │   ├── loader.ts             # createDataLoader(source, baseUrl)
│   │   │   │   └── index.ts              # Exports
│   │   │   └── styles/
│   │   │       └── theme.css             # Single shared dark-medieval theme (variables + scopes)
│   │   └── database/                     # Standalone DB components
│   │       ├── main.tsx                  # DB entry: hash-routed tabs
│   │       ├── DatabaseApp.tsx           # Tab routing (Fegyverek, Vértek, Tárgyak, Szörnyek, Térkép)
│   │       ├── explorer/
│   │       │   ├── DataTable.tsx         # Sortable/filterable table with detail panel
│   │       │   ├── FilterBar.tsx         # Filter input + preset toggles
│   │       │   ├── DetailPanel.tsx       # Full item/weapon/armor/monster details
│   │       │   ├── ExplorerView.tsx      # Unified explorer layout
│   │       │   ├── columns.ts            # ColumnDef[] per tab
│   │       │   ├── filters.ts            # FilterDef[] and filtering logic
│   │       │   └── labels.ts             # UI text (Hungarian)
│   │       └── map/
│   │           ├── MapView.tsx           # Clickable districts map
│   │           ├── CellDetail.tsx        # Map cell info + monsters
│   │           └── mapMeta.ts            # District & shop metadata
│   ├── static/db/
│   │   ├── monsters.json                 # Game data (single source of truth)
│   │   ├── weapons.json
│   │   ├── armors.json
│   │   ├── items.json
│   │   ├── map-data.json
│   │   ├── item-shops.json
│   │   └── weapon-shops.json
│   ├── tests/                            # Vitest + @testing-library/preact (jsdom)
│   ├── loader/larkinor-loader.user.js   # Hand-written ViolentMonkey loader (fetches + evals main script)
│   ├── vite.config.ts                    # Userscript build config (vite-plugin-monkey)
│   ├── vite.config.db.ts                 # Standalone DB build config
│   ├── package.json
│   └── tsconfig.json
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

## Module 2 — lc-app

A unified Vite + Preact + TypeScript project for both **in-game UI replacement** (userscript) and **standalone database explorer**. Targets Firefox for Android via ViolentMonkey; standalone DB opens in any browser.

### Architecture

#### Shared data layer (`src/shared/data/`)
- **TypeScript models** (`types.ts`): `Weapon`, `Armor`, `Item`, `Monster`, `MapCell`, `Shop` with full typing.
- **DataSource abstraction** (`source.ts`): `gmSource` (runs in userscript, uses `GM_xmlhttpRequest`) and `httpSource` (runs standalone, uses `fetch`). DB components must use `DataSource`, never call GM_* directly, so the same code runs in-game and standalone.
- **Data loader** (`loader.ts`): `createDataLoader(source, baseUrl)` → `DataLoader` with methods like `fetchMonsters()`, `fetchWeapons()`, etc. Cached via `GM_setValue` in-game, HTTP caching standalone.
- **Data single source of truth**: `static/db/*.json` (monsters, weapons, armors, items, map-data, item-shops, weapon-shops), deployed to `/larkinor/static/db/` on the production host.

#### Shared theme (`src/shared/styles/theme.css`)
- Single dark-medieval CSS variables sheet; **never add hardcoded hex/rgba in rule bodies** — use `:root` variables and `.lc-db` scopes.
- `.lc-db` classes scope explorer/map styles; userscript components use `lc-` classes.

#### In-game userscript (`src/main.ts`, `src/pages/`, `src/components/`)
- **Two-script pattern**: tiny hand-written loader (`loader/larkinor-loader.user.js`) fetches and `eval`s the built main script on every page load (cache-busted with `?v=`). Update the UI by re-uploading the built file — no reinstall.
  - **Critical**: because the loader `eval`s the main script, the main script's GM calls run in the **loader's** grant sandbox. The loader MUST `@grant` everything the main script uses: `GM_addStyle`, `GM_getValue`, `GM_setValue`, `GM_xmlhttpRequest`. Missing any → `ReferenceError` on boot.
- **Proxy-DOM pattern**: on a page we handle (FreeMove, Battle, Dungeon, Login), extract game state from the live DOM, move the original DOM into an off-screen `#lc-offscreen` container (never destroy), mount a Preact app into `#lc-root`. UI actions `.click()` the original hidden controls so the game's own form logic runs unchanged.
- **Page detection** (`utils/pageDetector.ts`): read hidden `input[name="oldalTipus"]` — `otVilag`→FreeMove, `otHarc`→Battle, `otTemplom`→Church, `otVegyesbolt`/`otFegyverbolt`/`otPiac`→Shop, else→Unknown. v1 renders FreeMove, Battle, Dungeon, Login.
- **In-game database** accessible via "Adatbázis" overlay button (DatabaseOverlay component); reuses standalone DB components with `gmSource`.

#### Standalone database (`src/database/`, built separately)
- **Hash-routed tabs**: Fegyverek (Weapons), Vértek (Armors), Tárgyak (Items), Szörnyek (Monsters), Térkép (Map).
- **Explorer components** (`explorer/`): sortable/filterable DataTable with side DetailPanel, FilterBar with presets, ColumnDef/FilterDef system per tab.
- **Map viewer** (`map/`): clickable districts with cell details and resident monsters.
- Uses `httpSource` for data fetching; no ViolentMonkey required — serves standalone at `/db/` during dev, `/larkinor/` in production.

### Real game DOM — hard-won facts (see `docs/superpowers/specs/2026-07-06-larkinor-real-dom-reference.md`)

The synthetic assumptions in the original plan were wrong; the real DOM is:
- Absolutely-positioned `<div>`s (no tables), many sharing an invalid duplicate `id="Layer3"`; page is **ISO-8859-2**.
- All controls are `<input type="image">` driving one shared `<form name="urlap">` via inline `onclick`. **Never parse/reconstruct the onclick** — locate the control (by image basename or `title`) and `.click()` it.
- **Stats are printed `max / current`** on BOTH screens (e.g. `Életpont: 303 / 260`) — the reverse of the intuitive order; `extractStats` swaps them. Gold (`Pénz:`) uses `&nbsp;`/space thousands separators → strip non-digits.
- Directions: image inputs `eszak`/`del`/`kelet`/`nyugat` → N/S/E/W. Actions: `select[name="tevFajta"]` + the `ok.gif` submit button. Buildings: other image inputs (excluding nav, `ok`, `tamadas`). Encounter attack button: `tamadas.gif` (`svEngageCreature`) → rendered icon-only in the NavPad centre. Status icons (insurance/curse/shield): the `<img>`s inside the stat `<b>` block, shown next to gold.
- Monster (battle): `img[title*="letpontja"]` → name before the comma, HP after `életpontja:`.
- Narration: the `font[face="Comic sans MS"]` block; `<br>` is converted to newlines (rendered with `white-space: pre-line`).
- **Monster detection uses narration sentence templates** (`utils/narration.ts` → `ENCOUNTER_PATTERNS`), each capturing the monster name, resolved against the DB. Add new templates as single-capture-group regexes to that array (there are unit tests per template).
- **Monster image path**: the DB stores `/pic/szornyk/NAME_k.gif` but the live server serves it at `/szornyk/NAME_k.gif` (no `/pic`) — `MonsterCard.monsterImageUrl` strips the `/pic`. Asset base is `https://l2.larkinor.hu`.
- The game page ships **no viewport meta**, so mobile browsers assume ~980px; `main.ts` injects `width=device-width` on pages we take over.
- **Encoding gotcha**: `db/monsters.json` had Latin-1/Latin-2 mojibake (`õ`/`û` instead of `ő`/`ű`) that broke name matching against the correctly-encoded live narration — fixed. Watch for this in any scraped Hungarian data.

## Development workflow

### lc-app

```bash
cd lc-app
npm install

# Development
npm run dev          # Vite dev server for userscript (http://localhost:5173)
npm run dev:db      # Standalone DB dev server (http://localhost:5173/db)
npm test            # Vitest (jsdom); GM_* are mocked in tests/setup.ts
npm test:watch      # Vitest in watch mode
npx tsc --noEmit    # Type-check
npm run build       # Full build: npm run build:userscript && npm run build:db
npm run serve       # Simple HTTP server for dist/ (http://localhost:9000)
```

**Build order** (important): `npm run build` runs `build:userscript` first (which wipes `dist/`), then `build:db`. Both artifacts are written to `dist/`:
- `dist/larkinor-ui.user.js` — userscript (run via ViolentMonkey loader)
- `dist/db/index.html` — standalone database viewer

**Data paths**:
- Dev userscript: data served from `/static/db/` (publicDir in `vite.config.ts`)
- Dev standalone DB: data served from `/db/` (publicDir in `vite.config.db.ts` at root)
- Both configs: `static/db/` is the source; Vite copies it as configured per build target.

**Production deploy** (host `https://example.invalid/larkinor/`):
Run `make deploy` in lc-app (or `bash ../scripts/deploy.sh` directly). This:
1. Builds the userscript and standalone DB
2. Uploads `dist/larkinor-ui.user.js` → `/larkinor/larkinor-ui.user.js`
3. Uploads `dist/db/` → `/larkinor/db/` (standalone DB site at `/larkinor/db/index.html`)
4. Uploads `static/db/` → `/larkinor/static/db/` (data for both userscript and standalone DB)
Userscript data URL is baked in `main.ts` (`DATA_BASE_URL`); `@connect` host is in `vite.config.ts`. Static serving over HTTPS is enough — `GM_xmlhttpRequest` bypasses CORS.

**Local device testing** via userscript loader:
```bash
cd lc-app
./serve.sh    # Builds, serves on port 9912 (or PORT=9000 ./serve.sh); prints loader URL
```
Install the printed loader into ViolentMonkey (one-time). After code changes, re-run `serve.sh` — the loader fetches the fresh script on next page load.

**Console-injection testing** (no ViolentMonkey; debug on the live game via DevTools):
1. Serve `dist/` with CORS on `127.0.0.1` (loopback is exempt from mixed-content blocking)
2. Paste GM_* shims (from `tests/setup.ts`) + the eval fetch line into the console
3. Re-inject in place rather than reloading (reloading logs out the game session)

### lc-database (LEGACY)

The original standalone database explorer is archived under `lc-database/` pending manual testing and deletion. Do not use for new work — all database functionality is now in `lc-app/src/database/`.

For reference (if needed):
```bash
# Serve archived lc-database locally (Python 3)
python3 -m http.server 8080 --directory lc-database
# Open http://localhost:8080/explorer.html in a browser
```

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
- **Temporary files** (screenshots, scratch scripts, debug output, Playwright
  artifacts, etc.) go in the repo-root `.tmp/` folder, which is git-ignored.
  Never leave them in the repo root or commit them.
