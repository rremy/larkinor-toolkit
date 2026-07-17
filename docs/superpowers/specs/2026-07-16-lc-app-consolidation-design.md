# Design — Consolidate lc-database into the userscript project (`lc-app`)

**Date:** 2026-07-16
**Status:** Approved (design), pending implementation plan

## Goal

Fold the standalone `lc-database` explorer into the `lc-userscript` project so the two
modules share one codebase — typed data models, data loaders, the dark-medieval theme,
and presentational components — and deploy to the same server together.

The database must be usable in **two** ways:

1. **Standalone site** — opened directly in a browser (bookmarked on mobile), served
   from the deploy host.
2. **In-game overlay** — a button in the injected userscript UI opens the explorer/map
   as a full-screen overlay while playing the live game.

## Decisions (locked)

| Decision | Choice |
| --- | --- |
| DB access model | **Both** — standalone site *and* in-game overlay |
| Rewrite scope | **Full port** of the DB explorer + map viewer to Preact + TypeScript |
| Data source | **Server only** — fetch JSON; no build-time data inlining, single source of truth |
| Project layout | **Single Vite project**, multi-target build (no workspaces) |
| Folder name | Rename `lc-userscript/` → **`lc-app/`** |
| Old `lc-database/` | **Keep it** — the user deletes it manually after migration is tested. Do not remove it as part of this work. |

## Target structure

```
lc-app/                          # renamed from lc-userscript/
├── src/
│   ├── shared/
│   │   ├── data/
│   │   │   ├── types.ts         # Weapon, Armor, Item, Monster, MapCell, Shop
│   │   │   ├── loader.ts        # createDataLoader(source) — pluggable fetch
│   │   │   ├── monsters.ts      # moved from src/data/monsters.ts
│   │   │   └── index.ts
│   │   ├── components/          # StatBar, MonsterCard, DataTable, DetailPanel, badges
│   │   └── styles/
│   │       └── theme.css        # single :root palette (was styles/base.css)
│   ├── userscript/              # existing injected game app
│   │   ├── main.ts
│   │   └── pages/ components/ utils/ hooks/
│   └── database/                # ported standalone DB
│       ├── index.html           # explorer entry (multi-page build)
│       ├── main.tsx
│       ├── DatabaseApp.tsx      # tabs: Fegyverek / Vértek / Tárgyak / Szörnyek / Térkép
│       ├── views/
│       │   ├── ExplorerView.tsx # sortable/filterable table + detail panel
│       │   └── MapView.tsx      # district grid + cell detail
│       └── db.ts                # wires shared loader with the httpSource (plain fetch)
├── static/db/                   # single source of truth for JSON data
│   ├── monsters.json weapons.json armors.json items.json   # already present
│   └── map-data.json item-shops.json weapon-shops.json     # to be copied from lc-database/
├── vite.config.ts               # userscript build target (vite-plugin-monkey)
└── vite.config.db.ts            # standalone DB build target (multi-page)
```

## Component / module design

### Shared data layer (`src/shared/data/`)

The current `loadMonsters` calls `GM_getValue`/`GM_xmlhttpRequest` directly, which do not
exist in a plain browser. Abstract fetching behind a `DataSource` interface so the same
DB components run in-game and standalone.

```ts
interface DataSource {
  // Fetch and parse JSON from a URL, with a caching layer keyed by url.
  fetchJson<T>(url: string): Promise<T>;
}
```

- **`gmSource`** — `GM_xmlhttpRequest` for the request (bypasses CORS), `GM_setValue`/
  `GM_getValue` for caching. Used by the userscript and the in-game overlay.
- **`httpSource`** — `window.fetch` for the request, `localStorage` for optional caching.
  Used by the standalone site.

`createDataLoader(source)` returns typed getters, each fetching a file under the data
base URL and validating shape:

```ts
loadWeapons(): Promise<Weapon[]>
loadArmors(): Promise<Armor[]>
loadItems(): Promise<Item[]>
loadMonsters(): Promise<MonsterDatabase>   // preserves existing byName index
loadMap(): Promise<MapCell[]>
loadShops(): Promise<{ item: Shop[]; weapon: Shop[] }>
```

