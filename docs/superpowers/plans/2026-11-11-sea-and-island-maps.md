# Sea and Island Maps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A sea chart of the archipelago and island maps, with the player's position tracked at sea and on islands, shown in a small in-game window and in the database's Térkép tab.

**Architecture:** Two committed data files (`sea-chart.json`, `islands.json`) built by scripts from committed snapshots of the fan pages. A pure resolver turns (previous position, pending step, what this page says, data) into the new position; both boots call one activation function that reads the page, runs the resolver and stores `lc-sea-position`. One chart component renders both the small window and the full chart.

**Tech Stack:** Preact + TypeScript, Vitest + @testing-library/preact (jsdom), Node `.mjs` scripts for scraping.

**Spec:** `docs/superpowers/specs/2026-11-11-sea-and-island-maps-design.md`

## Global Constraints

- Coordinates are our map grid's `(row, col)`: fan `(fr, fc)` → `(fr − 36, fc − 5)`; Thord-Artin `szig_<c>-<r>` → `(−12 − r, c + 22)`.
- Direction titles follow vowel harmony: `északra`, `nyugatra`, `délre`, `keletre` — every pattern accepts `r[ae]`.
- Hungarian UI copy; English identifiers and comments.
- No hex/rgba in CSS rule bodies — `theme.css` variables only; no unscoped element selectors; the chart is a CSS grid of `<div>`s, never a `<table>`.
- Never `instanceof HTMLElement` on page nodes — compare `tagName`/attributes.
- `lc-sea-position` and `lc-sea-move` are per character; `lc-sea-learned-tiles` is shared. Every new key is classified in `src/utils/config.ts` and listed in `tests/characterScope.test.ts`.
- A position is cleared, never guessed, on contradiction. Squares of kind `unknown` are skipped by every check.
- Temporary files go in `.tmp/`. Check `npm test; echo $?` (unhandled errors fail CI with green tests).

## Review Focus

1. **First use after install, or after a lost position, leaving a harbour** — no stored harbour: the departure page's four sides must pick the harbour from the chart when only one fits, and store nothing otherwise. Test in Task 4.
2. **Coming home by hómport / death / logout with a ship position stored** — the next city free-move page must replace the sea position with the city cell, so no ⛵ survives in town. Test in Task 4.
3. **A step clicked on a page that then does not move** (docking prints a building page, a refused step) — a pending step must be consumed by the next page whatever it is, never replayed later. Test in Task 5.
4. **Two characters in two tabs** — each keeps its own ship; learned tiles shared. Test in Task 5 (characterScope).
5. **Data failed to load** — the window and the chart render a plain message, the game page keeps working, and the stored position is left untouched. Tests in Tasks 5 and 7.

---

### Task 1: Chart and island data

**Files:**
- Create: `scripts/sea/archive/szigetvilag2.html`, `scripts/sea/archive/taterkep.html` (copies of `.tmp/sea/*.html`)
- Create: `scripts/sea/parseChart.mjs`, `scripts/sea/parseIslands.mjs`, `scripts/sea/build.mjs`
- Create: `static/db/sea-chart.json`, `static/db/islands.json` (generated, committed)
- Modify: `package.json` (script `"build:sea": "node scripts/sea/build.mjs"`)
- Modify: `src/shared/data/types.ts`, `src/shared/data/loader.ts`
- Test: `tests/sea/seaData.test.ts`

**Interfaces:**
- Produces (types.ts):
  ```ts
  export type SeaSquareKind = 'land' | 'unexplored' | 'unknown';
  export interface SeaSquare { row: number; col: number; kind: SeaSquareKind; district?: string; harbour?: true }
  export interface SeaChart { rows: { min: number; max: number }; cols: { min: number; max: number }; squares: SeaSquare[] }
  export interface IslandBuilding { name: string; ready: boolean; note?: string }
  export interface IslandTile { image: string; row: number; col: number; island: string; name?: string; district?: string; buildings?: IslandBuilding[] }
  ```
- Produces (loader): `loadSeaChart(): Promise<SeaChart>` (`sea-chart.json`), `loadIslands(): Promise<IslandTile[]>` (`islands.json`).

