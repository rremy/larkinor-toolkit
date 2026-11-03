// The city map tile the player was last seen on, as stored under
// `MAP_POSITION_PREF_KEY`. Written by the boots' capture on free-move pages
// (src/utils/captureMapPosition.ts), read by the map view — which also ships in
// the standalone bundle, hence a module of its own with no GM_* in reach.

/**
 * A tile id as the game names its pictures: `53`, and the few that encode no
 * row and column — `-15` north of row 0, `41-13` east of 68.
 */
const TILE_ID = /^-?\d+(?:-\d+)?$/;

/** A stored map position, or null when nothing usable is stored. */
export function parseMapPosition(raw: string | null): string | null {
  return raw && TILE_ID.test(raw) ? raw : null;
}
