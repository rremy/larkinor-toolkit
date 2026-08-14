# Tavern Quests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the 37 tavern quests (*kocsmai küldetések*) to the quest database tab beside the 45 royal quests, behind a Királyi/Kocsmai switcher, reusing every maze component unchanged.

**Architecture:** A second, standalone parser (`parseTavernQuest.mjs`) handles the tavern source's different filename, edge-class and title grammars, feeding the same `Quest`/`QuestCell` model. `Quest.id` widens from `number` to `string` so royal numbers and tavern slugs share one type, with `Quest.set` discriminating. Tavern data lives in its own `static/db/tavern-quests.json`, fetched only when that set is viewed.

**Tech Stack:** Vite + Preact + TypeScript (strict), Vitest + @testing-library/preact (jsdom), Node ESM scrapers.

**Spec:** `docs/superpowers/specs/2026-08-14-tavern-quests-design.md`

## Global Constraints

- All comments and identifiers in English; all UI copy in Hungarian.
- Never add hardcoded hex/rgba in CSS rule bodies — use `:root` variables from `src/shared/styles/theme.css`.
- No unscoped element selectors in CSS: everything stays under `#lc-root`, `#lc-dock-root` or a `.lc-*` class (the game page stays visible on desktop).
- `src/database/**` must never reference `GM_*` — it ships in the standalone bundle. Persistence arrives via the injected `PrefStore`.
- `static/db/*.json` is the single source of truth for game data.
- Scrapers fail loudly: an unknown edge token, unresolved sprite, missing field or empty maze aborts before anything is written.
- Lock types, exactly: `vas`, `rez`, `bronz`, `ezust`, `arany`, `platina`, `tolvaj`, `cso`.
- Confirmed sprite aliases (do not alter): `fureszfogu_%2520posvanyalligator`→65, `orult_banyasztorp`→26, `skivei_orvgyilkos`→151, `nyamvadt_varazlotanonc`→12, `unikornis`→83, `donna_brutalisa`→56, `minus`→132.
- Confirmed edge-class typo aliases: `Ezust`→`ezust`, `azust`→`ezust`, `asrany`→`arany`, `bronnz`→`bronz`.
- Run `npm run typecheck && npm test` before every commit.

## File Structure

| File | Responsibility |
|---|---|
| `src/shared/data/types.ts` (modify) | `QuestSet`; `Quest.id: string`, `.set`, `.title` |
| `src/shared/prefKeys.ts` (modify) | `QUEST_SET_PREF_KEY`, `questSelectedKey(set)`, legacy key |
| `scripts/quests/scrape.mjs` (modify) | Royal scrape emits the new `Quest` shape |
| `scripts/quests/parseTavernQuest.mjs` (create) | Tavern parser: edges, filenames, titles, page |
| `scripts/quests/scrapeTavern.mjs` (create) | Tavern crawl + monster resolution + write |
| `static/db/tavern-quests.json` (create) | Generated tavern data |
| `src/shared/data/loader.ts` (modify) | `loadTavernQuests()` |
| `src/database/DatabaseApp.tsx` (modify) | Route grammar `#quests/<set>/<id>` |
| `src/database/quests/QuestView.tsx` (modify) | Set switcher, per-set persistence |
| `tests/quests/tavernParse.test.ts` (create) | Tavern parser units |
| `tests/quests/tavernQuestData.test.ts` (create) | Tavern data invariants |

---

### Task 1: Widen the quest model to string ids and quest sets

**Files:**
- Modify: `src/shared/data/types.ts`
- Modify: `src/shared/prefKeys.ts`
- Modify: `scripts/quests/scrape.mjs`
- Modify: `static/db/quests.json` (regenerated in place, no network)
- Modify: `src/database/quests/QuestView.tsx`
- Modify: `src/database/DatabaseApp.tsx`
- Modify: `tests/quests/questData.test.ts`
- Modify: `tests/database/QuestView.test.tsx`, `tests/database/DatabaseApp.test.tsx`, `tests/DatabaseOverlay.test.tsx`

**Interfaces:**
- Produces: `type QuestSet = 'royal' | 'tavern'`; `Quest.id: string`, `Quest.set: QuestSet`, `Quest.title: string`; `QUEST_SET_PREF_KEY`, `questSelectedKey(set: QuestSet): string`, `LEGACY_QUEST_SELECTED_PREF_KEY`.

This task changes a type used across the app, so it lands in one piece: everything must compile and every existing test must still pass at the end. Behaviour is unchanged — only the id's runtime type.

- [ ] **Step 1: Widen the model**

In `src/shared/data/types.ts`, add above `Quest`:

```ts
/** Which body of quests a `Quest` belongs to. */
export type QuestSet = 'royal' | 'tavern';
```

Replace the `Quest` interface with:

```ts
export interface Quest {
  /**
   * Royal quests use their number as a string (`'1'`…`'45'`); tavern quests
   * use the source page's slug (`'GOMB'`, `'alapito_okirat'`, `'GY.I.K.'`).
   * One string type rather than a `number | string` union: every consumer
   * compares and routes on it, and a union would push a discriminant check
   * into each of those sites for no benefit.
   */
  id: string;
  set: QuestSet;
  /**
   * Chip and header label. Royal holds the bare number (the header renders
   * `12. küldetés` from it); tavern holds the display title.
   */
  title: string;
  description: string;
  reward: string;
  rows: number;
  cols: number;
  cells: QuestCell[];
}
```

- [ ] **Step 2: Add the pref keys**

In `src/shared/prefKeys.ts`, update the header comment's last sentence to read:

```ts
// but such key definitions — constants, or the small functions that derive
// them — so importing it from src/database/** never pulls in a GM_*
// dependency.
```

Then replace `QUEST_SELECTED_PREF_KEY` with:

```ts
import type { QuestSet } from './data/types';

/** PrefStore key holding which quest set the tab last showed. */
export const QUEST_SET_PREF_KEY = 'lc-quest-set';

/**
 * PrefStore key holding the last selected quest *within one set*.
 *
 * Per-set rather than a single key so switching to tavern, browsing, and
 * switching back returns to the royal quest you were on. It also keeps the
 * fallback correct: when a stored id no longer exists we fall back to the
 * first quest of the *stored set*, which is impossible to determine from a
 * selection key alone.
 */
export function questSelectedKey(set: QuestSet): string {
  return `lc-quest-selected-${set}`;
}

/**
 * The pre-set-switcher key, read once to seed `questSelectedKey('royal')` so
 * upgrading does not lose the user's position. Never written.
 */
export const LEGACY_QUEST_SELECTED_PREF_KEY = 'lc-quest-selected';
```

- [ ] **Step 3: Emit the new shape from the royal scraper**

In `scripts/quests/scrape.mjs`, replace the loop body's quest push so the parsed quest is reshaped:

```js
const quest = parseQuestPage(await res.text(), id, resolveMonster);
quests.push({ ...quest, id: String(id), set: 'royal', title: String(id) });
```

`parseQuestPage` still takes and reports the numeric `id` in its error messages, which is correct — it describes the source page being fetched.

- [ ] **Step 4: Migrate the committed royal data without re-scraping**

The data is generated, but re-running the scrape needs network and would produce an unrelated diff if the source moved. Rewrite the committed file deterministically instead:

```bash
node -e "
const fs=require('fs');
const q=JSON.parse(fs.readFileSync('static/db/quests.json','utf-8'));
const out=q.map(x=>({...x,id:String(x.id),set:'royal',title:String(x.id)}));
fs.writeFileSync('static/db/quests.json', JSON.stringify(out,null,0)+'\n');
console.log(out.length,'quests migrated; first id', JSON.stringify(out[0].id), out[0].set, JSON.stringify(out[0].title));
"
```

