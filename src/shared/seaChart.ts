// The archipelago chart as a lookup: what is on a square, which picture names
// an island tile, where the harbours are, and whether what a page shows around
// the player agrees with the chart.
//
// Shared by the userscript and the standalone database, so nothing here may
// reach a GM_* call or the live page.

import type { IslandTile, SeaChart, SeaSquare, Side } from './data';

/** What one side of a sea or island page shows (read by `src/utils/seaExtract.ts`). */
export type SeaSide = 'sea' | 'harbour' | 'land' | 'walk' | 'coast';

export interface ChartIndex {
  chart: SeaChart;
  /** The square at a position, or null for open sea. */
  squareAt(row: number, col: number): SeaSquare | null;
  tileByImage(image: string): IslandTile | null;
  tileAt(row: number, col: number): IslandTile | null;
  harbours: SeaSquare[];
  /** Every island tile with a known square. */
  tiles: IslandTile[];
  /** Whether a position lies on the chart at all. */
  contains(row: number, col: number): boolean;
}

export const STEP: Record<Side, { row: number; col: number }> = {
  N: { row: -1, col: 0 },
  S: { row: 1, col: 0 },
  E: { row: 0, col: 1 },
  W: { row: 0, col: -1 },
};

export const SIDES: readonly Side[] = ['N', 'E', 'S', 'W'];

const key = (row: number, col: number) => `${row},${col}`;

export function indexChart(chart: SeaChart, islands: IslandTile[]): ChartIndex {
  const squares = new Map(chart.squares.map((s) => [key(s.row, s.col), s]));
  const byImage = new Map(islands.map((t) => [t.image, t]));
  const byPos = new Map(islands.map((t) => [key(t.row, t.col), t]));
  return {
    chart,
    squareAt: (row, col) => squares.get(key(row, col)) ?? null,
    tileByImage: (image) => byImage.get(image) ?? null,
    tileAt: (row, col) => byPos.get(key(row, col)) ?? null,
    harbours: chart.squares.filter((s) => s.harbour),
    tiles: islands,
    contains: (row, col) =>
      row >= chart.rows.min && row <= chart.rows.max && col >= chart.cols.min && col <= chart.cols.max,
  };
}

/**
 * The harbour a building picture names. The game writes row and col one after
 * the other (`-2224` is (−22, 24), `13` is (1, 3)), so every split is tried
 * against the known harbours and only a single match is taken.
 */
export function harbourById(index: ChartIndex, id: string): SeaSquare | null {
  const matches: SeaSquare[] = [];
  for (let cut = 1; cut < id.length; cut += 1) {
    const rowText = id.slice(0, cut);
    const colText = id.slice(cut);
    if (!/^-?\d+$/.test(rowText) || !/^\d+$/.test(colText)) continue;
    const square = index.squareAt(Number(rowText), Number(colText));
    if (square?.harbour && !matches.includes(square)) matches.push(square);
  }
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Whether the sides a page draws contradict the chart at (row, col).
 *
 * At sea both ways count: open sea where the chart has anything, or land or a
 * harbour where it has open sea. Land beside a chart harbour and a harbour
 * beside chart land are tolerated, since an unfinished harbour may draw either.
 * On an island only a walkable side where the chart has sea counts: the
 * chart's island interiors are approximate, so coast beside chart land says
 * nothing. A square of kind `unknown`, or off the chart, is never evidence.
 */
export function contradicts(
  index: ChartIndex,
  row: number,
  col: number,
  place: 'sea' | 'island',
  sides: Partial<Record<Side, SeaSide>>,
): boolean {
  for (const side of SIDES) {
    const shown = sides[side];
    if (!shown) continue;
    const r = row + STEP[side].row;
    const c = col + STEP[side].col;
    if (!index.contains(r, c)) continue;
    const square = index.squareAt(r, c);
    if (square?.kind === 'unknown') continue;
    const open = square === null;
    if (place === 'sea') {
      if (shown === 'sea' && !open) return true;
      if ((shown === 'land' || shown === 'harbour') && open) return true;
    } else if (shown === 'walk' && open) {
      return true;
    }
  }
  return false;
}
