# CLAUDE.md — lcenter

Support tooling for [Larkinor](https://larkinor.hu), a Hungarian browser-based text RPG.

## Project structure

A single Vite + Preact + TypeScript project at the repo root: an in-game
userscript **and** a standalone database explorer, sharing one data layer and
theme.

```
lcenter/
├── src/
│   ├── main.ts              # Entry: detect platform → bootMobile | bootDesktop
│   ├── mobile/boot.ts       # Mobile boot: proxy-DOM page replacement
│   ├── desktop/             # Desktop boot: dock + in-place enhancements
│   │   ├── boot.ts · DesktopDock.tsx
│   │   ├── enhanceNarration.ts · useKeyboardShortcuts.ts
│   │   └── desktop.css
│   ├── pages/               # FreeMove.tsx, Battle.tsx, Dungeon.tsx, Login.tsx, Home.tsx (mobile)
│   ├── components/          # StatBar, NavPad, NarrationPanel, MonsterCard, DatabaseOverlay
│   ├── hooks/               # useHotkeyConfig
│   ├── utils/               # platform, pageDetector, domExtract, narration, hotkeys, config
│   ├── shared/
│   │   ├── data/
│   │   │   ├── types.ts     # Weapon, Armor, Item, Monster, MapCell, Shop (typed models)
│   │   │   ├── monsters.ts  # Monster DB + retrieval
│   │   │   ├── source.ts    # DataSource (gmSource for GM, httpSource for fetch)
│   │   │   ├── loader.ts    # createDataLoader(source, baseUrl)
│   │   │   └── index.ts
│   │   └── styles/theme.css # Single shared dark-medieval theme (variables + scopes)
│   └── database/            # Standalone DB (built separately; also mounted in-game)
│       ├── index.html · main.tsx · DatabaseApp.tsx   # hash-routed tabs
│       ├── explorer/        # DataTable, FilterBar, DetailPanel, ExplorerView, columns/filters/labels/lookups
│       └── map/             # MapView, CellDetail, Legend, mapMeta
├── static/db/*.json         # Game data — SINGLE SOURCE OF TRUTH
│                            #   monsters, weapons, armors, items, map-data, item-shops, weapon-shops
├── tests/                   # Vitest + @testing-library/preact (jsdom)
├── loader/larkinor-loader.user.js   # Hand-written ViolentMonkey loader (fetches + evals main script)
├── scripts/deploy.sh        # scp dist/ + static/ to the server (config from repo-root .env)
├── docs/superpowers/        # specs + plans
├── vite.config.ts           # Userscript build (vite-plugin-monkey)
├── vite.config.db.ts        # Standalone DB build
├── Makefile · serve.sh · package.json · tsconfig.json
└── screenshots/             # Game screenshots for reference
```

## Overview

One Vite + Preact + TypeScript project delivering both an **in-game UI replacement** (userscript) and a **standalone database explorer**, from a shared data layer and theme. Targets Firefox for Android via ViolentMonkey; the standalone DB opens in any browser.

**Data conventions**:
- All game data is JSON under `static/db/` (the single source of truth).
- Hungarian language throughout (game is Hungarian) — UI copy stays Hungarian; identifiers/comments English.
- Map coordinates: `imageId = row*10 + col`, row 0 = north, col 0 = west.

> The original zero-dependency HTML explorer (`lc-database/`) has been fully
> ported into `src/database/` and removed; see git history if you need it.

### Architecture

#### Shared data layer (`src/shared/data/`)
- **TypeScript models** (`types.ts`): `Weapon`, `Armor`, `Item`, `Monster`, `MapCell`, `Shop` with full typing.
- **DataSource abstraction** (`source.ts`): `gmSource` (runs in userscript, uses `GM_xmlhttpRequest`) and `httpSource` (runs standalone, uses `fetch`). DB components must use `DataSource`, never call GM_* directly, so the same code runs in-game and standalone.
- **Data loader** (`loader.ts`): `createDataLoader(source, baseUrl)` → `DataLoader` with methods like `fetchMonsters()`, `fetchWeapons()`, etc. Cached via `GM_setValue` in-game, HTTP caching standalone.
- **Data single source of truth**: `static/db/*.json` (monsters, weapons, armors, items, map-data, item-shops, weapon-shops), deployed to `/larkinor/static/db/` on the production host.

#### Shared theme (`src/shared/styles/theme.css`)
- Single dark-medieval CSS variables sheet; **never add hardcoded hex/rgba in rule bodies** — use `:root` variables and `.lc-db` scopes.
- `.lc-db` classes scope explorer/map styles; userscript components use `lc-` classes.

#### In-game userscript (`src/main.ts`, `src/mobile/`, `src/desktop/`, `src/pages/`, `src/components/`)
- **Two-script pattern**: tiny hand-written loader (`loader/larkinor-loader.user.js`) fetches and `eval`s the built main script on every page load (cache-busted with `?v=`). Update the UI by re-uploading the built file — no reinstall.
  - **Critical**: because the loader `eval`s the main script, the main script's GM calls run in the **loader's** grant sandbox. The loader MUST `@grant` everything the main script uses: `GM_addStyle`, `GM_getValue`, `GM_setValue`, `GM_xmlhttpRequest`. Missing any → `ReferenceError` on boot.
- **Proxy-DOM pattern** (mobile only): on a page we handle (FreeMove, Battle, Dungeon, Login, Home), extract game state from the live DOM, move the original DOM into an off-screen `#lc-offscreen` container (never destroy), mount a Preact app into `#lc-root`. UI actions `.click()` the original hidden controls so the game's own form logic runs unchanged. The desktop mode does **not** do this — see *Two platform modes* below.
- **Page detection** (`utils/pageDetector.ts`): read hidden `input[name="oldalTipus"]` — `otVilag`→FreeMove, `otHarc`→Battle, `otTemplom`→Church, `otLogin`→Login, `otLabirintus`→Dungeon, `otSajathaz`→Home, `otVegyesbolt`/`otFegyverbolt`/`otPiac`→Shop, else→Unknown. Mobile renders FreeMove, Battle, Login, Dungeon and Home, and leaves the rest untouched; desktop adds its dock to every page.
- **In-game database** accessible via "Adatbázis" overlay button (DatabaseOverlay component); reuses standalone DB components with `gmSource`.
- **Two platform modes** (`utils/platform.ts`): `detectPlatform(window)` picks `mobile` when
  `(pointer: coarse)` matches or the viewport is under 900px, else `desktop`. A stored
  override (`lc-platform-override`, set from the config drawer's *Felület* toggle) wins over
  auto-detection; it takes effect on the next page load.
  - **Mobile** (`src/mobile/boot.ts`) is the proxy-DOM full replacement described above.
  - **Desktop** (`src/desktop/boot.ts`) *augments* instead: it never calls `hideOriginalDOM`
    or injects a viewport meta. It mounts a fixed `#lc-dock-root` companion dock (quick
    actions, encounter attack, config, database), makes DB-known monster names in the live
    narration clickable (`enhanceNarration` — text-node splicing only, never `innerHTML`,
    which would destroy the game's own `<a>` handlers), and binds keyboard shortcuts
    (WASD/arrows, Space, 1–9, Q, Esc — all suppressed while the event target is a form
    control, so typing in chat can't move the character). The dock renders on every page,
    including ones we don't recognise; only free-move gets the full action set.
  - Because the game page stays visible on desktop, **no CSS may use an unscoped element
    selector** — everything stays under `#lc-root`, `#lc-dock-root` or a `.lc-*` class.

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
- The game page ships **no viewport meta**, so mobile browsers assume ~980px; `src/mobile/boot.ts` injects `width=device-width` on pages we take over. The desktop boot deliberately does not — the ~980px assumption is correct there.
- **Encoding gotcha**: `db/monsters.json` had Latin-1/Latin-2 mojibake (`õ`/`û` instead of `ő`/`ű`) that broke name matching against the correctly-encoded live narration — fixed. Watch for this in any scraped Hungarian data.
- **The game page runs in quirks mode** (`document.compatMode === 'BackCompat'` — verified live; the doctype is unusable). Two inheritance holes bite anything we render inside it, and neither reproduces in the standalone build, which is standards mode:
  - **Quirks mode does not inherit `color` or `font-size` into tables.** Cells reset to the document default however light the ancestor is — black text at 16px on our dark background. This made the in-game DB overlay's explorer and map nearly unreadable; `theme.css` now forces `color: inherit` on the `.lc-db` table and form elements. The `font-size` half is deliberately left alone (it only makes cells 16px instead of 14px, and fixing it shifts row heights).
  - **Form controls never inherit `color`** in any mode, so `input`/`select`/`option`/`button`/`textarea` need it set explicitly too.
  - Practical rule: an in-game component that renders a `<table>` or a form control must set `color` explicitly rather than relying on a coloured ancestor. Everything else (divs, spans) inherits normally.
- **Geometry of the desktop chat panel** (`#mydiv`, measured live at both 1440×900 and 1280×720): `left: 60, top: 473, 500×300`, absolutely positioned, `z-index: 10`, with its own text input occupying the top ~22px. It is laid out in fixed pixels and **does not move with the window**, which is why `src/desktop/boot.ts`'s `alignDock` can measure once at boot with no resize listener. Its parent is the 633px game content column at `0,−97` — note the negative top, i.e. the column starts above the viewport.

## Development workflow

All commands run from the repo root.

```bash
npm install

# Development
npm run dev          # Vite dev server for the userscript UI (make dev)
npm run dev:db       # Standalone DB dev server, data at /db (make dev-db)
npm test             # Vitest (jsdom); GM_* are mocked in tests/setup.ts
npm run test:watch   # Vitest in watch mode
npx tsc --noEmit     # Type-check
npm run build        # Full build: build:userscript && build:db (make build)
npm run serve        # Simple HTTP server for dist/ (http://localhost:9000)
```

**Build order** (important): `npm run build` runs `build:userscript` first (which wipes `dist/`), then `build:db` (which writes into `dist/` without emptying it — `emptyOutDir: false`). Both artifacts share the `dist/` root so the DB is the site entry point:
- `dist/index.html` (+ `dist/assets/`) — standalone database viewer (the site root)
- `dist/larkinor-ui.user.js` — userscript (run via ViolentMonkey loader)

**Data paths**:
- Dev userscript: data served from `/static/db/` (publicDir in `vite.config.ts`)
- Dev standalone DB: data served from `/db/` (publicDir in `vite.config.db.ts`, `dev` only)
- Prod standalone DB: fetches same-origin `/larkinor/static/db/` (baked in `src/database/main.tsx`)
- `static/db/` is the single source; the DB build does not copy it (deploy ships it separately).

**Production deploy** (host `https://example.invalid/larkinor/`):
Run `make deploy` (or `bash scripts/deploy.sh` directly). This:
1. Builds the userscript and standalone DB
2. Uploads `dist/.` → `/larkinor/` — so `/larkinor/` renders the DB (`index.html`),
   `/larkinor/larkinor-ui.user.js` is the userscript, `/larkinor/assets/` the DB assets
3. Uploads `static/.` → `/larkinor/static/` (data at `/larkinor/static/db/`, for both)
Userscript data URL is baked in `main.ts` (`DATA_BASE_URL`, absolute remote host); the
standalone DB uses the same-origin `/larkinor/static/db`. `@connect` host is in
`vite.config.ts`. Static serving over HTTPS is enough — `GM_xmlhttpRequest` bypasses CORS.

**Local device testing** via userscript loader:
```bash
./serve.sh    # Builds, serves on port 9912 (or PORT=9000 ./serve.sh); prints loader URL
```
Install the printed loader into ViolentMonkey (one-time). After code changes, re-run `serve.sh` — the loader fetches the fresh script on next page load.

**Console-injection testing** (no ViolentMonkey; debug on the live game via DevTools):
1. Serve `dist/` with CORS on `127.0.0.1` (loopback is exempt from mixed-content blocking)
2. Paste GM_* shims (from `tests/setup.ts`) + the eval fetch line into the console
3. Re-inject in place rather than reloading (reloading logs out the game session)

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
