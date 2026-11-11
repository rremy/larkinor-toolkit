// Where the player is in the archipelago, as stored under
// `SEA_POSITION_PREF_KEY`. Written by the boots (src/utils/activateSeaPosition.ts),
// read by the sea window and the database's sea chart — which also ships in
// the standalone bundle, hence a module of its own with no GM_* in reach.

/** How the position was arrived at. */
export type SeaPositionSource = 'city' | 'harbour' | 'departure' | 'move' | 'tile' | 'manual';

const SOURCES: readonly SeaPositionSource[] = ['city', 'harbour', 'departure', 'move', 'tile', 'manual'];

/** A square of the city map's grid, extended over the sea. */
export interface SeaPosition {
  row: number;
  col: number;
  source: SeaPositionSource;
  /** When it was written (ms since the epoch). */
  at: number;
}

/** A stored position, or null when nothing usable is stored. */
export function parseSeaPosition(raw: string | null): SeaPosition | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<SeaPosition>;
    if (!Number.isInteger(v.row) || !Number.isInteger(v.col)) return null;
    if (!SOURCES.includes(v.source as SeaPositionSource) || typeof v.at !== 'number') return null;
    return { row: v.row as number, col: v.col as number, source: v.source as SeaPositionSource, at: v.at };
  } catch {
    return null;
  }
}

export function serializeSeaPosition(p: SeaPosition): string {
  return JSON.stringify(p);
}

/** Whether a position lies on the city's own 10×10 block. */
export function isInCity(p: { row: number; col: number }): boolean {
  return p.row >= 0 && p.row <= 9 && p.col >= 0 && p.col <= 9;
}
