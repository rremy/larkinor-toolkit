# Royal Quests Database Tab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `Küldetések` tab to the database presenting the 45 royal quests as interactive mazes, where monsters link to their database entry, locked doors reveal where their key is, and choice points render as structured Q&A cards.

**Architecture:** A build-time scraper (`scripts/quests/`) turns the 45 source pages into a committed `static/db/quests.json`, following the project's existing "static/db is the single source of truth" convention. The parser is split into pure functions with no I/O so it is unit-testable against saved fixtures. The UI is a new `src/database/quests/` folder mirroring the existing `map/` layout, rendered as CSS grid divs rather than a `<table>` because the in-game page runs in quirks mode where tables refuse to inherit `color`.

**Tech Stack:** Node ESM (scraper, no dependencies), TypeScript, Preact, Vitest + @testing-library/preact, CSS custom properties.

**Spec:** `docs/superpowers/specs/2026-08-13-quest-database-design.md`

## Global Constraints

- **UI copy is Hungarian; identifiers and comments are English.** (CLAUDE.md)
- **No hardcoded hex/rgba in CSS rule bodies** — declare `:root` variables and reference them. (CLAUDE.md)
- **No unscoped element selectors in CSS** — everything under `#lc-root`, `#lc-dock-root` or a `.lc-*` class, because the game page stays visible on desktop. (CLAUDE.md)
- **The maze must not use `<table>`** — the in-game page is quirks mode, where tables do not inherit `color`. Use CSS grid + divs. (spec)
- **Any in-game form control must set `color` explicitly** — form controls never inherit `color` in any mode. (CLAUDE.md)
- **Temporary files go in the git-ignored `.tmp/`.** (CLAUDE.md)
- **Lock types are exactly:** `vas`, `rez`, `bronz`, `ezust`, `arany`, `platina`, `tolvaj`, `cso`.
- **Sides map:** `f`→N, `j`→E, `a`→S, `b`→W.
- **Asset base for monster sprites:** `https://l2.larkinor.hu`, with the DB path's leading `/pic` stripped (reuse `monsterImageUrl` from `src/components/MonsterCard.tsx`).
- **Commit convention:** conventional-commit subject, explanatory body, and the trailer `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` — matching this repo's existing history.
- **Do not push.** The user will ask when they want anything pushed.

---

### Task 1: Quest types, monster lookup by id, loader method

Foundation for everything else. `MonsterDatabase` currently indexes by name only, but quest cells store a resolved `monsterId`, so the grid needs an id lookup to render the sprite.

Adding a method to `DataLoader` breaks existing test stubs that implement the interface as object literals. Only two files do this — both are updated in this task so `npm run typecheck` stays green.

**Files:**
- Modify: `src/shared/data/types.ts` (append)
- Modify: `src/shared/data/monsters.ts:22-36`
- Modify: `src/shared/data/loader.ts:5-13, 24-36`
- Modify: `tests/database/MapView.test.tsx:29-33`
- Modify: `tests/database/DatabaseApp.test.tsx` (the `DataLoader` literal)
- Modify: `tests/shared/data/monsters.test.ts` (append — the file already exists with a `SAMPLE_MONSTERS` fixture)

**Interfaces:**
- Consumes: nothing.
- Produces: `LockType`, `Side`, `Edge`, `QuestChoice`, `QuestQuestion`, `QuestCell`, `Quest` (all from `@/shared/data`); `MonsterDatabase.getById(id: number): Monster | undefined` and `MonsterDatabase.byId: Map<number, Monster>`; `DataLoader.loadQuests(): Promise<Quest[]>`.

- [ ] **Step 1: Write the failing test for monster id lookup**

Append a new `it` block inside the existing `describe('buildMonsterDatabase')` in `tests/shared/data/monsters.test.ts`, reusing the file's `SAMPLE_MONSTERS` fixture:

```ts
  it('indexes monsters by id as well as by name', () => {
    const db = buildMonsterDatabase(SAMPLE_MONSTERS);
    expect(db.byId.has(1)).toBe(true);
    expect(db.getById(99)?.name).toBe('Hosszú nevű szörnyeteg király');
    expect(db.getById(12345)).toBeUndefined();
  });
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/shared/data/monsters.test.ts`
Expected: FAIL — `db.getById is not a function`.

- [ ] **Step 3: Add the id index**

In `src/shared/data/monsters.ts`, extend the interface and builder:

```ts
export interface MonsterDatabase {
  byName: Map<string, Monster>;
  byId: Map<number, Monster>;
  getByName(name: string): Monster | undefined;
  getById(id: number): Monster | undefined;
}

export function buildMonsterDatabase(monsters: Monster[]): MonsterDatabase {
  const byName = new Map<string, Monster>();
  const byId = new Map<number, Monster>();
  for (const m of monsters) {
    byName.set(m.name.toLowerCase(), m);
    byId.set(m.id, m);
  }

  return {
    byName,
    byId,
    getByName(name: string): Monster | undefined {
      return byName.get(name.toLowerCase());
    },
    getById(id: number): Monster | undefined {
      return byId.get(id);
    },
  };
}
```

- [ ] **Step 4: Append the quest types**

At the end of `src/shared/data/types.ts`:

```ts
/** The eight lock types a quest door can carry. */
export type LockType =
  | 'vas' | 'rez' | 'bronz' | 'ezust'
  | 'arany' | 'platina' | 'tolvaj' | 'cso';

export type Side = 'N' | 'E' | 'S' | 'W';

/**
 * One side of a quest maze cell. `szel` is a distinct kind on purpose: the
 * source site declares the class but ships no CSS rule for it, so its meaning
 * is undetermined and must not be collapsed into a wall or a door.
 */
export type Edge =
  | { kind: 'open' }
  | { kind: 'wall' }
  | { kind: 'door'; lock: LockType }
  | { kind: 'szel' };

export interface QuestChoice {
  /** The number the source prints in parentheses, e.g. `(2)`. */
  index: number;
  text: string;
  outcome: string;
}

export interface QuestQuestion {
  prompt: string;
  choices: QuestChoice[];
}

export interface QuestCell {
  row: number;
  col: number;
  edges: Record<Side, Edge>;
  /** Resolved against monsters.json; null when the cell holds no monster. */
  monsterId: number | null;
  /** Raw sprite base, kept when resolution fails so the UI can still label it. */
  monsterName: string | null;
  boss: boolean;
  /** The lock whose key this cell yields. */
  key: LockType | null;
  questItem: boolean;
  portal: 'entrance' | 'exit' | null;
  trap: boolean;
  death: boolean;
  narration: string;
  drops: string | null;
  question: QuestQuestion | null;
  /** Provenance, for diagnosing source drift. */
  rawImage: string;
}

export interface Quest {
  id: number;
  description: string;
  reward: string;
  rows: number;
  cols: number;
  cells: QuestCell[];
}
```

- [ ] **Step 5: Add the loader method and fix the two test stubs**

In `src/shared/data/loader.ts`, add to the `DataLoader` interface and the returned object:

```ts
// interface DataLoader — add:
  loadQuests(): Promise<Quest[]>;

// createDataLoader return — add:
    loadQuests: () => source.fetchJson<Quest[]>(url('quests.json')),
```

Import `Quest` in the existing type import at the top of the file.

In **both** `tests/database/MapView.test.tsx` and `tests/database/DatabaseApp.test.tsx`, add to the `DataLoader` object literal:

```ts
    loadQuests: async () => [],
```

and in `MapView.test.tsx` update the monster stub so it satisfies the widened interface:

```ts
    loadMonsters: async () => ({
      byName: new Map(), byId: new Map(),
      getByName: () => undefined, getById: () => undefined,
    }),
```

Apply the same widening to any other `loadMonsters` stub the typecheck flags.

- [ ] **Step 6: Verify tests and types pass**

Run: `npm test && npm run typecheck`
Expected: all tests PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/shared/data/types.ts src/shared/data/monsters.ts src/shared/data/loader.ts \
        tests/shared/data/monsters.test.ts tests/database/MapView.test.tsx tests/database/DatabaseApp.test.tsx
```

Commit with a conventional subject, explanatory body, and the `Co-Authored-By` trailer described in Global Constraints. Subject: `feat(data): add quest types, monster id index and loadQuests`.

---

### Task 2: Fixtures + parser foundations (comments, edges, grid)

The parser is plain Node ESM (`.mjs`) with no dependencies, imported directly by Vitest.

Six fixtures are chosen because each carries a distinct hazard: quest 1 is minimal, 11 has no entrance, 20 exercises every lock type, 27 has seven tables, 39 has `_szel` edges, 45 has a commented-out template row.

**Files:**
- Create: `tests/fixtures/quests/{1,11,20,27,39,45}.html`
- Create: `scripts/quests/parseQuest.mjs`
- Test: `tests/quests/parseQuest.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: from `scripts/quests/parseQuest.mjs` — `LOCK_SUFFIXES: string[]`, `SIDE_BY_PREFIX: Record<string, Side>`, `TOLERATED_TOKENS: Set<string>`, `stripComments(html: string): string`, `parseEdges(classAttr: string): Record<Side, Edge>`, `decodeEntities(s: string): string`, `stripTags(s: string): string`.

- [ ] **Step 1: Download the fixtures**

```bash
mkdir -p tests/fixtures/quests
for n in 1 11 20 27 39 45; do
  curl -sf "https://www.larkinorcenter.hu/kirkuld/$n/index.html" -o "tests/fixtures/quests/$n.html"
done
wc -c tests/fixtures/quests/*.html
```

Expected: six non-empty files. They are committed so the test suite runs offline.

- [ ] **Step 2: Write the failing test**

Create `tests/quests/parseQuest.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { stripComments, parseEdges, decodeEntities, stripTags } from '../../scripts/quests/parseQuest.mjs';

const fixture = (n: number) => readFileSync(`tests/fixtures/quests/${n}.html`, 'utf-8');

describe('stripComments', () => {
  it('removes the commented-out template row that quest 45 ships', () => {
    const raw = fixture(45);
    // The template row is commented out; its cells have empty src attributes.
    expect(raw).toContain('<!--');
    const stripped = stripComments(raw);
    expect(stripped).not.toContain('<!--');
    // Every remaining cell image has a real filename.
    expect(stripped).not.toMatch(/<img[^>]*src=""/);
  });
});

describe('parseEdges', () => {
  it('maps bare side tokens to walls and leaves the rest open', () => {
    expect(parseEdges('f j')).toEqual({
      N: { kind: 'wall' }, E: { kind: 'wall' },
      S: { kind: 'open' }, W: { kind: 'open' },
    });
  });

  it('maps suffixed side tokens to locked doors', () => {
    const edges = parseEdges('f j_vas a b_arany');
    expect(edges.E).toEqual({ kind: 'door', lock: 'vas' });
    expect(edges.W).toEqual({ kind: 'door', lock: 'arany' });
    expect(edges.N).toEqual({ kind: 'wall' });
    expect(edges.S).toEqual({ kind: 'wall' });
  });

  it('keeps szel as its own kind rather than a wall or a door', () => {
    expect(parseEdges('f_szel').N).toEqual({ kind: 'szel' });
  });

  it('tolerates the one malformed bare _cso token in the source', () => {
    expect(() => parseEdges('_cso')).not.toThrow();
    expect(parseEdges('_cso j')).toEqual({
      N: { kind: 'open' }, E: { kind: 'wall' },
      S: { kind: 'open' }, W: { kind: 'open' },
    });
  });

  it('throws on an unrecognised token so source drift cannot pass silently', () => {
    expect(() => parseEdges('f j_titanium')).toThrow(/j_titanium/);
    expect(() => parseEdges('x')).toThrow(/x/);
  });

  it('treats an empty class attribute as fully open', () => {
    expect(parseEdges('')).toEqual({
      N: { kind: 'open' }, E: { kind: 'open' },
      S: { kind: 'open' }, W: { kind: 'open' },
    });
  });
});

describe('decodeEntities / stripTags', () => {
  it('decodes the entities the source actually uses', () => {
    expect(decodeEntities('a&nbsp;b &amp; c &quot;d&quot;')).toBe('a b & c "d"');
  });

  it('strips tags and collapses whitespace', () => {
    expect(stripTags('<b>Hello</b>  <i>world</i>')).toBe('Hello world');
  });
});
```

- [ ] **Step 3: Run the test and verify it fails**

Run: `npx vitest run tests/quests/parseQuest.test.ts`
Expected: FAIL — cannot resolve `scripts/quests/parseQuest.mjs`.

- [ ] **Step 4: Implement the foundations**

Create `scripts/quests/parseQuest.mjs`:

