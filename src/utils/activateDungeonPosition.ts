// Turning a dungeon page into a marker on the quest maze.
//
// Sits between the pure matcher (`dungeonPosition`) and the boot modules: it
// does the data fetch and the preference writes, but takes both as injected
// collaborators so it stays testable without GM_* or the network. Same shape,
// and the same reasons, as `activateQuestOffer`.

import type { DataLoader, Quest, QuestSet } from '@/shared/data';
import {
  ACTIVE_ROYAL_QUEST_PREF_KEY,
  QUEST_POSITION_PREF_KEY,
  QUEST_SET_PREF_KEY,
  questClearedKey,
  questSelectedKey,
  type ReadPref,
  type WritePref,
} from '@/shared/prefKeys';
import { parseQuestPosition, serialiseQuestPosition, type QuestPosition } from '@/shared/questPosition';
import { parseCleared, serialiseCleared } from '@/shared/questCleared';
import { resolveDungeonPosition } from './dungeonPosition';
import { takePendingMove } from './trackDungeonMove';
import type { DungeonObservation } from './domExtract';

export type { ReadPref, WritePref } from '@/shared/prefKeys';

function isQuestSet(value: string | null): value is QuestSet {
  return value === 'royal' || value === 'tavern';
}

/**
 * Detect which maze cell the player is standing in and store it, so the quest
 * grid can mark it.
 *
 * Scoped to the **stored quest set** rather than searching both: the two data
 * files run ~1.5MB and ~1.2MB, and loading the second one on every dungeon page
 * to cover the rarer case of the player being in the other kind of labyrinth is
 * not a trade worth making. Picking the set once in the quests tab is the cost,
 * and it is a cost the player already pays to read the maze at all.
 *
 * Combines two signals via `resolveDungeonPosition`: the page's own narration
 * and walls, and the step the player took to get here (read from the pending
 * move left by `armDungeonMoveTracking`, and consumed here so the next page
 * cannot replay it). Within the narration signal the search is self-correcting:
 * `resolveDungeonPosition` tries the remembered quest first and the rest of the
 * set after (see the ordering below for which quest that is), and an *exact*
 * hit elsewhere moves the remembered selection too — so walking into a
 * different labyrinth fixes the store instead of silently detecting nothing.
 *
 * Clears the stored position whenever nothing matches, which is a routine
 * outcome (about a quarter of cells print no text). A stale marker is worse than
 * no marker: it looks exactly like a live one. The same goes for a quest-data
 * fetch that fails: the pending step has been consumed by then, so the chain
 * cannot be continued and the position it started from must not survive.
 *
 * Failures are swallowed. A position that cannot be detected is a missed
 * convenience, never a reason to break the page.
 */
export async function activateDungeonPosition(
  narration: string,
  observation: DungeonObservation,
  loader: DataLoader,
  readPref: ReadPref,
  writePref: WritePref,
): Promise<QuestPosition | null> {
  const storedSet = readPref(QUEST_SET_PREF_KEY);
  const set: QuestSet = isQuestSet(storedSet) ? storedSet : 'royal';

  // Read before anything is written: both of these describe the page *before*
  // this one, and the writes below overwrite them.
  const previous = parseQuestPosition(readPref(QUEST_POSITION_PREF_KEY));
  const move = takePendingMove(readPref, writePref);

  let quests: Quest[];
  try {
    quests = set === 'tavern' ? await loader.loadTavernQuests() : await loader.loadQuests();
  } catch (err) {
    console.warn('[Larkinor UI] Dungeon position: quest data unavailable:', err);
    // The pending move was consumed above, so the chain is already broken:
    // leaving the previous cell standing would let the *next* page propagate
    // from a two-page-old position, in the direction of the step after the one
    // that reached it — and report a cell the player has never been in as
    // exact. A broken chain restarts rather than silently continuing.
    clearDungeonPosition(writePref);
    return null;
  }

  // Which quest to search first, most-proven first:
  //
  // 1. **the quest the previous position was in.** Within a chain of
  //    consecutive dungeon pages the quest cannot change — reaching another
  //    labyrinth means passing through a non-dungeon page, and every one of
  //    those clears the position — so this is the one candidate that is
  //    demonstrated rather than remembered.
  // 2. **the quest the game named as active**, royal only: an active royal
  //    quest says nothing about whether the player has wandered into a tavern
  //    labyrinth. It is what the game says the character is *doing*, which
  //    still beats what the reader last browsed — but it never expires (the
  //    game simply stops printing the line, which is indistinguishable from a
  //    page that never printed it), so it must not outrank a maze the player is
  //    provably standing in: `locateDungeonPosition` keeps the first quest in
  //    search order among ambiguous matches, and a stale active quest at the
  //    front attributes every ambiguous cell of the real labyrinth to it.
  // 3. the last quest browsed in the tab.
  const preferred = (previous?.set === set ? previous.questId : null)
    ?? (set === 'royal' ? readPref(ACTIVE_ROYAL_QUEST_PREF_KEY) : null)
    ?? readPref(questSelectedKey(set));

  const position = resolveDungeonPosition(
    narration, observation.sides, quests, preferred, previous, move,
  );

  try {
    writePref(QUEST_POSITION_PREF_KEY, position ? serialiseQuestPosition(position) : '');
    // An **exact** hit outside the remembered quest is the store being stale,
    // not the player being lost — move the selection so the grid opens on the
    // maze they are actually walking. An ambiguous match earns no such move: a
    // set of candidates is not evidence of which maze the player is in, and
    // relocating the tab on one would drag the reader away on nothing (a stale
    // active quest at the front of the search order used to do exactly that,
    // repeatedly and with no way back).
    if (position?.exact) writePref(questSelectedKey(position.set), position.questId);
  } catch (err) {
    console.warn('[Larkinor UI] Dungeon position: could not store the position:', err);
  }

  // Only a position the page's own words pinned may write a permanent mark —
  // `exact` alone is not the gate, because a propagated step is exact too.
  if (position?.exact && position.source === 'narration') {
    recordClearedCell(position, quests, observation, readPref, writePref);
  }

  return position;
}

