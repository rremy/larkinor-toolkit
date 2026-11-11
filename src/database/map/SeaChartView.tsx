import { h, type JSX } from 'preact';
import { useMemo } from 'preact/hooks';
import type { MapData, Side } from '@/shared/data';
import type { ChartIndex } from '@/shared/seaChart';
import type { SeaPosition } from '@/shared/seaPosition';
import { DISTRICT_CLASS, layoutCells } from './mapMeta';

/** The rows and columns to draw, inclusive. */
export interface ChartBounds {
  minRow: number;
  maxRow: number;
  minCol: number;
  maxCol: number;
}

export type ChartDirection = Side | 'NE' | 'NW' | 'SE' | 'SW';

export interface SeaChartViewProps {
  index: ChartIndex;
  /** The city map, whose cells name the districts of the city block. */
  city: MapData | null;
  here: SeaPosition | null;
  /** The part of the chart to draw; the whole chart when absent. */
  bounds?: ChartBounds;
  selected?: { row: number; col: number } | null;
  onSelect?: (row: number, col: number) => void;
  /** The player is on the ship (⛵) rather than on land (📍). */
  atSea: boolean;
}

/** District → CSS class: the city map's, plus the two only islands have. */
const DISTRICT: Record<string, string> = { ...DISTRICT_CLASS, 'sivatag': 'sivatag', 'hegység': 'hegyseg' };

/**
 * The archipelago as a CSS grid of `<div>`s — never a table: the in-game page
 * runs in quirks mode, where table cells lose the inherited colour (CLAUDE.md).
 * Used whole in the database's map tab and as a window around the player.
 */
export function SeaChartView(props: SeaChartViewProps): JSX.Element {
  const { index, city, here, selected = null, onSelect, atSea } = props;
  const { chart } = index;
  const bounds = props.bounds ?? {
    minRow: chart.rows.min, maxRow: chart.rows.max, minCol: chart.cols.min, maxCol: chart.cols.max,
  };

  // City cells name the districts of the city block more exactly than the chart.
  const cityDistricts = useMemo(() => {
    const out = new Map<string, { district: string; id: string }>();
    if (!city) return out;
    const positions = layoutCells(city.cells, city.edges ?? {});
    for (const cell of city.cells) {
      const pos = positions.get(cell.imageId);
      if (pos) out.set(`${pos.row},${pos.col}`, { district: cell.district, id: cell.imageId });
    }
    return out;
  }, [city]);

  const cols = bounds.maxCol - bounds.minCol + 1;
  const squares: JSX.Element[] = [];
  for (let row = bounds.minRow; row <= bounds.maxRow; row += 1) {
    for (let col = bounds.minCol; col <= bounds.maxCol; col += 1) {
      const square = index.squareAt(row, col);
      const tile = index.tileAt(row, col);
      const cityCell = cityDistricts.get(`${row},${col}`);
      const district = cityCell?.district ?? tile?.district ?? square?.district;
      const isHere = here !== null && here.row === row && here.col === col;
      const classes = ['lc-sea-square'];
      if (!square) classes.push('water');
      else if (square.kind !== 'land') classes.push(square.kind);
      else classes.push(DISTRICT[district ?? ''] ?? 'land');
      if (square?.harbour) classes.push('harbour');
      if (isHere) classes.push('here');
      if (selected && selected.row === row && selected.col === col) classes.push('selected');
      const title = [tile?.name, cityCell ? `${cityCell.id}` : null, square?.harbour ? 'kikötő' : null, district]
        .filter(Boolean).join(' · ') || (square ? 'szárazföld' : 'tenger');
      squares.push(
        <div
          key={`${row},${col}`}
          class={classes.join(' ')}
          data-row={row}
          data-col={col}
          title={title}
          onClick={onSelect ? () => onSelect(row, col) : undefined}
        >
          {isHere ? <span class="lc-sea-here">{atSea ? '⛵' : '📍'}</span> : square?.harbour ? '⚓' : null}
        </div>,
      );
    }
  }
  return (
    <div class="lc-sea-chart" style={{ gridTemplateColumns: `repeat(${cols}, var(--sea-cell))` }}>
      {squares}
    </div>
  );
}

/**
 * Which way the nearest harbour lies when none is inside `bounds`; null when
 * one is in view or the chart has none. Diagonal when it is about as far across
 * as up or down.
 */
export function nearestHarbourDirection(
  index: ChartIndex,
  here: { row: number; col: number },
  bounds: ChartBounds,
): ChartDirection | null {
  const inView = (r: number, c: number) =>
    r >= bounds.minRow && r <= bounds.maxRow && c >= bounds.minCol && c <= bounds.maxCol;
  if (index.harbours.length === 0 || index.harbours.some((h) => inView(h.row, h.col))) return null;
  let best = index.harbours[0];
  let bestDist = Infinity;
  for (const harbour of index.harbours) {
    const d = (harbour.row - here.row) ** 2 + (harbour.col - here.col) ** 2;
    if (d < bestDist) { best = harbour; bestDist = d; }
  }
  const dr = best.row - here.row;
  const dc = best.col - here.col;
  const vertical = dr < 0 ? 'N' : 'S';
  const horizontal = dc < 0 ? 'W' : 'E';
  if (Math.abs(dr) > 2 * Math.abs(dc)) return vertical;
  if (Math.abs(dc) > 2 * Math.abs(dr)) return horizontal;
  return `${vertical}${horizontal}` as ChartDirection;
}
