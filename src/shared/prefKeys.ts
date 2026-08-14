// Preference keys shared by the userscript and the standalone database.
//
// A PrefStore (see its doc comment in src/database/DatabaseApp.tsx) is keyed
// by a plain string that its reader and writer must agree on. The reader
// (a view under src/database/**, GM-free) and the writer (a GM- or
// localStorage-backed store built elsewhere) are necessarily different
// modules, so the key itself needs one shared definition rather than two
// independent literals kept in sync by a comment — a single edit to either
// side would otherwise silently break persistence. This module holds nothing
// but such key definitions — constants, or the small functions that derive
// them — so importing it from src/database/** never pulls in a GM_*
// dependency.

import type { QuestSet } from './data/types';

/** PrefStore key holding the quest maze's last selected zoom (tile size). */
export const QUEST_TILE_PREF_KEY = 'lc-quest-tile-size';

/** PrefStore key holding which quest set the tab last showed. */
export const QUEST_SET_PREF_KEY = 'lc-quest-set';

/**
 * PrefStore key holding the last selected quest *within one set*.
 *
 * Per-set rather than a single key so switching to tavern, browsing, and
 * switching back returns to the royal quest you were on. It also keeps the
 * fallback correct: when a stored id no longer exists we fall back to the
 * first quest of the *stored set*, which is impossible to determine from a
 * selection key alone.
 */
export function questSelectedKey(set: QuestSet): string {
  return `lc-quest-selected-${set}`;
}

/**
 * The pre-set-switcher key, read once to seed `questSelectedKey('royal')` so
 * upgrading does not lose the user's position. Never written.
 */
export const LEGACY_QUEST_SELECTED_PREF_KEY = 'lc-quest-selected';
