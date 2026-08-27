// Recognising which maze cell the player is standing in.
//
// The dungeon page never states a coordinate, but it does print the cell's own
// narration text and it draws the cell's four sides. Together those pin the
// position: measured over the committed corpus, the text alone identifies 78%
// of narrated royal cells uniquely and the sides lift that to 90% (tavern:
// 98% and 99%, its narrations being near-unique to begin with). See
// `tests/dungeonPosition.test.ts`, which pins both figures so a data refresh
// that degrades detection fails loudly.
//
// Pure on purpose: no DOM, no GM_*, no data fetching — the caller supplies the
// narration, the observation and the quest list. `activateDungeonPosition`
// does the side effects, `domExtract` does the reading.

import type { Quest, QuestCell, Side } from '@/shared/data';
import { foldAccents } from '@/shared/text';
import type { QuestPosition, QuestPositionCell } from '@/shared/questPosition';

/** What the dungeon page says about one side of the cell the player is in. */
export type SideObservation = 'open' | 'wall' | 'door';

/**
 * Per-side observation. A side the page did not describe is simply absent, and
 * an absent side never rejects a candidate — the observation narrows the search
 * and is never allowed to break it.
 */
export type SideObservations = Partial<Record<Side, SideObservation>>;

const SIDES: Side[] = ['N', 'E', 'S', 'W'];

/**
 * How long a folded cell text must be before it may match as a suffix of, or
 * inside, a narration line rather than as the whole line.
 *
 * The loose rules exist for a cell text the game has run together with
 * something else on one line. They are length-gated because the narration's
 * leading lines belong to the player's last action, not to the cell: without a
 * floor, a cell whose text is `halál` would claim any position whose action
 * preamble happened to contain that word.
 */
const LOOSE_SUFFIX_MIN = 24;
const LOOSE_CONTAINS_MIN = 40;

/**
 * The narration split into folded, non-empty lines.
 *
 * Lines, not the whole block: the **last** line is the cell's own text and the
 * ones before it narrate the last action (a rest, a fight, a trap). Matching
 * against the block as a whole would let an action's wording decide a position.
 *
 * Folding drops accents, case and punctuation, which is not cosmetic — the game
 * prints `"Bosszulj…"` where the scraped data has `'Bosszulj…'`, and the two
 * sources disagree on Hungarian diacritics often enough that comparing them
 * literally is brittle.
 */
export function foldNarrationLines(narration: string): string[] {
  return narration
    .split('\n')
    .map((line) => foldAccents(line).replace(/[^a-z0-9]+/g, ' ').trim())
    .filter((line) => line.length > 0);
}

/**
 * How strongly a cell's text matches the narration: 2 for a whole line, 1 for
 * one of the length-gated loose rules, 0 for no match.
 *
 * The two strengths are ranked rather than merged so `matchCellsInQuest` can
 * ignore the loose rules whenever an exact line match exists — see there.
 */
export function narrationMatchStrength(cellNarration: string, foldedLines: string[]): 0 | 1 | 2 {
  const text = foldAccents(cellNarration).replace(/[^a-z0-9]+/g, ' ').trim();
  if (!text) return 0;
  if (foldedLines.includes(text)) return 2;

  const lastLine = foldedLines[foldedLines.length - 1];
  if (text.length >= LOOSE_SUFFIX_MIN && lastLine !== undefined && lastLine.endsWith(text)) return 1;
  if (text.length >= LOOSE_CONTAINS_MIN && foldedLines.some((line) => line.includes(text))) return 1;

  return 0;
}

/** Whether a cell's text matches the narration at all. */
export function cellNarrationMatches(cellNarration: string, foldedLines: string[]): boolean {
  return narrationMatchStrength(cellNarration, foldedLines) > 0;
}

/**
 * Whether a cell's four sides are consistent with what the page drew.
 *
 * Two deliberate asymmetries:
 *
 * - **A door in the data agrees with anything.** The dungeon page's door
 *   sprite grammar has not been verified against the live game the way the
 *   wall and corridor tiles have, so a door must never be the reason a cell is
 *   rejected. Being lenient there costs precision (measured: 0.4 percentage
 *   points) and cannot cost correctness.
 * - **`szel` counts as a wall.** It marks where the drawn maze stops, so the
 *   game has nothing to walk through there either.
 */
