// Turning the game's own "Aktuális küldetés: (39)" into a database selection.
//
// Sits between the pure parser (`activeQuest`) and the boot modules, taking its
// preference access as injected collaborators so it stays testable without
// GM_* — the same shape as `activateQuestOffer` and `activateDungeonPosition`.

import { findActiveQuest, type ActiveQuestMention } from './activeQuest';
import { ACTIVE_ROYAL_QUEST_PREF_KEY, questSelectedKey } from '@/shared/prefKeys';
import type { ReadPref, WritePref } from './activateDungeonPosition';

/**
 * Remember the active royal quest, and pre-select it **only when it changed**.
 *
 * Accepting a new quest is the moment pre-selecting helps; every page load
 * afterwards is when it would fight a player who deliberately opened some other
 * quest to read it. The same restraint `activateQuestOffer` applies by writing
 * only on a match.
 *
 * Deliberately never writes `lc-quest-set`: ordinary city pages print this
 * line, so switching the set here would pull a player mid-way through a tavern
 * quest back to royal on every step. The set moves only when the player clicks
 * the link, which routes explicitly.
 *
 * Failures are swallowed — a missed pre-selection is never a reason to break
 * the page — and the mention is still returned so the caller can render its
 * link.
 */
export function activateActiveQuest(
  narration: string,
  readPref: ReadPref,
  writePref: WritePref,
): ActiveQuestMention | null {
  const mention = findActiveQuest(narration);
  if (!mention) return null;

  try {
    const previous = readPref(ACTIVE_ROYAL_QUEST_PREF_KEY);
    writePref(ACTIVE_ROYAL_QUEST_PREF_KEY, mention.questId);
    if (previous !== mention.questId) writePref(questSelectedKey('royal'), mention.questId);
  } catch (err) {
    console.warn('[Larkinor UI] Active quest: could not store the selection:', err);
  }

  return mention;
}