Expected: `45 quests migrated; first id "1" royal "1"`.

- [ ] **Step 5: Update the data invariants test**

In `tests/quests/questData.test.ts`, replace the first test with:

```ts
  it('holds a contiguous run of royal quests starting at 1', () => {
    expect(quests.length).toBeGreaterThanOrEqual(45);
    expect(quests.map((q) => q.id)).toEqual(quests.map((_, i) => String(i + 1)));
    expect(quests.every((q) => q.set === 'royal')).toBe(true);
    expect(quests.map((q) => q.title)).toEqual(quests.map((_, i) => String(i + 1)));
  });
```

- [ ] **Step 6: Update QuestView for string ids**

In `src/database/quests/QuestView.tsx`:

- `questId: number | null` → `questId: string | null`
- `onSelectQuest(id: number): void` → `onSelectQuest(id: string): void`
- the restore effect's `const storedId = Number(prefStore.read(QUEST_SELECTED_PREF_KEY));` → `const storedId = prefStore.read(LEGACY_QUEST_SELECTED_PREF_KEY);` and the guard becomes `if (storedId && quests.some((q) => q.id === storedId))`
- the write effect's `String(selectedQuestId)` → `selectedQuestId`
- the import updates to `LEGACY_QUEST_SELECTED_PREF_KEY`
- the header `<h2>{quest.id}. küldetés</h2>` → `<h2>{quest.title}. küldetés</h2>`

Task 7 replaces this persistence wholesale; this step only keeps the file compiling and its tests green.

- [ ] **Step 7: Update the route's quest id**

In `src/database/DatabaseApp.tsx`, `routeFor` currently coerces every non-map param with `Number(param)`. Quests now need a string. Add a `quest` field to `Route`:

```ts
interface Route {
  tab: Tab;
  /** Selected entity id on explorer tabs (null elsewhere). */
  id: number | null;
  /** Selected/target cell id on the map tab (null elsewhere). */
  cell: string | null;
  /** Selected quest id on the quests tab (null elsewhere). */
  quest: string | null;
}
```

Update `DEFAULT_ROUTE` to `{ tab: 'weapons', id: null, cell: null, quest: null }`, and `routeFor` to:

```ts
function routeFor(tab: Tab, param: string | null): Route {
  if (tab === 'map') return { tab, id: null, cell: param, quest: null };
  if (tab === 'quests') return { tab, id: null, cell: null, quest: param };
  return { tab, id: param != null ? Number(param) : null, cell: null, quest: null };
}
```

Then at the `<QuestView` call site, `questId={route.id}` → `questId={route.quest}`, and the `onSelectQuest` callback's parameter type becomes `string`.

Task 6 widens the grammar to carry the set; this step only moves quests off the numeric field.

- [ ] **Step 8: Update the affected tests**

In `tests/database/QuestView.test.tsx`, `tests/database/DatabaseApp.test.tsx` and `tests/DatabaseOverlay.test.tsx`: every quest fixture gains `set: 'royal'` and `title` matching its id, every `id:` becomes a string, every `questId={1}` becomes `questId="1"`, and every stored pref value stays a string (it already is). Replace `QUEST_SELECTED_PREF_KEY` imports with `LEGACY_QUEST_SELECTED_PREF_KEY`.

- [ ] **Step 9: Verify**

Run: `npm run typecheck && npm test`
Expected: PASS, with no test count change.

- [ ] **Step 10: Stage and commit**

```bash
git add src/shared/data/types.ts src/shared/prefKeys.ts scripts/quests/scrape.mjs \
        static/db/quests.json src/database tests
```

Suggested type: `refactor`. Single-line message, e.g. `refactor(quests): widen quest ids to strings and add quest sets`, with a body explaining that tavern slugs cannot be numbers, plus the `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` trailer this repo uses.

---

### Task 2: Tavern parser — edge classes and filenames

**Files:**
- Create: `scripts/quests/parseTavernQuest.mjs`
- Test: `tests/quests/tavernParse.test.ts`

**Interfaces:**
- Produces: `TAVERN_EDGE_ALIASES`, `parseTavernEdges(classAttr)` → `Record<Side, Edge>`; `parseTavernImage(src)` → `{ base, key, questItem, portal, question, boss, empty }`; `SPRITE_ALIASES`.
- Consumes: `LOCK_SUFFIXES`, `SIDE_BY_PREFIX` re-used from `./parseQuest.mjs`.

- [ ] **Step 1: Write the failing tests**

Create `tests/quests/tavernParse.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseTavernEdges, parseTavernImage } from '../../scripts/quests/parseTavernQuest.mjs';

describe('parseTavernEdges', () => {
  it('reads the four sides as walls', () => {
    expect(parseTavernEdges('f j a b')).toEqual({
      N: { kind: 'wall' }, E: { kind: 'wall' },
      S: { kind: 'wall' }, W: { kind: 'wall' },
    });
  });

  it('reads a lock suffix as a door', () => {
    expect(parseTavernEdges('j_arany').E).toEqual({ kind: 'door', lock: 'arany' });
  });

  // The source ships these four malformed tokens; a strict parser throws on
  // them, which would abort the whole scrape over a typo.
  it.each([
    ['b_Ezust', 'W', 'ezust'],
    ['f_azust', 'N', 'ezust'],
    ['j_asrany', 'E', 'arany'],
    ['j_bronnz', 'E', 'bronz'],
  ])('normalises the source typo %s', (token, side, lock) => {
    expect(parseTavernEdges(token)[side]).toEqual({ kind: 'door', lock });
  });

  it('keeps _szel distinct from a wall', () => {
    expect(parseTavernEdges('a_szel').S).toEqual({ kind: 'szel' });
  });

  it('throws on a genuinely unknown token', () => {
    expect(() => parseTavernEdges('f_quartz')).toThrow(/unrecognised/);
  });
});

describe('parseTavernImage', () => {
  it('reads a bare monster sprite', () => {
    expect(parseTavernImage('GOMB_elemei/agyszivo.jpg'))
      .toMatchObject({ base: 'agyszivo', key: null, questItem: false, portal: null, question: false });
  });

  // Tavern spells a key cell `<monster>_<lock>`, not the royal `_<lock>kulcs`.
  it('reads a bare lock suffix as the key this cell yields', () => {
    expect(parseTavernImage('x_elemei/csontsarkany_bronz.jpg'))
      .toMatchObject({ base: 'csontsarkany', key: 'bronz' });
  });

  it('reads the quest item marker', () => {
    expect(parseTavernImage('x_elemei/berrablo_kulditargy.jpg'))
      .toMatchObject({ base: 'berrablo', questItem: true });
  });

  it('reads the exit marker in either spelling', () => {
    expect(parseTavernImage('x_elemei/a_labikibe.jpg')).toMatchObject({ portal: 'exit' });
    expect(parseTavernImage('x_elemei/a_kibe.jpg')).toMatchObject({ portal: 'exit' });
  });

  // Markers appear on either side of the base, so stripping must be
  // token-based rather than an ordered suffix peel.
  it('reads a question marker written as a prefix', () => {
    expect(parseTavernImage('x_elemei/kerdes_platina.jpg'))
      .toMatchObject({ question: true, key: 'platina', base: null, empty: true });
  });

  it('reads several markers combined on one tile', () => {
    expect(parseTavernImage('x_elemei/ven_villamvarazslo_labikibe_kulditargy.jpg'))
      .toMatchObject({ base: 'ven_villamvarazslo', portal: 'exit', questItem: true });
  });

  it('treats labikibe_kerdes as a markers-only tile with no creature', () => {
    expect(parseTavernImage('x_elemei/labikibe_kerdes.jpg'))
      .toMatchObject({ base: null, empty: true, portal: 'exit', question: true });
  });

  it.each(['black', 'nop', 'kijarat', 'bejarat'])('treats %s as scenery', (name) => {
    expect(parseTavernImage(`x_elemei/${name}.jpg`)).toMatchObject({ base: null, empty: true });
  });

  it('flags a boss sprite', () => {
    expect(parseTavernImage('x_elemei/tolvajkepzoboss.jpg'))
      .toMatchObject({ base: 'tolvajkepzoboss', boss: true });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/quests/tavernParse.test.ts`