```js
/**
 * Pure parsing functions for the larkinorcenter.hu royal quest pages.
 *
 * No I/O lives here on purpose: `scrape.mjs` does the fetching and writing, so
 * everything below is directly unit-testable against saved fixtures.
 */

/** Lock suffixes a door class or key filename can carry. */
export const LOCK_SUFFIXES = ['vas', 'rez', 'bronz', 'ezust', 'arany', 'platina', 'tolvaj', 'cso'];

/** Source side prefix → compass direction. */
export const SIDE_BY_PREFIX = { f: 'N', j: 'E', a: 'S', b: 'W' };

/**
 * Malformed class tokens present in the source that are known and harmless.
 * Anything outside this set throws, so genuine drift cannot pass silently.
 */
export const TOLERATED_TOKENS = new Set(['_cso']);

const ENTITIES = {
  '&nbsp;': ' ', '&amp;': '&', '&lt;': '<',
  '&gt;': '>', '&quot;': '"', '&#39;': "'",
};

export function decodeEntities(text) {
  return text.replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/g, (m) => ENTITIES[m]);
}

export function stripTags(html) {
  return decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/**
 * Remove HTML comments. Must run before any cell parsing: quest 45 ships a
 * commented-out template row that otherwise parses as eight phantom cells.
 */
export function stripComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, '');
}

const SIDE_TOKEN = /^([fjab])(?:_([a-z]+))?$/;

/** Parse a `<td>` class attribute into the cell's four edges. */
export function parseEdges(classAttr) {
  const edges = {
    N: { kind: 'open' }, E: { kind: 'open' },
    S: { kind: 'open' }, W: { kind: 'open' },
  };
  for (const token of String(classAttr).trim().split(/\s+/)) {
    if (!token) continue;
    if (TOLERATED_TOKENS.has(token)) continue;
    const m = SIDE_TOKEN.exec(token);
    if (!m) throw new Error(`unrecognised edge class token "${token}"`);
    const side = SIDE_BY_PREFIX[m[1]];
    const suffix = m[2];
    if (!suffix) { edges[side] = { kind: 'wall' }; continue; }
    if (suffix === 'szel') { edges[side] = { kind: 'szel' }; continue; }
    if (LOCK_SUFFIXES.includes(suffix)) { edges[side] = { kind: 'door', lock: suffix }; continue; }
    throw new Error(`unrecognised edge class token "${token}"`);
  }
  return edges;
}
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `npx vitest run tests/quests/parseQuest.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/fixtures/quests scripts/quests/parseQuest.mjs tests/quests/parseQuest.test.ts
```

Subject: `feat(quests): parse source maze edges and strip template comments`.

---

### Task 3: Image filename grammar

The filename grammar is `<base>[_<X>kulcs][_kt][_labikibe]`, but real files interleave the suffixes (`kereskedo_tolvajkulcs_kt_labikibe.jpg`), so the strip order is fixed: `_labikibe` → `_kt` → `_<X>kulcs` → `_kerdes`.

Two facts verified against the live source and worth knowing before implementing:
- `nop_labikibe.jpg` exists — an exit on an otherwise empty cell — so emptiness must be decided *after* stripping, not from the raw filename.
- `tolvajkepzoboss_kerdes.jpg` is the only base that fails a naive lookup. Stripping `_kerdes` resolves it to monster 201. With that rule, resolution is 328/328, so the scraper can demand perfect resolution rather than allow-listing a miss.

**Files:**
- Modify: `scripts/quests/parseQuest.mjs` (append)
- Test: `tests/quests/parseQuest.test.ts` (append)

**Interfaces:**
- Consumes: `LOCK_SUFFIXES` (Task 2).
- Produces: `parseImage(src: string): ImageFacts`, where `ImageFacts` is
  `{ base: string | null, key: LockType | null, questItem: boolean, portal: 'entrance'|'exit'|null, trap: boolean, death: boolean, boss: boolean, question: boolean, empty: boolean }`.

- [ ] **Step 1: Write the failing test**

Append to `tests/quests/parseQuest.test.ts`:

```ts
import { parseImage } from '../../scripts/quests/parseQuest.mjs';

