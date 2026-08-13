# Royal quests in the database — design

**Status:** approved, ready for planning
**Date:** 2026-08-13

A new `Küldetések` tab in the database, presenting the 45 royal quests
(*királyi küldetések*) as interactive mazes. Based on
`https://www.larkinorcenter.hu/kirkuld.html`, with three additions that the
source page cannot offer: monsters resolve to our database, locked doors point
at their key, and choice points render as real question cards.

## Source analysis

Each quest page is one HTML table describing a maze grid. The markup is
strictly regular, which is what makes the feature tractable.

**Grid.** Sizes run from 2×4 to 17×15. Cells carry `id="td<RR><CC>"` in only 5
of the 45 quests, so coordinates come from row/column index; the ids serve as a
cross-check where present.

**Edges.** A `<td>`'s class tokens encode the four sides: `f` (north), `j`
(east), `a` (south), `b` (west). A bare token is a solid wall. A suffixed token
is a locked door, one of eight lock types:

| Suffix | Lock | Suffix | Lock |
|---|---|---|---|
| `_vas` | iron | `_arany` | gold |
| `_rez` | copper | `_platina` | platinum |
| `_bronz` | bronze | `_tolvaj` | thief |
| `_ezust` | silver | `_cso` | pipe |

A ninth suffix, `_szel`, appears 182 times across quests 39, 40, 41 and 44 but
has **no rule in the source site's CSS**, so it renders as nothing there. Its
intent was undetermined at design time — resolved during implementation, see
*Resolved during implementation* below.

One malformed token exists: a bare `_cso` with no side prefix. The parser
tolerates it rather than aborting.

**Cell images** follow the grammar `<base>[_<X>kulcs][_kt][_labikibe].jpg`:

- `_<X>kulcs` — this cell yields that lock's key
- `_kt` — this cell holds the quest item
- `_labikibe` — labyrinth entrance or exit
- `boss` suffix on the base — boss monster
- special bases: `nop` (empty), `kerdes` (question), `csapda` (trap),
  `halal` (death), `bejarat` (entrance)

**Titles** hold the narration, with drops appended after ` -- `, and 143 of
them embed a choice point in the form
`KÉRDÉS: … VÁLASZOK: (1) … (2) …`.

**Monster resolution rate: 327 of 328 distinct sprite bases** match
`monsters.json` image basenames exactly. The single miss is
`tolvajkepzoboss_kerdes`. Click-through to monster details is therefore a
direct lookup, not a fuzzy match.

**Two structural exceptions**, both verified:

- Quest 27 has seven tables. They are not floors — they are alternate views of
  one maze, toggled by buttons labelled `Teljes labirintus`, `Vaskulcs`,
  `Rézkulcs` and so on: a hand-made "where is each key" overlay. Our door→key
  resolution supersedes it, so we take the first table and drop the rest.
- Quest 11 has no entrance marker. The model must tolerate a null entrance.

## Data pipeline

Scraped once into a committed snapshot, joining the project's existing
convention that `static/db/` is the single source of truth. This keeps the
feature working offline, in-game through `gmSource`, and on GitHub Pages,
without putting a third-party fan site in the runtime path of every page view.

- `scripts/quests/parseQuest.mjs` — pure functions, no I/O
- `scripts/quests/scrape.mjs` — fetch and write, run via `npm run scrape:quests`
- output: `static/db/quests.json`, committed

The scraper **fails loudly rather than degrading silently**. It aborts the
write on an unknown class token, a zero-cell quest, a missing description or
reward, or **any unresolved sprite base other than the single known miss,
`tolvajkepzoboss_kerdes`**, which is allow-listed by name. A percentage
threshold would let new drift hide inside the noise floor; an explicit
allow-list cannot. The scraper prints every unresolved base it sees, so source
drift surfaces at scrape time rather than as a broken page.

## Model

Added to `src/shared/data/types.ts`:

```ts
export type LockType =
  | 'vas' | 'rez' | 'bronz' | 'ezust'
  | 'arany' | 'platina' | 'tolvaj' | 'cso';

export type Side = 'N' | 'E' | 'S' | 'W';

export type Edge =
  | { kind: 'open' }
  | { kind: 'wall' }
  | { kind: 'door'; lock: LockType }
  | { kind: 'szel' };

export interface QuestChoice {
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
  /** Resolved against monsters.json; null when the cell has no monster. */
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

`loadQuests()` joins the existing methods on `DataLoader`, fetching
`quests.json` through the same `DataSource` abstraction as every other entity.

## Parsing rules

Order matters; these are the steps a naive parser gets wrong.

1. **Strip HTML comments first.** Quest 45 ships a commented-out template row
   that otherwise parses as eight phantom cells.
2. **Edges** from class tokens per side. `_szel` is preserved as its own kind
   rather than forced into wall-or-door. The malformed bare `_cso` is tolerated.
3. **Image grammar** stripped in fixed order: `_labikibe`, then `_kt`, then
   `_<X>kulcs`, leaving the base. `boss` is detected on the resulting base.
4. **Monster lookup**: try the base, then base + `_k`, against `monsters.json`
   image basenames.
5. **Question before drops.** Answer text contains ` -- ` as well, so splitting
   on the drops separator first corrupts the question in every one of the 143
   cells that have one.

Anything the question parser cannot split cleanly falls back to raw narration.
It never invents structure.

## UI

A new tab in `DatabaseApp`, routed `#quests/<id>`, reusing the existing
`tab[/param]` route grammar unchanged; cell selection stays in component state.
New folder `src/database/quests/`, laid out like the existing `map/`:

```
src/database/quests/
├── QuestView.tsx          # picker + grid + detail
├── QuestGrid.tsx          # the maze
├── QuestCellDetail.tsx    # side panel for the selected cell
├── QuestQuestionCard.tsx  # choice-point rendering
└── questMeta.ts           # lock labels, colors, badge metadata
```

### The grid is CSS grid and divs, never a `<table>`

Deliberate. The game page runs in quirks mode, where tables refuse to inherit
`color` — a documented problem that already made the in-game explorer nearly
unreadable. Rendering the maze as divs avoids that whole class of bug instead
of patching around it.

Tile size is a CSS variable, so a zoom control plus a scroll container handles
17×15 quests inside the ~720px docked in-game overlay and on mobile.

A cell draws its four borders from `edges`: walls in the theme's stone color,
doors in per-lock colors added to `theme.css` — the game's key colors, tuned
for our dark background rather than copied raw — and `szel` distinct from both.
Over that sits the monster sprite from `l2.larkinor.hu`, with corner badges for
key, quest item, entrance, exit, trap and question. `nop` cells recede as unlit
void.

### The three features

**Monsters.** Clicking a cell opens the detail panel, where the monster name
links to `#monsters/<id>` — reusing the cross-tab navigation the app already
performs for dropped items. An unresolved sprite shows its raw base name rather
than a dead link.

**Doors → keys.** Hovering *or focusing* a door edge highlights the cell in
that quest yielding its key, and shows, for example,
`Vaskulcs — 3. sor, 2. oszlop (Csontváz)`. When the quest contains no such
cell, it says so explicitly rather than showing an empty tooltip.

Hover alone would be unreachable by keyboard and absent on touch, so doors are
focusable and tappable for the same result, and each quest carries a
**permanent key legend** listing every lock present and where its key is. The
legend is the discoverable version; hover is the fast one.

**Questions.** A card with the prompt, then one row per choice with its
outcome, color-coded by valence parsed from the recurring patterns (`max ÉP`,
`3 méreg`, `HALÁL`, `semmi`, `30 ezüst`). Unparseable questions fall back to
raw narration.

### Supporting UI

A quest header carrying description, reward, and counts (monsters, keys,
questions, traps). The quest picker searches via the existing
accent-insensitive `matchesSearch` from `shared/text.ts`.

Available on both surfaces: the standalone site and the in-game
`DatabaseOverlay` both render `DatabaseApp`, so the tab appears in both. The
in-game path is why the quirks-mode and narrow-width constraints above are
requirements rather than polish.

## Testing

Splitting the parser into pure functions is what makes the risky part testable.
`tests/questParse.test.ts` imports `parseQuest.mjs` directly and runs against
real saved pages in `tests/fixtures/quests/`.

**Unit** — targeted at the specific things found during source analysis:

- class token → `Edge`, including `_szel` and the malformed bare `_cso`
- image grammar across every real suffix combination (`_kt_labikibe`,
  `_aranykulcs_kt`, `_platinakulcs_labikibe`, `boss` bases)
- comment stripping, using quest 45
- question parsing, table-driven over the real separator variants, plus the
  fallback path
- question extracted before drops
- monster resolution against the actual `monsters.json`
- quest 27 yields one grid; quest 11 yields a null entrance

**Component** (`@testing-library/preact`): grid renders walls and doors from
the model; door hover *and* focus highlight the key cell; the no-key-in-quest
message appears; monster click changes route; question card renders choices and
falls back cleanly.

**Data invariants over the committed `quests.json`**, running in CI: at least
45 quests with contiguous ids from 1 (so a future quest 46 does not fail the
build, but a dropped quest does), all cells within bounds, every lock a valid
`LockType`, every `monsterId` resolvable in `monsters.json`. A bad re-scrape
fails the build rather than shipping.

## Risks