Expected: FAIL — cannot resolve `scripts/quests/parseTavernQuest.mjs`.

- [ ] **Step 3: Implement**

Create `scripts/quests/parseTavernQuest.mjs`:

```js
/**
 * Pure parsing functions for the larkinorcenter.hu tavern quest pages
 * (kocsmai küldetések).
 *
 * Deliberately separate from parseQuest.mjs rather than a dialect flag through
 * it: the two sources share a page skeleton but almost no grammar. Tavern
 * spells a key cell `<monster>_<lock>` where royal spells `<monster>_<lock>kulcs`,
 * writes markers on either side of the base, and has no structured question
 * format at all. A shared parser would mean a branch in every function.
 *
 * No I/O here on purpose: scrapeTavern.mjs fetches and writes, so everything
 * below is unit-testable against saved fixtures.
 */
import { LOCK_SUFFIXES, SIDE_BY_PREFIX, decodeEntities, stripComments, stripTags } from './parseQuest.mjs';

export { stripComments, stripTags, decodeEntities };

/**
 * Malformed edge-class tokens in the source, mapped to what they meant.
 * Case is normalised before lookup, so `Ezust` needs no entry of its own.
 */
export const TAVERN_EDGE_ALIASES = {
  azust: 'ezust',
  asrany: 'arany',
  bronnz: 'bronz',
};

const SIDE_TOKEN = /^([fjab])(?:_([a-z]+))?$/;

/** Parse a `<td>` class attribute into the cell's four edges. */
export function parseTavernEdges(classAttr) {
  const edges = {
    N: { kind: 'open' }, E: { kind: 'open' },
    S: { kind: 'open' }, W: { kind: 'open' },
  };
  for (const raw of String(classAttr).trim().split(/\s+/)) {
    if (!raw) continue;
    const token = raw.toLowerCase();
    const m = SIDE_TOKEN.exec(token);
    if (!m) throw new Error(`unrecognised edge class token "${raw}"`);
    const side = SIDE_BY_PREFIX[m[1]];
    const suffix = m[2] ? (TAVERN_EDGE_ALIASES[m[2]] ?? m[2]) : undefined;
    if (!suffix) { edges[side] = { kind: 'wall' }; continue; }
    if (suffix === 'szel') { edges[side] = { kind: 'szel' }; continue; }
    if (LOCK_SUFFIXES.includes(suffix)) { edges[side] = { kind: 'door', lock: suffix }; continue; }
    throw new Error(`unrecognised edge class token "${raw}"`);
  }
  return edges;
}

const ITEM_TOKENS = new Set(['kulditargy', 'kuldi', 'kt']);
const PORTAL_TOKENS = new Set(['labikibe', 'kibe', 'labi']);
/** Bases that are scenery or markers, never a creature. */
const SCENERY = new Set(['black', 'nop', 'kijarat', 'bejarat', 'csapda', 'halal', 'kerdes', '']);

/**
 * Decompose a cell image filename.
 *
 * Token-based rather than an ordered suffix peel, because the source writes
 * markers on either side of the sprite name (`kerdes_platina` and
 * `labikibe_kerdes` both occur). Every recognised token is consumed wherever
 * it sits; whatever is left rejoins to form the sprite base.
 */
export function parseTavernImage(src) {
  const facts = {
    base: null, key: null, questItem: false, portal: null,
    trap: false, death: false, boss: false, question: false, empty: false,
  };

  const raw = String(src).replace(/^.*\//, '').replace(/\.(gif|jpe?g|png)$/i, '');
  if (!raw) { facts.empty = true; return facts; }

  const rest = [];
  for (const token of raw.split('_')) {
    const t = token.toLowerCase();
    if (LOCK_SUFFIXES.includes(t)) { facts.key = t; continue; }
    if (ITEM_TOKENS.has(t)) { facts.questItem = true; continue; }
    if (PORTAL_TOKENS.has(t)) { facts.portal = 'exit'; continue; }
    if (t === 'kerdes') { facts.question = true; continue; }
    if (t === 'csapda') { facts.trap = true; continue; }
    if (t === 'halal') { facts.death = true; continue; }
    if (t === 'bejarat') { facts.portal = facts.portal ?? 'entrance'; continue; }
    rest.push(token);
  }

  const base = rest.join('_');
  if (SCENERY.has(base.toLowerCase())) { facts.empty = true; return facts; }

  facts.base = base;
  facts.boss = /boss$/.test(base);
  return facts;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/quests/tavernParse.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Stage and commit**

```bash
git add scripts/quests/parseTavernQuest.mjs tests/quests/tavernParse.test.ts
```

Suggested type: `feat`. Single-line message plus body and the repo's `Co-Authored-By` trailer.

---

### Task 3: Tavern parser — titles and page assembly

**Files:**
- Modify: `scripts/quests/parseTavernQuest.mjs`
- Modify: `tests/quests/tavernParse.test.ts`

**Interfaces:**
- Consumes: `parseTavernEdges`, `parseTavernImage` from Task 2.
- Produces: `parseTavernTitle(title, isQuestionImage)` → `{ narration, question }`; `parseTavernQuestPage(html, { id, title }, resolveMonster)` → `Quest`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/quests/tavernParse.test.ts`:

```ts
import { parseTavernTitle, parseTavernQuestPage } from '../../scripts/quests/parseTavernQuest.mjs';

describe('parseTavernTitle', () => {
  it('keeps a non-question title as narration, newlines and all', () => {
    const r = parseTavernTitle('A keleti ajtó mögül:\n- Ne mozdulj!\n- Mmmhmhm!', false);
    expect(r.question).toBeNull();
    expect(r.narration).toBe('A keleti ajtó mögül: - Ne mozdulj! - Mmmhmhm!');
  });

  // Line 0 is the setup, the rest are the options. The tavern source has no
  // (n) markers, no arrows and no ` -- `, so this line split is the only
  // structure available.
  it('splits a question image title into a prompt and its options', () => {
    const r = parseTavernTitle('Felveszed?\nNaná!\nHaggyámá!', true);
    expect(r.narration).toBe('');
    expect(r.question).toEqual({
      prompt: 'Felveszed?',
      choices: [
        { index: 1, text: 'Naná!', outcome: '' },
        { index: 2, text: 'Haggyámá!', outcome: '' },
      ],
    });
  });

  // The royal set's hasQuestion/question split: the marker comes from the
  // artwork, so a title that cannot yield options must not fabricate any.
  it('yields no question when a question image has fewer than two lines', () => {
    const r = parseTavernTitle('A WC zárva van.', true);
    expect(r.question).toBeNull();
    expect(r.narration).toBe('A WC zárva van.');
  });

  it('yields no question for an empty title', () => {
    expect(parseTavernTitle('', true)).toEqual({ narration: '', question: null });
  });

  it('never treats a non-question multi-line title as options', () => {
    expect(parseTavernTitle('Egy sor\nMásik sor', false).question).toBeNull();
  });
});

const PAGE = `
<p><span class="tulajdonsagnev">Leírás:</span> Szerezd meg a gömböt.<br></p>
<p><span class="tulajdonsagnev">Jutalom:</span> 3000 arany</p>
<div class="lab"><table>
<tr>
  <td class="f b"><img class="szorny" title="" src="q_elemei/agyszivo_bronz.jpg"></td>
  <td class="f j_vas"><img class="szorny" title="Felveszed?&#10;Naná!" src="q_elemei/kerdes.jpg"></td>