- [ ] **Step 1: Write the failing data test** — `tests/sea/seaData.test.ts` reads both JSON files from disk:
  ```ts
  it('spans the fan grid in our coordinates', () => expect(chart.rows).toEqual({ min: -36, max: 35 }) && expect(chart.cols).toEqual({ min: -5, max: 42 }));
  it('lists exactly the real harbours', () => expect(harbours.map(s => [s.row, s.col]).sort()).toEqual(
    [[-34, 25], [-24, 1], [-22, 24], [-20, -3], [-16, 25], [-13, 27], [1, 3], [4, 1], [8, 4]].sort()));
  it('drops the legend swatches', () => { expect(at(-35, -4)).toBeUndefined(); expect(at(-29, 34)).toBeUndefined(); });  // fan (1,1), (7,39)
  it('marks the two uncertain squares unknown', () => { expect(at(-27, 9)?.kind).toBe('unknown'); expect(at(-23, 2)?.kind).toBe('unknown'); });
  it('keeps the city block as land', () => expect(at(1, 3)).toMatchObject({ kind: 'land', harbour: true }));
  it('places Thord-Artin by szig_<c>-<r>', () => expect(tile('nagysziget/szig_2-10')).toMatchObject({ row: -22, col: 24, name: 'Lápapály', island: 'Thord-Artin' }));
  it('puts every Thord-Artin tile on chart land', () => islands.filter(t => t.island === 'Thord-Artin').forEach(t => expect(at(t.row, t.col)).toBeDefined()));
  it('prefers the commented name over the placeholder', () => expect(tile('nagysziget/szig_3-22')?.name).toBe('Északi kikötő'));
  it('records harbour readiness', () => { expect(tile('nagysziget/szig_2-10')?.buildings).toContainEqual(expect.objectContaining({ name: 'Kikötő', ready: true })); expect(tile('nagysziget/szig_5-1')?.buildings?.[0].ready).toBe(false); });
  it('seeds the small western island', () => expect(['szighar/szighar_1-1', 'szighar/szighar_2-1', 'szigmag/szigmag_2--21'].map(i => [tile(i)?.row, tile(i)?.col])).toEqual([[-24, 1], [-24, 2], [-23, 1]]));
  ```
  (`at(r, c)` = square lookup, `tile(img)` = island lookup; tiles that are `unexplored.gif` placeholders with no commented name are not emitted.)
- [ ] **Step 2: Run** `npx vitest run tests/sea/seaData.test.ts` — expect FAIL (files missing).
- [ ] **Step 3: Implement the parsers and build script.**
  - `parseChart(html)`: rows split on `<tr`, cells expanded by `colspan`; kind from the class (`tenger` → omit, `unex`/`ununex` → `unexplored`, else `land` with `district` = the class); `o` text or the `F` at fan (16,2) → `harbour: true`; drop fan rows 1–8 at fan cols 1 and 39; force (−27,9) and (−23,2) to `unknown`.
  - `parseIslands(html)`: strip nothing; for each `<td>` take the visible `img.terkepelem` and the commented one; `szig_<c>-<r>` from either; name = commented `modalcim` when the visible one is `Nem meghódított terület`; district from `Negyed / Terület`; buildings from `epuletnev` + `kesz` / stone text. Append the three hand-measured small-island tiles (island `'Nyugati sziget'`, districts `harcos-negyed`, `harcos-negyed`, `sivatag`).
  - `build.mjs` writes both JSON files (2-space indent).
  - Add the two loader methods and types.
- [ ] **Step 4: Run** `npm run build:sea && npx vitest run tests/sea/seaData.test.ts` — expect PASS.
- [ ] **Step 5: Commit** `feat(sea): chart and island data from the fan maps, in the city map's coordinates`.

### Task 2: Reading sea, island and harbour pages

