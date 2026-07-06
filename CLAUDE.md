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
├── lc-userscript/        # Vite + Preact + TS ViolentMonkey userscript
│   ├── src/
│   │   ├── main.ts               # Entry: detect page → proxy DOM → mount Preact
│   │   ├── pages/                # FreeMove.tsx, Battle.tsx
│   │   ├── components/           # StatBar, NavPad, NarrationPanel, MonsterCard
│   │   ├── data/monsters.ts      # Monster type, DB (fetch + GM_setValue cache)
│   │   ├── utils/                # pageDetector, domExtract, narration
│   │   └── styles/base.css       # Dark-medieval theme, lc- prefixed
│   ├── tests/                    # Vitest + @testing-library/preact (jsdom)
│   ├── loader/larkinor-loader.user.js   # Hand-written ViolentMonkey loader
│   ├── serve.sh                  # Build + LAN-serve for local device testing
│   └── vite.config.ts
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

A mobile-first UI replacement for Larkinor, built with **Vite + vite-plugin-monkey + Preact + TypeScript**. Targets Firefox for Android with ViolentMonkey. Ships as a single bundled `.user.js`.

### Architecture

- **Two-script pattern**: a tiny hand-written **loader** (`loader/larkinor-loader.user.js`) is the only thing installed in ViolentMonkey; it `GM_xmlhttpRequest`-fetches and `eval`s the built **main script** from the server on every page load (cache-busted with `?v=`). Update the game UI by re-uploading the built file — no reinstall.
  - **Critical**: because the loader `eval`s the main script, the main script's GM calls run in the **loader's** grant sandbox. The loader MUST `@grant` everything the main script uses: `GM_addStyle`, `GM_getValue`, `GM_setValue`, `GM_xmlhttpRequest`. Missing any → `ReferenceError` on boot.
- **Proxy-DOM pattern** (`main.ts`): on a page we handle, extract game state from the live DOM, move the original DOM into an off-screen `#lc-offscreen` container (never destroy it), mount a Preact app into `#lc-root`. UI actions `.click()` the original hidden controls so the game's own form logic runs unchanged. Extraction happens *before* `hideOriginalDOM`.
- **Page detection** (`utils/pageDetector.ts`): read hidden `input[name="oldalTipus"]` — `otVilag`→FreeMove, `otHarc`→Battle, `otTemplom`→Church, `otVegyesbolt`/`otFegyverbolt`/`otPiac`→Shop, else→Unknown. v1 renders only FreeMove + Battle; other pages are left untouched.
- All injected classes/IDs use the `lc-` prefix; colors via the CSS variables in `base.css` (same dark-medieval palette as lc-database).

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
cd lc-userscript
npm install
npm test            # Vitest (jsdom); GM_* are mocked in tests/setup.ts
npm run build       # → dist/larkinor-ui.user.js (build wipes dist/ first)
npx tsc --noEmit    # type-check
```

**Deploy** (production host `https://example.invalid/larkinor/`): upload both
`dist/larkinor-ui.user.js` and `dist/monsters.json` there. The monsters URL is
baked into the build (`MONSTERS_JSON_URL` in `main.ts`); `@connect` for the host
is in `vite.config.ts`. `npm run build` wipes `dist/`, so re-copy `monsters.json`
(from `lc-database/db/monsters.json`) after each build. Static serving over HTTPS
is enough — `GM_xmlhttpRequest` bypasses CORS, so no CORS headers needed.

**Local device testing**: `./serve.sh` builds, copies `monsters.json`, bakes the
LAN URL, serves `dist/` with CORS, and prints a ready-to-install loader.

**Console-injection testing** (no ViolentMonkey, e.g. via Playwright/DevTools on
the live game): serve `dist/` with CORS on `127.0.0.1` (loopback is exempt from
mixed-content blocking), then paste GM_* shims + `eval(fetch(...))`. Reloading
the game logs the session out (POST-driven), so re-inject in place rather than
reloading.

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