</tr>
<tr>
  <td class="a b"><img class="szorny" title="" src="q_elemei/black.jpg"></td>
  <td class="a j"><img class="szorny" title="" src="q_elemei/nop_labikibe.jpg"></td>
</tr>
</table></div>`;

describe('parseTavernQuestPage', () => {
  const resolve = (base) => (base === 'agyszivo' ? { id: 7, name: 'Agyszívó' } : null);

  it('reads the identity, description, reward and grid', () => {
    const q = parseTavernQuestPage(PAGE, { id: 'GOMB', title: 'GÖMB' }, resolve);
    expect(q).toMatchObject({
      id: 'GOMB', set: 'tavern', title: 'GÖMB',
      description: 'Szerezd meg a gömböt.', reward: '3000 arany',
      rows: 2, cols: 2,
    });
    expect(q.cells).toHaveLength(4);
  });

  it('resolves monsters and records the key each cell yields', () => {
    const q = parseTavernQuestPage(PAGE, { id: 'GOMB', title: 'GÖMB' }, resolve);
    expect(q.cells[0]).toMatchObject({ row: 0, col: 0, monsterId: 7, monsterName: 'Agyszívó', key: 'bronz' });
  });

  it('marks a question tile from its image and parses its options', () => {
    const q = parseTavernQuestPage(PAGE, { id: 'GOMB', title: 'GÖMB' }, resolve);
    expect(q.cells[1]).toMatchObject({ hasQuestion: true, monsterId: null });
    expect(q.cells[1].question.choices).toEqual([{ index: 1, text: 'Naná!', outcome: '' }]);
    expect(q.cells[1].edges.E).toEqual({ kind: 'door', lock: 'vas' });
  });

  it('reads an exit standing on an otherwise empty cell', () => {
    const q = parseTavernQuestPage(PAGE, { id: 'GOMB', title: 'GÖMB' }, resolve);
    expect(q.cells[3]).toMatchObject({ portal: 'exit', monsterId: null, monsterName: null });
  });

  it('throws when the maze is missing', () => {
    expect(() => parseTavernQuestPage('<p>nothing</p>', { id: 'X', title: 'X' }, resolve))
      .toThrow(/X/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/quests/tavernParse.test.ts`
Expected: FAIL — `parseTavernTitle is not a function`.

- [ ] **Step 3: Implement**

Append to `scripts/quests/parseTavernQuest.mjs`:

```js
/**
 * Decompose a cell `title` into narration and an optional question.
 *
 * The tavern source has no question grammar: no `KÉRDÉS:`/`VÁLASZ:` tokens,
 * no `(n)` markers, no `->` or ` -- ` outcome separators anywhere in the set.
 * What it does have is newline-delimited text on question tiles, where line 0
 * is the setup and the remaining lines are the options. Measured across all
 * 132 multi-line question cells; see the spec's "Risks and accepted limits"
 * for why this is a heuristic rather than a grammar.
 *
 * `isQuestionImage` (from parseTavernImage) gates the split entirely: 200
 * titles in the set are multi-line, but some are dialogue transcripts, so a
 * line count can never decide this on its own.
 *
 * Tavern choices carry no outcome — the source simply does not record one.
 */
export function parseTavernTitle(title, isQuestionImage = false) {
  const lines = decodeEntities(String(title))
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  if (lines.length === 0) return { narration: '', question: null };
  if (!isQuestionImage || lines.length < 2) {
    return { narration: lines.join(' '), question: null };
  }
  return {
    narration: '',
    question: {
      prompt: lines[0],
      choices: lines.slice(1).map((text, i) => ({ index: i + 1, text, outcome: '' })),
    },
  };
}

const DESC_RE = /<span class="tulajdonsagnev">\s*Le[íi]r[áa]s\s*:?\s*<\/span>\s*([\s\S]*?)(?:<br|<span class="tulajdonsagnev">|<\/p>)/i;
const REWARD_RE = /<span class="tulajdonsagnev">\s*Jutalom\s*:?\s*<\/span>\s*([\s\S]*?)<\/p>/i;

function field(html, re, label, questId) {
  const m = re.exec(html);
  if (!m) throw new Error(`quest ${questId}: missing ${label}`);
  const value = stripTags(m[1]).replace(/[;,\s]+$/, '');
  if (!value) throw new Error(`quest ${questId}: empty ${label}`);
  return value;
}

/**
 * Parse one tavern quest page into a `Quest`.
 *
 * `resolveMonster` maps a sprite base to a monster, injected so this stays
 * pure and the tests need no monsters.json.
 */
export function parseTavernQuestPage(html, { id, title }, resolveMonster) {
  const clean = stripComments(html);

  const description = field(clean, DESC_RE, 'description', id);
  const reward = field(clean, REWARD_RE, 'reward', id);

  const labStart = clean.indexOf('<div class="lab">');
  if (labStart < 0) throw new Error(`quest ${id}: no maze container`);
  const tableMatch = /<table[^>]*>([\s\S]*?)<\/table>/i.exec(clean.slice(labStart));
  if (!tableMatch) throw new Error(`quest ${id}: no maze table`);

  const rowHtml = [...tableMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1]);
  if (rowHtml.length === 0) throw new Error(`quest ${id}: maze has no rows`);

  const cells = [];
  let cols = 0;
  rowHtml.forEach((row, r) => {
    const tds = [...row.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/gi)];
    cols = Math.max(cols, tds.length);
    tds.forEach((td, c) => {
      const classAttr = (/class="([^"]*)"/i.exec(td[1]) ?? [, ''])[1];
      const inner = td[2];
      const src = (/src="([^"]*)"/i.exec(inner) ?? [, ''])[1];
      const rawTitle = (/title="([^"]*)"/i.exec(inner) ?? [, ''])[1];

      let edges;
      try {
        edges = parseTavernEdges(classAttr);
      } catch (err) {
        throw new Error(`quest ${id} cell ${r},${c}: ${err.message}`);
      }

      const facts = parseTavernImage(src);
      const parsed = parseTavernTitle(rawTitle, facts.question);

      let monsterId = null;
      let monsterName = null;
      if (facts.base) {
        const hit = resolveMonster(facts.base);
        if (hit) { monsterId = hit.id; monsterName = hit.name; }
        else { monsterName = facts.base; }
      }

      cells.push({
        row: r,
        col: c,
        edges,
        monsterId,
        monsterName,
        boss: facts.boss,
        key: facts.key,
        questItem: facts.questItem,
        portal: facts.portal,
        trap: facts.trap,
        death: facts.death,
        narration: parsed.narration,
        // Tavern titles carry no drops line — the field stays null so the
        // shared QuestCellDetail simply omits that row.
        drops: null,
        hasQuestion: facts.question,
        question: parsed.question,
        rawImage: src,
      });
    });
  });

  if (cells.length === 0) throw new Error(`quest ${id}: maze has no cells`);

  return { id, set: 'tavern', title, description, reward, rows: rowHtml.length, cols, cells };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/quests/tavernParse.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Stage and commit**

```bash
git add scripts/quests/parseTavernQuest.mjs tests/quests/tavernParse.test.ts
```

Suggested type: `feat`.

---

### Task 4: Tavern scraper

**Files:**
- Create: `scripts/quests/scrapeTavern.mjs`
- Create: `static/db/tavern-quests.json` (generated)
- Modify: `package.json`

**Interfaces:**
- Consumes: `parseTavernQuestPage` from Task 3.
- Produces: `static/db/tavern-quests.json` — a `Quest[]` with `set: 'tavern'`.

- [ ] **Step 1: Implement the scraper**

Create `scripts/quests/scrapeTavern.mjs`:

```js
#!/usr/bin/env node
/**
 * Crawl the larkinorcenter.hu tavern quest pages into
 * static/db/tavern-quests.json.
 *
 * Run with `npm run scrape:tavern`. Fails loudly rather than degrading: an
 * unknown class token, a missing field, an empty maze or an unresolved sprite
 * aborts before anything is written, so source drift surfaces here rather than
 * as a broken page.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseTavernQuestPage, decodeEntities } from './parseTavernQuest.mjs';

const BASE = 'https://www.larkinorcenter.hu/kocskuld';
const OUT = 'static/db/tavern-quests.json';

/**
 * Sprite basenames the source misspells or mis-encodes, mapped to monster ids.
 * Confirmed against the live pages and reviewed by hand — deliberately an
 * explicit list rather than fuzzy matching, which at edit-distance 1 would
 * also silently pair unrelated monsters.
 */