**The question parser is lossy.** 143 questions with inconsistent separators;
some will not split cleanly. Mitigated by the raw-text fallback and by having
the scraper report the clean-parse rate, so the real number is known rather
than assumed.

**Third-party drift.** Mitigated by the committed snapshot plus a validating
scraper: drift becomes a scrape-time error, never a broken page for users.

**A shared cell boundary is painted twice, and the two paintings can
disagree.** `QuestGrid` renders each cell's own four edges; `.quest-cell` has
no `z-index`, so on a shared boundary the two `.quest-edge` divs stack in
document order. Checked directly against `quests.json`: 19 boundaries across
quests 11, 17, 39 and 40 declare a different edge on each side (e.g. one cell's
south edge is `wall`, its neighbour's north edge is a `vas` door; one side
`platina`, the other `tolvaj`). Visually confirmed in the browser (quest 17,
row 6/7 col 5; quest 40, row 6 col 3/4): the later cell in DOM order fully
occludes the earlier one at that boundary — a clean single-coloured line, not
a visible glitch, but the losing side's declaration is silently discarded.
This is a fact about the source data's own internal inconsistency (both cells
of the pair being asked to describe the same physical wall differently), not a
parser bug, and is not fixed here — flagging it so a future reader who spots
an oddly-coloured door isn't chasing a rendering bug that isn't there.

No new runtime dependency — `MonsterCard` already loads sprites from
`l2.larkinor.hu`.

## Resolved during implementation

**`_szel` semantics — resolved, "edge/margin," high confidence.** Undefined in
the source site's CSS, so intent could not be read off the markup directly.
Two independent lines of evidence settle it:

1. **Structural (decisive).** For every one of the 182 `_szel` occurrences
   across quests 39, 40, 41 and 44, the cell on the *other* side of the edge is
   either off the quest's declared `rows × cols` grid entirely, or is an empty
   `nop` filler cell. Zero occurrences border a real, navigable neighbouring
   cell. `_szel` therefore never separates two rooms — it traces the outline of
   an irregularly-shaped playable area drawn inside a rectangular HTML table,
   marking where the drawing stops rather than gating a passage. That reading
   matches `szél` as "edge/margin," not "wind": a wind-barrier mechanic between
   two traversable spaces would be expected to show up at least sometimes
   between two real cells, and it never does.
2. **Narrative (corroborating, not decisive on its own).** The narration of
   cells adjacent to `_szel` edges contains no wind/gust/draught vocabulary
   (`szél` as "wind", `huzat`, `fuvallat`, `szellő`) at all — it's ordinary
   room narration unrelated to the edge. The word `szél` does appear a
   handful of times incidentally in this data set's prose, and every one of
   those uses is the "edge/margin" sense (`"az út szélén álló szomorú fűzek"`
   — willows at the *edge* of the road; `"a szád szélét"` — the *edge* of your
   mouth), never "wind." This is a small, incidental sample, not proof by
   itself, but it points the same direction as the structural evidence rather
   than against it.

Queries run (`static/db/quests.json`, via `node -e`):

```js
// 1. Every _szel edge borders either off-grid space or a nop filler cell,
//    never a real neighbouring cell (182/182 across quests 39, 40, 41, 44):
//    outOfGrid=22 nopNeighbor=40 realNeighbor=0   (quest 39)
//    outOfGrid=32 nopNeighbor=0  realNeighbor=0   (quest 40)
//    outOfGrid=42 nopNeighbor=0  realNeighbor=0   (quest 41)
//    outOfGrid=46 nopNeighbor=0  realNeighbor=0   (quest 44)

// 2. Narration adjacent to _szel edges: zero genuine wind/gust/draught hits
//    out of 147 unique adjacent cells; the handful of "szél"-word matches
//    are incidental uses meaning "edge" ("út szélén", "szád szélét").
```

**Treatment applied.** `_szel` keeps its own distinct `Edge` kind and its own
`--quest-szel` colour (unchanged) rather than being collapsed into `wall` —
that distinction is still useful, since it now carries a specific, named
meaning rather than an unknown one. What changed is the label: the edge's
tooltip and a caption shown under the grid whenever a quest contains one now
read **`labirintus széle`** ("edge of the maze") instead of the ambiguous
fallback `különleges átjáró` ("special passage") that the fallback plan called
for — a "passage" label would misrepresent a boundary that never actually
leads anywhere. See `src/database/quests/questMeta.ts` (`SZEL_LABEL`,
`hasSzelEdges`), `QuestGrid.tsx` and `QuestView.tsx`.

## Out of scope

A key-aware route solver (entrance → required keys → doors → exit) was
considered and deliberately deferred. It is a second subsystem with its own
model, tests, and judgement calls about optional detours and unreachable cells.
The data model does not preclude adding it later.
