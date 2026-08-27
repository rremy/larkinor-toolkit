# Quest tracking — active quest, cleared tiles, movement — design

**Status:** approved 2026-08-27
**Builds on:**
`docs/superpowers/specs/2026-08-13-quest-database-design.md` (the royal maze data),
`docs/superpowers/specs/2026-08-14-tavern-quests-design.md` (the second set),
`docs/superpowers/specs/2026-07-06-larkinor-real-dom-reference.md` (the live DOM),
and the position detection already shipped in `src/utils/dungeonPosition.ts`.

## Goal

Three independent improvements to the quest tab, all of them about answering
*where am I and what is left* while the player is actually walking a maze:

1. **The game names the active royal quest.** A page whose narration prints
   `Aktuális küldetés: (39)` states outright what the pub matcher can only guess
   at. Recognise it, remember it, and make the text a link that opens the quests
   tab on royal quest 39.
2. **Cleared tiles are drawn as cleared.** A monster killed, a question
   answered, a trap sprung — the tile is spent, and the maze should say so
   instead of still advertising work that is done.
3. **Movement is tracked.** A detected position plus a known step is a second,
   independent way to know where the player is. It fills in the pages the
   narration cannot pin, and — because the step is filtered by the walls the
   page draws — it collapses ambiguous matches into single ones.

Each part is separately shippable. Part 1 needs no quest data at all; parts 2
and 3 both hang off the existing dungeon-page activation.

## Part 1 — the active royal quest

### Source

The line appears inside the narration block (`font[face="Comic sans MS"]`),
in the form `Aktuális küldetés: (39)`. The parenthesised value is a **royal**
quest number: tavern quests are keyed by page slug (`GOMB`, `GY.I.K`) and have
no number the game could print.

That makes the whole part **data-free**. A royal quest's `Quest.id` *is* the
number and its display title is the same string (`QuestView` renders
`39. küldetés` from it), so nothing here needs `quests.json` — 1.5MB that would
otherwise be fetched on ordinary city pages for a link label.

### `src/utils/activeQuest.ts` (pure)

```ts
export interface ActiveQuestMention {
  questId: string;   // '39'
  index: number;     // offset of the matched run in the narration
  length: number;
}
export function findActiveQuest(narration: string): ActiveQuestMention | null;
```

- Matches on the **raw** narration, not a folded copy, because the offsets are
  what lets both platforms wrap the matched run in a link. Accent tolerance
  comes from character classes (`Aktu[aá]lis\s+k[uü]ldet[eé]s`) rather than
  folding, so a source that arrives unaccented still matches without the
  offsets shifting out from under the caller.
- Range-checked to `1–45`, the royal set's size. An out-of-range or non-numeric
  value yields null: writing a quest id the database cannot resolve would send
  the tab to its fallback quest, which reads as a bug rather than as "unknown".
- The matched run covers the whole `Aktuális küldetés: (39)` phrase, so the link
  is a sentence-sized target rather than two characters.

### `src/utils/activateActiveQuest.ts`

Same shape as `activateQuestOffer` — injected `readPref`/`writePref`, no GM_*,
no DOM:

```ts
export function activateActiveQuest(
  narration: string, readPref: ReadPref, writePref: WritePref,
): ActiveQuestMention | null;
```

- Writes `lc-quest-active-royal` (new key, `ACTIVE_ROYAL_QUEST_PREF_KEY`).
- Writes `lc-quest-selected-royal` **only when the id differs from the stored
  active one.** Accepting a new quest is exactly when pre-selecting it helps;
  every page load afterwards is when it would fight a player who has
  deliberately opened some other quest to read it. "Write on change" is the
  same restraint `activateQuestOffer` applies with "write only on a match".
- **Never writes `lc-quest-set`.** The line is printed by ordinary city pages,
  so switching the set here would drag a player mid-way through a tavern quest
  back to royal on every step they take. The set moves only when the player
  clicks the link, which routes explicitly (see below) and lets `QuestView`'s
  own persistence effect record it.