const SPRITE_ALIASES = {
  'fureszfogu_%2520posvanyalligator': 65,
  orult_banyasztorp: 26,
  skivei_orvgyilkos: 151,
  nyamvadt_varazlotanonc: 12,
  unikornis: 83,
  donna_brutalisa: 56,
  minus: 132,
};

const monsters = JSON.parse(readFileSync('static/db/monsters.json', 'utf-8'));

/** Accent-folded, punctuation-free key for name matching. */
function fold(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

const byId = new Map(monsters.map((m) => [m.id, m]));
const byBase = new Map();
const byName = new Map();
for (const m of monsters) {
  const base = m.image.replace(/^.*\//, '').replace(/\.[a-z]+$/i, '');
  if (base && !byBase.has(base)) byBase.set(base, m);
  const name = fold(m.name);
  // First wins: monsters.json carries `*`-prefixed elite duplicates that fold
  // onto the same key as their base entry, and the base entry has the lower id.
  if (name && !byName.has(name)) byName.set(name, m);
}

const unresolved = new Set();
/**
 * Resolve a sprite base: exact image basename, then accent-folded monster
 * name, then the alias list. Name matching is unambiguous here — the 1575
 * monsters fold to 1127 distinct keys and none maps to two different sprites.
 */
function resolveMonster(base) {
  const hit = byBase.get(base)
    ?? byBase.get(`${base}_k`)
    ?? byName.get(fold(base))
    ?? byId.get(SPRITE_ALIASES[base]);
  if (!hit) { unresolved.add(base); return null; }
  return { id: hit.id, name: hit.name };
}

const index = await fetch(`${BASE}/index.html`);
if (!index.ok) throw new Error(`index: HTTP ${index.status}`);
const links = [...(await index.text()).matchAll(/<a class="keret" href="([^"]+)">([^<]+)<\/a>/g)]
  .map((m) => ({
    href: m[1],
    // The slug is the filename without its extension: stable, unlike the
    // title, which carries accents and the source's own typos.
    id: m[1].replace(/^.*\//, '').replace(/\.html?$/i, ''),
    title: decodeEntities(m[2]).trim(),
  }));
if (links.length === 0) throw new Error('index: no quest links found');

const quests = [];
for (const link of links) {
  const res = await fetch(`${BASE}/${link.href}`);
  if (!res.ok) throw new Error(`quest ${link.id}: HTTP ${res.status}`);
  const quest = parseTavernQuestPage(await res.text(), link, resolveMonster);
  quests.push(quest);
  process.stdout.write(`${link.id}: ${quest.rows}x${quest.cols}, ${quest.cells.length} cells\n`);
}

if (unresolved.size > 0) {
  throw new Error(`unresolved sprite bases: ${[...unresolved].sort().join(', ')}`);
}

const cells = quests.flatMap((q) => q.cells);
const questionCells = cells.filter((c) => c.hasQuestion).length;
const parsed = cells.filter((c) => c.question).length;
process.stdout.write(
  `\n${quests.length} quests, ${cells.length} cells, ` +
  `${questionCells} question tiles, ${parsed} with parsed options\n`,
);

writeFileSync(OUT, `${JSON.stringify(quests, null, 0)}\n`, 'utf-8');
process.stdout.write(`wrote ${OUT}\n`);
```

- [ ] **Step 2: Add the npm script**

In `package.json`, beside `"scrape:quests"`:

```json
"scrape:tavern": "node scripts/quests/scrapeTavern.mjs",
```

- [ ] **Step 3: Run the scrape**

Run: `npm run scrape:tavern`

Expected, exactly: 37 quests, and a final summary line reading
`37 quests, 2950 cells, 147 question tiles, 132 with parsed options`.

If the run aborts on unresolved sprites, do **not** widen the alias list to
silence it — that abort is the design's drift detector. Report the unresolved
bases and stop.

- [ ] **Step 4: Sanity-check the output**

```bash
node -e "
const q=JSON.parse(require('fs').readFileSync('static/db/tavern-quests.json','utf-8'));
const c=q.flatMap(x=>x.cells);
console.log('quests',q.length,'cells',c.length);
console.log('all tavern:', q.every(x=>x.set==='tavern'));
console.log('unique ids:', new Set(q.map(x=>x.id)).size);
console.log('titles sample:', q.slice(0,3).map(x=>x.id+'='+x.title).join(', '));
console.log('monster cells', c.filter(x=>x.monsterId!=null).length,
            'unresolved', c.filter(x=>x.monsterName&&x.monsterId==null).length);
"
```

Expected: 37 quests, 37 unique ids, `all tavern: true`, and **0** unresolved.

- [ ] **Step 5: Stage and commit**

```bash
git add scripts/quests/scrapeTavern.mjs static/db/tavern-quests.json package.json
```

Suggested type: `feat`.

---

### Task 5: Loader and data invariants

**Files:**
- Modify: `src/shared/data/loader.ts`
- Create: `tests/quests/tavernQuestData.test.ts`
- Modify: `tests/database/MapView.test.tsx`, `tests/database/QuestView.test.tsx`, `tests/database/DatabaseApp.test.tsx` (loader stubs)

**Interfaces:**
- Produces: `DataLoader.loadTavernQuests(): Promise<Quest[]>`.

- [ ] **Step 1: Write the failing data test**

Create `tests/quests/tavernQuestData.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Quest, LockType } from '@/shared/data';

const quests: Quest[] = JSON.parse(readFileSync('static/db/tavern-quests.json', 'utf-8'));
const monsters = JSON.parse(readFileSync('static/db/monsters.json', 'utf-8'));
const monsterIds = new Set<number>(monsters.map((m: { id: number }) => m.id));

const LOCKS: LockType[] = ['vas', 'rez', 'bronz', 'ezust', 'arany', 'platina', 'tolvaj', 'cso'];

describe('static/db/tavern-quests.json', () => {
  it('holds all 37 tavern quests with unique slug ids and titles', () => {
    expect(quests).toHaveLength(37);
    expect(new Set(quests.map((q) => q.id)).size).toBe(37);
    for (const q of quests) {
      expect(q.set, q.id).toBe('tavern');
      expect(q.id, 'id').toBeTruthy();
      expect(q.title, q.id).toBeTruthy();
    }
  });

  it('gives every quest a description and a reward', () => {
    for (const q of quests) {
      expect(q.description, q.id).toBeTruthy();
      expect(q.reward, q.id).toBeTruthy();
    }
  });

  it('keeps every cell inside its declared grid', () => {
    for (const q of quests) {
      expect(q.cells.length, q.id).toBe(q.rows * q.cols);
      for (const c of q.cells) {
        expect(c.row, q.id).toBeGreaterThanOrEqual(0);
        expect(c.row, q.id).toBeLessThan(q.rows);
        expect(c.col, q.id).toBeGreaterThanOrEqual(0);
        expect(c.col, q.id).toBeLessThan(q.cols);
      }
    }
  });

  // The whole point of the alias list: with it, nothing is left dangling.
  it('resolves every creature sprite to a monster in monsters.json', () => {
    for (const q of quests) {
      for (const c of q.cells) {
        if (c.monsterName == null) continue;
        expect(c.monsterId, `${q.id} ${c.row},${c.col} ${c.rawImage}`).not.toBeNull();
        expect(monsterIds).toContain(c.monsterId);
      }
    }
  });

  it('uses only known lock types on doors and keys', () => {
    for (const q of quests) {
      for (const c of q.cells) {
        if (c.key) expect(LOCKS, q.id).toContain(c.key);
        for (const edge of Object.values(c.edges)) {
          if (edge.kind === 'door') expect(LOCKS, q.id).toContain(edge.lock);
        }
      }
    }
  });

  // Image-derived, so it must not track parse success. 15 of the 147 tiles
  // have a title too short to yield options; they keep the marker and show
  // no card, exactly as the royal set does.
  it('marks 147 question tiles, of which 132 carry parsed options', () => {
    const cells = quests.flatMap((q) => q.cells);
    expect(cells.filter((c) => c.hasQuestion)).toHaveLength(147);
    expect(cells.filter((c) => c.question)).toHaveLength(132);
    for (const c of cells) {
      if (c.question) expect(c.hasQuestion).toBe(true);
    }
  });

  // Tavern answers have no outcomes anywhere in the source; if a future
  // scrape starts producing them, that is new information, not noise.
  it('carries no outcome text on any tavern choice', () => {
    for (const q of quests) {
      for (const c of q.cells) {
        for (const choice of c.question?.choices ?? []) {
          expect(choice.outcome, `${q.id} ${c.row},${c.col}`).toBe('');
        }
      }
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/quests/tavernQuestData.test.ts`
Expected: PASS already if Task 4 produced correct data — this test guards the committed artifact rather than new code. If it fails, the data is wrong; fix the scrape, not the test.

- [ ] **Step 3: Add the loader method**

In `src/shared/data/loader.ts`, add to the `DataLoader` interface after `loadQuests`:

```ts
  loadTavernQuests(): Promise<Quest[]>;
```

and to the returned object after the `loadQuests` entry:

```ts
    loadTavernQuests: () => source.fetchJson<Quest[]>(url('tavern-quests.json')),
```

- [ ] **Step 4: Update the loader stubs in existing tests**

`tests/database/MapView.test.tsx`, `tests/database/QuestView.test.tsx` and
`tests/database/DatabaseApp.test.tsx` each build a partial `DataLoader`. Add
`loadTavernQuests: async () => []` to each (or, in QuestView's case, whatever
that test's fixture needs) so they satisfy the widened interface.

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 6: Stage and commit**

```bash
git add src/shared/data/loader.ts tests
```

Suggested type: `feat`.

---

### Task 6: Set-aware routing

**Files:**
- Modify: `src/database/DatabaseApp.tsx`
- Modify: `tests/database/DatabaseApp.test.tsx`

**Interfaces:**
- Consumes: `QuestSet` from `@/shared/data`.
- Produces: routes `#quests/<set>/<id>`; `Route.set: QuestSet | null`, `Route.quest: string | null`; `QuestView` receives `questSet` and `questId`, and its `onSelectQuest(set: QuestSet, id: string)`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/database/DatabaseApp.test.tsx`:

```ts
describe('quest routing', () => {
  it('routes #quests/tavern/GOMB to the tavern set', async () => {
    location.hash = '#quests/tavern/GOMB';
    render(<DatabaseApp loader={makeLoader()} />);
    await screen.findByText('GÖMB');
  });

  // A slug carries dots and mixed case, which the old numeric grammar rejected.
  it('accepts a slug containing dots', async () => {
    location.hash = '#quests/tavern/GY.I.K.';
    render(<DatabaseApp loader={makeLoader()} />);
    await screen.findByText('GY.I.K.');
  });

  // Bookmarks and the pre-switcher pref both produce a bare numeric param.
  it('reads a legacy #quests/12 as royal quest 12', async () => {
    location.hash = '#quests/12';
    render(<DatabaseApp loader={makeLoader()} />);
    await screen.findByText('12. küldetés');
  });
});
```

Extend the test file's loader stub so `loadQuests` returns a royal quest with
`id: '12'`, and `loadTavernQuests` returns tavern quests with ids `'GOMB'`
(title `GÖMB`) and `'GY.I.K.'` (title `GY.I.K.`), each with a 1×1 grid whose
single cell is fully populated (copy the existing royal fixture's cell and set
`hasQuestion: false`, `question: null`).

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/database/DatabaseApp.test.tsx`
Expected: FAIL — the slug routes fall through to `DEFAULT_ROUTE` and render the weapons tab.

- [ ] **Step 3: Implement**

In `src/database/DatabaseApp.tsx`:

```ts
const QUEST_SETS: QuestSet[] = ['royal', 'tavern'];

function isQuestSet(value: string): value is QuestSet {
  return (QUEST_SETS as string[]).includes(value);
}
```

Extend `Route`:

```ts
interface Route {
  tab: Tab;
  /** Selected entity id on explorer tabs (null elsewhere). */
  id: number | null;
  /** Selected/target cell id on the map tab (null elsewhere). */
  cell: string | null;
  /** Which quest set the quests tab shows (null elsewhere / when unrouted). */
  set: QuestSet | null;
  /** Selected quest id on the quests tab (null elsewhere). */
  quest: string | null;
}
```

`DEFAULT_ROUTE` becomes `{ tab: 'weapons', id: null, cell: null, set: null, quest: null }`.

Replace `routeFor`, `serializeRoute` and `parseRoute`:

```ts
/** Build a route from a tab and its raw path segments (meaning is per-tab). */
function routeFor(tab: Tab, first: string | null, second: string | null): Route {
  const empty = { id: null, cell: null, set: null, quest: null };
  if (tab === 'map') return { ...empty, tab, cell: first };
  if (tab === 'quests') {
    // `#quests/<set>/<id>` is the current grammar. A first segment that is
    // not a set name is a pre-switcher route (`#quests/12`) or an old stored
    // pref, and means a royal quest — worth honouring so existing bookmarks
    // keep working.
    if (first != null && isQuestSet(first)) return { ...empty, tab, set: first, quest: second };
    return { ...empty, tab, set: first != null ? 'royal' : null, quest: first };
  }
  // Explorer tabs take a numeric entity id; the widened grammar below also
  // admits non-numeric segments, which are not valid here.
  const id = first != null && /^-?\d+$/.test(first) ? Number(first) : null;
  return { ...empty, tab, id };
}

/**
 * Serialise to `tab[/first[/second]]`. Explorer tabs pass an entity id, the
 * map tab a cell id, and the quests tab a set and quest id.
 */
function serializeRoute(tab: Tab, first: string | null, second: string | null): string {
  if (first == null) return tab;
  return second == null ? `${tab}/${first}` : `${tab}/${first}/${second}`;
}

/**
 * Inverse of `serializeRoute`. Anything unrecognised degrades to the default.
 * The segment charset admits the tavern slugs, which carry mixed case and
 * dots (`GY.I.K.`) — the old `-?\d+` grammar rejected them outright.
 */
function parseRoute(raw: string): Route {
  const m = raw.match(/^([a-z]+)(?:\/([A-Za-z0-9._-]+))?(?:\/([A-Za-z0-9._-]+))?$/);
  if (!m || !isTab(m[1])) return DEFAULT_ROUTE;
  return routeFor(m[1] as Tab, m[2] ?? null, m[3] ?? null);
}
```

Update `hashFor` and every `navigate(...)` call to pass both segments. `navigate`'s signature becomes `navigate(tab: Tab, first: string | null, second: string | null = null)`; existing call sites that pass one param keep working.

At the `<QuestView` call site:

```tsx
        <QuestView
          loader={loader}
          questSet={route.set}
          questId={route.quest}
          prefStore={prefStore}
          onSelectQuest={(set, id) => navigate('quests', set, id)}
          onJumpToMonster={(id) => navigate('monsters', String(id))}
        />
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/database/DatabaseApp.test.tsx && npm run typecheck`
Expected: PASS. `QuestView` will not yet accept `questSet` — add the prop as part of Task 7; if typecheck blocks here, add `questSet?: QuestSet | null` to `QuestViewProps` unused in this task and consume it in Task 7.

- [ ] **Step 5: Stage and commit**

```bash
git add src/database/DatabaseApp.tsx tests/database/DatabaseApp.test.tsx
```

Suggested type: `feat`.

---

### Task 7: Set switcher and per-set persistence

**Files:**
- Modify: `src/database/quests/QuestView.tsx`
- Modify: `src/shared/styles/theme.css`
- Modify: `tests/database/QuestView.test.tsx`

**Interfaces:**
- Consumes: `loadTavernQuests` (Task 5); `questSet`/`onSelectQuest(set, id)` (Task 6); `QUEST_SET_PREF_KEY`, `questSelectedKey`, `LEGACY_QUEST_SELECTED_PREF_KEY` (Task 1).

- [ ] **Step 1: Write the failing tests**

Replace the persistence `describe` block in `tests/database/QuestView.test.tsx` and add:

```ts
describe('quest set switcher', () => {
  it('renders both set buttons with the royal set active by default', async () => {
    render(<QuestView loader={makeLoader()} questSet={null} questId={null}
      onSelectQuest={vi.fn()} onJumpToMonster={vi.fn()} />);
    expect(await screen.findByRole('button', { name: 'Királyi' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Kocsmai' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('loads the tavern set and shows its titles as chips', async () => {
    render(<QuestView loader={makeLoader()} questSet="tavern" questId={null}
      onSelectQuest={vi.fn()} onJumpToMonster={vi.fn()} />);
    expect(await screen.findByRole('button', { name: 'GÖMB' })).toBeInTheDocument();
  });

  it('selects the first quest of the set when switching', async () => {
    const onSelectQuest = vi.fn();
    render(<QuestView loader={makeLoader()} questSet="royal" questId="1"
      onSelectQuest={onSelectQuest} onJumpToMonster={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Kocsmai' }));
    await waitFor(() => expect(onSelectQuest).toHaveBeenCalledWith('tavern', 'GOMB'));
  });

  it('renders the tavern header from the title, not as a numbered quest', async () => {
    render(<QuestView loader={makeLoader()} questSet="tavern" questId="GOMB"
      onSelectQuest={vi.fn()} onJumpToMonster={vi.fn()} />);
    expect(await screen.findByRole('heading', { name: 'GÖMB' })).toBeInTheDocument();
  });
});

describe('per-set persistence', () => {
  // The whole reason the keys are per-set: the in-game overlay remounts on
  // every page load, and coming back to royal must not dump you on quest 1.
  it('remembers a separate selection for each set', async () => {
    const prefStore = makePrefStore({});
    const { rerender } = render(<QuestView loader={makeLoader()} questSet="royal" questId="3"
      prefStore={prefStore} onSelectQuest={vi.fn()} onJumpToMonster={vi.fn()} />);
    await waitFor(() => expect(prefStore.read(questSelectedKey('royal'))).toBe('3'));

    rerender(<QuestView loader={makeLoader()} questSet="tavern" questId="GOMB"
      prefStore={prefStore} onSelectQuest={vi.fn()} onJumpToMonster={vi.fn()} />);
    await waitFor(() => expect(prefStore.read(questSelectedKey('tavern'))).toBe('GOMB'));
    expect(prefStore.read(questSelectedKey('royal'))).toBe('3');
  });

  it('records which set was last shown', async () => {
    const prefStore = makePrefStore({});
    render(<QuestView loader={makeLoader()} questSet="tavern" questId="GOMB"
      prefStore={prefStore} onSelectQuest={vi.fn()} onJumpToMonster={vi.fn()} />);
    await waitFor(() => expect(prefStore.read(QUEST_SET_PREF_KEY)).toBe('tavern'));
  });

  it('restores both the set and its selection on a bare route', async () => {
    const onSelectQuest = vi.fn();
    const prefStore = makePrefStore({
      [QUEST_SET_PREF_KEY]: 'tavern',
      [questSelectedKey('tavern')]: 'GOMB',
    });
    render(<QuestView loader={makeLoader()} questSet={null} questId={null}
      prefStore={prefStore} onSelectQuest={onSelectQuest} onJumpToMonster={vi.fn()} />);
    await waitFor(() => expect(onSelectQuest).toHaveBeenCalledWith('tavern', 'GOMB'));
  });

  // Falls back within the stored set, which is exactly what a selection key
  // alone could not express.
  it('falls back to the first quest of the stored set when the id is stale', async () => {
    const onSelectQuest = vi.fn();
    const prefStore = makePrefStore({
      [QUEST_SET_PREF_KEY]: 'tavern',
      [questSelectedKey('tavern')]: 'DELETED',
    });
    render(<QuestView loader={makeLoader()} questSet={null} questId={null}
      prefStore={prefStore} onSelectQuest={onSelectQuest} onJumpToMonster={vi.fn()} />);
    await waitFor(() => expect(onSelectQuest).toHaveBeenCalledWith('tavern', 'GOMB'));
  });

  it('seeds the royal selection from the pre-switcher key', async () => {
    const onSelectQuest = vi.fn();
    const prefStore = makePrefStore({ [LEGACY_QUEST_SELECTED_PREF_KEY]: '2' });
    render(<QuestView loader={makeLoader()} questSet={null} questId={null}
      prefStore={prefStore} onSelectQuest={onSelectQuest} onJumpToMonster={vi.fn()} />);
    await waitFor(() => expect(onSelectQuest).toHaveBeenCalledWith('royal', '2'));
  });
});
```

Extend the file's `makeLoader` so `loadTavernQuests` returns two tavern quests
(`GOMB`/*GÖMB* first, then any second) shaped exactly like the royal fixtures
but with `set: 'tavern'`. Import `QUEST_SET_PREF_KEY`, `questSelectedKey` and
`LEGACY_QUEST_SELECTED_PREF_KEY`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/database/QuestView.test.tsx`
Expected: FAIL — no `Királyi`/`Kocsmai` buttons exist.

- [ ] **Step 3: Implement**

In `src/database/quests/QuestView.tsx`:

Props become:

```ts
interface QuestViewProps {
  loader: DataLoader;
  /** Routed quest set (`#quests/<set>/…`); null falls back to the stored set. */
  questSet: QuestSet | null;
  /** Routed quest id; null falls back to the stored selection for the set. */
  questId: string | null;
  prefStore?: PrefStore;
  onSelectQuest(set: QuestSet, id: string): void;
  onJumpToMonster(id: number): void;
}
```

Add near the top of the module:

```ts
const SET_LABELS: Record<QuestSet, string> = { royal: 'Királyi', tavern: 'Kocsmai' };
const SETS: QuestSet[] = ['royal', 'tavern'];

function isQuestSet(value: string | null): value is QuestSet {
  return value === 'royal' || value === 'tavern';
}
```

State and loading:

```ts
  // The active set falls back to the stored one, then to royal. Read once at
  // mount: later navigation supplies `questSet` explicitly.
  const [fallbackSet] = useState<QuestSet>(() => {
    const stored = prefStore?.read(QUEST_SET_PREF_KEY) ?? null;
    return isQuestSet(stored) ? stored : 'royal';
  });
  const activeSet = questSet ?? fallbackSet;

  const [bySet, setBySet] = useState<Partial<Record<QuestSet, Quest[]>>>({});
  const quests = bySet[activeSet] ?? null;
```

Replace the data effect so each set is fetched at most once, on demand — the
two files are ~1.5MB and ~1.2MB, so loading both up front would double the
tab's cost for no benefit:

```ts
  useEffect(() => {
    let cancelled = false;
    if (bySet[activeSet]) return;
    const load = activeSet === 'tavern' ? loader.loadTavernQuests() : loader.loadQuests();
    load.then((q) => {
      if (!cancelled) setBySet((prev) => ({ ...prev, [activeSet]: q }));
    });
    return () => { cancelled = true; };
  }, [loader, activeSet, bySet]);

  useEffect(() => {
    let cancelled = false;
    loader.loadMonsters().then((m) => { if (!cancelled) setMonsters(m); });
    return () => { cancelled = true; };
  }, [loader]);
```

Persistence — replace both existing effects:

```ts
  /**
   * Restore the stored set and selection when navigation cleared them —
   * switching tabs, or a bare `#quests` route. The set is restored first and
   * the selection looked up *within it*, so a stale id falls back to the first
   * quest of the set the user was in rather than to royal quest 1.
   */
  useEffect(() => {
    if (restoredQuestRef.current) return;
    if (questId != null || !quests || !prefStore) return;
    restoredQuestRef.current = true;
    const stored = prefStore.read(questSelectedKey(activeSet))
      // One-time seed: the pre-switcher key held a royal quest number.
      ?? (activeSet === 'royal' ? prefStore.read(LEGACY_QUEST_SELECTED_PREF_KEY) : null);
    const target = stored && quests.some((q) => q.id === stored) ? stored : quests[0]?.id;
    if (target) onSelectQuest(activeSet, target);
  }, [questId, quests, prefStore, activeSet, onSelectQuest]);

  /** Remember whichever set and quest end up shown. */
  useEffect(() => {
    if (selectedQuestId == null || !prefStore) return;
    prefStore.write(QUEST_SET_PREF_KEY, activeSet);
    prefStore.write(questSelectedKey(activeSet), selectedQuestId);
  }, [selectedQuestId, activeSet, prefStore]);
```

Note `restoredQuestRef` must reset when the set changes, so switching sets can
restore within the new set. Add:

```ts
  useEffect(() => { restoredQuestRef.current = false; }, [activeSet]);
```

Switching sets — the toggle hands the parent the new set's first quest, so the
route is always complete:

```ts
  function changeSet(next: QuestSet) {
    if (next === activeSet) return;
    const target = bySet[next]?.[0]?.id
      ?? (prefStore?.read(questSelectedKey(next)) || null);
    // With the set's data not yet fetched and nothing stored, route to the set
    // with no quest; the restore effect picks the first once data arrives.
    onSelectQuest(next, target ?? '');
  }
```

Render the toggle above the chip strip, and the chips from `title`:

```tsx
      <div class="quest-sets" role="group" aria-label="Küldetés típus">
        {SETS.map((s) => (
          <button
            key={s}
            type="button"
            class={`quest-set-btn${s === activeSet ? ' active' : ''}`}
            aria-pressed={s === activeSet}
            onClick={() => changeSet(s)}
          >
            {SET_LABELS[s]}
          </button>
        ))}
      </div>
```

The chip's label and the header become set-aware:

```tsx
            {q.title}
```

```tsx
            <h2>{quest.set === 'royal' ? `${quest.title}. küldetés` : quest.title}</h2>
```

Every `onSelectQuest(q.id)` call becomes `onSelectQuest(quest.set, q.id)`.

- [ ] **Step 4: Style the toggle**

In `src/shared/styles/theme.css`, beside the existing `.quest-chip` rules, add
`.lc-db .quest-sets` and `.lc-db .quest-set-btn` styling. Use only existing
`:root` variables (no new hex literals), match the chip strip's spacing, and
give `.active` the same treatment `.quest-chip.active` already has. Set
`color` explicitly on the buttons — form controls never inherit it, in any
mode, and the in-game overlay runs in quirks mode.

- [ ] **Step 5: Run to verify it passes**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 6: Stage and commit**

```bash
git add src/database/quests/QuestView.tsx src/shared/styles/theme.css tests/database/QuestView.test.tsx
```

Suggested type: `feat`.

---

### Task 8: Documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`

- [ ] **Step 1: Update CLAUDE.md**

In the project-structure tree, add `scrapeTavern.mjs` / `parseTavernQuest.mjs`
under `scripts/quests/` and `tavern-quests.json` to the `static/db/*.json`
list.

In the quest-viewer paragraph, add a tavern subsection recording the facts a
future reader would otherwise have to rediscover:

- 37 quests keyed by page slug, titled from the index link text; scraped by
  `npm run scrape:tavern`.
- Keys are `<monster>_<lock>` (not the royal `_<lock>kulcs`), quest items are
  `_kulditargy`, exits `_labikibe`/`_kibe`, and markers sit on either side of
  the sprite name — so the parser is token-based, not an ordered suffix peel.
- There is no question grammar: zero `(n)` markers, arrows or ` -- ` in the
  set. Question tiles are identified by image, and their newline-delimited
  titles split as line 0 = setup, rest = options, with no outcomes.
- The source carries typos the parser aliases rather than dying on: four edge
  classes (`b_Ezust`, `f_azust`, `j_asrany`, `j_bronnz`) and seven sprite
  basenames (listed in `scrapeTavern.mjs`).
- `black.jpg` is void filler alongside `nop.jpg`.

In the data-paths section, note that royal and tavern data are separate files
fetched on demand, and why (combined size).

- [ ] **Step 2: Update README.md**

Add the tavern quests to the database feature list in the user-facing wording
already used there (Hungarian tab names, English prose).

- [ ] **Step 3: Verify the docs match reality**

Run: `npm run typecheck && npm test && npm run build`
Expected: PASS, and the build emits both `dist/index.html` and
`dist/larkinor-ui.user.js`.

- [ ] **Step 4: Stage and commit**

```bash
git add CLAUDE.md README.md
```

Suggested type: `docs`.

---

## Self-Review

**Spec coverage.** Data model → Task 1. Two data files → Tasks 4, 5. Second
parser (edges, filenames, titles, monsters) → Tasks 2, 3, 4. Scraper → Task 4.
UI switcher → Task 7. Route → Task 6. Persistence → Tasks 1, 7. Testing →
Tasks 2, 3, 5, 6, 7. Docs → Task 8. `QuestQuestionCard` needs no change, as
the spec records; no task touches it.

**Type consistency.** `parseTavernQuestPage(html, { id, title }, resolveMonster)`
is defined in Task 3 and called in Task 4 with `link` (which carries `href`,
`id` and `title` — the extra `href` is ignored). `onSelectQuest(set, id)` is
introduced in Task 6 and consumed in Task 7; Task 1 leaves it single-argument,
which Task 6 changes in the same commit as its call site. `questSelectedKey`
and `QUEST_SET_PREF_KEY` are defined in Task 1 and used in Task 7.

**Known ordering hazard.** Task 6 passes `questSet` to `QuestView` before
Task 7 consumes it; Task 6's Step 4 says to add the prop as optional-unused if
typecheck blocks. Reviewers should accept that seam rather than requiring
Task 6 to implement Task 7's behaviour.
