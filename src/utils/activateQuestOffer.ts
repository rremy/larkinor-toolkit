// Turning a recognised pub quest into a database selection.
//
// Sits between the pure matcher (`questOffer`) and the boot modules: it does
// the data fetch and the preference writes, but takes both as injected
// collaborators so it stays testable without GM_* or the network.

import type { DataLoader, Quest } from '@/shared/data';
import { QUEST_SET_PREF_KEY, questSelectedKey } from '@/shared/prefKeys';
import { matchTavernQuest, type QuestOfferMatch } from './questOffer';

/** Writes one preference. In the userscript this is `setPref` (GM-backed). */
export type WritePref = (key: string, value: string) => void;

/**
 * Identify the tavern quest a pub narration offers and pre-select it in the
 * quest database, so opening the tab lands on it.
 *
 * Only writes on a match. A pub visit with no quest note leaves the player's
 * current selection untouched — activating the wrong quest, or clobbering a
 * quest they were mid-way through reading, is worse than doing nothing.
 *
 * The tavern data is ~1.4MB, so this deliberately runs only on pub pages;
 * `gmSource` caches it, making every visit after the first a local read.
 * Failures are swallowed: a quest that cannot be recognised is a missed
 * convenience, never a reason to break the page.
 */
export async function activateQuestOffer(
  narration: string,
  loader: DataLoader,
  writePref: WritePref,
): Promise<QuestOfferMatch | null> {
  if (!narration.trim()) return null;

  let quests: Quest[];
  try {
    quests = await loader.loadTavernQuests();
  } catch (err) {
    console.warn('[Larkinor UI] Quest offer: tavern data unavailable:', err);
    return null;
  }

  const match = matchTavernQuest(narration, quests);
  if (!match) return null;

  try {
    writePref(QUEST_SET_PREF_KEY, 'tavern');
    writePref(questSelectedKey('tavern'), match.quest.id);
  } catch (err) {
    // A failed write costs the pre-selection, not the note: the caller still
    // gets the match and can still offer the link.
    console.warn('[Larkinor UI] Quest offer: could not store the selection:', err);
  }

  return match;
}
