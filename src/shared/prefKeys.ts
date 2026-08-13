// Preference keys shared by the userscript and the standalone database.
//
// A PrefStore (see its doc comment in src/database/DatabaseApp.tsx) is keyed
// by a plain string that its reader and writer must agree on. The reader
// (a view under src/database/**, GM-free) and the writer (a GM- or
// localStorage-backed store built elsewhere) are necessarily different
// modules, so the key itself needs one shared definition rather than two
// independent literals kept in sync by a comment — a single edit to either
// side would otherwise silently break persistence. This module holds nothing
// but such string constants, so importing it from src/database/** never pulls
// in a GM_* dependency.

/** PrefStore key holding the quest maze's last selected zoom (tile size). */
export const QUEST_TILE_PREF_KEY = 'lc-quest-tile-size';