- Runs on **every** page in both boots, before any page-type branch: it is one
  regex over text the boots already have, and the line's page is not something
  worth assuming.

### Reaching the tab

- **Desktop** splices an inline link into the live narration. `enhanceNarration`
  already solves this problem for monster names — flatten the block, map a match
  in the flat text back to its text node, splice without ever touching
  `innerHTML` (which would destroy the game's own inline handlers). That
  machinery moves to `src/desktop/narrationSplice.ts` and both consumers use it;
  each keeps its own marker attribute so one running twice cannot undo the
  other. The link opens the quests tab through the dock's existing
  `openQuestsSignal` nonce plus an `openQuestTarget` of `{set:'royal', id}` —
  the same route the pub note takes, and for the same reason: `QuestView` reads
  the stored set once at mount, so an already-open overlay would never see a
  freshly written pref.
- **Mobile** adds one optional span to `NarrationPanel`
  (`questLink?: { index; length; onClick }`), spliced by the component's
  existing offset-based span machinery — the same path its monster mentions and
  narration anchors already take, including the overlap skip. `FreeMove`,
  `Battle` and `Dungeon` wire it to their `DatabaseOverlay` with
  `initialTab='quests'`, `initialQuest={set:'royal', id}` and a nonce;
  `Dungeon` already has the nonce half of that plumbing.

`NarrationPanel` takes the mention's offsets rather than its text so the span
lands where the parser found it, not at the first `indexOf` of a phrase that
could plausibly recur.

### What else gains from it

The stored active quest is a better "preferred quest" than the last-viewed
selection for dungeon detection: it is what the game says the player is doing.
But it is not the *top* preference — the quest the previous dungeon position
was in outranks it, because every non-dungeon page clears the position, so
within a chain of consecutive dungeon pages the quest cannot change: that
candidate is proven, not merely stated by a pref that never expires.
`activateDungeonPosition` therefore falls back to the active quest only when
there is no previous position in the loaded set, preferring it over
`lc-quest-selected-royal` **when the loaded set is royal**, and ignoring it
otherwise. It never chooses which set to load — the active royal quest says
nothing about whether the player has wandered into a tavern labyrinth.

> **Corrected 2026-08-27 (doc touch-up).** This section originally presented
> the active royal quest as the top-ranked preferred quest for dungeon
> detection. It is now second, behind the quest the previous dungeon position
> was in. Nothing ever clears the active-quest pref — the game simply stops
> printing the line, which is indistinguishable from a page that never printed
> it — so a stale active quest at the front of the search would capture every
> ambiguous match. See the `??` chain in `activateDungeonPosition`
> (`src/utils/activateDungeonPosition.ts`).

## Part 2 — cleared tiles

### State and storage

`src/shared/questCleared.ts`, beside `questPosition.ts` and for the same reason:
the writer is the userscript's boot (and the quests tab's own toggle) while the
reader ships in the GM-free standalone bundle, so the shape needs one shared
definition.

```ts
/** Wire shape: { version: 1, cells: ['3,4', …] } — keys are questMeta's cellKey. */
export function serialiseCleared(cells: ReadonlySet<string>): string;
export function parseCleared(raw: string | null): Set<string>;
```

One pref **per quest**, `questClearedKey(set, id)` → `lc-quest-cleared-<set>-<id>`
in `prefKeys.ts`. Per quest rather than one blob: a quest holds at most ~150
cells so each value stays small, the reset is a single delete, and no write ever
has to merge against another quest's progress. At most 45 + 37 keys exist, and
only for quests actually walked.

Unlike `QuestPosition`, cleared state is **long-lived** — it is progress, not an
observation about the current page — so `parseCleared` degrades to an empty set
on anything it does not recognise instead of the caller treating a parse failure
as a reason to stop.

### Automatic clearing

Runs in `activateDungeonPosition`, and only when the resolved position is
**exact and pinned by the narration** (`position.source === 'narration'`): a
cleared mark on the wrong cell is worse than no mark, an ambiguous match has
no single cell to mark, and a mark is permanent — only the page's own words
may justify one. Each rule compares what the page shows against what the
quest data says the cell holds:

