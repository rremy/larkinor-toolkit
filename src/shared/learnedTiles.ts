// Island tiles the toolkit has learned the position of, by their picture.
//
// Islands other than Thord-Artin name their tiles with pictures that do not
// say where the tile is (`szighar/szighar_1-1`). When the player steps onto
// one from a square the page has just confirmed, the picture is remembered
// against that square, so seeing it again pins the position outright.
//
// Shared between characters (a fact about the game) and never expiring, so an
// entry is guarded: a picture later seen on a different square is flagged as a
// conflict and never pins again.

export interface LearnedTile {
  row: number;
  col: number;
  conflict?: true;
}

export type LearnedTiles = Record<string, LearnedTile>;

export function parseLearnedTiles(raw: string | null): LearnedTiles {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as Record<string, Partial<LearnedTile>>;
    if (!v || typeof v !== 'object') return {};
    const out: LearnedTiles = {};
    for (const [image, t] of Object.entries(v)) {
      if (!Number.isInteger(t?.row) || !Number.isInteger(t?.col)) continue;
      out[image] = { row: t.row as number, col: t.col as number, ...(t.conflict ? { conflict: true } : {}) };
    }
    return out;
  } catch {
    return {};
  }
}

export function serializeLearnedTiles(tiles: LearnedTiles): string {
  return JSON.stringify(tiles);
}

/** Record a picture seen on a square; a second, different square flags a conflict. */
export function recordTile(tiles: LearnedTiles, image: string, row: number, col: number): LearnedTiles {
  const known = tiles[image];
  if (!known) return { ...tiles, [image]: { row, col } };
  if (known.conflict || (known.row === row && known.col === col)) return tiles;
  return { ...tiles, [image]: { ...known, conflict: true } };
}

/** The square a picture pins, or null when it is unknown or conflicting. */
export function pinnedSquare(tiles: LearnedTiles, image: string): { row: number; col: number } | null {
  const t = tiles[image];
  return t && !t.conflict ? { row: t.row, col: t.col } : null;
}