**Files:**
- Create: `src/utils/seaExtract.ts`
- Create: `tests/fixtures/sea/{sea-departed-13,sea-battle,island-szighar-1-1,island-nagysziget-szig_2-10}.html` from `.tmp/sea/*.json` (JSON-decode, unwrap every `lc-`-classed element to its text)
- Modify: `src/utils/pageDetector.ts` (`otKikoto` → `PageType.Harbour`)
- Test: `tests/seaExtract.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type SeaSide = 'sea' | 'harbour' | 'land' | 'walk' | 'coast';
  export interface SeaPageObservation {
    place: 'sea' | 'island' | 'other';
    sides: Partial<Record<Side, SeaSide>>;   // Side = 'N'|'E'|'S'|'W' from '@/shared/data'
    islandImage: string | null;              // 'nagysziget/szig_2-10'
    departed: boolean;                       // narration has 'Elindulsz a hajóddal'
    sailed: boolean;                         // narration's first line starts 'Tovább hajózol'
  }
  export function readSeaPage(doc: Document): SeaPageObservation;
  export function readHarbourPicture(doc: Document): string | null;   // '-2224' from /2/epulet/-2224kikoto.gif
  export function seaDirectionInputs(doc: Document): { side: Side; input: Element }[];
  ```

- [ ] **Step 1: Write failing tests** against the fixtures:
  ```ts
  expect(readSeaPage(departed)).toEqual({ place: 'sea', sides: { N: 'sea', S: 'harbour', W: 'land', E: 'land' }, islandImage: null, departed: true, sailed: false });
  expect(readSeaPage(battle).sailed).toBe(true);                       // otHarc page opening 'Tovább hajózol...'
  expect(readSeaPage(ta)).toMatchObject({ place: 'island', islandImage: 'nagysziget/szig_2-10', sides: { N: 'walk', W: 'coast', E: 'walk', S: 'walk' } });
  expect(readSeaPage(small).islandImage).toBe('szighar/szighar_1-1');
  expect(readSeaPage(cityFreeMoveFixture).place).toBe('other');        // an existing city free-move fixture
  expect(readHarbourPicture(docWith('<img src="/2/epulet/-241kikoto.gif">'))).toBe('-241');
  expect(seaDirectionInputs(departed).map(d => d.side).sort()).toEqual(['N', 'S']);
  expect(detectPage(docWithOldalTipus('otKikoto'))).toBe(PageType.Harbour);
  ```
  Also a `délre`/`keletre` case built inline, so a `-ra`-only pattern fails.
- [ ] **Step 2: Run** `npx vitest run tests/seaExtract.test.ts` — FAIL.
- [ ] **Step 3: Implement.** Place: `/tajk/hajotengeren.gif` → `sea`; a `/tajk/<dir>/…gif` whose `<dir>` starts `szig` or is `nagysziget` → `island`; else `other`. Sides from titles `^(észak|dél|kelet|nyugat)r[ae] (hajózol - )?(.*)$`: `hajózol - tenger` → sea, `hajózol - kikötő` → harbour, `szárazföld` → land, `nyomulsz` → walk, `tengerpart` → coast. Ignore anything inside `#lc-root`, `#lc-dock-root`, `.lc-db`.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(sea): read what a sea, island or harbour page says`.

### Task 3: The chart model

**Files:**
- Create: `src/shared/seaChart.ts`
- Test: `tests/sea/seaChart.test.ts`

**Interfaces:**
- Consumes: Task 1 types.
- Produces:
  ```ts
  export interface ChartIndex { squareAt(row: number, col: number): SeaSquare | null; tileByImage(image: string): IslandTile | null; tileAt(row: number, col: number): IslandTile | null; harbours: SeaSquare[] }
  export function indexChart(chart: SeaChart, islands: IslandTile[]): ChartIndex;
  export function harbourById(index: ChartIndex, id: string): SeaSquare | null;  // '-2224' → (−22,24); '13' → (1,3); ambiguous concatenation resolved against the harbour list
  export function contradicts(index: ChartIndex, row: number, col: number, place: 'sea' | 'island', sides: Partial<Record<Side, SeaSide>>): boolean;
  export const STEP: Record<Side, { row: number; col: number }>;
  ```

- [ ] **Step 1: Failing tests:**
  ```ts
  expect(harbourById(idx, '-2224')).toMatchObject({ row: -22, col: 24 });
  expect(harbourById(idx, '-241')).toMatchObject({ row: -24, col: 1 });
  expect(harbourById(idx, '84')).toMatchObject({ row: 8, col: 4 });
  expect(harbourById(idx, '999')).toBeNull();
  expect(contradicts(idx, 0, 3, 'sea', { N: 'sea', S: 'harbour', W: 'land', E: 'land' })).toBe(false);
  expect(contradicts(idx, 0, 3, 'sea', { N: 'land' })).toBe(true);           // land where the chart has sea
  expect(contradicts(idx, -1, 3, 'sea', { E: 'sea' })).toBe(true);           // sea where the chart has land (-14)
  expect(contradicts(idx, 0, 3, 'sea', { S: 'sea' })).toBe(true);            // chart has a harbour there
  expect(contradicts(idx, -22, 2, 'sea', { N: 'sea' })).toBe(false);         // north is (−23,2), unknown: skipped
  expect(contradicts(idx, -24, 2, 'island', { S: 'coast' })).toBe(false);    // coast vs chart land: no information
  expect(contradicts(idx, -22, 24, 'island', { W: 'walk' })).toBe(true);     // walkable where the chart has sea
  ```
- [ ] **Step 2: Run** `npx vitest run tests/sea/seaChart.test.ts` — FAIL.
- [ ] **Step 3: Implement** `indexChart` with `Map<'r,c', …>`. `harbourById`: try every split of the id into a signed row and a col that names a harbour; return the single match. `contradicts`: sea rules both ways, island rule one way, `unknown` neighbours skipped.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(sea): chart index, harbour ids and the side check`.