> **Corrected 2026-08-27 (doc touch-up).** This paragraph originally gated
> the rule on `exact` alone. That stopped being sufficient once movement
> tracking landed: a step propagated from a confirmed previous position is
> `exact` whenever the walls leave one candidate, so gating on `exact` alone
> would mark cells nobody's narration confirmed — the game refuses a move,
> the cell the player is still standing on prints no text (about a quarter
> don't), the prediction wins, and the monster on the *predicted* cell is
> recorded as killed. The shipped gate additionally requires
> `position.source === 'narration'`; see `activateDungeonPosition` in
> `src/utils/activateDungeonPosition.ts`.

| Data says | Page shows | Conclusion |
|---|---|---|
| `monsterId != null` | no `ellenfel/` tile **and** no `tamadas` control | killed |
| `hasQuestion` | no `input[name="valasz"]` radios | answered |
| `trap` | (the player is standing here) | sprung |

- The trap rule needs no page evidence: a trap fires on entry, so being detected
  on the tile is the evidence.
- The question rule reuses the signal `extractDungeonQuestion` already reads —
  radios are how the live page asks, and their absence is how it stops asking.
- **The monster rule rests on one unverified assumption**: that the enemy
  silhouette (`ellenfel/ellenfel_b.gif`) is drawn only while the creature is
  alive. It is consistent with everything measured so far, but it has not been
  watched across a kill. Two mitigations, both deliberate: the rule requires
  **both** signals absent (the silhouette *and* the `tamadas` control, which the
  game cannot offer for a creature that is gone), and the manual toggle below
  can correct any cell the page gets wrong. Confirming it live is a task in the
  implementation plan, not a blocker for the rest.

The observations come from one new extractor rather than three ad-hoc queries:

```ts
export interface DungeonObservation {
  sides: SideObservations;
  enemy: boolean;     // ellenfel tile or tamadas control present
  question: boolean;  // input[name="valasz"] present
}
export function extractDungeonObservation(doc: Document): DungeonObservation;
```

`extractDungeonSides` stays as it is and becomes the `sides` half, so the
existing corpus tests keep testing exactly what they test today.

### Manual clearing

- `QuestCellDetail` gains a toggle for the selected cell — `Teljesítve` /
  `Visszavonás`. In the detail panel rather than as a grid gesture: a
  long-press or right-click on a tile would collide with the compare card's
  touch handling and with ordinary selection, and an accidental toggle is
  silent progress loss.
- The quest header gains `Teljesített: 7 · Visszaállítás`, shown only when the
  count is non-zero, which both reports the state and resets the quest. This is
  the whole lifecycle: marks otherwise persist indefinitely, because a maze
  half-cleared across two sessions is the normal case and an automatic reset
  would have to guess when a run started.

### Rendering

`.quest-cell.cleared` desaturates the tile, dims the sprite and any centred
icon, and adds a `✓` corner badge (`BADGE.cleared`).

- **Walls keep full strength.** They are what the player navigates by, and on a
  cleared tile they are the only thing still load-bearing.
- **The position marker outranks it.** Standing on a cleared tile is common;
  the ring and `📍` must stay legible over the dimming.
- **`void` is untouched.** Outside-the-maze canvas must never read as "done" —
  the two mean opposite things and the palette must not blur them.

`QuestView` holds the cleared set in state (seeded from the pref on mount and
re-read when the quest data arrives, the same double-read `position` already
does, and for the same reason: the boot's write can land after the tab mounts),
passes it to `QuestGrid` as a `Set<string>` keyed by `cellKey`, and writes
through the `prefStore` on every toggle.

## Part 3 — movement tracking

### Recording the step

`src/utils/trackDungeonMove.ts`:

```ts
export function armDungeonMoveTracking(doc: Document, writePref: WritePref): void;
```

A capture-phase `click` listener on the game's own direction inputs
(`eszak`/`del`/`kelet`/`nyugat`, matched with `domExtract`'s existing basename
map — exposed as `dungeonDirectionInputs(doc)`) writes `lc-quest-move` = `N|E|S|W`
synchronously. The direction is a `Side`, not `domExtract`'s `Direction`: the
matcher already speaks `Side` throughout, and reusing it keeps
`dungeonPosition.ts` importing nothing but `@/shared/**` — the property that
makes it testable without a DOM. Three properties make this the right hook:

- **It catches every path.** The player's own click on desktop, mobile's NavPad
  (which `.click()`s the original control), and the desktop keyboard shortcuts
  (which do the same) all funnel through these inputs.
- **It cannot race the detection.** The listener is attached at boot, before the
  async quest-data load resolves, and it needs no position of its own: the
  *previous* cell is read on the next page load, before being overwritten.
- **It is armed only on dungeon pages**, so a step taken in the city can never
  be replayed against a maze.

The pending move is read and **cleared immediately** at the start of every
dungeon activation, so a rest, an answer, a fight or a failed move leaves no
phantom step behind for the page after.

### Propagating the position

`src/utils/dungeonPosition.ts` gains, pure and testable:

```ts
export function propagatePosition(
  previous: QuestPosition, dir: Side, quest: Quest, observed: SideObservations,
): QuestPositionCell[];
```

Every cell of `previous.cells` is carried one step in `dir` and the target kept
only if all of these hold: it exists in the grid; the **source** cell's edge in
that direction is not a wall or `szel` (the data's own account of whether the
step is even possible); and `sidesAgree(target, observed)` — the page's drawn
walls, the same test the narration matcher uses.

Propagating the whole candidate list rather than only an exact position is the
same code and strictly more useful: `{A,B,C}` stepped north and filtered by the
walls frequently leaves one cell where no single page could. That is the part
plain dead reckoning cannot do.

### Combining with the narration

```ts
export function resolveDungeonPosition(
  narration: string, observed: SideObservations, quests: readonly Quest[],
  preferredQuestId: string | null, previous: QuestPosition | null, move: Side | null,
): QuestPosition | null;
```

1. `detected = locateDungeonPosition(...)`, unchanged.
2. `predicted = previous && move ? propagatePosition(...) : []`, in `previous`'s
   own quest.
3. Combine:
   - both non-empty and they intersect → the intersection (often a single cell);
   - both non-empty and disjoint → **`detected` wins**, and the chain is
     dropped;
   - `detected` empty → `predicted`;
   - `predicted` empty → `detected`.

**Why evidence outranks inference.** A click on a direction is not proof of a
move: the game may refuse it, the page may not navigate at all, the player may
mis-click — and the page's own words are the only account of where they ended
up. Where the two signals merely fail to overlap, the honest resolution is to
believe the page and restart the chain from it.

> **Corrected 2026-08-27 (final review).** This paragraph originally argued the
> rule from a locked door being "drawn *and* offered": clicking it without the
> key leaves the player where they were while the prediction insists they
> advanced. That premise is wrong. The measured fact, recorded in `CLAUDE.md`
> before this feature was planned, is the opposite — **a locked door is drawn
> but offers no nav button** — so a locked door can never be the step that was
> clicked. The rule itself is unchanged and still correct on the weaker premise
> above; only its justification was faulty.


`QuestPosition` gains `source: 'narration' | 'move'` (wire `VERSION` → 2; a
stored v1 value is dropped, which costs one step in the maze — the file already
argues this). Rendered **identically** to a detected position: a step confirmed
by the drawn walls is not a guess to be hedged, and a second visual language for
"you are here" would read as a second player.

Chaining follows from the storage: a `move`-sourced position is stored like any
other, so the next step propagates from it, with the drawn walls re-checked
every time. No step cap — the wall check is the brake, and it is a sharper one
than any count.

### Measuring it

`tests/dungeonPosition.test.ts` gains a **seeded random-walk** measurement over
both committed sets: from each quest's entrance, step through open edges with a
deterministic PRNG, synthesise each page from the data (the cell's narration,
its four sides) and run the resolver. Pinned figures: the share of steps
resolved to a unique cell, with and without the propagation. Per-page rates
(78.1% / 90.5% royal, 98.4% / 99.2% tavern) stay pinned as they are, so the two
measurements together say what tracking is worth on top of what a single page
can do.

## Files

New: `src/utils/activeQuest.ts`, `src/utils/activateActiveQuest.ts`,
`src/utils/trackDungeonMove.ts`, `src/shared/questCleared.ts`,
`src/desktop/narrationSplice.ts`.

Changed: `src/shared/prefKeys.ts` (`ACTIVE_ROYAL_QUEST_PREF_KEY`,
`QUEST_MOVE_PREF_KEY`, `questClearedKey`), `src/shared/questPosition.ts`
(`source`, VERSION 2), `src/utils/dungeonPosition.ts` (propagate + resolve),
`src/utils/activateDungeonPosition.ts` (move, active quest, auto-clear),
`src/utils/domExtract.ts` (`extractDungeonObservation`,
`dungeonDirectionInputs`), `src/desktop/enhanceNarration.ts` (uses the shared
splice), `src/desktop/boot.ts` and `src/mobile/boot.ts` (activation + arming),
`src/desktop/DesktopDock.tsx` (a royal `openQuestTarget`),
`src/components/NarrationPanel.tsx` (the quest span), `src/pages/FreeMove.tsx`,
`src/pages/Battle.tsx`, `src/pages/Dungeon.tsx` (link → quests tab),
`src/database/quests/QuestView.tsx`, `QuestGrid.tsx`, `QuestCellDetail.tsx`,
`questMeta.ts` (`BADGE.cleared`), `src/shared/styles/theme.css`.

## Testing

- Unit: `findActiveQuest` (accented, unaccented, out-of-range, absent, offsets),
  `activateActiveQuest` (write-on-change, never writes the set),
  `parseCleared`/`serialiseCleared` round-trip and garbage, `propagatePosition`
  (grid edge, wall, `szel`, door, disagreeing sides), `resolveDungeonPosition`
  (all four combine branches, including the locked-door disjoint case).
- Corpus: the seeded random walk above; the existing per-page rates unchanged.
- jsdom: the desktop splice on a captured narration (and that the game's own
  anchors survive it), `NarrationPanel`'s quest span, the `QuestCellDetail`
  toggle and header reset writing through a fake `prefStore`, `QuestGrid`
  rendering `.cleared` without disturbing walls or the position marker,
  `armDungeonMoveTracking` writing on a synthetic direction click.
- Both boots: the activation fires on the right pages, arming happens only in a
  dungeon, and the pending move is cleared on entry.

## Corrected 2026-08-27 — the entry page

> **Corrected after live testing.** *Out of scope* below lists "seeding a
> position from the entrance tile on the first page of a run" as deliberately
> excluded. That was wrong in a way only the live game showed: an entry page
> prints the game's own `Sikerült bejutnod a labirintusba.` line **instead of**
> the cell's text, so no entry page could be identified at all — not a rare
> case but every labyrinth visit. `dungeonPosition.ts` now carries a fallback
> tier (`narrationSaysEntered` + `matchEntranceCell`), consulted only when the
> narration tier finds nothing, pinning the promoted quest's `entrance` cell
> when the drawn walls agree. It reads the **entrance** specifically, not the
> entrance/exit tile class: royal quest 29 draws 38 exits, while an entrance is
> unique in 44 of 45 royal and 36 of 37 tavern quests. `QuestPosition.source`
> gained `'entrance'` (wire version 3) so the auto-clear still requires
> `'narration'`.

## Out of scope

Graying *visited* tiles (a trail is a different feature from cleared work);
seeding a position from the entrance tile on the first page of a run; loading
the second quest set to cover a labyrinth outside the stored one; any change to
how the pub's fuzzy tavern match works.