/**
 * Mark the cell the player is standing on as cleared, when the page proves its
 * work is done.
 *
 * Only ever called for an **exact** position the *narration* pinned: a mark on
 * the wrong cell is worse than no mark, an ambiguous match has no single cell to
 * credit, and a mark is permanent, so only the page's own account of where the
 * player is may justify one.
 *
 * `exact` stopped implying "the page said so" the moment movement tracking
 * landed: a propagated step is exact whenever the walls leave one candidate.
 * Trusting that here would mark cells nobody visited — the game refuses a move,
 * the cell the player is still standing in prints nothing (about a quarter do),
 * the prediction wins, and the monster on the *predicted* cell is recorded as
 * killed. That includes the trap rule, which loses almost nothing by it: a
 * sprung trap prints text, and a false trap mark would be as permanent as any
 * other.
 *
 * Three rules, each comparing the page against the data:
 *
 * - a monster the data knows about, with neither the enemy silhouette nor an
 *   attack control on the page → killed;
 * - a question cell with no answer radios → answered;
 * - a trap cell → sprung, on arrival: a trap fires on entry, so standing here
 *   *is* the evidence.
 *
 * Nothing is written when the cell holds none of those, so an ordinary empty
 * room never accumulates a mark it does not deserve.
 */
function recordClearedCell(
  position: QuestPosition,
  quests: readonly Quest[],
  observation: DungeonObservation,
  readPref: ReadPref,
  writePref: WritePref,
): void {
  const quest = quests.find((q) => q.id === position.questId && q.set === position.set);
  const [at] = position.cells;
  const cell = quest?.cells.find((c) => c.row === at.row && c.col === at.col);
  if (!cell) return;

  const done = (cell.monsterId != null && !observation.enemy)
    || (cell.hasQuestion && !observation.question)
    || cell.trap;
  if (!done) return;

  try {
    const key = questClearedKey(position.set, position.questId);
    const cleared = parseCleared(readPref(key));
    const cellId = `${cell.row},${cell.col}`;
    if (cleared.has(cellId)) return;
    cleared.add(cellId);
    writePref(key, serialiseCleared(cleared));
  } catch (err) {
    console.warn('[Larkinor UI] Dungeon position: could not store the cleared cell:', err);
  }
}

/**
 * Forget any stored position.
 *
 * Called from every page that is not a dungeon, which is what keeps the marker
 * from outliving the visit. Cheap and idempotent, so both boots can call it
 * unconditionally rather than tracking whether anything was ever written.
 */
export function clearDungeonPosition(writePref: WritePref): void {
  try {
    writePref(QUEST_POSITION_PREF_KEY, '');
  } catch (err) {
    console.warn('[Larkinor UI] Dungeon position: could not clear the position:', err);
  }
}