### Task 4: The position resolver

**Files:**
- Create: `src/shared/seaPosition.ts` (type, parse/serialize — no GM)
- Create: `src/shared/learnedTiles.ts`
- Create: `src/utils/seaTracking.ts`
- Test: `tests/sea/seaTracking.test.ts`, `tests/sea/learnedTiles.test.ts`

**Interfaces:**
- Consumes: Tasks 2–3.
- Produces:
  ```ts
  // seaPosition.ts
  export type SeaPositionSource = 'city' | 'harbour' | 'departure' | 'move' | 'tile' | 'manual';
  export interface SeaPosition { row: number; col: number; source: SeaPositionSource; at: number }
  export function parseSeaPosition(raw: string | null): SeaPosition | null;
  export function serializeSeaPosition(p: SeaPosition): string;
  // learnedTiles.ts
  export interface LearnedTile { row: number; col: number; conflict?: true }
  export type LearnedTiles = Record<string, LearnedTile>;
  export function parseLearnedTiles(raw: string | null): LearnedTiles;
  export function recordTile(tiles: LearnedTiles, image: string, row: number, col: number): LearnedTiles;  // second, different square → conflict
  export function pinnedSquare(tiles: LearnedTiles, image: string): { row: number; col: number } | null;  // null when conflicting
  // seaTracking.ts
  export type SeaPageInput =
    | { kind: 'city'; row: number; col: number }
    | { kind: 'harbour'; harbourId: string | null }
    | { kind: 'battle'; sailed: boolean }
    | { kind: 'observed'; observation: SeaPageObservation }
    | { kind: 'other' };
  export interface SeaResolution { position: SeaPosition | null; lost: boolean; learn: { image: string; row: number; col: number } | null; keep: boolean }
  export function resolveSeaPosition(prev: SeaPosition | null, step: Side | null, page: SeaPageInput, index: ChartIndex | null, learned: LearnedTiles, now: number): SeaResolution;
  ```
  `keep: true` means "leave the stored value as it is" (non-sea pages, data not loaded).