export function sidesAgree(cell: QuestCell, observed: SideObservations): boolean {
  return SIDES.every((side) => {
    const seen = observed[side];
    if (seen === undefined) return true;
    const kind = cell.edges[side].kind;
    if (kind === 'door') return true;
    if (seen === 'door') return false;
    return seen === 'open' ? kind === 'open' : kind === 'wall' || kind === 'szel';
  });
}

/**
 * Every cell of one quest consistent with the narration and the sides.
 *
 * The loose narration rules are consulted **only when no cell matches a whole
 * line**. Mixing the two would let a cell whose text is a long tail of another
 * cell's text tag along on every one of that cell's hits, turning exact
 * positions into ambiguous ones — the corpus rates this module pins are the
 * rates of the exact rule, and tiering is what preserves them.
 */
export function matchCellsInQuest(
  quest: Quest,
  narration: string,
  observed: SideObservations,
): QuestCell[] {
  const lines = foldNarrationLines(narration);
  if (lines.length === 0) return [];

  const scored = quest.cells
    .map((cell) => ({ cell, strength: narrationMatchStrength(cell.narration, lines) }))
    .filter((c) => c.strength > 0 && sidesAgree(c.cell, observed));
  if (scored.length === 0) return [];

  const best = Math.max(...scored.map((c) => c.strength));
  return scored.filter((c) => c.strength === best).map((c) => c.cell);
}

/**
 * Locate the player's cell, searching the quest they were last looking at
 * first and the rest of the set after.
 *
 * The fallback is what makes this self-correcting. The stored quest goes stale
 * the moment the player walks into a different labyrinth without opening the
 * quests tab, and searching only that quest would then detect nothing at all,
 * silently. A hit elsewhere in the set tells the caller to move the stored
 * selection too.
 *
 * An exact hit anywhere outranks an ambiguous one, and among ambiguous results
 * the preferred quest wins — a player mid-way through reading a quest is far
 * more likely to be standing in it than in some other maze that repeats the
 * same line of flavour text.
 *
 * Returns null when nothing matches, which is a routine outcome rather than an
 * error: roughly a quarter of cells carry no text for the page to print.
 */
export function locateDungeonPosition(
  narration: string,
  observed: SideObservations,
  quests: readonly Quest[],
  preferredQuestId: string | null,
): QuestPosition | null {
  if (foldNarrationLines(narration).length === 0) return null;

  const preferred = preferredQuestId != null
    ? quests.find((q) => q.id === preferredQuestId)
    : undefined;
  const order = preferred ? [preferred, ...quests.filter((q) => q !== preferred)] : quests;

  let ambiguous: QuestPosition | null = null;

  for (const quest of order) {
    const cells = matchCellsInQuest(quest, narration, observed);
    if (cells.length === 0) continue;

    const position: QuestPosition = {
      set: quest.set,
      questId: quest.id,
      cells: cells.map((c) => ({ row: c.row, col: c.col })),
      exact: cells.length === 1,
      source: 'narration',
    };
    if (position.exact) return position;
    ambiguous ??= position;
  }

  return ambiguous;
}

/** Row/column delta of one step towards each side. */
const STEP: Record<Side, { row: number; col: number }> = {
  N: { row: -1, col: 0 },
  E: { row: 0, col: 1 },
  S: { row: 1, col: 0 },
  W: { row: 0, col: -1 },
};

/**
 * Where the player can now be, having taken one step from a known position.
 *
 * Every candidate of `previous` is carried one cell in `dir` and kept only if
 * three things hold: the source cell's own edge in that direction is passable
 * (the data's account of whether the step was possible at all), the target
 * exists in the grid, and the target's sides agree with what the page drew.
 *
 * Propagating the whole candidate list rather than only an exact position is
 * the same code and strictly more useful: three candidates stepped north and
 * filtered by the walls frequently leave one, which no single page could do.
 *
 * A `door` is passable here — a locked door offers no button and cannot have
 * been the step taken, and the caller resolves a failed step by preferring the
 * narration (see `resolveDungeonPosition`).
 */
