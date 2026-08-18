// Capturing the worn equipment when the character page is visited.
//
// Shared by both boots and injected with its writer (like activateQuestOffer),
// so the capture is testable without GM_* and the two boots cannot drift.

import { extractCharacter } from '@/utils/characterExtract';
import { LOADOUT_PREF_KEY, serializeLoadout } from '@/shared/loadout';

/**
 * Extracts and stores the loadout. Returns whether anything was written — a
 * page with no equipment block leaves the stored loadout untouched rather than
 * replacing it with five empty slots.
 */
export function captureLoadout(doc: Document, write: (key: string, value: string) => void): boolean {
  const loadout = extractCharacter(doc);
  if (!loadout) {
    console.warn('[Larkinor UI] Character page carried no equipment block — loadout not updated');
    return false;
  }
  write(LOADOUT_PREF_KEY, serializeLoadout(loadout));
  return true;
}
