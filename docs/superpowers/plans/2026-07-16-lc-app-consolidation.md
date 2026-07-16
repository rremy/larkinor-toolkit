# lc-app Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fold the standalone `lc-database` explorer into the userscript project (renamed `lc-app`) so both share typed data models, a pluggable data loader, one theme, and Preact components — deployable together and usable as a standalone site *and* an in-game overlay.

**Architecture:** One Vite project, two build targets. `src/shared/` holds data types, a `DataSource`-backed loader (GM in-game, `fetch` standalone), the theme, and reusable components. `src/userscript/` is the existing injected app; `src/database/` is the ported explorer + map. The DB explorer is a Preact rewrite of `lc-database/explorer.html` + `map.html`, fetching JSON from `static/db/` (server only).

**Tech Stack:** Vite 5, Preact 10, TypeScript 5, `vite-plugin-monkey` 4, Vitest 1 + `@testing-library/preact`.

## Global Constraints

- **Preact + TypeScript**; `npx tsc --noEmit` must stay clean. No React.
- **All identifiers and comments in English**; game-facing UI copy stays Hungarian.
- **Injected CSS/DOM uses the `lc-` prefix**; colors via the CSS custom properties in the theme — never hardcoded hex in new code.
- **Data is server-only** — fetch from `static/db/`; no build-time data inlining.
- **Do NOT delete `lc-database/`** — the user removes it manually after testing.
- **Single source of truth for data** is `lc-app/static/db/*.json`.
- **The DB components must render in both environments** — no direct `GM_*` calls inside `src/shared/components/` or `src/database/`; all fetching goes through a `DataSource`.
- Data host (production): `https://example.invalid/larkinor/static/db/`.
- Existing tests must keep passing after file moves (update import paths).

## File Structure

```
lc-app/                                 (renamed from lc-userscript/)
├── src/
│   ├── shared/
│   │   ├── data/
│   │   │   ├── types.ts                 Weapon, Armor, Item, MapCell, Shop, ItemShop
│   │   │   ├── monsters.ts              moved from src/data/monsters.ts (types + buildMonsterDatabase)
│   │   │   ├── source.ts                DataSource interface + gmSource + httpSource
│   │   │   ├── loader.ts                createDataLoader(source, baseUrl)
│   │   │   └── index.ts                 barrel re-export
│   │   ├── styles/
│   │   │   └── theme.css                moved from src/styles/base.css
│   │   └── components/                  (populated during port tasks)
│   ├── userscript/                      (existing app — files moved here)
│   │   ├── main.ts
│   │   ├── pages/  components/  utils/  hooks/
│   └── database/
│       ├── index.html                   standalone entry
│       ├── main.tsx                      mounts DatabaseApp with httpSource
│       ├── DatabaseApp.tsx               tabs + hash routing
│       ├── explorer/
│       │   ├── ExplorerView.tsx
│       │   ├── DataTable.tsx
│       │   ├── Filters.tsx
│       │   ├── DetailPanel.tsx
│       │   ├── columns.ts                COLS config (typed)
│       │   ├── filters.ts               FILTERS config + applyFilters + sortRows
│       │   └── labels.ts                TYPE_LABEL
│       └── map/
│           ├── MapView.tsx
│           ├── mapMeta.ts               DISTRICT_CLASS/SHORT, POI_EMOJI/LABEL, parseId
│           └── CellDetail.tsx
├── static/db/                           monsters/weapons/armors/items + map-data/item-shops/weapon-shops
├── vite.config.ts                       userscript target
└── vite.config.db.ts                    standalone DB target
```

`lc-database/` (source of the port) is left untouched throughout.

---

## Task 1: Rename `lc-userscript/` → `lc-app/` and update references

Pure rename + reference update. No behavior change. The deliverable: the project builds and tests from its new path.

**Files:**
- Rename dir: `lc-userscript/` → `lc-app/`
- Modify: `lc-app/package.json` (name field)
- Modify: `lc-app/Makefile` (comment header only — commands unchanged)
- Modify: `scripts/deploy.sh:16-17` (`DIST_DIR`/`STATIC_DIR` paths)
- Modify: `scripts/deploy.sh:6` (comment)
- Modify: `CLAUDE.md` (repo-root — all `lc-userscript` path references → `lc-app`)

**Interfaces:**
- Produces: project root at `lc-app/`; `npm` scripts unchanged.

- [ ] **Step 1: Rename the directory with git**

```bash
cd /Users/robert.remenyi/Documents/Dev/lcenter
git mv lc-userscript lc-app
```

- [ ] **Step 2: Update package name**

In `lc-app/package.json` change:
```json
  "name": "lc-userscript",
```
to:
```json
  "name": "lc-app",
```

- [ ] **Step 3: Update deploy.sh paths**

In `scripts/deploy.sh` change these two lines:
```bash
DIST_DIR="${REPO_ROOT}/lc-userscript/dist"
STATIC_DIR="${REPO_ROOT}/lc-userscript/static"
```
to:
```bash
DIST_DIR="${REPO_ROOT}/lc-app/dist"
STATIC_DIR="${REPO_ROOT}/lc-app/static"
```
And update the comment on line 6 (`lc-userscript/dist` → `lc-app/dist`).

- [ ] **Step 4: Update Makefile header comment**

In `lc-app/Makefile`, change the first comment line `# lc-userscript build / deploy` to `# lc-app build / deploy`. Recipes are unchanged.

- [ ] **Step 5: Update repo-root CLAUDE.md path references**

In `/Users/robert.remenyi/Documents/Dev/lcenter/CLAUDE.md` replace directory-path occurrences of `lc-userscript/` with `lc-app/` (the module heading "Module 2 — lc-userscript" and the `cd lc-userscript` command included). Leave the historical spec/plan filenames untouched.

- [ ] **Step 6: Verify build + tests from the new path**

Run:
```bash
cd /Users/robert.remenyi/Documents/Dev/lcenter/lc-app && npm test && npx tsc --noEmit && npm run build
```
Expected: tests PASS, tsc no errors, `dist/larkinor-ui.user.js` produced.