describe('parseImage', () => {
  it('reads a plain monster sprite', () => {
    expect(parseImage('moszkitoraj_k.gif')).toMatchObject({
      base: 'moszkitoraj_k', key: null, questItem: false, portal: null,
      trap: false, death: false, boss: false, question: false, empty: false,
    });
  });

  it('reads the key a cell yields', () => {
    expect(parseImage('csontvaz_vaskulcs.jpg')).toMatchObject({ base: 'csontvaz', key: 'vas' });
    expect(parseImage('csontlovag_platinakulcs.jpg')).toMatchObject({ base: 'csontlovag', key: 'platina' });
  });

  it('strips interleaved suffixes in a fixed order', () => {
    expect(parseImage('kereskedo_tolvajkulcs_kt_labikibe.jpg'))
      .toMatchObject({ base: 'kereskedo', key: 'tolvaj', questItem: true, portal: 'exit' });
    expect(parseImage('dzsinkaboss_aranykulcs_kt.jpg'))
      .toMatchObject({ base: 'dzsinkaboss', key: 'arany', questItem: true, boss: true });
    expect(parseImage('polip_platinakulcs_labikibe.jpg'))
      .toMatchObject({ base: 'polip', key: 'platina', portal: 'exit' });
    expect(parseImage('goblinharcmuvesz_kt_labikibe.jpg'))
      .toMatchObject({ base: 'goblinharcmuvesz', questItem: true, portal: 'exit' });
  });

  it('treats bejarat as the entrance and other _labikibe files as exits', () => {
    expect(parseImage('bejarat_labikibe.jpg')).toMatchObject({ portal: 'entrance', empty: true });
    expect(parseImage('moszkitoraj_labikibe.jpg')).toMatchObject({ portal: 'exit', base: 'moszkitoraj' });
  });

  it('handles the trailing _j variant of the exit suffix', () => {
    expect(parseImage('csapda_labikibe_j.jpg')).toMatchObject({ portal: 'exit', trap: true });
    expect(parseImage('nop_labikibe_j.jpg')).toMatchObject({ portal: 'exit', empty: true });
  });

  it('decides emptiness after stripping, so an exit on an empty cell survives', () => {
    expect(parseImage('nop.jpg')).toMatchObject({ empty: true, portal: null });
    expect(parseImage('nop')).toMatchObject({ empty: true });
    expect(parseImage('')).toMatchObject({ empty: true });
    expect(parseImage('nop_labikibe.jpg')).toMatchObject({ empty: true, portal: 'exit' });
  });

  it('flags question, trap and death cells', () => {
    expect(parseImage('kerdes.jpg')).toMatchObject({ question: true, empty: true });
    expect(parseImage('kerdes_aranykulcs.jpg')).toMatchObject({ question: true, key: 'arany' });
    expect(parseImage('kerdes_kt_labikibe.jpg')).toMatchObject({ question: true, questItem: true, portal: 'exit' });
    expect(parseImage('csapda.jpg')).toMatchObject({ trap: true, empty: true });
    expect(parseImage('halal.jpg')).toMatchObject({ death: true, empty: true });
  });

  it('strips the _kerdes suffix so the boss base stays resolvable', () => {
    expect(parseImage('tolvajkepzoboss_kerdes.jpg'))
      .toMatchObject({ base: 'tolvajkepzoboss', question: true, boss: true, empty: false });
  });

  it('detects boss bases', () => {
    expect(parseImage('csontlovagboss_kt.jpg')).toMatchObject({ base: 'csontlovagboss', boss: true, questItem: true });
    expect(parseImage('nyonyoraboss_kt.gif')).toMatchObject({ base: 'nyonyoraboss', boss: true });
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/quests/parseQuest.test.ts -t parseImage`
Expected: FAIL — `parseImage is not a function`.

- [ ] **Step 3: Implement the grammar**

Append to `scripts/quests/parseQuest.mjs`:

```js
const KEY_SUFFIX = new RegExp(`_(${LOCK_SUFFIXES.join('|')})kulcs$`);
const EXIT_SUFFIX = /_labikibe(?:_j)?$/;

/**
 * Decompose a cell image filename.
 *
 * Suffixes interleave in the source (`kereskedo_tolvajkulcs_kt_labikibe.jpg`),
 * so the strip order is fixed: exit, quest item, key, question. Emptiness is
 * decided only after stripping, because `nop_labikibe.jpg` is an exit standing
 * on an otherwise empty cell.
 */
export function parseImage(src) {
  const facts = {
    base: null, key: null, questItem: false, portal: null,
    trap: false, death: false, boss: false, question: false, empty: false,
  };

  let rest = String(src).replace(/^.*\//, '').replace(/\.(gif|jpe?g|png)$/i, '');
  if (!rest) { facts.empty = true; return facts; }

  if (EXIT_SUFFIX.test(rest)) { facts.portal = 'exit'; rest = rest.replace(EXIT_SUFFIX, ''); }
  if (/_kt$/.test(rest)) { facts.questItem = true; rest = rest.replace(/_kt$/, ''); }

  const keyMatch = KEY_SUFFIX.exec(rest);
  if (keyMatch) { facts.key = keyMatch[1]; rest = rest.replace(KEY_SUFFIX, ''); }

  // `tolvajkepzoboss_kerdes` is a question drawn over a boss sprite.
  if (/_kerdes$/.test(rest)) { facts.question = true; rest = rest.replace(/_kerdes$/, ''); }

  if (rest === 'kerdes') { facts.question = true; facts.empty = true; return facts; }
  if (rest === 'csapda') { facts.trap = true; facts.empty = true; return facts; }
  if (rest === 'halal') { facts.death = true; facts.empty = true; return facts; }
  if (rest === 'bejarat') { facts.portal = 'entrance'; facts.empty = true; return facts; }
  if (rest === 'nop' || rest === '') { facts.empty = true; return facts; }

  facts.base = rest;
  facts.boss = /boss$/.test(rest);
  return facts;
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run tests/quests/parseQuest.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/quests/parseQuest.mjs tests/quests/parseQuest.test.ts
```

Subject: `feat(quests): decode the cell image filename grammar`.

---

### Task 4: Question and drops parsing

The riskiest part. Two rules matter and both have tests:

1. **Question before drops.** Answer text uses ` -- ` as its own separator, so splitting on the drops separator first corrupts all 143 questions.
2. **Drops can trail the final answer.** In titles like `… (3) Továbbmész -- Hullámelementál -- 6 db elementál eszencia`, the quest drop sits after the last answer's outcome. It is lifted out only when the trailing segment matches the drop shape `<n> db …`, which keeps the rule testable instead of guessy.

Anything the parser cannot split into at least two choices falls back to raw narration. It never invents structure.

**Files:**
- Modify: `scripts/quests/parseQuest.mjs` (append)
- Test: `tests/quests/parseQuest.test.ts` (append)

**Interfaces:**
- Consumes: `stripTags`, `decodeEntities` (Task 2).
- Produces: `parseTitle(title: string): { narration: string, drops: string | null, question: QuestQuestion | null }`.

- [ ] **Step 1: Write the failing test**

Append to `tests/quests/parseQuest.test.ts`:

```ts
import { parseTitle } from '../../scripts/quests/parseQuest.mjs';

describe('parseTitle', () => {
  it('splits drops off a plain narration', () => {
    const r = parseTitle('Továbbhaladva látod, hogy dél felé szűkül a folyosó... -- 1 db szúnyogszárny');
    expect(r.narration).toBe('Továbbhaladva látod, hogy dél felé szűkül a folyosó...');
    expect(r.drops).toBe('1 db szúnyogszárny');
    expect(r.question).toBeNull();
  });

  it('returns null drops when the title has no separator', () => {
    const r = parseTitle('Itt léptél be Gründen pincéjébe.');
    expect(r.drops).toBeNull();
    expect(r.narration).toBe('Itt léptél be Gründen pincéjébe.');
  });

  it('parses a colon-separated question, keeping narration before it', () => {
    const r = parseTitle(
      'Találsz egy borosüveget. KÉRDÉS: Mit teszel? VÁLASZOK: ' +
      '(1) Megkóstolod: max ÉP (2) Kiiszod az egészet: 3 méreg (3) Otthagyod a földön az üveget: semmi',
    );
    expect(r.narration).toBe('Találsz egy borosüveget.');
    expect(r.question?.prompt).toBe('Mit teszel?');
    expect(r.question?.choices).toEqual([
      { index: 1, text: 'Megkóstolod', outcome: 'max ÉP' },
      { index: 2, text: 'Kiiszod az egészet', outcome: '3 méreg' },
      { index: 3, text: 'Otthagyod a földön az üveget', outcome: 'semmi' },
    ]);
  });

  it('parses a dash-separated question with semicolons', () => {
    const r = parseTitle(
      'Látsz egy gyökeret. KÉRDÉS: Mit teszel? VÁLASZ: (1) Megpróbálod meghúzni -- Kaméleon; (2) Otthagyod -- semmi',
    );
    expect(r.question?.choices).toEqual([
      { index: 1, text: 'Megpróbálod meghúzni', outcome: 'Kaméleon' },
      { index: 2, text: 'Otthagyod', outcome: 'semmi' },
    ]);
  });

  it('parses parenthesised outcomes and a lowercase Válasz label', () => {
    const r = parseTitle(
      'Észreveszel egy gombát. KÉRDÉS: Mit teszel? Válasz: ' +
      '(1) Otthagyod. (Gyógyulsz); (2) Bedörzsölöd vele a homlokod (3 méreg); (3) Otthagyod (4 átok)',
    );
    expect(r.question?.choices.map((c) => c.outcome)).toEqual(['Gyógyulsz', '3 méreg', '4 átok']);
    expect(r.question?.choices[1].text).toBe('Bedörzsölöd vele a homlokod');
  });

  it('does not let the drops separator corrupt the question', () => {
    const r = parseTitle(
      'KÉRDÉS: Mit teszel? VÁLASZ: (1) Felállsz -- 15 méreg; (2) Lehajolsz -- 4 méreg',
    );
    expect(r.question?.choices).toHaveLength(2);
    expect(r.question?.choices[0].outcome).toBe('15 méreg');
    expect(r.drops).toBeNull();
  });

  it('lifts a trailing quest drop out of the final answer', () => {
    const r = parseTitle(
      'KÉRDÉS: Mit teszel? VÁLASZ: (1) Hallgatsz -- semmi; ' +
      '(2) Megmondod a neved -- Halál; (3) Továbbmész -- Hullámelementál -- 6 db elementál eszencia',
    );
    expect(r.drops).toBe('6 db elementál eszencia');
    expect(r.question?.choices[2].outcome).toBe('Hullámelementál');
  });

  it('tolerates the doubled parenthesis typo in the source', () => {
    const r = parseTitle('KÉRDÉS: Mi? VÁLASZ: (1) NYED. -- -20000 ÉP; (2) NYEB. -- semmi; (3)) NYANYED. -- -20000 ÉP');
    expect(r.question?.choices.map((c) => c.index)).toEqual([1, 2, 3]);
  });

  it('falls back to raw narration when the answers cannot be split', () => {
    const raw = 'KÉRDÉS: Mit teszel? VÁLASZ: mindegy';
    const r = parseTitle(raw);
    expect(r.question).toBeNull();
    expect(r.narration).toBe(raw);
  });

  it('returns empty narration for an empty title', () => {
    expect(parseTitle('')).toEqual({ narration: '', drops: null, question: null });
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/quests/parseQuest.test.ts -t parseTitle`
Expected: FAIL — `parseTitle is not a function`.

- [ ] **Step 3: Implement the title parser**

Append to `scripts/quests/parseQuest.mjs`:

```js
const QUESTION_RE = /K[ÉE]RD[ÉE]S\s*:?\s*([\s\S]*?)\s*V[ÁA]LASZ(?:OK)?\s*:?\s*([\s\S]*)$/i;
const CHOICE_MARKER = /\((\d)\)+\s*/g;
const DROPS_SEPARATOR = ' -- ';
/** A quest drop always reads `<n> db <thing>`. */
const DROP_SHAPE = /^\d+\s*db\s/i;

/** Split one raw answer into its text and its outcome. */
function splitOutcome(index, raw) {
  let text = raw.trim().replace(/[;,.\s]+$/, '');
  let outcome = '';
  let m;
  if ((m = /^([\s\S]*?)\s+--\s+([\s\S]*)$/.exec(text))) {
    text = m[1]; outcome = m[2];
  } else if ((m = /^([\s\S]*?)\s*\(([^()]*)\)\s*$/.exec(text))) {
    text = m[1]; outcome = m[2];
  } else if ((m = /^([\s\S]*?):\s*([\s\S]*)$/.exec(text))) {
    text = m[1]; outcome = m[2];
  }
  return {
    index,
    text: text.trim().replace(/[;,.\s]+$/, ''),
    outcome: outcome.trim().replace(/[;,\s]+$/, ''),
  };
}

/** Split the answer block on its `(n)` markers. */
function parseChoices(raw) {
  const marks = [];
  CHOICE_MARKER.lastIndex = 0;
  let m;
  while ((m = CHOICE_MARKER.exec(raw))) {
    marks.push({ index: Number(m[1]), start: m.index, end: CHOICE_MARKER.lastIndex });
  }
  return marks.map((mark, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].start : raw.length;
    return splitOutcome(mark.index, raw.slice(mark.end, end));
  });
}

/**
 * Decompose a cell `title` into narration, drops and an optional question.
 *
 * The question is extracted first: answers use ` -- ` as their own separator,
 * so splitting on the drops separator first would corrupt every question.
 */
export function parseTitle(title) {
  const text = decodeEntities(String(title)).replace(/\s+/g, ' ').trim();
  if (!text) return { narration: '', drops: null, question: null };

  const qm = QUESTION_RE.exec(text);
  if (qm) {
    const choices = parseChoices(qm[2]);
    if (choices.length >= 2) {
      const narration = text.slice(0, qm.index).trim();
      let drops = null;
      // A quest drop can trail the final answer's outcome.
      const last = choices[choices.length - 1];
      const cut = last.outcome.lastIndexOf(DROPS_SEPARATOR);
      if (cut >= 0) {
        const tail = last.outcome.slice(cut + DROPS_SEPARATOR.length).trim();
        if (DROP_SHAPE.test(tail)) {
          drops = tail;
          last.outcome = last.outcome.slice(0, cut).trim();
        }
      }
      return { narration, drops, question: { prompt: qm[1].trim(), choices } };
    }
    // Unsplittable answers: keep the raw text rather than invent structure.
    return { narration: text, drops: null, question: null };
  }

  const cut = text.indexOf(DROPS_SEPARATOR);
  if (cut < 0) return { narration: text, drops: null, question: null };
  return {
    narration: text.slice(0, cut).trim(),
    drops: text.slice(cut + DROPS_SEPARATOR.length).trim(),
    question: null,
  };
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run tests/quests/parseQuest.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/quests/parseQuest.mjs tests/quests/parseQuest.test.ts
```

Subject: `feat(quests): parse choice points and drops from cell titles`.

---

### Task 5: Page assembly

Puts the pieces together into a `Quest`. Handles the three structural exceptions verified against the source: quest 27's seven tables are alternate views of one maze (take the first), quest 11 has no entrance marker, and only 5 of 45 quests carry `td` coordinate ids so coordinates come from row/column position.

**Files:**
- Modify: `scripts/quests/parseQuest.mjs` (append)
- Test: `tests/quests/parseQuest.test.ts` (append)

**Interfaces:**
- Consumes: everything from Tasks 2–4.
- Produces: `parseQuestPage(html: string, id: number, resolveMonster: (base: string) => { id: number, name: string } | null): Quest`.
  `resolveMonster` is injected so the parser stays pure and the tests need no `monsters.json`.

- [ ] **Step 1: Write the failing test**

Append to `tests/quests/parseQuest.test.ts`:

```ts
import { parseQuestPage } from '../../scripts/quests/parseQuest.mjs';
import type { Quest } from '@/shared/data';

/** Resolver stub: every base resolves, so unresolved cases are explicit in tests. */
const resolveAll = (base: string) => ({ id: 1, name: `M:${base}` });
const resolveNone = () => null;

const parse = (n: number, resolve = resolveAll): Quest =>
  parseQuestPage(readFileSync(`tests/fixtures/quests/${n}.html`, 'utf-8'), n, resolve);

describe('parseQuestPage', () => {
  it('reads the description and reward', () => {
    const q = parse(1);
    expect(q.id).toBe(1);
    expect(q.description).toContain('Gründen borospincéjét ellepték a szúnyogok');
    expect(q.reward).toContain('20 db ezüst');
    // Trailing separators from the source are trimmed.
    expect(q.reward.endsWith(',')).toBe(false);
  });

  it('derives coordinates from row and column position', () => {
    const q = parse(1);
    expect(q.rows).toBe(2);
    expect(q.cols).toBe(4);
    expect(q.cells).toHaveLength(8);
    expect(q.cells[0]).toMatchObject({ row: 0, col: 0 });
    expect(q.cells.at(-1)).toMatchObject({ row: 1, col: 3 });
  });

  it('carries edges, keys and portals onto cells', () => {
    const q = parse(1);
    const entrance = q.cells.find((c) => c.portal === 'entrance');
    expect(entrance).toMatchObject({ row: 0, col: 0 });
    // The iron-key door and the cell that yields the iron key both exist.
    const doorCell = q.cells.find((c) => Object.values(c.edges).some(
      (e) => e.kind === 'door' && e.lock === 'vas'));
    expect(doorCell).toBeTruthy();
    expect(q.cells.some((c) => c.key === 'vas')).toBe(true);
  });

  it('attaches parsed narration, drops and questions to the right cells', () => {
    const q = parse(1);
    expect(q.cells.some((c) => c.question?.choices.length === 3)).toBe(true);
    expect(q.cells.some((c) => c.drops === '1 db szúnyogszárny')).toBe(true);
  });

  it('resolves monsters through the injected resolver', () => {
    const q = parse(1);
    const withMonster = q.cells.filter((c) => c.monsterId !== null);
    expect(withMonster.length).toBeGreaterThan(0);
    expect(withMonster[0].monsterName).toMatch(/^M:/);
  });

  it('keeps the raw base as monsterName when resolution fails', () => {
    const q = parse(1, resolveNone);
    const unresolved = q.cells.find((c) => c.rawImage.includes('moszkitoraj'));
    expect(unresolved?.monsterId).toBeNull();
    expect(unresolved?.monsterName).toBe('moszkitoraj_k');
  });

  it('takes only the first table of quest 27, which is one maze in seven views', () => {
    const q = parse(27);
    expect(q.cells).toHaveLength(q.rows * q.cols);
    // The full-maze view is 8 rows; the six key views follow it.
    expect(q.rows).toBeLessThan(20);
  });

  it('tolerates quest 11 having no entrance marker', () => {
    const q = parse(11);
    expect(q.cells.some((c) => c.portal === 'entrance')).toBe(false);
    expect(q.cells.length).toBeGreaterThan(0);
  });

  it('preserves szel edges in quest 39', () => {
    const q = parse(39);
    expect(q.cells.some((c) => Object.values(c.edges).some((e) => e.kind === 'szel'))).toBe(true);
  });

  it('ignores the commented-out template row in quest 45', () => {
    const q = parse(45);
    expect(q.cells).toHaveLength(q.rows * q.cols);
    expect(q.cells.every((c) => c.rawImage !== '')).toBe(true);
  });

  it('records every lock type present in quest 20', () => {
    const q = parse(20);
    const locks = new Set(
      q.cells.flatMap((c) => Object.values(c.edges))
        .filter((e) => e.kind === 'door').map((e: any) => e.lock),
    );
    expect(locks.size).toBeGreaterThanOrEqual(7);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/quests/parseQuest.test.ts -t parseQuestPage`
Expected: FAIL — `parseQuestPage is not a function`.

- [ ] **Step 3: Implement page assembly**

Append to `scripts/quests/parseQuest.mjs`:

```js
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
 * Parse one quest page into a `Quest`.
 *
 * `resolveMonster` maps a sprite base to a monster, injected so this stays pure
 * and the tests need no monsters.json.
 */
export function parseQuestPage(html, id, resolveMonster) {
  const clean = stripComments(html);

  const description = field(clean, DESC_RE, 'description', id);
  const reward = field(clean, REWARD_RE, 'reward', id);

  const labStart = clean.indexOf('<div class="lab">');
  if (labStart < 0) throw new Error(`quest ${id}: no maze container`);
  const lab = clean.slice(labStart);

  // Quest 27 ships seven tables: the full maze followed by six per-key views.
  const tableMatch = /<table[^>]*>([\s\S]*?)<\/table>/i.exec(lab);
  if (!tableMatch) throw new Error(`quest ${id}: no maze table`);
  const table = tableMatch[1];

  const rowHtml = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1]);
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
      const title = (/title="([^"]*)"/i.exec(inner) ?? [, ''])[1];

      let edges;
      try {
        edges = parseEdges(classAttr);
      } catch (err) {
        throw new Error(`quest ${id} cell ${r},${c}: ${err.message}`);
      }

      const facts = parseImage(src);
      const parsed = parseTitle(title);

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
        drops: parsed.drops,
        // Null when the title could not be split, even if the image says
        // "question" — the card is never rendered from invented structure.
        question: parsed.question,
        rawImage: src,
      });
    });
  });

  if (cells.length === 0) throw new Error(`quest ${id}: maze has no cells`);

  return { id, description, reward, rows: rowHtml.length, cols, cells };
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run tests/quests/parseQuest.test.ts`
Expected: PASS. If the quest 45 assertion `cells.length === rows * cols` fails, the commented template row is still being counted — confirm `stripComments` runs before the row match.

- [ ] **Step 5: Commit**

```bash
git add scripts/quests/parseQuest.mjs tests/quests/parseQuest.test.ts
```

Subject: `feat(quests): assemble parsed source pages into quest records`.

---

### Task 6: Scraper CLI and generated data

Produces the committed `static/db/quests.json` and the CI guard over it.

The scraper demands **perfect monster resolution**. Because stripping `_kerdes` resolves `tolvajkepzoboss` (verified: monster 201), all 328 distinct sprite bases resolve, so any unresolved base is genuine drift and aborts the write.

**Files:**
- Create: `scripts/quests/scrape.mjs`
- Create: `static/db/quests.json` (generated)
- Modify: `package.json` (scripts)
- Test: `tests/quests/questData.test.ts`

**Interfaces:**
- Consumes: `parseQuestPage` (Task 5), `Quest` (Task 1).
- Produces: `static/db/quests.json` — a bare `Quest[]`, matching how `monsters.json` / `weapons.json` are shaped.

- [ ] **Step 1: Write the scraper**

Create `scripts/quests/scrape.mjs`:

```js
#!/usr/bin/env node
/**
 * Crawl the larkinorcenter.hu royal quest pages into static/db/quests.json.
 *
 * Run with `npm run scrape:quests`. Fails loudly rather than degrading: an
 * unknown class token, a missing field, an empty maze or an unresolved sprite
 * base aborts before anything is written, so source drift surfaces here rather
 * than as a broken page.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseQuestPage } from './parseQuest.mjs';

const BASE = 'https://www.larkinorcenter.hu/kirkuld';
const QUEST_COUNT = 45;
const OUT = 'static/db/quests.json';

const monsters = JSON.parse(readFileSync('static/db/monsters.json', 'utf-8'));

/** Sprite base (`moszkitoraj_k`) → monster, from each monster's image path. */
const byBase = new Map();
for (const m of monsters) {
  const base = m.image.replace(/^.*\//, '').replace(/\.[a-z]+$/i, '');
  if (base) byBase.set(base, m);
}

const unresolved = new Set();
function resolveMonster(base) {
  const hit = byBase.get(base) ?? byBase.get(`${base}_k`);
  if (!hit) { unresolved.add(base); return null; }
  return { id: hit.id, name: hit.name };
}

const quests = [];
for (let id = 1; id <= QUEST_COUNT; id += 1) {
  const res = await fetch(`${BASE}/${id}/index.html`);
  if (!res.ok) throw new Error(`quest ${id}: HTTP ${res.status}`);
  const quest = parseQuestPage(await res.text(), id, resolveMonster);
  quests.push(quest);
  process.stdout.write(`quest ${id}: ${quest.rows}x${quest.cols}, ${quest.cells.length} cells\n`);
}

if (unresolved.size > 0) {
  throw new Error(`unresolved sprite bases: ${[...unresolved].sort().join(', ')}`);
}

const cells = quests.flatMap((q) => q.cells);
const questions = cells.filter((c) => c.question).length;
const rawQuestionCells = cells.filter((c) => /K[ÉE]RD[ÉE]S/i.test(c.narration)).length;
process.stdout.write(
  `\n${quests.length} quests, ${cells.length} cells, ` +
  `${questions} questions parsed, ${rawQuestionCells} left as raw text\n`,
);

writeFileSync(OUT, `${JSON.stringify(quests, null, 0)}\n`, 'utf-8');
process.stdout.write(`wrote ${OUT}\n`);
```

- [ ] **Step 2: Add the npm script**

In `package.json` `scripts`, add:

```json
    "scrape:quests": "node scripts/quests/scrape.mjs",
```

- [ ] **Step 3: Run the scraper**

Run: `npm run scrape:quests`
Expected: 45 lines of per-quest dimensions, then a summary, then `wrote static/db/quests.json`. It must **not** report unresolved bases. Note the reported clean-parse rate for questions — that is the real number the spec asks for, and it belongs in the commit body.

- [ ] **Step 4: Write the data invariant test**

Create `tests/quests/questData.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Quest, LockType } from '@/shared/data';

const quests: Quest[] = JSON.parse(readFileSync('static/db/quests.json', 'utf-8'));
const monsters = JSON.parse(readFileSync('static/db/monsters.json', 'utf-8'));
const monsterIds = new Set<number>(monsters.map((m: { id: number }) => m.id));

const LOCKS: LockType[] = ['vas', 'rez', 'bronz', 'ezust', 'arany', 'platina', 'tolvaj', 'cso'];

describe('static/db/quests.json', () => {
  it('holds a contiguous run of quests starting at 1', () => {
    expect(quests.length).toBeGreaterThanOrEqual(45);
    expect(quests.map((q) => q.id)).toEqual(quests.map((_, i) => i + 1));
  });

  it('gives every quest a description and a reward', () => {
    for (const q of quests) {
      expect(q.description, `quest ${q.id}`).toBeTruthy();
      expect(q.reward, `quest ${q.id}`).toBeTruthy();
    }
  });

  it('keeps every cell inside its declared grid', () => {
    for (const q of quests) {
      expect(q.cells.length, `quest ${q.id}`).toBe(q.rows * q.cols);
      for (const c of q.cells) {
        expect(c.row, `quest ${q.id}`).toBeGreaterThanOrEqual(0);
        expect(c.row, `quest ${q.id}`).toBeLessThan(q.rows);
        expect(c.col, `quest ${q.id}`).toBeGreaterThanOrEqual(0);
        expect(c.col, `quest ${q.id}`).toBeLessThan(q.cols);
      }
    }
  });

  it('uses only known lock types on doors and keys', () => {
    for (const q of quests) {
      for (const c of q.cells) {
        if (c.key) expect(LOCKS, `quest ${q.id}`).toContain(c.key);
        for (const edge of Object.values(c.edges)) {
          if (edge.kind === 'door') expect(LOCKS, `quest ${q.id}`).toContain(edge.lock);
        }
      }
    }
  });

  it('resolves every monster id against monsters.json', () => {
    for (const q of quests) {
      for (const c of q.cells) {
        if (c.monsterId !== null) {
          expect(monsterIds.has(c.monsterId), `quest ${q.id} monster ${c.monsterId}`).toBe(true);
        }
      }
    }
  });

  it('provides a key cell for every lock that appears on a door', () => {
    const missing: string[] = [];
    for (const q of quests) {
      const keysHere = new Set(q.cells.map((c) => c.key).filter(Boolean));
      const locksHere = new Set(
        q.cells.flatMap((c) => Object.values(c.edges))
          .filter((e) => e.kind === 'door')
          .map((e) => (e as { lock: LockType }).lock),
      );
      for (const lock of locksHere) if (!keysHere.has(lock)) missing.push(`quest ${q.id}: ${lock}`);
    }
    // Recorded, not asserted empty: the source may genuinely omit a key.
    // The UI states "nincs kulcs ebben a küldetésben" for these.
    expect(Array.isArray(missing)).toBe(true);
  });
});
```

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: PASS. If the contiguous-id test fails, the scraper wrote fewer than 45 quests — re-run it and read the error.

- [ ] **Step 6: Commit**

```bash
git add scripts/quests/scrape.mjs static/db/quests.json package.json tests/quests/questData.test.ts
```

Subject: `feat(quests): scrape the royal quests into static/db/quests.json`. Put the observed question clean-parse rate in the body.

---

### Task 7: Presentation metadata

Lookup tables and pure helpers, separated from components so they are testable without rendering.

**Files:**
- Create: `src/database/quests/questMeta.ts`
- Test: `tests/database/questMeta.test.ts`

**Interfaces:**
- Consumes: `LockType`, `QuestCell`, `Quest` (Task 1).
- Produces: `LOCK_LABEL: Record<LockType, string>`, `KEY_LABEL: Record<LockType, string>`, `BADGE: { key: string, questItem: string, entrance: string, exit: string, trap: string, death: string, question: string, boss: string }`, `outcomeValence(text: string): 'good'|'bad'|'fatal'|'neutral'`, `coordLabel(cell: {row:number,col:number}): string`, `keyCellsFor(quest: Quest, lock: LockType): QuestCell[]`, `locksIn(quest: Quest): LockType[]`.

- [ ] **Step 1: Write the failing test**

Create `tests/database/questMeta.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { LOCK_LABEL, outcomeValence, coordLabel, keyCellsFor, locksIn } from '@/database/quests/questMeta';
import type { Quest, QuestCell, Edge } from '@/shared/data';

const openEdges = (): Record<'N'|'E'|'S'|'W', Edge> => ({
  N: { kind: 'open' }, E: { kind: 'open' }, S: { kind: 'open' }, W: { kind: 'open' },
});

function cell(partial: Partial<QuestCell>): QuestCell {
  return {
    row: 0, col: 0, edges: openEdges(), monsterId: null, monsterName: null,
    boss: false, key: null, questItem: false, portal: null, trap: false,
    death: false, narration: '', drops: null, question: null, rawImage: '',
    ...partial,
  };
}

function quest(cells: QuestCell[]): Quest {
  return { id: 1, description: '', reward: '', rows: 2, cols: 2, cells };
}

describe('LOCK_LABEL', () => {
  it('names every lock in Hungarian', () => {
    expect(LOCK_LABEL.vas).toBe('vaskulcs');
    expect(LOCK_LABEL.ezust).toBe('ezüstkulcs');
    expect(LOCK_LABEL.cso).toBe('csőkulcs');
    expect(Object.keys(LOCK_LABEL)).toHaveLength(8);
  });
});

describe('outcomeValence', () => {
  it('marks death as fatal', () => {
    expect(outcomeValence('HALÁL')).toBe('fatal');
    expect(outcomeValence('Halál')).toBe('fatal');
  });

  it('marks damage, poison and curses as bad', () => {
    expect(outcomeValence('3 méreg')).toBe('bad');
    expect(outcomeValence('4 átok')).toBe('bad');
    expect(outcomeValence('-20000 ÉP')).toBe('bad');
    expect(outcomeValence('Elveszted a bal kezedben levő tárgyat')).toBe('bad');
  });

  it('marks healing and loot as good', () => {
    expect(outcomeValence('max ÉP')).toBe('good');
    expect(outcomeValence('Gyógyulsz')).toBe('good');
    expect(outcomeValence('30 ezüst')).toBe('good');
    expect(outcomeValence('1 db kincs')).toBe('good');
  });

  it('marks nothing-happens as neutral', () => {
    expect(outcomeValence('semmi')).toBe('neutral');
    expect(outcomeValence('')).toBe('neutral');
    expect(outcomeValence('Kaméleon')).toBe('neutral');
  });
});

describe('coordLabel', () => {
  it('renders 1-based Hungarian row/column labels', () => {
    expect(coordLabel({ row: 0, col: 0 })).toBe('1. sor, 1. oszlop');
    expect(coordLabel({ row: 2, col: 1 })).toBe('3. sor, 2. oszlop');
  });
});

describe('keyCellsFor / locksIn', () => {
  it('finds the cells yielding a lock, and lists locks present on doors', () => {
    const q = quest([
      cell({ row: 0, col: 0, edges: { ...openEdges(), E: { kind: 'door', lock: 'vas' } } }),
      cell({ row: 1, col: 1, key: 'vas' }),
      cell({ row: 1, col: 0, key: 'arany' }),
    ]);
    expect(keyCellsFor(q, 'vas')).toHaveLength(1);
    expect(keyCellsFor(q, 'vas')[0]).toMatchObject({ row: 1, col: 1 });
    expect(keyCellsFor(q, 'platina')).toEqual([]);
    // Only locks that actually gate a door, deduped.
    expect(locksIn(q)).toEqual(['vas']);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/database/questMeta.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the metadata**

Create `src/database/quests/questMeta.ts`:

```ts
import type { LockType, Quest, QuestCell, Side } from '@/shared/data';

/** Hungarian key names, as the game prints them. */
export const LOCK_LABEL: Record<LockType, string> = {
  vas: 'vaskulcs',
  rez: 'rézkulcs',
  bronz: 'bronzkulcs',
  ezust: 'ezüstkulcs',
  arany: 'aranykulcs',
  platina: 'platinakulcs',
  tolvaj: 'tolvajkulcs',
  cso: 'csőkulcs',
};

/** Badge glyphs overlaid on maze cells. */
export const BADGE = {
  key: '🔑',
  questItem: '📜',
  entrance: '⬇',
  exit: '🚪',
  trap: '⚠',
  death: '💀',
  question: '❓',
  boss: '★',
} as const;

export const SIDES: Side[] = ['N', 'E', 'S', 'W'];

/** Hungarian side names, used in door tooltips. */
export const SIDE_LABEL: Record<Side, string> = {
  N: 'észak', E: 'kelet', S: 'dél', W: 'nyugat',
};

export type Valence = 'good' | 'bad' | 'fatal' | 'neutral';

/**
 * Classify a choice outcome so the Q&A card can colour it. Ordered most
 * specific first: `-20000 ÉP` must not read as the "ÉP" gain case.
 */
export function outcomeValence(text: string): Valence {
  const t = text.toLowerCase();
  if (!t) return 'neutral';
  if (/hal[áa]l/.test(t)) return 'fatal';
  if (/-\s*\d/.test(t)) return 'bad';
  if (/m[ée]reg|[áa]tok|fert[őo]z[ée]s|elveszted|veszt|s[ée]r[üu]l/.test(t)) return 'bad';
  if (/^semmi\b|^nincs\b/.test(t)) return 'neutral';
  if (/max [ée]p|gy[óo]gyul|ez[üu]st|arany|kincs|\d+\s*db\s/.test(t)) return 'good';
  return 'neutral';
}

/** 1-based Hungarian position label, e.g. `3. sor, 2. oszlop`. */
export function coordLabel(cell: { row: number; col: number }): string {
  return `${cell.row + 1}. sor, ${cell.col + 1}. oszlop`;
}

/** Cells in this quest that yield the given lock's key. */
export function keyCellsFor(quest: Quest, lock: LockType): QuestCell[] {
  return quest.cells.filter((c) => c.key === lock);
}

/** Every lock that gates at least one door in this quest, deduped and ordered. */
export function locksIn(quest: Quest): LockType[] {
  const found = new Set<LockType>();
  for (const cell of quest.cells) {
    for (const side of SIDES) {
      const edge = cell.edges[side];
      if (edge.kind === 'door') found.add(edge.lock);
    }
  }
  return (Object.keys(LOCK_LABEL) as LockType[]).filter((l) => found.has(l));
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run tests/database/questMeta.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/database/quests/questMeta.ts tests/database/questMeta.test.ts
```

Subject: `feat(quests): add lock labels, badges and outcome classification`.

---

### Task 8: The maze grid

CSS grid and divs, **never a `<table>`** — see Global Constraints.

Doors are focusable (`tabindex="0"`) from the start, because Task 9 hangs hover *and* focus behaviour off them and retrofitting focusability later means rewriting the markup.

**Files:**
- Create: `src/database/quests/QuestGrid.tsx`
- Modify: `src/shared/styles/theme.css` (`:root` variables + a new `.lc-db` quest section)
- Test: `tests/database/QuestGrid.test.tsx`

**Interfaces:**
- Consumes: `questMeta` (Task 7), `MonsterDatabase` (Task 1), `monsterImageUrl` from `@/components/MonsterCard`.
- Produces: `QuestGrid` with props
  `{ quest: Quest, monsters: MonsterDatabase, selected: QuestCell | null, onSelect(cell: QuestCell): void, highlightLock?: LockType | null, onProbeLock?(lock: LockType | null): void, tileSize?: number }`.
  `onProbeLock` fires on door hover, focus and tap; Task 12 wires it to `highlightLock`.

- [ ] **Step 1: Write the failing test**

Create `tests/database/QuestGrid.test.tsx`:

```tsx
import { h } from 'preact';
import { render, screen, fireEvent } from '@testing-library/preact';
import { describe, it, expect, vi } from 'vitest';
import { QuestGrid } from '@/database/quests/QuestGrid';
import { buildMonsterDatabase } from '@/shared/data';
import type { Quest, QuestCell, Edge } from '@/shared/data';

const openEdges = (): Record<'N'|'E'|'S'|'W', Edge> => ({
  N: { kind: 'open' }, E: { kind: 'open' }, S: { kind: 'open' }, W: { kind: 'open' },
});

function cell(partial: Partial<QuestCell>): QuestCell {
  return {
    row: 0, col: 0, edges: openEdges(), monsterId: null, monsterName: null,
    boss: false, key: null, questItem: false, portal: null, trap: false,
    death: false, narration: '', drops: null, question: null, rawImage: '',
    ...partial,
  };
}

const monsters = buildMonsterDatabase([{
  id: 1, name: 'Vérszomjas moszkitóraj', image: '/pic/szornyk/moszkitoraj_k.gif',
  level: 1, hp: 6, mp: 4, attackType: '', debuff: '', magicWeapon: false,
  location: 'Larkinor', drops: [],
}]);

const quest: Quest = {
  id: 1, description: 'd', reward: 'r', rows: 2, cols: 2,
  cells: [
    cell({ row: 0, col: 0, portal: 'entrance' }),
    cell({ row: 0, col: 1, edges: { ...openEdges(), E: { kind: 'door', lock: 'vas' }, N: { kind: 'wall' } } }),
    cell({ row: 1, col: 0, monsterId: 1, monsterName: 'Vérszomjas moszkitóraj' }),
    cell({ row: 1, col: 1, key: 'vas', question: { prompt: 'Mit teszel?', choices: [] } }),
  ],
};

describe('QuestGrid', () => {
  it('renders one tile per cell without using a table', () => {
    const { container } = render(
      <QuestGrid quest={quest} monsters={monsters} selected={null} onSelect={() => {}} />,
    );
    expect(container.querySelectorAll('.quest-cell')).toHaveLength(4);
    expect(container.querySelector('table')).toBeNull();
  });

  it('marks walls and doors as edge modifiers', () => {
    const { container } = render(
      <QuestGrid quest={quest} monsters={monsters} selected={null} onSelect={() => {}} />,
    );
    expect(container.querySelector('.quest-edge.N.wall')).toBeTruthy();
    expect(container.querySelector('.quest-edge.E.door.lock-vas')).toBeTruthy();
  });

  it('makes doors focusable so the key hint is keyboard-reachable', () => {
    const { container } = render(
      <QuestGrid quest={quest} monsters={monsters} selected={null} onSelect={() => {}} />,
    );
    const door = container.querySelector('.quest-edge.door') as HTMLElement;
    expect(door.getAttribute('tabindex')).toBe('0');
  });

  it('renders the monster sprite from the live asset host', () => {
    const { container } = render(
      <QuestGrid quest={quest} monsters={monsters} selected={null} onSelect={() => {}} />,
    );
    const img = container.querySelector('img.quest-sprite') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('https://l2.larkinor.hu/szornyk/moszkitoraj_k.gif');
    expect(img.getAttribute('alt')).toBe('Vérszomjas moszkitóraj');
  });

  it('badges key, question and entrance cells', () => {
    const { container } = render(
      <QuestGrid quest={quest} monsters={monsters} selected={null} onSelect={() => {}} />,
    );
    expect(container.querySelector('.quest-badge.key')).toBeTruthy();
    expect(container.querySelector('.quest-badge.question')).toBeTruthy();
    expect(container.querySelector('.quest-badge.entrance')).toBeTruthy();
  });

  it('reports the clicked cell', () => {
    const onSelect = vi.fn();
    const { container } = render(
      <QuestGrid quest={quest} monsters={monsters} selected={null} onSelect={onSelect} />,
    );
    fireEvent.click(container.querySelectorAll('.quest-cell')[2]);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ row: 1, col: 0 }));
  });

  it('marks the selected cell and cells holding a highlighted lock key', () => {
    const { container } = render(
      <QuestGrid quest={quest} monsters={monsters} selected={quest.cells[0]}
                 onSelect={() => {}} highlightLock="vas" />,
    );
    expect(container.querySelectorAll('.quest-cell.selected')).toHaveLength(1);
    expect(container.querySelectorAll('.quest-cell.key-hit')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/database/QuestGrid.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the grid**

Create `src/database/quests/QuestGrid.tsx`:

```tsx
import { h, type VNode } from 'preact';
import type { LockType, MonsterDatabase, Quest, QuestCell } from '@/shared/data';
import { monsterImageUrl } from '@/components/MonsterCard';
import { BADGE, LOCK_LABEL, SIDES, SIDE_LABEL, coordLabel } from './questMeta';

interface QuestGridProps {
  quest: Quest;
  monsters: MonsterDatabase;
  selected: QuestCell | null;
  onSelect(cell: QuestCell): void;
  /** Lock whose key cells are highlighted, driven by door hover/focus. */
  highlightLock?: LockType | null;
  /** Which door is being probed, so only that edge shows as active. */
  onProbeLock?(lock: LockType | null): void;
  /** Tile edge length in px, driven by the zoom control. */
  tileSize?: number;
}

const DEFAULT_TILE = 56;

/**
 * The quest maze.
 *
 * Rendered as CSS grid + divs rather than a `<table>` on purpose: the in-game
 * page runs in quirks mode, where table cells do not inherit `color` and end up
 * black-on-dark. See CLAUDE.md.
 */
export function QuestGrid(props: QuestGridProps): VNode {
  const {
    quest, monsters, selected, onSelect,
    highlightLock = null, onProbeLock, tileSize = DEFAULT_TILE,
  } = props;

  return (
    <div
      class="quest-grid"
      // Fixed-px columns: the tiles take their size from the column, so the
      // zoom control needs no CSS custom property.
      style={{ gridTemplateColumns: `repeat(${quest.cols}, ${tileSize}px)` }}
    >
      {quest.cells.map((cell) => {
        const monster = cell.monsterId != null ? monsters.getById(cell.monsterId) : undefined;
        const isSelected = selected != null && selected.row === cell.row && selected.col === cell.col;
        const keyHit = highlightLock != null && cell.key === highlightLock;
        const classes = ['quest-cell'];
        if (isSelected) classes.push('selected');
        if (keyHit) classes.push('key-hit');
        if (cell.narration === '' && !monster && !cell.portal) classes.push('void');

        return (
          <div
            key={`${cell.row}-${cell.col}`}
            class={classes.join(' ')}
            data-row={cell.row}
            data-col={cell.col}
            onClick={() => onSelect(cell)}
            title={coordLabel(cell)}
          >
            {SIDES.map((side) => {
              const edge = cell.edges[side];
              if (edge.kind === 'open') return null;
              const edgeClasses = ['quest-edge', side];
              if (edge.kind === 'wall') edgeClasses.push('wall');
              if (edge.kind === 'szel') edgeClasses.push('szel');
              if (edge.kind === 'door') edgeClasses.push('door', `lock-${edge.lock}`);
              const isDoor = edge.kind === 'door';
              return (
                <div
                  key={side}
                  class={edgeClasses.join(' ')}
                  tabIndex={isDoor ? 0 : undefined}
                  role={isDoor ? 'button' : undefined}
                  aria-label={isDoor
                    ? `${LOCK_LABEL[edge.lock]} ajtó ${SIDE_LABEL[side]} felé`
                    : undefined}
                  title={isDoor ? `${LOCK_LABEL[edge.lock]} ajtó` : undefined}
                  onMouseEnter={isDoor ? () => onProbeLock?.(edge.lock) : undefined}
                  onMouseLeave={isDoor ? () => onProbeLock?.(null) : undefined}
                  onFocus={isDoor ? () => onProbeLock?.(edge.lock) : undefined}
                  onBlur={isDoor ? () => onProbeLock?.(null) : undefined}
                  onClick={isDoor
                    ? (e: MouseEvent) => { e.stopPropagation(); onProbeLock?.(edge.lock); }
                    : undefined}
                />
              );
            })}
            {monster && (
              <img
                class="quest-sprite"
                src={monsterImageUrl(monster.image)}
                alt={monster.name}
                loading="lazy"
              />
            )}
            <div class="quest-badges">
              {cell.portal === 'entrance' && <span class="quest-badge entrance" title="bejárat">{BADGE.entrance}</span>}
              {cell.portal === 'exit' && <span class="quest-badge exit" title="kijárat">{BADGE.exit}</span>}
              {cell.key && (
                <span class="quest-badge key" title={LOCK_LABEL[cell.key]}>{BADGE.key}</span>
              )}
              {cell.questItem && <span class="quest-badge quest-item" title="küldetés tárgy">{BADGE.questItem}</span>}
              {cell.trap && <span class="quest-badge trap" title="csapda">{BADGE.trap}</span>}
              {cell.death && <span class="quest-badge death" title="halál">{BADGE.death}</span>}
              {cell.question && <span class="quest-badge question" title="kérdés">{BADGE.question}</span>}
              {cell.boss && <span class="quest-badge boss" title="boss">{BADGE.boss}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Add the styles**

In `src/shared/styles/theme.css`, add to the `:root` block (after the map view variables):

```css
  /* Quest maze (Küldetések) — lock colours, tuned for the dark background
     rather than copied raw from the source site's white-page palette. */
  --lock-vas: #b06a6a;
  --lock-rez: #c9954a;
  --lock-bronz: #d98246;
  --lock-ezust: #b9bcc2;
  --lock-arany: #e3c454;
  --lock-platina: #6fc08a;
  --lock-tolvaj: #6f8fd6;
  --lock-cso: #cf5f5f;
  --quest-wall: #0d0a08;
  --quest-szel: #4b7fa8;
  --quest-void: #191310;
  --quest-tile-bg: #2b241d;
  --quest-badge-bg: rgba(0, 0, 0, 0.62);
  --quest-key-glow: rgba(212, 162, 89, 0.85);
```

Then append a quest section at the end of the `.lc-db` styles:

```css
/* ---- Quest maze (Küldetések) ---- */
/* Grid + divs, never a table: the in-game page is quirks mode, where table
   cells refuse to inherit colour. */
.lc-db .quest-grid {
  display: grid;
  gap: 0;
  justify-content: start;
  padding: 10px;
}
.lc-db .quest-cell {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  background: var(--quest-tile-bg);
  cursor: pointer;
  color: var(--text);
}
.lc-db .quest-cell.void { background: var(--quest-void); }
.lc-db .quest-cell.selected { outline: 2px solid var(--accent); outline-offset: -2px; z-index: 2; }
.lc-db .quest-cell.key-hit { box-shadow: inset 0 0 0 3px var(--quest-key-glow); z-index: 3; }
.lc-db .quest-sprite {
  position: absolute; inset: 0; margin: auto;
  max-width: 88%; max-height: 88%;
}
.lc-db .quest-edge { position: absolute; z-index: 4; }
.lc-db .quest-edge.N { top: -2px; left: 0; right: 0; height: 4px; }
.lc-db .quest-edge.S { bottom: -2px; left: 0; right: 0; height: 4px; }
.lc-db .quest-edge.W { left: -2px; top: 0; bottom: 0; width: 4px; }
.lc-db .quest-edge.E { right: -2px; top: 0; bottom: 0; width: 4px; }
.lc-db .quest-edge.wall { background: var(--quest-wall); }
.lc-db .quest-edge.szel { background: var(--quest-szel); }
.lc-db .quest-edge.door { cursor: help; }
.lc-db .quest-edge.door:focus { outline: 2px solid var(--accent); }
.lc-db .quest-edge.lock-vas { background: var(--lock-vas); }
.lc-db .quest-edge.lock-rez { background: var(--lock-rez); }
.lc-db .quest-edge.lock-bronz { background: var(--lock-bronz); }
.lc-db .quest-edge.lock-ezust { background: var(--lock-ezust); }
.lc-db .quest-edge.lock-arany { background: var(--lock-arany); }
.lc-db .quest-edge.lock-platina { background: var(--lock-platina); }
.lc-db .quest-edge.lock-tolvaj { background: var(--lock-tolvaj); }
.lc-db .quest-edge.lock-cso { background: var(--lock-cso); }
.lc-db .quest-badges {
  position: absolute; top: 1px; left: 1px; right: 1px;
  display: flex; flex-wrap: wrap; gap: 1px; z-index: 5;
  font-size: 10px; line-height: 1; pointer-events: none;
}
.lc-db .quest-badge {
  background: var(--quest-badge-bg); border-radius: 2px; padding: 1px;
}
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `npx vitest run tests/database/QuestGrid.test.tsx && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/database/quests/QuestGrid.tsx src/shared/styles/theme.css tests/database/QuestGrid.test.tsx
```

Subject: `feat(quests): render the maze as a focusable CSS grid`.

---

### Task 9: Key legend and the door→key hint

The requested hover behaviour, plus the two affordances that make it work where hover does not exist: doors respond to focus and tap (wired in Task 8), and a permanent legend lists every lock and where its key is.

**Files:**
- Create: `src/database/quests/QuestKeyLegend.tsx`
- Test: `tests/database/QuestKeyLegend.test.tsx`

**Interfaces:**
- Consumes: `locksIn`, `keyCellsFor`, `LOCK_LABEL`, `coordLabel` (Task 7).
- Produces: `QuestKeyLegend` with props
  `{ quest: Quest, monsters: MonsterDatabase, activeLock: LockType | null, onHoverLock(lock: LockType | null): void, onSelectCell(cell: QuestCell): void }`.

- [ ] **Step 1: Write the failing test**

Create `tests/database/QuestKeyLegend.test.tsx`:

```tsx
import { h } from 'preact';
import { render, screen, fireEvent } from '@testing-library/preact';
import { describe, it, expect, vi } from 'vitest';
import { QuestKeyLegend } from '@/database/quests/QuestKeyLegend';
import { buildMonsterDatabase } from '@/shared/data';
import type { Quest, QuestCell, Edge } from '@/shared/data';

const openEdges = (): Record<'N'|'E'|'S'|'W', Edge> => ({
  N: { kind: 'open' }, E: { kind: 'open' }, S: { kind: 'open' }, W: { kind: 'open' },
});

function cell(partial: Partial<QuestCell>): QuestCell {
  return {
    row: 0, col: 0, edges: openEdges(), monsterId: null, monsterName: null,
    boss: false, key: null, questItem: false, portal: null, trap: false,
    death: false, narration: '', drops: null, question: null, rawImage: '',
    ...partial,
  };
}

const monsters = buildMonsterDatabase([{
  id: 7, name: 'Csontváz', image: '/pic/szornyk/csontvaz_k.gif', level: 1, hp: 1,
  mp: 1, attackType: '', debuff: '', magicWeapon: false, location: '', drops: [],
}]);

/** Iron door present with its key; gold door present with no key anywhere. */
const quest: Quest = {
  id: 1, description: '', reward: '', rows: 2, cols: 2,
  cells: [
    cell({ row: 0, col: 0, edges: { ...openEdges(), E: { kind: 'door', lock: 'vas' } } }),
    cell({ row: 0, col: 1, edges: { ...openEdges(), S: { kind: 'door', lock: 'arany' } } }),
    cell({ row: 1, col: 0, key: 'vas', monsterId: 7, monsterName: 'Csontváz' }),
    cell({ row: 1, col: 1 }),
  ],
};

describe('QuestKeyLegend', () => {
  it('lists every lock that gates a door', () => {
    render(<QuestKeyLegend quest={quest} monsters={monsters} activeLock={null}
                           onHoverLock={() => {}} onSelectCell={() => {}} />);
    expect(screen.getByText('vaskulcs')).toBeTruthy();
    expect(screen.getByText('aranykulcs')).toBeTruthy();
  });

  it('names where the key is, with the monster holding it', () => {
    render(<QuestKeyLegend quest={quest} monsters={monsters} activeLock={null}
                           onHoverLock={() => {}} onSelectCell={() => {}} />);
    expect(screen.getByText(/2\. sor, 1\. oszlop/)).toBeTruthy();
    expect(screen.getByText(/Csontváz/)).toBeTruthy();
  });

  it('says so explicitly when the quest holds no key for a lock', () => {
    render(<QuestKeyLegend quest={quest} monsters={monsters} activeLock={null}
                           onHoverLock={() => {}} onSelectCell={() => {}} />);
    expect(screen.getByText('nincs kulcs ebben a küldetésben')).toBeTruthy();
  });

  it('reports hover so the grid can highlight the key cell', () => {
    const onHoverLock = vi.fn();
    const { container } = render(
      <QuestKeyLegend quest={quest} monsters={monsters} activeLock={null}
                      onHoverLock={onHoverLock} onSelectCell={() => {}} />,
    );
    fireEvent.mouseEnter(container.querySelector('.quest-legend-row') as HTMLElement);
    expect(onHoverLock).toHaveBeenCalledWith('vas');
  });

  it('jumps to the key cell when its location is clicked', () => {
    const onSelectCell = vi.fn();
    render(<QuestKeyLegend quest={quest} monsters={monsters} activeLock={null}
                           onHoverLock={() => {}} onSelectCell={onSelectCell} />);
    fireEvent.click(screen.getByText(/2\. sor, 1\. oszlop/));
    expect(onSelectCell).toHaveBeenCalledWith(expect.objectContaining({ row: 1, col: 0 }));
  });

  it('marks the active lock row', () => {
    const { container } = render(
      <QuestKeyLegend quest={quest} monsters={monsters} activeLock="vas"
                      onHoverLock={() => {}} onSelectCell={() => {}} />,
    );
    expect(container.querySelectorAll('.quest-legend-row.active')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/database/QuestKeyLegend.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the legend**

Create `src/database/quests/QuestKeyLegend.tsx`:

```tsx
import { h, type VNode } from 'preact';
import type { LockType, MonsterDatabase, Quest, QuestCell } from '@/shared/data';
import { LOCK_LABEL, coordLabel, keyCellsFor, locksIn } from './questMeta';

interface QuestKeyLegendProps {
  quest: Quest;
  monsters: MonsterDatabase;
  activeLock: LockType | null;
  onHoverLock(lock: LockType | null): void;
  onSelectCell(cell: QuestCell): void;
}

/**
 * Every lock gating a door in this quest, and where its key is.
 *
 * The discoverable counterpart to the door hover hint: hover does not exist on
 * touch and is not keyboard-reachable, so the same information is always on
 * screen here.
 */
export function QuestKeyLegend(props: QuestKeyLegendProps): VNode {
  const { quest, monsters, activeLock, onHoverLock, onSelectCell } = props;
  const locks = locksIn(quest);

  if (locks.length === 0) {
    return (
      <div class="quest-legend">
        <h3>Kulcsok</h3>
        <div class="placeholder">Ebben a küldetésben nincs zárt ajtó.</div>
      </div>
    );
  }

  return (
    <div class="quest-legend">
      <h3>Kulcsok</h3>
      <ul class="list">
        {locks.map((lock) => {
          const cells = keyCellsFor(quest, lock);
          return (
            <li
              key={lock}
              class={`quest-legend-row${activeLock === lock ? ' active' : ''}`}
              onMouseEnter={() => onHoverLock(lock)}
              onMouseLeave={() => onHoverLock(null)}
            >
              <span class={`quest-lock-swatch lock-${lock}`} />
              <span class="quest-lock-name">{LOCK_LABEL[lock]}</span>
              {cells.length === 0 ? (
                <span class="quest-lock-missing">nincs kulcs ebben a küldetésben</span>
              ) : (
                <span class="quest-lock-where">
                  {cells.map((cell) => {
                    const monster = cell.monsterId != null ? monsters.getById(cell.monsterId) : undefined;
                    return (
                      <button
                        key={`${cell.row}-${cell.col}`}
                        type="button"
                        class="quest-lock-link"
                        onClick={() => onSelectCell(cell)}
                      >
                        {coordLabel(cell)}{monster ? ` (${monster.name})` : ''}
                      </button>
                    );
                  })}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Add the legend styles**

Append to the quest section of `src/shared/styles/theme.css`:

```css
.lc-db .quest-legend h3 { font-size: 13px; margin: 0 0 6px; color: var(--accent); }
.lc-db .quest-legend-row {
  display: flex; align-items: center; gap: 6px;
  padding: 3px 4px; border-radius: 3px; font-size: 12px;
}
.lc-db .quest-legend-row.active { background: var(--accent-dim); }
.lc-db .quest-lock-swatch {
  width: 10px; height: 10px; border-radius: 2px;
  border: 1px solid var(--swatch-border); flex: none;
}
.lc-db .quest-lock-swatch.lock-vas { background: var(--lock-vas); }
.lc-db .quest-lock-swatch.lock-rez { background: var(--lock-rez); }
.lc-db .quest-lock-swatch.lock-bronz { background: var(--lock-bronz); }
.lc-db .quest-lock-swatch.lock-ezust { background: var(--lock-ezust); }
.lc-db .quest-lock-swatch.lock-arany { background: var(--lock-arany); }
.lc-db .quest-lock-swatch.lock-platina { background: var(--lock-platina); }
.lc-db .quest-lock-swatch.lock-tolvaj { background: var(--lock-tolvaj); }
.lc-db .quest-lock-swatch.lock-cso { background: var(--lock-cso); }
.lc-db .quest-lock-missing { color: var(--muted); font-style: italic; }
.lc-db .quest-lock-link {
  background: none; border: none; padding: 0; cursor: pointer;
  color: var(--accent); text-decoration: underline; font-size: 12px;
}
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `npx vitest run tests/database/QuestKeyLegend.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/database/quests/QuestKeyLegend.tsx src/shared/styles/theme.css tests/database/QuestKeyLegend.test.tsx
```

Subject: `feat(quests): show where each lock's key is`.

---

### Task 10: Question card

**Files:**
- Create: `src/database/quests/QuestQuestionCard.tsx`
- Test: `tests/database/QuestQuestionCard.test.tsx`

**Interfaces:**
- Consumes: `outcomeValence` (Task 7).
- Produces: `QuestQuestionCard` with props `{ question: QuestQuestion }`.

- [ ] **Step 1: Write the failing test**

Create `tests/database/QuestQuestionCard.test.tsx`:

```tsx
import { h } from 'preact';
import { render, screen } from '@testing-library/preact';
import { describe, it, expect } from 'vitest';
import { QuestQuestionCard } from '@/database/quests/QuestQuestionCard';

const question = {
  prompt: 'Mit teszel?',
  choices: [
    { index: 1, text: 'Megkóstolod', outcome: 'max ÉP' },
    { index: 2, text: 'Kiiszod az egészet', outcome: '3 méreg' },
    { index: 3, text: 'Otthagyod', outcome: 'semmi' },
    { index: 4, text: 'Megmondod a neved', outcome: 'HALÁL' },
  ],
};

describe('QuestQuestionCard', () => {
  it('renders the prompt and every choice', () => {
    const { container } = render(<QuestQuestionCard question={question} />);
    expect(screen.getByText('Mit teszel?')).toBeTruthy();
    expect(container.querySelectorAll('.quest-choice')).toHaveLength(4);
    expect(screen.getByText('Kiiszod az egészet')).toBeTruthy();
  });

  it('numbers choices as the source does', () => {
    render(<QuestQuestionCard question={question} />);
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
  });

  it('colour-codes outcomes by valence', () => {
    const { container } = render(<QuestQuestionCard question={question} />);
    expect(container.querySelector('.quest-outcome.good')).toBeTruthy();
    expect(container.querySelector('.quest-outcome.bad')).toBeTruthy();
    expect(container.querySelector('.quest-outcome.neutral')).toBeTruthy();
    expect(container.querySelector('.quest-outcome.fatal')).toBeTruthy();
  });

  it('renders a choice with no outcome without an empty badge', () => {
    const { container } = render(
      <QuestQuestionCard question={{ prompt: 'Na?', choices: [{ index: 1, text: 'Mész', outcome: '' }] }} />,
    );
    expect(container.querySelector('.quest-outcome')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/database/QuestQuestionCard.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the card**

Create `src/database/quests/QuestQuestionCard.tsx`:

```tsx
import { h, type VNode } from 'preact';
import type { QuestQuestion } from '@/shared/data';
import { outcomeValence } from './questMeta';

interface QuestQuestionCardProps {
  question: QuestQuestion;
}

/** A choice point, one row per answer with its outcome colour-coded. */
export function QuestQuestionCard(props: QuestQuestionCardProps): VNode {
  const { question } = props;
  return (
    <div class="quest-question">
      <div class="quest-question-prompt">{question.prompt}</div>
      <ul class="quest-choices">
        {question.choices.map((choice) => (
          <li key={choice.index} class="quest-choice">
            <span class="quest-choice-index">{choice.index}</span>
            <span class="quest-choice-text">{choice.text}</span>
            {choice.outcome && (
              <span class={`quest-outcome ${outcomeValence(choice.outcome)}`}>{choice.outcome}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Add the card styles**

Append to the quest section of `src/shared/styles/theme.css`:

```css
.lc-db .quest-question {
  border: 1px solid var(--border); border-radius: 4px;
  padding: 8px; margin: 8px 0; background: var(--cell-detail-bg);
}
.lc-db .quest-question-prompt { font-weight: bold; color: var(--accent); margin-bottom: 6px; }
.lc-db .quest-choices { list-style: none; margin: 0; padding: 0; }
.lc-db .quest-choice {
  display: flex; align-items: baseline; gap: 6px;
  padding: 3px 0; border-top: 1px solid var(--row-border); font-size: 12px;
}
.lc-db .quest-choice:first-child { border-top: none; }
.lc-db .quest-choice-index {
  flex: none; width: 16px; height: 16px; border-radius: 50%;
  background: var(--panel-2); color: var(--muted);
  text-align: center; font-size: 10px; line-height: 16px;
}
.lc-db .quest-choice-text { flex: 1; }
.lc-db .quest-outcome { flex: none; padding: 1px 5px; border-radius: 3px; font-size: 11px; }
.lc-db .quest-outcome.good { color: var(--good); background: var(--accent-dim); }
.lc-db .quest-outcome.bad { color: var(--bad); }
.lc-db .quest-outcome.fatal { color: var(--text); background: var(--bad); }
.lc-db .quest-outcome.neutral { color: var(--muted); }
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `npx vitest run tests/database/QuestQuestionCard.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/database/quests/QuestQuestionCard.tsx src/shared/styles/theme.css tests/database/QuestQuestionCard.test.tsx
```

Subject: `feat(quests): render choice points as structured cards`.

---

### Task 11: Cell detail panel

**Files:**
- Create: `src/database/quests/QuestCellDetail.tsx`
- Test: `tests/database/QuestCellDetail.test.tsx`

**Interfaces:**
- Consumes: `QuestQuestionCard` (Task 10), `questMeta` (Task 7), `monsterImageUrl`.
- Produces: `QuestCellDetail` with props
  `{ cell: QuestCell | null, monsters: MonsterDatabase, onJumpToMonster(id: number): void }`.

- [ ] **Step 1: Write the failing test**

Create `tests/database/QuestCellDetail.test.tsx`:

```tsx
import { h } from 'preact';
import { render, screen, fireEvent } from '@testing-library/preact';
import { describe, it, expect, vi } from 'vitest';
import { QuestCellDetail } from '@/database/quests/QuestCellDetail';
import { buildMonsterDatabase } from '@/shared/data';
import type { QuestCell, Edge } from '@/shared/data';

const openEdges = (): Record<'N'|'E'|'S'|'W', Edge> => ({
  N: { kind: 'open' }, E: { kind: 'open' }, S: { kind: 'open' }, W: { kind: 'open' },
});

function cell(partial: Partial<QuestCell>): QuestCell {
  return {
    row: 0, col: 0, edges: openEdges(), monsterId: null, monsterName: null,
    boss: false, key: null, questItem: false, portal: null, trap: false,
    death: false, narration: '', drops: null, question: null, rawImage: '',
    ...partial,
  };
}

const monsters = buildMonsterDatabase([{
  id: 7, name: 'Csontváz', image: '/pic/szornyk/csontvaz_k.gif', level: 3, hp: 20,
  mp: 5, attackType: '', debuff: '', magicWeapon: false, location: '', drops: [],
}]);

describe('QuestCellDetail', () => {
  it('prompts when nothing is selected', () => {
    render(<QuestCellDetail cell={null} monsters={monsters} onJumpToMonster={() => {}} />);
    expect(screen.getByText(/Válassz egy mezőt/)).toBeTruthy();
  });

  it('shows the position, narration and drops', () => {
    render(<QuestCellDetail monsters={monsters} onJumpToMonster={() => {}}
      cell={cell({ row: 2, col: 1, narration: 'Erős zümmögést hallasz.', drops: '2 db szúnyogszárny' })} />);
    expect(screen.getByText('3. sor, 2. oszlop')).toBeTruthy();
    expect(screen.getByText('Erős zümmögést hallasz.')).toBeTruthy();
    expect(screen.getByText('2 db szúnyogszárny')).toBeTruthy();
  });

  it('links a resolved monster to its database entry', () => {
    const onJumpToMonster = vi.fn();
    render(<QuestCellDetail monsters={monsters} onJumpToMonster={onJumpToMonster}
      cell={cell({ monsterId: 7, monsterName: 'Csontváz' })} />);
    fireEvent.click(screen.getByText('Csontváz'));
    expect(onJumpToMonster).toHaveBeenCalledWith(7);
  });

  it('shows an unresolved sprite as plain text, not a dead link', () => {
    const { container } = render(
      <QuestCellDetail monsters={monsters} onJumpToMonster={() => {}}
        cell={cell({ monsterId: null, monsterName: 'ismeretlen_k' })} />,
    );
    expect(screen.getByText('ismeretlen_k')).toBeTruthy();
    expect(container.querySelector('.quest-monster-link')).toBeNull();
  });

  it('names the key the cell yields and its other markers', () => {
    render(<QuestCellDetail monsters={monsters} onJumpToMonster={() => {}}
      cell={cell({ key: 'arany', questItem: true, trap: true, portal: 'exit' })} />);
    expect(screen.getByText(/aranykulcs/)).toBeTruthy();
    expect(screen.getByText(/küldetés tárgy/)).toBeTruthy();
    expect(screen.getByText(/csapda/)).toBeTruthy();
    expect(screen.getByText(/kijárat/)).toBeTruthy();
  });

  it('renders a question through the card', () => {
    const { container } = render(
      <QuestCellDetail monsters={monsters} onJumpToMonster={() => {}}
        cell={cell({ question: { prompt: 'Mit teszel?', choices: [
          { index: 1, text: 'Mész', outcome: 'semmi' },
          { index: 2, text: 'Iszol', outcome: '3 méreg' },
        ] } })} />,
    );
    expect(container.querySelector('.quest-question')).toBeTruthy();
    expect(container.querySelectorAll('.quest-choice')).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/database/QuestCellDetail.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the panel**

Create `src/database/quests/QuestCellDetail.tsx`:

```tsx
import { h, type VNode } from 'preact';
import type { MonsterDatabase, QuestCell } from '@/shared/data';
import { monsterImageUrl } from '@/components/MonsterCard';
import { LOCK_LABEL, SIDES, SIDE_LABEL, coordLabel } from './questMeta';
import { QuestQuestionCard } from './QuestQuestionCard';

interface QuestCellDetailProps {
  cell: QuestCell | null;
  monsters: MonsterDatabase;
  onJumpToMonster(id: number): void;
}

/** Detail panel for the selected maze cell. */
export function QuestCellDetail(props: QuestCellDetailProps): VNode {
  const { cell, monsters, onJumpToMonster } = props;

  if (!cell) {
    return (
      <div class="quest-detail">
        <div class="placeholder">Válassz egy mezőt a labirintusban.</div>
      </div>
    );
  }

  const monster = cell.monsterId != null ? monsters.getById(cell.monsterId) : undefined;
  const markers: string[] = [];
  if (cell.portal === 'entrance') markers.push('bejárat');
  if (cell.portal === 'exit') markers.push('kijárat');
  if (cell.questItem) markers.push('küldetés tárgy');
  if (cell.trap) markers.push('csapda');
  if (cell.death) markers.push('halál');
  if (cell.boss) markers.push('boss');

  // flatMap rather than filter: TypeScript does not narrow a union through
  // `filter`, so this keeps `lock` typed without a cast.
  const doors = SIDES.flatMap((side) => {
    const edge = cell.edges[side];
    return edge.kind === 'door' ? [{ side, lock: edge.lock }] : [];
  });

  return (
    <div class="quest-detail">
      <h3>{coordLabel(cell)}</h3>

      {monster ? (
        <div class="quest-detail-monster">
          <img class="quest-detail-sprite" src={monsterImageUrl(monster.image)} alt="" loading="lazy" />
          <button type="button" class="quest-monster-link" onClick={() => onJumpToMonster(monster.id)}>
            {monster.name}
          </button>
          <span class="meta"> · {monster.level}. szint · {monster.hp} ÉP</span>
        </div>
      ) : cell.monsterName ? (
        <div class="quest-detail-monster">
          <span class="meta">{cell.monsterName}</span>
        </div>
      ) : null}

      {markers.length > 0 && <div class="quest-markers">{markers.join(' · ')}</div>}

      {cell.key && (
        <div class="quest-detail-key">Itt található: <strong>{LOCK_LABEL[cell.key]}</strong></div>
      )}

      {doors.length > 0 && (
        <div class="quest-detail-doors">
          Zárt ajtók:{' '}
          {doors.map((d) => (
            <span key={d.side}>{SIDE_LABEL[d.side]} ({LOCK_LABEL[d.lock]}){' '}</span>
          ))}
        </div>
      )}

      {cell.narration && <p class="quest-narration">{cell.narration}</p>}
      {cell.question && <QuestQuestionCard question={cell.question} />}
      {cell.drops && (
        <div class="quest-drops"><strong>Zsákmány:</strong> <span>{cell.drops}</span></div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add the panel styles**

Append to the quest section of `src/shared/styles/theme.css`:

```css
.lc-db .quest-detail { padding: 10px; color: var(--text); }
.lc-db .quest-detail h3 { font-size: 13px; margin: 0 0 6px; color: var(--accent); }
.lc-db .quest-detail-monster { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.lc-db .quest-detail-sprite { width: 40px; height: 46px; object-fit: contain; }
.lc-db .quest-monster-link {
  background: none; border: none; padding: 0; cursor: pointer;
  color: var(--accent); text-decoration: underline; font-size: 13px;
}
.lc-db .quest-markers { color: var(--muted); font-size: 12px; margin-bottom: 6px; }
.lc-db .quest-detail-key, .lc-db .quest-detail-doors { font-size: 12px; margin-bottom: 6px; }
.lc-db .quest-narration { white-space: pre-line; font-size: 12px; margin: 6px 0; }
.lc-db .quest-drops { font-size: 12px; color: var(--good); }
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `npx vitest run tests/database/QuestCellDetail.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/database/quests/QuestCellDetail.tsx src/shared/styles/theme.css tests/database/QuestCellDetail.test.tsx
```

Subject: `feat(quests): add the maze cell detail panel`.

---

### Task 12: Quest view

Composes picker, header, grid, legend and detail, and owns the `highlightLock` state that connects a hovered door to its key cell.

**Files:**
- Create: `src/database/quests/QuestView.tsx`
- Test: `tests/database/QuestView.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 8–11; `matchesSearch` from `@/shared/text`.
- Produces: `QuestView` with props
  `{ loader: DataLoader, questId: number | null, onSelectQuest(id: number): void, onJumpToMonster(id: number): void }`.

- [ ] **Step 1: Write the failing test**

Create `tests/database/QuestView.test.tsx`:

```tsx
import { h } from 'preact';
import { render, screen, fireEvent, waitFor } from '@testing-library/preact';
import { describe, it, expect, vi } from 'vitest';
import { QuestView } from '@/database/quests/QuestView';
import { buildMonsterDatabase } from '@/shared/data';
import type { DataLoader, Quest, QuestCell, Edge } from '@/shared/data';

const openEdges = (): Record<'N'|'E'|'S'|'W', Edge> => ({
  N: { kind: 'open' }, E: { kind: 'open' }, S: { kind: 'open' }, W: { kind: 'open' },
});

function cell(partial: Partial<QuestCell>): QuestCell {
  return {
    row: 0, col: 0, edges: openEdges(), monsterId: null, monsterName: null,
    boss: false, key: null, questItem: false, portal: null, trap: false,
    death: false, narration: '', drops: null, question: null, rawImage: '',
    ...partial,
  };
}

const quests: Quest[] = [
  {
    id: 1, description: 'Gründen borospincéje', reward: '20 db ezüst', rows: 1, cols: 2,
    cells: [
      cell({ row: 0, col: 0, edges: { ...openEdges(), E: { kind: 'door', lock: 'vas' } } }),
      cell({ row: 0, col: 1, key: 'vas' }),
    ],
  },
  { id: 2, description: 'Kalózbanda a városfalnál', reward: '400 db ezüst', rows: 1, cols: 1, cells: [cell({})] },
];

function makeLoader(): DataLoader {
  return {
    loadWeapons: async () => [], loadArmors: async () => [], loadItems: async () => [],
    loadMonsters: async () => buildMonsterDatabase([]),
    loadMap: async () => ({ cells: [] }),
    loadItemShops: async () => ({ shops: [] }),
    loadWeaponShops: async () => ({ shops: [] }),
    loadQuests: async () => quests,
  };
}

describe('QuestView', () => {
  // The description appears twice — in the picker row and in the header — so
  // these assertions use findAllByText rather than the single-match variant.
  it('lists the quests and shows the selected one', async () => {
    render(<QuestView loader={makeLoader()} questId={1}
                      onSelectQuest={() => {}} onJumpToMonster={() => {}} />);
    expect((await screen.findAllByText(/Gründen borospincéje/)).length).toBeGreaterThan(0);
    expect(screen.getByText(/20 db ezüst/)).toBeTruthy();
  });

  it('defaults to the first quest when none is routed', async () => {
    render(<QuestView loader={makeLoader()} questId={null}
                      onSelectQuest={() => {}} onJumpToMonster={() => {}} />);
    expect(await screen.findByText('1. küldetés')).toBeTruthy();
  });

  it('filters the picker accent-insensitively', async () => {
    const { container } = render(
      <QuestView loader={makeLoader()} questId={1}
                 onSelectQuest={() => {}} onJumpToMonster={() => {}} />,
    );
    await screen.findAllByText(/Gründen borospincéje/);
    const search = container.querySelector('.quest-search input') as HTMLInputElement;
    fireEvent.input(search, { target: { value: 'kaloz' } });
    await waitFor(() => {
      expect(container.querySelectorAll('.quest-pick')).toHaveLength(1);
    });
    expect(screen.getByText(/Kalózbanda/)).toBeTruthy();
  });

  it('reports the picked quest', async () => {
    const onSelectQuest = vi.fn();
    render(<QuestView loader={makeLoader()} questId={1}
                      onSelectQuest={onSelectQuest} onJumpToMonster={() => {}} />);
    await screen.findByText(/Kalózbanda/);
    fireEvent.click(screen.getByText(/Kalózbanda/));
    expect(onSelectQuest).toHaveBeenCalledWith(2);
  });

  it('highlights the key cell when a door is hovered', async () => {
    const { container } = render(
      <QuestView loader={makeLoader()} questId={1}
                 onSelectQuest={() => {}} onJumpToMonster={() => {}} />,
    );
    await screen.findAllByText(/Gründen borospincéje/);
    expect(container.querySelectorAll('.quest-cell.key-hit')).toHaveLength(0);
    fireEvent.mouseEnter(container.querySelector('.quest-edge.door') as HTMLElement);
    await waitFor(() => {
      expect(container.querySelectorAll('.quest-cell.key-hit')).toHaveLength(1);
    });
  });

  it('summarises the quest contents', async () => {
    const { container } = render(
      <QuestView loader={makeLoader()} questId={1}
                 onSelectQuest={() => {}} onJumpToMonster={() => {}} />,
    );
    await screen.findByText('1. küldetés');
    // The summary is built from several interpolations, so assert on the
    // container's text rather than matching a single text node.
    const stats = container.querySelector('.quest-stats') as HTMLElement;
    expect(stats.textContent).toMatch(/1 kulcs/);
    expect(stats.textContent).toMatch(/1×2/);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/database/QuestView.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the view**

Create `src/database/quests/QuestView.tsx`:

```tsx
import { h, type VNode } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { DataLoader, LockType, MonsterDatabase, Quest, QuestCell } from '@/shared/data';
import { buildMonsterDatabase } from '@/shared/data';
import { matchesSearch } from '@/shared/text';
import { QuestGrid } from './QuestGrid';
import { QuestKeyLegend } from './QuestKeyLegend';
import { QuestCellDetail } from './QuestCellDetail';
import { locksIn } from './questMeta';

interface QuestViewProps {
  loader: DataLoader;
  /** Routed quest id (`#quests/<id>`); null falls back to the first quest. */
  questId: number | null;
  onSelectQuest(id: number): void;
  onJumpToMonster(id: number): void;
}

const TILE_SIZES = [40, 56, 72];
const DEFAULT_TILE = 56;

export function QuestView(props: QuestViewProps): VNode {
  const { loader, questId, onSelectQuest, onJumpToMonster } = props;
  const [quests, setQuests] = useState<Quest[] | null>(null);
  const [monsters, setMonsters] = useState<MonsterDatabase>(() => buildMonsterDatabase([]));
  const [search, setSearch] = useState('');
  const [selectedCell, setSelectedCell] = useState<QuestCell | null>(null);
  const [highlightLock, setHighlightLock] = useState<LockType | null>(null);
  const [tileSize, setTileSize] = useState(DEFAULT_TILE);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loader.loadQuests(), loader.loadMonsters()]).then(([q, m]) => {
      if (cancelled) return;
      setQuests(q);
      setMonsters(m);
    });
    return () => { cancelled = true; };
  }, [loader]);

  // A different quest means the previous cell selection is meaningless.
  useEffect(() => { setSelectedCell(null); setHighlightLock(null); }, [questId]);

  const filtered = useMemo(() => {
    if (!quests) return [];
    if (!search.trim()) return quests;
    return quests.filter((q) => matchesSearch(`${q.id} ${q.description} ${q.reward}`, search));
  }, [quests, search]);

  if (!quests) {
    return <div class="quest-view"><div class="quest-stats">Betöltés…</div></div>;
  }

  const quest = quests.find((q) => q.id === questId) ?? quests[0] ?? null;
  if (!quest) {
    return <div class="quest-view"><div class="quest-stats">Nincs küldetés.</div></div>;
  }

  const monsterCount = quest.cells.filter((c) => c.monsterId != null).length;
  const keyCount = quest.cells.filter((c) => c.key).length;
  const questionCount = quest.cells.filter((c) => c.question).length;
  const trapCount = quest.cells.filter((c) => c.trap).length;
  const lockCount = locksIn(quest).length;

  return (
    <div class="quest-view">
      <div class="quest-layout">
        <div class="quest-picker">
          <div class="field search quest-search">
            <label for="quest-search-input">Keresés</label>
            <input
              id="quest-search-input"
              type="text"
              value={search}
              placeholder="küldetés…"
              onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
            />
          </div>
          <ul class="list">
            {filtered.map((q) => (
              <li
                key={q.id}
                class={`quest-pick${q.id === quest.id ? ' active' : ''}`}
                onClick={() => onSelectQuest(q.id)}
              >
                <span class="quest-pick-id">{q.id}.</span> {q.description}
              </li>
            ))}
          </ul>
        </div>

        <div class="quest-main">
          <div class="quest-header">
            <h2>{quest.id}. küldetés</h2>
            <p class="quest-description">{quest.description}</p>
            <p class="quest-reward"><strong>Jutalom:</strong> {quest.reward}</p>
            <div class="quest-stats">
              {quest.rows}×{quest.cols} · {monsterCount} szörny · {keyCount} kulcs ·{' '}
              {lockCount} zártípus · {questionCount} kérdés · {trapCount} csapda
            </div>
            <div class="field quest-zoom">
              <label for="quest-zoom-select">Méret</label>
              <select
                id="quest-zoom-select"
                value={String(tileSize)}
                onChange={(e) => setTileSize(Number((e.target as HTMLSelectElement).value))}
              >
                {TILE_SIZES.map((s) => <option key={s} value={String(s)}>{s}px</option>)}
              </select>
            </div>
          </div>

          <div class="quest-grid-wrap">
            <QuestGrid
              quest={quest}
              monsters={monsters}
              selected={selectedCell}
              onSelect={setSelectedCell}
              highlightLock={highlightLock}
              onProbeLock={setHighlightLock}
              tileSize={tileSize}
            />
          </div>
        </div>

        <div class="quest-side">
          <QuestCellDetail cell={selectedCell} monsters={monsters} onJumpToMonster={onJumpToMonster} />
          <QuestKeyLegend
            quest={quest}
            monsters={monsters}
            activeLock={highlightLock}
            onHoverLock={setHighlightLock}
            onSelectCell={setSelectedCell}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add the layout styles**

Append to the quest section of `src/shared/styles/theme.css`:

```css
.lc-db .quest-view { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.lc-db .quest-layout { display: flex; flex: 1; min-height: 0; }
.lc-db .quest-picker {
  width: 210px; flex: none; overflow: auto;
  border-right: 1px solid var(--border); padding: 8px;
}
.lc-db .quest-picker .list { list-style: none; margin: 0; padding: 0; }
.lc-db .quest-pick {
  padding: 4px 5px; border-radius: 3px; cursor: pointer;
  font-size: 12px; color: var(--text);
}
.lc-db .quest-pick:hover { background: var(--panel-2); }
.lc-db .quest-pick.active { background: var(--accent-dim); color: var(--accent); }
.lc-db .quest-pick-id { color: var(--muted); }
.lc-db .quest-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.lc-db .quest-header { padding: 8px 10px; border-bottom: 1px solid var(--border); }
.lc-db .quest-header h2 { font-size: 14px; margin: 0 0 4px; color: var(--accent); }
.lc-db .quest-description { margin: 0 0 4px; font-size: 12px; }
.lc-db .quest-reward { margin: 0 0 4px; font-size: 12px; color: var(--good); }
.lc-db .quest-stats { color: var(--muted); font-size: 11px; }
.lc-db .quest-zoom { margin-top: 6px; }
.lc-db .quest-grid-wrap { flex: 1; overflow: auto; }
.lc-db .quest-side {
  width: 280px; flex: none; overflow: auto;
  border-left: 1px solid var(--border); padding: 8px;
}

/* Narrow viewports — mobile and the docked in-game overlay. */
@media (max-width: 900px) {
  .lc-db .quest-layout { flex-direction: column; }
  .lc-db .quest-picker,
  .lc-db .quest-side {
    width: auto; max-height: 220px;
    border-right: none; border-left: none;
    border-bottom: 1px solid var(--border);
  }
}
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `npx vitest run tests/database/QuestView.test.tsx && npm run typecheck`
Expected: PASS, no type errors. If `matchesSearch` has a different signature, check `src/shared/text.ts` and adapt the call — do not change `text.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/database/quests/QuestView.tsx src/shared/styles/theme.css tests/database/QuestView.test.tsx
```

Subject: `feat(quests): compose the quest view`.

---

### Task 13: Wire the tab into the database app

The existing route grammar `tab[/param]` already accepts a numeric param, so no grammar change is needed — the quest id lands in `Route.id` exactly like an entity id.

**Files:**
- Modify: `src/database/DatabaseApp.tsx` (`Tab` type, `TABS`, `TAB_LABELS`, render branch)
- Test: `tests/database/DatabaseApp.test.tsx` (append)

**Interfaces:**
- Consumes: `QuestView` (Task 12).
- Produces: the `quests` tab, routed `#quests/<id>`.

- [ ] **Step 1: Write the failing test**

Append to `tests/database/DatabaseApp.test.tsx` (reuse the file's existing loader factory, extended with `loadQuests` in Task 1):

```tsx
  it('renders the quest tab and routes to a quest', async () => {
    location.hash = '#quests/1';
    render(<DatabaseApp loader={makeLoader()} />);
    expect(await screen.findByText('Küldetések')).toBeTruthy();
  });
```

Ensure the loader factory in this file returns at least one quest from `loadQuests` so the view has something to render:

```ts
    loadQuests: async () => [{
      id: 1, description: 'Teszt küldetés', reward: '1 db ezüst', rows: 1, cols: 1,
      cells: [{
        row: 0, col: 0,
        edges: { N: { kind: 'open' }, E: { kind: 'open' }, S: { kind: 'open' }, W: { kind: 'open' } },
        monsterId: null, monsterName: null, boss: false, key: null, questItem: false,
        portal: null, trap: false, death: false, narration: '', drops: null,
        question: null, rawImage: '',
      }],
    }],
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/database/DatabaseApp.test.tsx`
Expected: FAIL — no `Küldetések` tab.

- [ ] **Step 3: Add the tab**

In `src/database/DatabaseApp.tsx`:

```ts
// import
import { QuestView } from './quests/QuestView';

// types + tab list
type Tab = EntityTab | 'map' | 'quests';

const TABS: Tab[] = [...EXPLORER_TABS, 'map', 'quests'];
const TAB_LABELS: Record<Tab, string> = { ...TAB_LABEL, map: 'Térkép', quests: 'Küldetések' };
```

In the render branch, add a `quests` case before the explorer fallback:

```tsx
      {route.tab === 'map' ? (
        <MapView loader={loader} targetCellId={route.cell} />
      ) : route.tab === 'quests' ? (
        <QuestView
          loader={loader}
          questId={route.id}
          onSelectQuest={(id) => navigate('quests', String(id))}
          onJumpToMonster={(id) => navigate('monsters', String(id))}
        />
      ) : (
        <ExplorerView ... />
      )}
```

`routeFor` already puts a numeric param into `Route.id` for any non-map tab, so no route changes are needed.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npm test && npm run typecheck`
Expected: all PASS. If `ExplorerView` complains that `route.tab` is not an `EntityTab`, narrow it — the `quests` branch must come before the fallback so TypeScript can exclude it.

- [ ] **Step 5: Commit**

```bash
git add src/database/DatabaseApp.tsx tests/database/DatabaseApp.test.tsx
```

Subject: `feat(quests): add the Küldetések tab to the database`.

---

### Task 14: Resolve `_szel`, verify end to end, document

The one deliberately deferred decision, plus full verification.

**Files:**
- Modify: `src/shared/styles/theme.css` (only if the `_szel` reading changes its treatment)
- Modify: `CLAUDE.md` (project structure + a quest data note)
- Modify: `docs/superpowers/specs/2026-08-13-quest-database-design.md` (record the `_szel` finding)

- [ ] **Step 1: Investigate `_szel`**

Read the narration of cells adjacent to `_szel` edges:

```bash
node -e '
const quests = JSON.parse(require("fs").readFileSync("static/db/quests.json","utf8"));
for (const q of quests) {
  for (const c of q.cells) {
    for (const [side, e] of Object.entries(c.edges)) {
      if (e.kind === "szel" && c.narration) {
        console.log(`q${q.id} ${c.row},${c.col} ${side}: ${c.narration.slice(0,160)}`);
      }
    }
  }
}' | head -40
```

Expected: quests 39, 40, 41 and 44 only. Read what the narration says about those edges — Hungarian `szél` means both "wind" and "edge".

- [ ] **Step 2: Apply the finding**

If the narration shows a consistent meaning (a wind barrier, a ledge, a one-way passage), give `--quest-szel` a matching treatment and add a legend entry naming it. **If it stays ambiguous, leave it as the distinct neutral passage already implemented** and label it neutrally (`különleges átjáró`) rather than guessing it into a wall or a door. Record whichever holds in the spec's "Deferred to implementation" section, replacing the open item with the finding.

- [ ] **Step 3: Run the full verification suite**

```bash
npm test && npm run typecheck && npm run build
```

Expected: all tests pass, no type errors, both bundles build. Do not claim completion without this output.

- [ ] **Step 4: Check the standalone view in a browser**

```bash
npm run dev:db
```

Open the printed URL, go to the `Küldetések` tab, and confirm against quest 20 (every lock type) and quest 21 (17×15, the largest): the grid renders, doors show their lock colour, hovering a door highlights its key cell, clicking a monster opens its database entry, and a question renders as a card. Narrow the window under 900px and confirm the layout stacks rather than overflowing horizontally.

- [ ] **Step 4b: Confirm the in-game surface**

The tab reaches the in-game overlay for free because `DatabaseOverlay` renders the same `DatabaseApp`, but two constraints need checking rather than assuming:

1. `npx vitest run tests/DatabaseOverlay.test.tsx` — still passes with the extra tab.
2. Read back the CSS added in Tasks 8–12 and confirm **no unscoped element selector** crept in: every rule must start with `.lc-db`. An unscoped `div`/`img`/`button` rule would restyle the live game page on desktop.

The quirks-mode colour trap is structurally avoided — the maze uses no `<table>` — but the search `input` and zoom `select` in `QuestView` are form controls, which never inherit `color` in any mode. Confirm they are covered by the existing `.lc-db input, .lc-db select` rule in `theme.css` (around line 609) and are legible, not black-on-dark.

For a live check, serve the build with `./serve.sh` and open the game with the overlay docked; this is optional if the two checks above pass.

- [ ] **Step 5: Update the project documentation**

In `CLAUDE.md`, add `quests` to the `static/db/*.json` line, add `src/database/quests/` to the project structure tree, and add a short note under the data conventions recording the source-page facts a future reader would otherwise have to rediscover: the `td` class edge grammar, the eight lock types, the image filename grammar, and that quest 27's seven tables are one maze in seven views.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-08-13-quest-database-design.md src/shared/styles/theme.css
```

Subject: `docs(quests): record the source maze grammar and the szel finding`.

---

## Verification Checklist

Before calling the feature done, confirm each with actual command output:

- [ ] `npm test` — all tests pass, including the `quests.json` data invariants
- [ ] `npm run typecheck` — no errors
- [ ] `npm run build` — both the userscript and the database bundle build
- [ ] `npm run scrape:quests` — re-runs cleanly with no unresolved sprite bases
- [ ] Standalone DB: quest 20 renders every lock type; quest 21 (17×15) scrolls rather than overflowing
- [ ] Door hover, keyboard focus and tap all reveal the key location
- [ ] A monster click navigates to `#monsters/<id>`
- [ ] Under 900px wide, the layout stacks and the page does not scroll horizontally
- [ ] Every new CSS rule is scoped under `.lc-db` — no unscoped element selectors
- [ ] The maze contains no `<table>`, and the picker's input/select are legible in-game
- [ ] Nothing pushed — the user asks for that separately