export function propagatePosition(
  previous: QuestPosition,
  dir: Side,
  quest: Quest,
  observed: SideObservations,
): QuestPositionCell[] {
  const byPosition = new Map(quest.cells.map((c) => [`${c.row},${c.col}`, c]));
  const delta = STEP[dir];
  const out: QuestPositionCell[] = [];

  for (const from of previous.cells) {
    const source = byPosition.get(`${from.row},${from.col}`);
    if (!source) continue;
    const kind = source.edges[dir].kind;
    if (kind === 'wall' || kind === 'szel') continue;

    const target = byPosition.get(`${from.row + delta.row},${from.col + delta.col}`);
    if (!target || !sidesAgree(target, observed)) continue;
    if (out.some((c) => c.row === target.row && c.col === target.col)) continue;
    out.push({ row: target.row, col: target.col });
  }

  return out;
}

/**
 * The player's position from both signals the page offers: the text it printed,
 * and the step they took to get here.
 *
 * Order of authority, and why:
 *
 * 1. **An exact narration match in the *same* quest wins outright.** A click
 *    on a direction control is not proof of a move: the game may refuse it,
 *    the page may not navigate at all, the player may mis-click — and the
 *    page's own words are the only account of where they ended up. (Not via
 *    a locked door, despite what this comment used to say: a locked door is
 *    drawn but offers *no* nav button — measured live, see `propagatePosition`
 *    above — so it can never have been the step that was clicked.) A
 *    disagreement drops the chain rather than averaging two incompatible
 *    answers.
 * 2. **A step confirmed within the previous exact quest beats an exact
 *    narration match found in a *different* quest.** Within a chain of
 *    consecutive dungeon pages the quest cannot change: reaching a different
 *    labyrinth means walking through a non-dungeon page first, and every
 *    non-dungeon page clears the stored position (see
 *    `clearDungeonPosition`), so a stored `previous` position always belongs
 *    to the maze the player is still standing in. If that `previous` was
 *    itself exact and the step propagates to a cell inside its own quest,
 *    that quest is proven, not merely guessed — so an exact narration hit
 *    turned up *elsewhere* in the corpus is a coincidence of wording, not
 *    evidence: `locateDungeonPosition` searches the whole corpus, so an
 *    unrelated quest's phrasing can happen to be unique even while the
 *    walker's own quest still reads as ambiguous (measured on the committed
 *    corpus in `tests/dungeonPosition.test.ts`'s wrong-lock rate). An
 *    *ambiguous* `previous` carries no such proof — it has not yet pinned
 *    down which maze the player is in — so this rule applies only when it
 *    was exact.
 * 3. **They intersect when both are ambiguous or agree, within the same
 *    quest**, which is where the tracking earns its keep: a step filtered by
 *    the drawn walls routinely collapses several candidates to one.
 * 4. **Either fills in for the other's silence.** Roughly a quarter of cells
 *    print no text at all, and that is exactly where a step is the only thing
 *    that knows anything.
 */
export function resolveDungeonPosition(
  narration: string,
  observed: SideObservations,
  quests: readonly Quest[],
  preferredQuestId: string | null,
  previous: QuestPosition | null,
  move: Side | null,
): QuestPosition | null {
  const detected = locateDungeonPosition(narration, observed, quests, preferredQuestId);

  const quest = previous && move
    ? quests.find((q) => q.id === previous.questId && q.set === previous.set)
    : undefined;
  if (!quest || !previous || !move) return detected;

  const stepped = propagatePosition(previous, move, quest, observed);
  if (stepped.length === 0) return detected;

  const walked: QuestPosition = {
    set: quest.set,
    questId: quest.id,
    cells: stepped,
    exact: stepped.length === 1,
    source: 'move',
  };

  if (!detected) return walked;
  if (detected.set !== walked.set || detected.questId !== walked.questId) {
    // Rule 2 above: a step confirmed within the quest `previous` was
    // exactly in outranks an exact narration match that only turned up in a
    // different quest. An ambiguous `previous` gets no such benefit — the
    // match elsewhere in the corpus is all either signal has to go on.
    return previous.exact ? walked : detected;
  }

  const both = walked.cells.filter((c) =>
    detected.cells.some((d) => d.row === c.row && d.col === c.col));
  if (both.length === 0) return detected;
  if (detected.exact) return detected;

  return { ...walked, cells: both, exact: both.length === 1 };
}
