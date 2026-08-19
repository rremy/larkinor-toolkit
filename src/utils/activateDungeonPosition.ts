// Turning a dungeon page into a marker on the quest maze.
//
// Sits between the pure matcher (`dungeonPosition`) and the boot modules: it
// does the data fetch and the preference writes, but takes both as injected
// collaborators so it stays testable without GM_* or the network. Same shape,
// and the same reasons, as `activateQuestOffer`.

import type { DataLoader, Quest, QuestSet } from '@/shared/data';
import { QUEST_POSITION_PREF_KEY, QUEST_SET_PREF_KEY, questSelectedKey } from '@/shared/prefKeys';
import { serialiseQuestPosition, type QuestPosition } from '@/shared/questPosition';
import { locateDungeonPosition, type SideObservations } from './dungeonPosition';

/** Writes one preference. In the userscript this is `setPref` (GM-backed). */
export type WritePref = (key: string, value: string) => void;
/** Reads one preference. In the userscript this is `getPref` (GM-backed). */
export type ReadPref = (key: string) => string | null;

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
 * Within that set the search is self-correcting: `locateDungeonPosition` tries
 * the remembered quest first and the rest of the set after, and a hit elsewhere
 * moves the remembered selection too — so walking into a different labyrinth
 * fixes the store instead of silently detecting nothing.
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
  observed: SideObservations,
  loader: DataLoader,
  readPref: ReadPref,
  writePref: WritePref,
): Promise<QuestPosition | null> {
  const storedSet = readPref(QUEST_SET_PREF_KEY);
  const set: QuestSet = isQuestSet(storedSet) ? storedSet : 'royal';

  let quests: Quest[];
  try {
    quests = set === 'tavern' ? await loader.loadTavernQuests() : await loader.loadQuests();
  } catch (err) {
    console.warn('[Larkinor UI] Dungeon position: quest data unavailable:', err);
    return null;
  }

  const position = locateDungeonPosition(narration, observed, quests, readPref(questSelectedKey(set)));

  try {
    writePref(QUEST_POSITION_PREF_KEY, position ? serialiseQuestPosition(position) : '');
    // A hit outside the remembered quest is the store being stale, not the
    // player being lost — move the selection so the grid opens on the maze they
    // are actually walking.
    if (position) writePref(questSelectedKey(position.set), position.questId);
  } catch (err) {
    console.warn('[Larkinor UI] Dungeon position: could not store the position:', err);
  }

  return position;
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
