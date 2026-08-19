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
 * PrefStore key holding whether the quest's details block — the brief, the
 * reward and the stats line — is expanded. Only narrow viewports can collapse
 * it (see theme.css), so an absent value means collapsed: together those three
 * push the maze off a phone screen, and the maze is what the tab is for.
 */
export const QUEST_DETAILS_PREF_KEY = 'lc-quest-details-open';

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

/**
 * PrefStore key holding the serialised `QuestPosition` — which maze cell the
 * player was last detected in, written by the boots on every dungeon page and
 * cleared on every other page.
 *
 * Cleared rather than left to age out: a marker that outlives the labyrinth
 * visit would point at wherever the player was last seen, which reads exactly
 * like a live position. There is deliberately no timestamp — the page type is a
 * sharper answer to "are they still in there?" than any expiry could be.
 */
export const QUEST_POSITION_PREF_KEY = 'lc-quest-position';

/**
 * PrefStore key holding the serialised `Loadout` — what the player is wearing,
 * captured on every character-page visit. Read by the compare card on every
 * surface; written only by the boots' loadout capture.
 */
export const LOADOUT_PREF_KEY = 'lc-loadout';