- [ ] **Step 7: Commit**

```bash
cd /Users/robert.remenyi/Documents/Dev/lcenter
git add -A
git commit -m "refactor: rename lc-userscript to lc-app"
```

---

## Task 2: Shared data types

Add a typed model for every DB entity, matching the real JSON shapes in `lc-database/db/*.json` and `lc-database/*.json`.

**Files:**
- Create: `lc-app/src/shared/data/types.ts`
- Test: `lc-app/tests/shared/data/types.test.ts`

**Interfaces:**
- Produces:
  - `interface DropRef { monsterId: number; qty: number }`
  - `interface RecipeRef { name: string; qty: number; id: string }`
  - `interface ShopRef { cellId: string; owner: string; price: number }`
  - `interface Weapon { id: number; name: string; weight: number; price: number; special: string; magical: boolean; craftableAt: string; minLevel: number | null; recipe: RecipeRef[]; droppedBy: DropRef[]; type: string; maxDamage: number; spread: number; avgDamage: number; vampiric: boolean; level: number; availability: string[]; shops: ShopRef[] }`
  - `interface Armor { id: number; name: string; weight: number; price: number; special: string; magical: boolean; craftableAt: string; minLevel: number | null; recipe: RecipeRef[]; droppedBy: DropRef[]; type: string; defense: number; level: number; shops?: ShopRef[] }`
  - `interface Item { id: number; name: string; weight: number; price: number; special: string; magical: boolean; craftableAt: string; minLevel: number | null; recipe: RecipeRef[]; droppedBy: DropRef[]; defense: number | null; shops: ShopRef[] }`
  - `interface Building { name: string; icon: string }`
  - `interface MapCell { imageId: string; imageSrc: string; district: string; buildings: Building[]; clanHouses: Building[]; exits: Record<string, string>; blockers: Record<string, string>; firstCoords: [number, number] }`
  - `interface MapData { cells: MapCell[] }`
  - `interface ShopLine { id: string; qty: number; name: string; price: number }`
  - `interface ItemShop { cellId: string; owner: string; itemCount: number; items: ShopLine[] }`
  - `interface ShopData { shops: ItemShop[] }`

- [ ] **Step 1: Write the failing test**

```ts
// lc-app/tests/shared/data/types.test.ts
import { describe, it, expect } from 'vitest';
import weapons from '../../../../lc-database/db/weapons.json';
import type { Weapon } from '@/shared/data/types';

describe('data types', () => {
  it('a real weapon record satisfies the Weapon type', () => {
    const w = weapons[0] as Weapon;
    expect(w.name).toBe('bot');
    expect(w.type).toBe('Ütő/Zúzó');
    expect(w.shops[0].owner).toBe('Thorgard');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lc-app && npx vitest run tests/shared/data/types.test.ts`
Expected: FAIL — cannot resolve `@/shared/data/types`.

- [ ] **Step 3: Create the types file**

Write `lc-app/src/shared/data/types.ts` with all the interfaces from the **Interfaces → Produces** block above, each `export`ed.

- [ ] **Step 4: Allow JSON imports in the test tsconfig if needed**

If tsc/vitest complains about the `.json` import, confirm `resolveJsonModule` is set. Run:
```bash
cd lc-app && grep resolveJsonModule tsconfig.json || echo MISSING
```
If `MISSING`, add `"resolveJsonModule": true` to `compilerOptions` in `lc-app/tsconfig.json`.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd lc-app && npx vitest run tests/shared/data/types.test.ts && npx tsc --noEmit`
Expected: PASS, tsc clean.

- [ ] **Step 6: Commit**

```bash
cd /Users/robert.remenyi/Documents/Dev/lcenter
git add lc-app/src/shared/data/types.ts lc-app/tests/shared/data/types.test.ts lc-app/tsconfig.json
git commit -m "feat: add shared DB data types"
```

---

## Task 3: DataSource abstraction + relocate monster loader

Introduce a pluggable fetch/cache layer so DB code never calls `GM_*` directly, and move the monster types/loader into `src/shared/data/`.

**Files:**
- Create: `lc-app/src/shared/data/source.ts`
- Move: `lc-app/src/data/monsters.ts` → `lc-app/src/shared/data/monsters.ts` (refactor `loadMonsters` off `GM_*`)
- Create: `lc-app/src/shared/data/loader.ts`
- Create: `lc-app/src/shared/data/index.ts`
- Modify: `lc-app/src/main.ts` (import paths + use loader)
- Create: `lc-app/tests/shared/data/source.test.ts`
- Move: `lc-app/tests/data/monsters.test.ts` → `lc-app/tests/shared/data/monsters.test.ts` (if it exists; update import path)

**Interfaces:**
- Consumes: types from Task 2; `Monster`, `MonsterDatabase`, `buildMonsterDatabase` from the moved `monsters.ts`.
- Produces:
  - `interface DataSource { fetchJson<T>(url: string): Promise<T> }`
  - `function gmSource(cacheKeyPrefix?: string): DataSource` — uses `GM_xmlhttpRequest` + `GM_getValue`/`GM_setValue` (cache key = prefix + url).
  - `function httpSource(): DataSource` — uses `window.fetch`; caches JSON text in `localStorage` under `lc_cache:<url>`.
  - `interface DataLoader { loadWeapons(): Promise<Weapon[]>; loadArmors(): Promise<Armor[]>; loadItems(): Promise<Item[]>; loadMonsters(): Promise<MonsterDatabase>; loadMap(): Promise<MapData>; loadItemShops(): Promise<ShopData>; loadWeaponShops(): Promise<ShopData> }`
  - `function createDataLoader(source: DataSource, baseUrl: string): DataLoader` — each method fetches `${baseUrl}/<file>.json`.

- [ ] **Step 1: Write the failing test for `httpSource`**

```ts
// lc-app/tests/shared/data/source.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { httpSource, createDataLoader } from '@/shared/data';

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

