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
 * set after, and a hit elsewhere moves the remembered selection too — so
 * walking into a different labyrinth fixes the store instead of silently
 * detecting nothing.
 *
 * Clears the stored position whenever nothing matches, which is a routine
 * outcome (about a quarter of cells print no text). A stale marker is worse than
 * no marker: it looks exactly like a live one.
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
    return null;
  }

  // What the game says the character is doing beats what the reader last
  // browsed — but only within the royal set, since an active royal quest says
  // nothing about whether the player has wandered into a tavern labyrinth.
  const preferred = (set === 'royal' ? readPref(ACTIVE_ROYAL_QUEST_PREF_KEY) : null)
    ?? readPref(questSelectedKey(set));

  const position = resolveDungeonPosition(
    narration, observation.sides, quests, preferred, previous, move,
  );

  try {
    writePref(QUEST_POSITION_PREF_KEY, position ? serialiseQuestPosition(position) : '');
    // A hit outside the remembered quest is the store being stale, not the
    // player being lost — move the selection so the grid opens on the maze they
    // are actually walking.
    if (position) writePref(questSelectedKey(position.set), position.questId);
  } catch (err) {
    console.warn('[Larkinor UI] Dungeon position: could not store the position:', err);
  }

  if (position?.exact) {
    recordClearedCell(position, quests, observation, readPref, writePref);
  }

  return position;
}

/**
 * Mark the cell the player is standing on as cleared, when the page proves its
 * work is done.
 *
 * Only ever called for an **exact** position: a mark on the wrong cell is worse
 * than no mark, and an ambiguous match has no single cell to credit.
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