- [ ] **Step 1: Failing tests** (`now = 1`), using the real data index:
  ```ts
  it('city tile sets the position', () => expect(r(null, null, { kind: 'city', row: 1, col: 3 }).position).toMatchObject({ row: 1, col: 3, source: 'city' }));
  it('harbour picture sets the harbour square', () => expect(r(null, null, { kind: 'harbour', harbourId: '-2224' }).position).toMatchObject({ row: -22, col: 24, source: 'harbour' }));
  it('departure puts the ship beside the known harbour', () => expect(r(at(1, 3, 'harbour'), null, sea({ departed: true, sides: { N: 'sea', S: 'harbour', W: 'land', E: 'land' } })).position).toMatchObject({ row: 0, col: 3, source: 'departure' }));
  it('departure with no known harbour uses the only fitting one', () => expect(r(null, null, sea({ departed: true, sides: { N: 'sea', S: 'harbour', W: 'land', E: 'land' } })).position).toMatchObject({ row: 0, col: 3 }));
  it('departure that fits several harbours stores nothing', /* sides { E: 'harbour' } only */ () => expect(r(null, null, sea({ departed: true, sides: { E: 'harbour' } })).position).toBeNull());
  it('a sailed step moves one square', () => expect(r(at(0, 3), 'N', sea({ sailed: true, sides: { N: 'sea', W: 'sea', E: 'land', S: 'sea' } })).position).toMatchObject({ row: -1, col: 3, source: 'move' }));
  it('a contradiction loses the position', () => expect(r(at(0, 3), 'N', sea({ sailed: true, sides: { N: 'land', W: 'land', E: 'land', S: 'land' } }))).toMatchObject({ position: null, lost: true }));
  it('a sea fight advances by the step', () => expect(r(at(-7, -2), 'W', { kind: 'battle', sailed: true }).position).toMatchObject({ row: -7, col: -3 }));
  it('the page after a flee holds', () => expect(r(at(-7, -3), null, sea({ sailed: false, sides: { N: 'sea', E: 'sea', S: 'sea', W: 'sea' } })).position).toMatchObject({ row: -7, col: -3 }));
  it('a Thord-Artin tile pins the position', () => expect(r(at(5, 5), null, island('nagysziget/szig_3-10', { W: 'walk' })).position).toMatchObject({ row: -22, col: 25, source: 'tile' }));
  it('an island step learns an unknown picture from a confirmed square', () => expect(r(at(-24, 1), 'E', island('szigvar/szigvar_9-9', { N: 'coast' })).learn).toEqual({ image: 'szigvar/szigvar_9-9', row: -24, col: 2 }));
  it('a conflicting learned picture does not pin', () => expect(r(at(0, 0), null, island('szigx/a', {}), { 'szigx/a': { row: 1, col: 1, conflict: true } }).position).toMatchObject({ row: 0, col: 0 }));
  it('a pending step is spent on any page', () => expect(r(at(0, 3), 'N', { kind: 'other' })).toMatchObject({ keep: true }));
  it('hómport home replaces a ship position', () => expect(r(at(-20, 10, 'move'), null, { kind: 'city', row: 4, col: 4 }).position).toMatchObject({ row: 4, col: 4, source: 'city' }));
  it('no data keeps the stored value', () => expect(resolveSeaPosition(at(0, 3), 'N', sea({ sailed: true }), null, {}, 1).keep).toBe(true));
  ```
  `learnedTiles.test.ts`: record → pinned; same square again → pinned; different square → conflict and `pinnedSquare` null; malformed JSON → `{}`.
