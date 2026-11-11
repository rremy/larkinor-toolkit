import { describe, it, expect, vi } from 'vitest';
import { h } from 'preact';
import { render, fireEvent } from '@testing-library/preact';
import type { IslandTile, MapData, SeaChart } from '@/shared/data';
import { indexChart } from '@/shared/seaChart';
import { SeaChartView, nearestHarbourDirection } from '@/database/map/SeaChartView';

/** A 5×5 chart: a harbour island in the north-west, a Thord-Artin-like tile, an unknown square. */
const chart: SeaChart = {
  rows: { min: -2, max: 2 },
  cols: { min: -2, max: 2 },
  squares: [
    { row: -2, col: -2, kind: 'land', district: 'harcos-negyed', harbour: true },
    { row: -2, col: -1, kind: 'land', district: 'sivatag' },
    { row: 2, col: 2, kind: 'unknown' },
    { row: 1, col: -2, kind: 'unexplored' },
    { row: 0, col: 2, kind: 'land', district: 'mocsár', harbour: true },
  ],
};
const islands: IslandTile[] = [
  { image: 'nagysziget/szig_2-10', row: 0, col: 2, island: 'Thord-Artin', name: 'Lápapály', district: 'mocsár' },
];
const city: MapData = { cells: [], edges: {} };
const idx = indexChart(chart, islands);
const here = { row: 0, col: 0, source: 'move' as const, at: 0 };

function squareAt(container: Element, row: number, col: number): Element | null {
  return container.querySelector(`.lc-sea-square[data-row="${row}"][data-col="${col}"]`);
}

describe('SeaChartView', () => {
  it('draws one square per position, as divs', () => {
    const { container } = render(h(SeaChartView, { index: idx, city, here: null, atSea: false }));
    expect(container.querySelectorAll('.lc-sea-square')).toHaveLength(25);
    expect(container.querySelector('table')).toBeNull();
  });

  it('marks the ship on its square at sea', () => {
    const { container } = render(h(SeaChartView, { index: idx, city, here, atSea: true }));
    const sq = squareAt(container, 0, 0)!;
    expect(sq.classList.contains('here')).toBe(true);
    expect(sq.textContent).toContain('⛵');
  });

  it('marks the player with a pin on land', () => {
    const { container } = render(h(SeaChartView, { index: idx, city, here: { ...here, row: -2, col: -1 }, atSea: false }));
    expect(squareAt(container, -2, -1)!.textContent).toContain('📍');
  });

  it('draws harbours, named by their island tile where one is known', () => {
    const { container } = render(h(SeaChartView, { index: idx, city, here: null, atSea: false }));
    const lapapaly = squareAt(container, 0, 2)!;
    expect(lapapaly.textContent).toContain('⚓');
    expect(lapapaly.getAttribute('title')).toContain('Lápapály');
    expect(squareAt(container, -2, -2)!.textContent).toContain('⚓');
  });

  it('tells land, unexplored and unknown squares apart', () => {
    const { container } = render(h(SeaChartView, { index: idx, city, here: null, atSea: false }));
    expect(squareAt(container, -2, -1)!.className).toContain('sivatag');
    expect(squareAt(container, 1, -2)!.className).toContain('unexplored');
    expect(squareAt(container, 2, 2)!.className).toContain('unknown');
    expect(squareAt(container, 1, 1)!.className).toContain('water');
  });

  it('draws only the squares inside the bounds it is given', () => {
    const { container } = render(h(SeaChartView, {
      index: idx, city, here, atSea: true, bounds: { minRow: -1, maxRow: 1, minCol: -1, maxCol: 1 },
    }));
    expect(container.querySelectorAll('.lc-sea-square')).toHaveLength(9);
  });

  it('reports the square clicked', () => {
    const onSelect = vi.fn();
    const { container } = render(h(SeaChartView, { index: idx, city, here: null, atSea: false, onSelect }));
    fireEvent.click(squareAt(container, -2, -1)!);
    expect(onSelect).toHaveBeenCalledWith(-2, -1);
  });

  it('marks the selected square', () => {
    const { container } = render(h(SeaChartView, { index: idx, city, here: null, atSea: false, selected: { row: 1, col: 1 } }));
    expect(squareAt(container, 1, 1)!.classList.contains('selected')).toBe(true);
  });
});

describe('nearestHarbourDirection', () => {
  it('is null when a harbour is in view', () => {
    expect(nearestHarbourDirection(idx, { row: 0, col: 0 }, { minRow: -1, maxRow: 1, minCol: -1, maxCol: 2 })).toBeNull();
  });

  it('points straight at a harbour that is off to one side', () => {
    expect(nearestHarbourDirection(idx, { row: 0, col: 0 }, { minRow: 0, maxRow: 0, minCol: 0, maxCol: 0 })).toBe('E');
  });

  it('points diagonally when the harbour is as far across as up', () => {
    const one = indexChart({ ...chart, squares: [chart.squares[0]] }, []);
    expect(nearestHarbourDirection(one, { row: 0, col: 0 }, { minRow: 0, maxRow: 0, minCol: 0, maxCol: 0 })).toBe('NW');
  });

  it('is null when the chart has no harbour at all', () => {
    const none = indexChart({ ...chart, squares: [] }, []);
    expect(nearestHarbourDirection(none, { row: 0, col: 0 }, { minRow: 0, maxRow: 0, minCol: 0, maxCol: 0 })).toBeNull();
  });
});