describe('httpSource', () => {
  it('fetches and parses JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200, text: async () => '[{"id":1}]',
    })));
    const src = httpSource();
    const data = await src.fetchJson<{ id: number }[]>('http://x/w.json');
    expect(data[0].id).toBe(1);
  });

  it('serves the second call from localStorage cache', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => '[1,2]' }));
    vi.stubGlobal('fetch', fetchMock);
    const src = httpSource();
    await src.fetchJson('http://x/a.json');
    await src.fetchJson('http://x/a.json');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('createDataLoader', () => {
  it('requests the weapons file under the base url', async () => {
    const fetchJson = vi.fn(async () => []);
    const loader = createDataLoader({ fetchJson }, 'http://x/db');
    await loader.loadWeapons();
    expect(fetchJson).toHaveBeenCalledWith('http://x/db/weapons.json');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lc-app && npx vitest run tests/shared/data/source.test.ts`
Expected: FAIL — cannot resolve `@/shared/data`.

- [ ] **Step 3: Move monsters.ts and refactor `loadMonsters` off GM**

```bash
cd /Users/robert.remenyi/Documents/Dev/lcenter/lc-app
mkdir -p src/shared/data
git mv src/data/monsters.ts src/shared/data/monsters.ts
```
In `src/shared/data/monsters.ts` **delete** the `loadMonsters` function and the `CACHE_KEY` constant (fetching moves to the loader). Keep `MonsterDrop`, `Monster`, `MonsterDatabase`, and `buildMonsterDatabase`.

- [ ] **Step 4: Create `source.ts`**

```ts
// lc-app/src/shared/data/source.ts
export interface DataSource {
  fetchJson<T>(url: string): Promise<T>;
}

export function gmSource(cacheKeyPrefix = 'lc_cache:'): DataSource {
  return {
    fetchJson<T>(url: string): Promise<T> {
      const key = cacheKeyPrefix + url;
      const cached = GM_getValue(key, null);
      if (cached) {
        try { return Promise.resolve(JSON.parse(cached) as T); } catch { /* refetch */ }
      }
      return new Promise<T>((resolve, reject) => {
        GM_xmlhttpRequest({
          method: 'GET',
          url,
          onload(res) {
            if (res.status !== 200) { reject(new Error(`HTTP ${res.status} for ${url}`)); return; }
            try {
              const parsed = JSON.parse(res.responseText) as T;
              GM_setValue(key, res.responseText);
              resolve(parsed);
            } catch (e) { reject(e); }
          },
          onerror() { reject(new Error(`Network error for ${url}`)); },
        });
      });
    },
  };
}

export function httpSource(cacheKeyPrefix = 'lc_cache:'): DataSource {
  return {
    async fetchJson<T>(url: string): Promise<T> {
      const key = cacheKeyPrefix + url;
      const cached = localStorage.getItem(key);
      if (cached) {
        try { return JSON.parse(cached) as T; } catch { /* refetch */ }
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const text = await res.text();
      const parsed = JSON.parse(text) as T;
      try { localStorage.setItem(key, text); } catch { /* quota — ignore */ }
      return parsed;
    },
  };
}
```

- [ ] **Step 5: Create `loader.ts`**

```ts
// lc-app/src/shared/data/loader.ts
import type { DataSource } from './source';
import type { Weapon, Armor, Item, MapData, ShopData } from './types';
import { buildMonsterDatabase, type Monster, type MonsterDatabase } from './monsters';

export interface DataLoader {
  loadWeapons(): Promise<Weapon[]>;
  loadArmors(): Promise<Armor[]>;
  loadItems(): Promise<Item[]>;
  loadMonsters(): Promise<MonsterDatabase>;
  loadMap(): Promise<MapData>;
  loadItemShops(): Promise<ShopData>;
  loadWeaponShops(): Promise<ShopData>;
}

export function createDataLoader(source: DataSource, baseUrl: string): DataLoader {
  const url = (file: string) => `${baseUrl}/${file}`;
  return {
    loadWeapons: () => source.fetchJson<Weapon[]>(url('weapons.json')),
    loadArmors: () => source.fetchJson<Armor[]>(url('armors.json')),
    loadItems: () => source.fetchJson<Item[]>(url('items.json')),
    loadMonsters: async () =>
      buildMonsterDatabase(await source.fetchJson<Monster[]>(url('monsters.json'))),
    loadMap: () => source.fetchJson<MapData>(url('map-data.json')),
    loadItemShops: () => source.fetchJson<ShopData>(url('item-shops.json')),
    loadWeaponShops: () => source.fetchJson<ShopData>(url('weapon-shops.json')),
  };
}
```

- [ ] **Step 6: Create the barrel `index.ts`**

```ts
// lc-app/src/shared/data/index.ts
export * from './types';
export * from './monsters';
export * from './source';
export * from './loader';
```

- [ ] **Step 7: Update `main.ts` to use the loader**

In `lc-app/src/main.ts`:
- Change the import on line 4 from
  `import { loadMonsters, type MonsterDatabase } from '@/data/monsters';`
  to
  `import { createDataLoader, gmSource, type MonsterDatabase } from '@/shared/data';`
- Replace the `MONSTERS_JSON_URL` constant (lines 16-18) with a base URL:
  ```ts
  const DATA_BASE_URL = import.meta.env.DEV
    ? new URL('/static/db', import.meta.url).href
    : 'https://example.invalid/larkinor/static/db';
  ```
- Replace the `loadMonsters(MONSTERS_JSON_URL)` call (line 103) with:
  ```ts
  createDataLoader(gmSource(), DATA_BASE_URL).loadMonsters()
  ```
- Update the `@/styles/base.css?raw` import in Step of Task 4 (leave for now; it still resolves).

- [ ] **Step 8: Add a monster-loader test through the loader**

```ts
// append to lc-app/tests/shared/data/source.test.ts
import { buildMonsterDatabase } from '@/shared/data';
describe('loadMonsters via loader', () => {
  it('indexes monsters by lowercased name', async () => {
    const fetchJson = vi.fn(async () => [{ name: 'Kutya' }]) as any;
    const { createDataLoader } = await import('@/shared/data');
    const db = await createDataLoader({ fetchJson }, 'http://x/db').loadMonsters();
    expect(db.getByName('kutya')).toBeTruthy();
    expect(buildMonsterDatabase([]).getByName('x')).toBeUndefined();
  });
});
```

- [ ] **Step 9: Run all tests + typecheck**

Run: `cd lc-app && npx vitest run && npx tsc --noEmit`
Expected: PASS (including pre-existing tests), tsc clean.

- [ ] **Step 10: Commit**

```bash
cd /Users/robert.remenyi/Documents/Dev/lcenter
git add -A
git commit -m "feat: add pluggable DataSource + DataLoader, relocate monster loader"
```

---

## Task 4: Relocate the theme to `shared/styles`

Single theme file consumed by both apps. The DB currently duplicates the palette in `lc-database/explorer.html`; the injected app uses `src/styles/base.css`.

**Files:**
- Move: `lc-app/src/styles/base.css` → `lc-app/src/shared/styles/theme.css`
- Modify: `lc-app/src/main.ts:9` (import path)
- Modify: any other `@/styles/base.css` importers (grep first)

**Interfaces:**
- Produces: `@/shared/styles/theme.css` (raw-importable stylesheet with the `:root` palette + `lc-` scoped rules).

- [ ] **Step 1: Move the file**

```bash
cd /Users/robert.remenyi/Documents/Dev/lcenter/lc-app
mkdir -p src/shared/styles
git mv src/styles/base.css src/shared/styles/theme.css
```

- [ ] **Step 2: Update all importers**

Run:
```bash
cd lc-app && grep -rln "styles/base.css" src
```
For each hit, replace `@/styles/base.css` with `@/shared/styles/theme.css`. (At minimum `src/main.ts:9`.)

- [ ] **Step 3: Verify build + tests**

Run: `cd lc-app && npx tsc --noEmit && npm test && npm run build`
Expected: tsc clean, tests PASS, `dist/larkinor-ui.user.js` still contains the injected styles.

- [ ] **Step 4: Commit**

```bash
cd /Users/robert.remenyi/Documents/Dev/lcenter
git add -A
git commit -m "refactor: move theme to shared/styles/theme.css"
```

---

## Task 5: Standalone DB build target (scaffold)

Add a second Vite build that produces the standalone site. Deliverable: `npm run build:db` emits `dist/db/index.html` that boots an empty `DatabaseApp`.

**Files:**
- Create: `lc-app/vite.config.db.ts`
- Create: `lc-app/src/database/index.html`
- Create: `lc-app/src/database/main.tsx`
- Create: `lc-app/src/database/DatabaseApp.tsx`
- Modify: `lc-app/package.json` (scripts)
- Modify: `scripts/deploy.sh` (no change needed — `dist/.` already recurses into `dist/db`; verify only)

**Interfaces:**
- Consumes: `createDataLoader`, `httpSource` from Task 3.
- Produces: `DatabaseApp` Preact component (props `{ loader: DataLoader }`); standalone entry mounting it with `httpSource`.

- [ ] **Step 1: Create the DB entry HTML**

```html
<!-- lc-app/src/database/index.html -->
<!DOCTYPE html>
<html lang="hu">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#1a1410">
  <title>Larkinor adatbázis</title>
</head>
<body>
  <div id="lc-db-root"></div>
  <script type="module" src="./main.tsx"></script>
</body>
</html>
```

- [ ] **Step 2: Create `DatabaseApp.tsx` (placeholder body)**

```tsx
// lc-app/src/database/DatabaseApp.tsx
import { h } from 'preact';
import type { DataLoader } from '@/shared/data';

export interface DatabaseAppProps {
  loader: DataLoader;
}

export function DatabaseApp(_props: DatabaseAppProps) {
  return <div id="lc-root" class="lc-db"><h1>Larkinor adatbázis</h1></div>;
}
```

- [ ] **Step 3: Create `main.tsx`**

```tsx
// lc-app/src/database/main.tsx
import { h, render } from 'preact';
import { createDataLoader, httpSource } from '@/shared/data';
import { DatabaseApp } from './DatabaseApp';
import theme from '@/shared/styles/theme.css?raw';

const DATA_BASE_URL = import.meta.env.DEV
  ? '/static/db'
  : 'https://example.invalid/larkinor/static/db';

const style = document.createElement('style');
style.textContent = theme;
document.head.appendChild(style);

const loader = createDataLoader(httpSource(), DATA_BASE_URL);
render(<DatabaseApp loader={loader} />, document.getElementById('lc-db-root')!);
```

- [ ] **Step 4: Create `vite.config.db.ts`**

```ts
// lc-app/vite.config.db.ts
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import path from 'node:path';

// Standalone DB site build. Kept separate from the vite-plugin-monkey config so
// the two targets never share plugins. Outputs to dist/db so the userscript
// build (which empties dist/) must run FIRST — see package.json `build`.
export default defineConfig({
  root: path.resolve(__dirname, 'src/database'),
  base: './',
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  publicDir: path.resolve(__dirname, 'static'),
  plugins: [preact()],
  build: {
    outDir: path.resolve(__dirname, 'dist/db'),
    emptyOutDir: true,
  },
});
```

Note: `publicDir` points at `static/`, so the dev server serves `/static/db/*.json` and the build copies it into `dist/db/static/`. Adjust `DATA_BASE_URL` dev value if the served path differs; verify in Step 7.

- [ ] **Step 5: Add package.json scripts**

In `lc-app/package.json` replace the `"build"` script and add DB scripts:
```json
    "dev": "vite",
    "dev:db": "vite --config vite.config.db.ts",
    "build": "npm run build:userscript && npm run build:db",
    "build:userscript": "vite build",
    "build:db": "vite build --config vite.config.db.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "serve": "python3 -m http.server 9000 --directory dist"
```

- [ ] **Step 6: Build the DB target**

Run: `cd lc-app && npm run build:db`
Expected: `dist/db/index.html` + hashed `dist/db/assets/*.js` produced.

- [ ] **Step 7: Smoke-test the standalone page**

Run:
```bash
cd lc-app && npm run dev:db
```
Open the printed URL. Expected: page shows the "Larkinor adatbázis" heading with the dark theme background (`#1a1410`). Stop the dev server (Ctrl-C).

- [ ] **Step 8: Verify the combined build keeps the userscript**

Run: `cd lc-app && npm run build && ls dist/larkinor-ui.user.js dist/db/index.html`
Expected: both files exist (userscript build runs first and empties `dist/`, then DB build creates `dist/db/`).

- [ ] **Step 9: Commit**

```bash
cd /Users/robert.remenyi/Documents/Dev/lcenter
git add -A
git commit -m "feat: add standalone DB build target with empty DatabaseApp"
```

---

## Task 6: Copy data files + port the Explorer view

The largest task. Port the tabbed table explorer (weapons/armors/items/monsters) from `lc-database/explorer.html` — filters, sortable columns, detail panel, hash routing — into Preact. The **testable logic** (filter/sort/fold-accents) is specified with full code + tests; the **markup/layout** reproduces `lc-database/explorer.html` sections cited by line range, using the theme classes already defined there.

**Files:**
- Copy: `lc-database/map-data.json`, `lc-database/item-shops.json`, `lc-database/weapon-shops.json` → `lc-app/static/db/`
- Create: `lc-app/src/database/explorer/columns.ts`
- Create: `lc-app/src/database/explorer/labels.ts`
- Create: `lc-app/src/database/explorer/filters.ts`
- Create: `lc-app/src/database/explorer/DataTable.tsx`
- Create: `lc-app/src/database/explorer/Filters.tsx`
- Create: `lc-app/src/database/explorer/DetailPanel.tsx`
- Create: `lc-app/src/database/explorer/ExplorerView.tsx`
- Modify: `lc-app/src/database/DatabaseApp.tsx`
- Modify: `lc-app/src/shared/styles/theme.css` (append the explorer-specific rules from `lc-database/explorer.html` `<style>`, `lc-`-neutral)
- Test: `lc-app/tests/database/filters.test.ts`
- Test: `lc-app/tests/database/DataTable.test.tsx`

**Interfaces:**
- Consumes: `DataLoader`, `Weapon`/`Armor`/`Item`/`MonsterDatabase` from shared.
- Produces:
  - `type EntityTab = 'weapons' | 'armors' | 'items' | 'monsters'`
  - `interface ColumnDef { key: string; label: string; num?: boolean; bool?: boolean; cls?: string }`
  - `const COLS: Record<EntityTab, ColumnDef[]>`
  - `type FilterDef = { type: 'search' | 'range' | 'select' | 'tri'; key: string; label: string; options?: string[] }`
  - `const FILTERS: Record<EntityTab, FilterDef[]>`
  - `type FilterState = Record<string, string>` (raw control values; range keys use `<key>_min`/`<key>_max`, tri uses `''|'yes'|'no'`)
  - `function foldAccents(s: string): string`
  - `function applyFilters<T>(rows: T[], defs: FilterDef[], state: FilterState): T[]`
  - `function sortRows<T>(rows: T[], key: string, asc: boolean, numeric: boolean): T[]`
  - `<ExplorerView loader tab onSelect>` and `<DatabaseApp>` rendering tab bar + ExplorerView.

- [ ] **Step 1: Copy the three JSON files into static/db**

```bash
cd /Users/robert.remenyi/Documents/Dev/lcenter
cp lc-database/map-data.json lc-database/item-shops.json lc-database/weapon-shops.json lc-app/static/db/
```

- [ ] **Step 2: Write the failing filter/sort test**

```ts
// lc-app/tests/database/filters.test.ts
import { describe, it, expect } from 'vitest';
import { applyFilters, sortRows, foldAccents } from '@/database/explorer/filters';
import type { FilterDef } from '@/database/explorer/filters';

const rows = [
  { name: 'Kard', level: 5, magical: true },
  { name: 'őrbot', level: 2, magical: false },
  { name: 'Balta', level: 5, magical: true },
];

describe('foldAccents', () => {
  it('strips Hungarian accents and lowercases', () => {
    expect(foldAccents('ŐrÜtő')).toBe('oruto');
  });
});

describe('applyFilters', () => {
  const defs: FilterDef[] = [
    { type: 'search', key: 'name', label: '' },
    { type: 'range', key: 'level', label: '' },
    { type: 'tri', key: 'magical', label: '' },
  ];
  it('accent-insensitive name search', () => {
    expect(applyFilters(rows, defs, { name: 'orbot' }).map(r => r.name)).toEqual(['őrbot']);
  });
  it('range min/max on level', () => {
    expect(applyFilters(rows, defs, { level_min: '5' }).map(r => r.name)).toEqual(['Kard', 'Balta']);
  });
  it('tri-state boolean', () => {
    expect(applyFilters(rows, defs, { magical: 'no' }).map(r => r.name)).toEqual(['őrbot']);
  });
});

describe('sortRows', () => {
  it('numeric ascending', () => {
    expect(sortRows(rows, 'level', true, true).map(r => r.level)).toEqual([2, 5, 5]);
  });
  it('string descending, accent-folded', () => {
    expect(sortRows(rows, 'name', false, false)[0].name).toBe('őrbot');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd lc-app && npx vitest run tests/database/filters.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `filters.ts`**

```ts
// lc-app/src/database/explorer/filters.ts
export type FilterDef = {
  type: 'search' | 'range' | 'select' | 'tri';
  key: string;
  label: string;
  options?: string[];
};
export type FilterState = Record<string, string>;

export function foldAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function applyFilters<T extends Record<string, unknown>>(
  rows: T[], defs: FilterDef[], state: FilterState,
): T[] {
  return rows.filter((row) => defs.every((def) => {
    if (def.type === 'search') {
      const q = (state[def.key] ?? '').trim();
      if (!q) return true;
      return foldAccents(String(row[def.key] ?? '')).includes(foldAccents(q));
    }
    if (def.type === 'range') {
      const v = Number(row[def.key]);
      const min = state[`${def.key}_min`], max = state[`${def.key}_max`];
      if (min !== undefined && min !== '' && !(v >= Number(min))) return false;
      if (max !== undefined && max !== '' && !(v <= Number(max))) return false;
      return true;
    }
    if (def.type === 'select') {
      const sel = state[def.key];
      if (!sel) return true;
      return String(row[def.key]) === sel;
    }
    // tri
    const t = state[def.key];
    if (!t) return true;
    return Boolean(row[def.key]) === (t === 'yes');
  }));
}

export function sortRows<T extends Record<string, unknown>>(
  rows: T[], key: string, asc: boolean, numeric: boolean,
): T[] {
  const dir = asc ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (numeric) return (Number(a[key]) - Number(b[key])) * dir;
    return foldAccents(String(a[key] ?? '')).localeCompare(foldAccents(String(b[key] ?? ''))) * dir;
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd lc-app && npx vitest run tests/database/filters.test.ts`
Expected: PASS.

- [ ] **Step 6: Create `columns.ts` and `labels.ts`**

Transcribe the `COLS` object from `lc-database/explorer.html:291-337` into `columns.ts` as `export const COLS: Record<EntityTab, ColumnDef[]>` (also `export type EntityTab` and `export interface ColumnDef`). Transcribe `TYPE_LABEL` from `lc-database/explorer.html:595-...` into `labels.ts`. Transcribe `FILTERS` from `lc-database/explorer.html:339-372` into `filters.ts` as `export const FILTERS: Record<EntityTab, FilterDef[]>`.

- [ ] **Step 7: Write the DataTable component test**

```tsx
// lc-app/tests/database/DataTable.test.tsx
import { h } from 'preact';
import { render, fireEvent, screen } from '@testing-library/preact';
import { describe, it, expect, vi } from 'vitest';
import { DataTable } from '@/database/explorer/DataTable';
import type { ColumnDef } from '@/database/explorer/columns';

const cols: ColumnDef[] = [
  { key: 'name', label: 'Név' },
  { key: 'level', label: 'Szint', num: true },
];
const rows = [{ name: 'Kard', level: 5 }, { name: 'Balta', level: 2 }];

describe('DataTable', () => {
  it('renders rows and sorts on header click', () => {
    render(<DataTable columns={cols} rows={rows} onSelect={() => {}} />);
    fireEvent.click(screen.getByText('Szint'));
    const cells = screen.getAllByRole('row').slice(1).map(r => r.textContent);
    expect(cells[0]).toContain('Balta'); // level 2 first, ascending
  });

  it('calls onSelect with the clicked row', () => {
    const onSelect = vi.fn();
    render(<DataTable columns={cols} rows={rows} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Kard'));
    expect(onSelect).toHaveBeenCalledWith(rows[0]);
  });
});
```

- [ ] **Step 8: Implement `DataTable.tsx`**

Build a sortable table component with signature
`function DataTable<T extends Record<string, unknown>>(props: { columns: ColumnDef[]; rows: T[]; onSelect: (row: T) => void; selected?: T }): VNode`.
Manage `sortKey`/`sortAsc` in `useState` (default first numeric-less column ascending); render `<th>`s with click handlers calling `sortRows(rows, col.key, asc, !!col.num)`; render `<tr class="row">` with `onClick={() => onSelect(row)}`, applying `col.cls`, formatting booleans as a `badge yes/no`, numbers right-aligned. Reproduce the markup/classes from `lc-database/explorer.html:511-544` (`renderTable`) and the `fmt`/bool rules from `explorer.html:504-510`.

- [ ] **Step 9: Implement `Filters.tsx` and `DetailPanel.tsx`**

- `Filters.tsx`: `function Filters(props: { defs: FilterDef[]; state: FilterState; onChange: (next: FilterState) => void }): VNode` — render one control per def (search input, min/max range pair, select, tri-state select `''/yes/no`) mirroring `explorer.html:407-465` (`renderFilters`). Include the "Clear" button resetting state to `{}`.
- `DetailPanel.tsx`: `function DetailPanel(props: { tab: EntityTab; entity: Weapon | Armor | Item | Monster | null; onClose: () => void; onJump: (tab: EntityTab, id: number) => void }): VNode` — reproduce the detail rendering from `explorer.html:548-594` (`renderDetail`), including recipe/droppedBy/shops lists. `droppedBy`/recipe entries call `onJump` to cross-navigate.

- [ ] **Step 10: Implement `ExplorerView.tsx`**

`function ExplorerView(props: { loader: DataLoader; tab: EntityTab }): VNode`:
- On mount / `tab` change, `useState` for the loaded rows; call the matching loader method (`loadWeapons`/`loadArmors`/`loadItems`; for monsters use `loadMonsters()` then `[...db.byName.values()]`). Guard with a loading flag.
- Hold `filterState` and `selected` in `useState`.
- Compute `visible = applyFilters(rows, FILTERS[tab], filterState)`.
- Layout: `<Filters>` on top, `<DataTable>` + `<DetailPanel>` side by side, matching `explorer.html` `.db-view .layout` (`explorer.html:...`). Show a result count.

- [ ] **Step 11: Wire tabs + hash routing into `DatabaseApp.tsx`**

Replace the placeholder body with:
- A tab bar (Fegyverek/Vértek/Tárgyak/Szörnyek — Térkép added in Task 7) mirroring `explorer.html` header tabs.
- `useState` for the active tab, initialised from `location.hash` and kept in sync (reproduce `syncFromHash`/`navigate` from `explorer.html:664-716`, format `#<tab>` and `#<tab>/<id>`).
- Render `<ExplorerView loader={props.loader} tab={activeTab} />`.

- [ ] **Step 12: Append explorer styles to the theme**

Copy the explorer-specific CSS rules from the `<style>` block of `lc-database/explorer.html` (the `.tabs`, `.filters`, `.db-view`, `table.db`, `.detail`, `.badge` rules — `explorer.html:24-...`) into `lc-app/src/shared/styles/theme.css`, appended under a `/* ===== DB explorer ===== */` banner. Keep selectors as-is (they're already class-based and theme-variable-driven). Do **not** duplicate the `:root` palette — it's already present.

- [ ] **Step 13: Run tests + typecheck + build**

Run: `cd lc-app && npx vitest run && npx tsc --noEmit && npm run build:db`
Expected: all tests PASS, tsc clean, `dist/db/index.html` builds.

- [ ] **Step 14: Manual smoke test**

Run `cd lc-app && npm run dev:db`, open the page. Expected: four tabs, table populated, filters narrow the list, clicking a row shows its detail, hash updates (`#weapons/4`). Stop the server.

- [ ] **Step 15: Commit**

```bash
cd /Users/robert.remenyi/Documents/Dev/lcenter
git add -A
git commit -m "feat: port Explorer view (tables, filters, detail) to Preact"
```

---

## Task 7: Port the Map view

Port `lc-database/map.html`'s district grid + cell detail into a `MapView` component and add it as a fifth tab.

**Files:**
- Create: `lc-app/src/database/map/mapMeta.ts`
- Create: `lc-app/src/database/map/CellDetail.tsx`
- Create: `lc-app/src/database/map/MapView.tsx`
- Modify: `lc-app/src/database/DatabaseApp.tsx` (add "Térkép" tab)
- Modify: `lc-app/src/shared/styles/theme.css` (append map grid rules)
- Test: `lc-app/tests/database/mapMeta.test.ts`

**Interfaces:**
- Consumes: `DataLoader.loadMap()`, `MapCell`, `MapData` from shared.
- Produces:
  - `function parseId(imageId: string): { row: number; col: number }` (`row = floor(id/10)`, `col = id % 10`)
  - `const DISTRICT_CLASS`, `DISTRICT_SHORT`, `POI_EMOJI`, `POI_LABEL: Record<string, string>`
  - `<MapView loader>` and `<CellDetail cell>`.

- [ ] **Step 1: Write the failing mapMeta test**

```ts
// lc-app/tests/database/mapMeta.test.ts
import { describe, it, expect } from 'vitest';
import { parseId, DISTRICT_SHORT } from '@/database/map/mapMeta';

describe('parseId', () => {
  it('splits imageId into row/col (row*10+col)', () => {
    expect(parseId('54')).toEqual({ row: 5, col: 4 });
    expect(parseId('7')).toEqual({ row: 0, col: 7 });
  });
});
describe('DISTRICT_SHORT', () => {
  it('maps known districts', () => {
    expect(DISTRICT_SHORT['városközpont']).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lc-app && npx vitest run tests/database/mapMeta.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `mapMeta.ts`**

```ts
// lc-app/src/database/map/mapMeta.ts
export function parseId(imageId: string): { row: number; col: number } {
  const id = Number(imageId);
  return { row: Math.floor(id / 10), col: id % 10 };
}
```
Then transcribe `DISTRICT_CLASS` (`lc-database/explorer.html:734-738` / `map.html`), `DISTRICT_SHORT` (`:739-743`), `POI_EMOJI` (`:744-748`), `POI_LABEL` (`:749-754`) as `export const … : Record<string, string>`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd lc-app && npx vitest run tests/database/mapMeta.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement `CellDetail.tsx`**

`function CellDetail(props: { cell: MapCell | null }): VNode` — reproduce `showCellDetail` (`explorer.html:868-...`): district name, buildings list (icon via `POI_EMOJI`, label via `POI_LABEL`/`name`, owner in parens), clan houses, exits. Image from `https://l2.larkinor.hu${cell.imageSrc}`.

- [ ] **Step 6: Implement `MapView.tsx`**

`function MapView(props: { loader: DataLoader }): VNode`:
- Load `loader.loadMap()` into state on mount.
- Build a 10×10 grid keyed by `parseId(cell.imageId)`; render each cell with `DISTRICT_CLASS[cell.district]` styling, `DISTRICT_SHORT` label, and POI emoji markers — reproduce `renderGrid` (`explorer.html:786-867`).
- Track `selectedCell` in state; clicking a cell shows `<CellDetail>`.

- [ ] **Step 7: Append map styles to the theme**

Copy the map-grid CSS rules from `lc-database/explorer.html` / `map.html` (`.map-grid`, `.cell`, district tint classes, `.poi`, cell detail rules) into `theme.css` under a `/* ===== Map ===== */` banner. The district tint variables (`--varos`, `--magus`, …) are **not** in the current injected theme — add them to the `:root` block from `lc-database/explorer.html:14-18`.

- [ ] **Step 8: Add the Térkép tab**

In `DatabaseApp.tsx`, add a `'map'` tab to the tab bar; when active, render `<MapView loader={props.loader} />` instead of `<ExplorerView>`. Extend the hash routing to accept `#map`.

- [ ] **Step 9: Run tests + typecheck + build + smoke test**

Run: `cd lc-app && npx vitest run && npx tsc --noEmit && npm run build:db`
Then `npm run dev:db`, open the Térkép tab. Expected: 10×10 district grid renders, clicking a cell shows its detail with image. Stop the server.

- [ ] **Step 10: Commit**

```bash
cd /Users/robert.remenyi/Documents/Dev/lcenter
git add -A
git commit -m "feat: port Map view (district grid + cell detail) to Preact"
```

---

## Task 8: In-game database overlay

Add an "Adatbázis" button to the injected userscript UI that mounts `DatabaseApp` (GM-backed) in a full-screen overlay.

**Files:**
- Create: `lc-app/src/userscript/components/DatabaseOverlay.tsx` (or `src/components/` — match where existing components live)
- Modify: the FreeMove/Battle header or `NavPad` to add the trigger button (choose the shared header; `src/pages/FreeMove.tsx`)
- Modify: `lc-app/src/shared/styles/theme.css` (overlay rules)
- Test: `lc-app/tests/userscript/DatabaseOverlay.test.tsx`

**Interfaces:**
- Consumes: `DatabaseApp`, `createDataLoader`, `gmSource`, `DATA_BASE_URL`.
- Produces: `function DatabaseOverlay(props: { open: boolean; onClose: () => void }): VNode`.

- [ ] **Step 1: Write the failing overlay test**

```tsx
// lc-app/tests/userscript/DatabaseOverlay.test.tsx
import { h } from 'preact';
import { render, screen, fireEvent } from '@testing-library/preact';
import { describe, it, expect, vi } from 'vitest';
import { DatabaseOverlay } from '@/userscript/components/DatabaseOverlay';

describe('DatabaseOverlay', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<DatabaseOverlay open={false} onClose={() => {}} />);
    expect(container.querySelector('.lc-db-overlay')).toBeNull();
  });
  it('renders and closes when open', () => {
    const onClose = vi.fn();
    render(<DatabaseOverlay open onClose={onClose} />);
    expect(document.querySelector('.lc-db-overlay')).toBeTruthy();
    fireEvent.click(screen.getBylabel ?? screen.getByText('✕'));
    expect(onClose).toHaveBeenCalled();
  });
});
```
(If `getByLabel` unavailable, select the close button by its `✕` text as shown.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd lc-app && npx vitest run tests/userscript/DatabaseOverlay.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `DatabaseOverlay.tsx`**

```tsx
// lc-app/src/userscript/components/DatabaseOverlay.tsx
import { h } from 'preact';
import { useMemo } from 'preact/hooks';
import { DatabaseApp } from '@/database/DatabaseApp';
import { createDataLoader, gmSource } from '@/shared/data';

const DATA_BASE_URL = import.meta.env.DEV
  ? new URL('/static/db', import.meta.url).href
  : 'https://example.invalid/larkinor/static/db';

export function DatabaseOverlay(props: { open: boolean; onClose: () => void }) {
  if (!props.open) return null;
  const loader = useMemo(() => createDataLoader(gmSource(), DATA_BASE_URL), []);
  return (
    <div class="lc-db-overlay">
      <button class="lc-db-overlay__close" onClick={props.onClose}>✕</button>
      <div class="lc-db-overlay__body"><DatabaseApp loader={loader} /></div>
    </div>
  );
}
```
Note: `DatabaseApp` uses `location.hash` for routing. In the overlay this is acceptable (hash changes don't reload the game). If it proves disruptive, a follow-up can pass a routing-mode prop — out of scope here.

- [ ] **Step 4: Add the trigger button + state**

In `src/pages/FreeMove.tsx` (the primary screen), add a `useState('open')` boolean, render an "Adatbázis" button in the header/NavPad area (`lc-`-classed), and render `<DatabaseOverlay open={open} onClose={() => setOpen(false)} />`. Follow the existing button styling in that file.

- [ ] **Step 5: Add overlay styles**

Append to `theme.css` under `/* ===== In-game DB overlay ===== */`: `.lc-db-overlay { position: fixed; inset: 0; z-index: 9999; background: var(--bg); overflow: auto; }`, a close-button rule, and a body wrapper. Reuse theme variables.

- [ ] **Step 6: Run tests + typecheck + build**

Run: `cd lc-app && npx vitest run && npx tsc --noEmit && npm run build`
Expected: all PASS, both `dist/larkinor-ui.user.js` and `dist/db/index.html` produced. Confirm the userscript bundle grew (now includes DatabaseApp).

- [ ] **Step 7: Commit**

```bash
cd /Users/robert.remenyi/Documents/Dev/lcenter
git add -A
git commit -m "feat: add in-game database overlay button"
```

---

## Task 9: Documentation handoff

Update project docs to describe the consolidated structure. Leave `lc-database/` in place for the user to delete after manual testing.

**Files:**
- Modify: `lc-app/CLAUDE.md` (if a module-specific one exists) or repo-root `CLAUDE.md`
- Modify: repo-root `CLAUDE.md` — update the "Module 2" section and add the DB-in-lc-app description; note `build:db`/`dev:db`.

- [ ] **Step 1: Document the new structure and build targets**

In repo-root `CLAUDE.md`, under the lc-app module section, add:
- the `src/shared` / `src/userscript` / `src/database` split
- the two build targets (`npm run build` = userscript + DB; `build:db`, `dev:db`)
- the `DataSource` pattern (gm vs http) and that DB components must not call `GM_*` directly
- data single-source-of-truth at `static/db/`
- a note that `lc-database/` is legacy, pending manual removal

- [ ] **Step 2: Verify the full build one more time**

Run: `cd lc-app && npm test && npx tsc --noEmit && npm run build`
Expected: tests PASS, tsc clean, both artifacts present.

- [ ] **Step 3: Commit**

```bash
cd /Users/robert.remenyi/Documents/Dev/lcenter
git add -A
git commit -m "docs: document consolidated lc-app structure and DB build"
```

---

## Self-Review notes

- **Spec coverage:** access model (standalone Task 5-7 + in-game Task 8) ✓; full port (Tasks 6-7) ✓; server-only data (Task 3 loader, Task 6 copy) ✓; single project (Tasks 1,5) ✓; rename (Task 1) ✓; keep `lc-database/` (never deleted; Task 9 notes it) ✓; shared data layer (Task 2-3) ✓; shared theme (Task 4) ✓; testing (tests in every logic task) ✓.
- **Type consistency:** `DataSource.fetchJson`, `createDataLoader`, `DataLoader` methods, `ColumnDef`/`FilterDef`/`FilterState`, `foldAccents`/`applyFilters`/`sortRows`, `parseId` are named identically across the tasks that define and consume them.
- **Known judgement calls flagged in-plan:** exact served path of `/static/db` under the DB dev server (Task 5 Step 7 verifies); overlay hash-routing interaction (Task 8 Step 3 note). Markup-heavy port steps cite exact `lc-database/explorer.html`/`map.html` line ranges as the behavioral source rather than transcribing JSX verbatim.