The existing `Monster`/`MonsterDatabase` types and `buildMonsterDatabase` move here
unchanged; `loadMonsters` is refactored to go through the `DataSource` rather than calling
`GM_*` directly.

### Shared components (`src/shared/components/`)

Extract the genuinely reusable presentational pieces so both apps import the same code:

- `StatBar`, `MonsterCard` (already exist in userscript — moved and generalized)
- `DataTable` — generic sortable/filterable table (extracted from the explorer monolith)
- `DetailPanel` — the right-hand detail card
- badge helpers

Userscript pages and DB views both import from `shared/components/`. The DB-specific
filter widgets and the map grid stay in `src/database/`.

### Standalone DB (`src/database/`)

`DatabaseApp.tsx` reproduces the current explorer's tabbed UI (Fegyverek / Vértek /
Tárgyak / Szörnyek / Térkép) plus the hash-based routing/deep-linking that
`explorer.html` already has. `ExplorerView` renders the table + filters + detail;
`MapView` renders the district grid + cell detail (ported from `map.html`). `db.ts`
constructs the loader with `httpSource`.

### In-game overlay (`src/userscript/`)

Add an **"Adatbázis"** button (in the NavPad or a header slot) that mounts
`<DatabaseApp source={gmSource} />` into a full-screen `lc-`-prefixed overlay layered
above the game UI, with a close control. Data is fetched via `gmSource` (GM request +
GM cache). Because `DatabaseApp` is the same component tree as the standalone site, no
duplication.

## Build & deploy

- `npm run build:userscript` → `dist/larkinor-ui.user.js` (existing `vite-plugin-monkey`
  pipeline, unchanged).
- `npm run build:db` → `dist/db/` (multi-page Vite build: `index.html` + hashed JS/CSS
  assets). Target-specific config in `vite.config.db.ts` to keep the monkey config
  isolated.
- `npm run build` runs both.
- Deploy under `/larkinor/` on the host:
  - userscript: `/larkinor/larkinor-ui.user.js`
  - standalone DB: `/larkinor/db/`
  - data: `/larkinor/static/db/*.json`
- `serve.sh` continues to serve `dist/` over LAN with CORS for device testing; it also
  serves the DB build.

## Data files

`static/db/` becomes the single source of truth. It already holds `monsters.json`,
`weapons.json`, `armors.json`, `items.json`. During migration, copy `map-data.json`,
`item-shops.json`, and `weapon-shops.json` from `lc-database/` into `static/db/`.
The old `lc-database/` folder (and its 1.8 MB inlined-data `explorer.html`) is left in
place; the user removes it after manual verification.

## Testing

- Vitest unit tests for the shared data layer: typed parsing, filtering, sorting, the
  `DataSource` cache behaviour (GM path is mocked as today in `tests/setup.ts`; http path
  tested against a stubbed `fetch`).
- Component tests (`@testing-library/preact`) for `DataTable` sort/filter and
  `DatabaseApp` tab switching.
- Existing userscript tests keep passing after the file moves (import paths updated).
- `npx tsc --noEmit` clean.

## Migration order (each step independently shippable)

1. **Scaffold + rename** — rename folder to `lc-app`; create `src/shared/` (move
   `data/monsters.ts`, `styles/base.css`→`theme.css`); add the `DataSource` abstraction
   and refactor `loadMonsters` onto it; add the `build:db` target. Update `Makefile`,
   `serve.sh`, `vite.config.ts` alias, `package.json`, and repo `CLAUDE.md` references.
2. **Port ExplorerView** — weapons/armors/items/monsters table + filters + detail; copy
   the shop/map JSON into `static/db/`; standalone site works server-only.
3. **Port MapView** — district grid + cell detail from `map.html`.
4. **In-game overlay** — add the "Adatbázis" button and overlay mount in the userscript.
5. **Handoff** — update docs; leave `lc-database/` for the user to delete after manual
   testing.

## Non-goals

- No npm workspaces / monorepo tooling.
- No offline (`file://`) build of the standalone DB — server-hosted only.
- No new data content or scraping; data files are copied/consolidated as-is.
- Not deleting `lc-database/` in this work.