- [ ] **Step 2: Run** `npx vitest run tests/sea` — FAIL.
- [ ] **Step 3: Implement.** Order inside `resolveSeaPosition`: `other` → keep; `city` → city; `harbour` → `harbourById`; `battle` with `sailed` and a step → move without a check (the next page checks); `observed`: (a) island picture known in `islands.json` or pinned learned → tile; (b) `departed` → beside harbour (prev harbour square, else unique chart harbour whose sea neighbour's sides fit); (c) step + `sailed` or step on island → move; (d) no step → hold `prev`. Then `contradicts` on the result; contradiction → `{ position: null, lost: true }`. Learn only when the result came from (c), passed the check, the page is an island, and its picture is neither seeded nor pinned.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(sea): resolve the player's position at sea and on islands`.

### Task 5: Activation in both boots

**Files:**
- Create: `src/utils/activateSeaPosition.ts`
- Modify: `src/shared/prefKeys.ts` (`SEA_POSITION_PREF_KEY = 'lc-sea-position'`, `SEA_MOVE_PREF_KEY = 'lc-sea-move'`, `SEA_LEARNED_TILES_PREF_KEY = 'lc-sea-learned-tiles'`)
- Modify: `src/utils/config.ts` (first two in `CHARACTER_KEYS`)
- Modify: `src/desktop/boot.ts`, `src/mobile/boot.ts`
- Test: `tests/activateSeaPosition.test.ts`, `tests/characterScope.test.ts`

**Interfaces:**
- Consumes: Tasks 2–4; `parseId` from `src/database/map/mapMeta.ts`.
- Produces:
  ```ts
  export function armSeaMoveTracking(doc: Document, writePref: WritePref): void;   // capture-phase click on seaDirectionInputs → SEA_MOVE_PREF_KEY
  export function activateSeaPosition(pageType: PageType, doc: Document, loader: DataLoader, readPref: ReadPref, writePref: WritePref, now?: number): Promise<SeaPosition | null>;
  export function isSeaOrIsland(doc: Document): boolean;   // readSeaPage(doc).place !== 'other'
  ```

- [ ] **Step 1: Failing tests** with a fake loader and an in-memory pref map:
  ```ts
  it('arms the step and stores it on click', /* click the N control on the departed fixture → pref 'N' */);
  it('a city free-move page stores the city square without loading data', /* tajk/13.gif → {row:1,col:3,source:'city'}; loader.loadSeaChart not called */);
  it('a sea page loads the chart and stores the resolved square', /* prev (1,3,harbour) + departed fixture → (0,3) */);
  it('takes the pending step on every page', /* step stored, Shop page → SEA_MOVE_PREF_KEY cleared, position unchanged */);
  it('leaves the position alone when the data fails to load', /* loader rejects → stored value unchanged, no throw */);
  it('writes a learned tile to the shared key', /* … */);
  it('writes the lost marker as an empty position', /* contradiction → SEA_POSITION_PREF_KEY = '' */);
  ```
  `characterScope.test.ts`: `lc-sea-position` and `lc-sea-move` per character, `lc-sea-learned-tiles` shared.
- [ ] **Step 2: Run** `npx vitest run tests/activateSeaPosition.test.ts tests/characterScope.test.ts` — FAIL.
- [ ] **Step 3: Implement**, mirroring `trackDungeonMove`'s take-and-clear. City free-move pages: `parseId(captureMapPosition(...)'s id)` → `{ kind: 'city' }` with no data load; `PageType.Harbour` → `readHarbourPicture`; `PageType.Battle` → `{ kind: 'battle', sailed: readSeaPage(doc).sailed }`; sea/island free-move → observed; else `other`. Load chart + islands only for harbour/battle-with-sailed/sea/island. In both boots: arm synchronously when `isSeaOrIsland(doc)`, then call `activateSeaPosition(...).catch(warn)` beside the existing `captureMapPosition`, before anything renders.
- [ ] **Step 4: Run** `npm test; echo $?` — all pass, exit 0.
- [ ] **Step 5: Commit** `feat(sea): track the player's position on every page`.

### Task 6: The chart component

**Files:**
- Create: `src/database/map/SeaChartView.tsx`
- Modify: `src/shared/styles/theme.css` (`.lc-db .sea-chart…` and `.lc-sea-window…` rules; `--sea-water`, `--sea-unexplored`, `--sea-unknown`, `--sea-here` variables; island land reuses the city map's district colour variables via `DISTRICT_CLASS`)
- Test: `tests/database/SeaChartView.test.tsx`

**Interfaces:**
- Consumes: `ChartIndex`, `MapData` (city cells placed by `layoutCells`), `SeaPosition`.
- Produces:
  ```ts
  export interface ChartBounds { minRow: number; maxRow: number; minCol: number; maxCol: number }
  export interface SeaChartViewProps { index: ChartIndex; city: MapData | null; here: SeaPosition | null; bounds?: ChartBounds; cellSize?: number; selected?: { row: number; col: number } | null; onSelect?: (row: number, col: number) => void; atSea: boolean }
  export function SeaChartView(props: SeaChartViewProps): JSX.Element;
  export function nearestHarbourDirection(index: ChartIndex, here: { row: number; col: number }, bounds: ChartBounds): Side | 'NE' | 'NW' | 'SE' | 'SW' | null;  // null when a harbour is in bounds
  ```

- [ ] **Step 1: Failing tests:** renders one `.sea-square` per square in bounds; the `here` square carries `.here` and ⛵ when `atSea`, 📍 otherwise; harbours show ⚓ with `title` = island tile name when one is there; `unknown` squares carry `.unknown`; city cells use their district class; `onSelect(row, col)` fires on click; `nearestHarbourDirection(idx, {row:-7,col:-2}, small)` returns the expected corner; no `<table>` in the output.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** as a CSS grid; `bounds` defaults to the whole chart.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(sea): draw the sea chart`.

### Task 7: Térkép tab — Város / Tenger

**Files:**
- Create: `src/database/map/MapTab.tsx` (switch + loading; wraps the existing `MapView` unchanged for *Város*)
- Create: `src/database/map/SeaDetail.tsx`
- Modify: `src/database/DatabaseApp.tsx` (render `MapTab`; route `#map/sea` selects *Tenger*; pass `tracksPosition`)
- Modify: `src/shared/prefKeys.ts` (`MAP_MODE_PREF_KEY = 'lc-map-mode'`, shared)
- Test: `tests/database/MapTab.test.tsx`

**Interfaces:**
- Consumes: Task 6; `SEA_POSITION_PREF_KEY`.
- Produces: `MapTab(props: { loader: DataLoader; targetCellId?: string | null; prefStore?: PrefStore; tracksPosition?: boolean; seaRequested?: boolean })`.

- [ ] **Step 1: Failing tests:** opens on *Tenger* centred on the stored position when it is outside rows 0–9 / cols 0–9, else on *Város*; the switch flips and is remembered (`lc-map-mode`); `#map/sea` forces *Tenger*; selecting a Thord-Artin square shows its name, district and buildings with *kész* / stone; selecting a city cell shows the existing `CellDetail`; *📍 Itt állok* appears only with `tracksPosition` and writes `{ source: 'manual' }`; the loader rejecting shows `Nem sikerült betölteni a tengeri térképet.`; without a stored position no marker and no jump button.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test; echo $?` — exit 0.
- [ ] **Step 5: Commit** `feat(sea): a sea chart in the database's map tab`.

### Task 8: The window around the player

**Files:**
- Create: `src/components/SeaWindow.tsx`
- Modify: `src/desktop/DesktopDock.tsx` (a `DockedPanel` titled `Tengeri térkép`, shown when `atSeaOrIsland`; its click opens the database on `#map/sea` through the existing open-database path)
- Modify: `src/desktop/boot.ts` (pass `atSeaOrIsland` = `isSeaOrIsland(doc)`)
- Modify: `src/pages/FreeMove.tsx`, `src/utils/domExtract.ts` (`FreeMoveState.atSeaOrIsland`) — on mobile the window replaces `lc-hero-img`; tapping opens the overlay on the sea chart
- Test: `tests/SeaWindow.test.tsx`, `tests/desktopDock.test.tsx`, `tests/FreeMove.test.tsx` (or the existing free-move page test)

**Interfaces:**
- Consumes: Tasks 5–7.
- Produces: `SeaWindow(props: { loader: DataLoader; readPref: ReadPref; onOpenChart: () => void; atSea: boolean })` — 13 cols × 11 rows centred on the stored position; arrow from `nearestHarbourDirection`; when the stored position is empty: `Elvesztettük a helyzeted — jelöld be a térképen (📍 Itt állok).`

- [ ] **Step 1: Failing tests:** window renders 143 squares with the player in the centre; shows the harbour arrow when none is in view; shows the lost message when the pref is empty; clicking calls `onOpenChart`; desktop dock shows the panel on a sea fixture and not on a city fixture; mobile free-move shows the window instead of the hero picture on a sea fixture.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** The window reads the position after the boot's activation resolved: the boots re-render once `activateSeaPosition` settles (desktop `renderDock()`, mobile re-render of the page).
- [ ] **Step 4: Run** `npm test; echo $?` — exit 0.
- [ ] **Step 5: Commit** `feat(sea): a sea window beside the game while sailing or on an island`.

### Task 9: Documentation and live check

**Files:**
- Modify: `CLAUDE.md` (a *Sea and islands* section: coordinates, the page grammar incl. vowel harmony, harbour picture ids, position rules, data files and their scripts), `README.md` (feature line), `docs/superpowers/specs/2026-11-11-sea-and-island-maps-design.md` (status: implemented)

- [ ] **Step 1:** Write the docs.
- [ ] **Step 2:** `npm run typecheck && npm test; echo $? && npm run build` — all succeed.
- [ ] **Step 3:** Restart `./serve.sh`; in the Playwright browser on a sea or island page, confirm the window shows the right square and the database opens on *Tenger*. Screenshot to `.tmp/sea/`.
- [ ] **Step 4: Commit** `docs(sea): record the sea and island page grammar and the position rules`.
