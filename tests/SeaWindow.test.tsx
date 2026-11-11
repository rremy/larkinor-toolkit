import { describe, it, expect, vi } from 'vitest';
import { h } from 'preact';
import { render, screen, fireEvent, waitFor } from '@testing-library/preact';
import { readFileSync } from 'node:fs';
import type { DataLoader, IslandTile, SeaChart } from '@/shared/data';
import { SEA_POSITION_PREF_KEY } from '@/shared/prefKeys';
import { serializeSeaPosition } from '@/shared/seaPosition';
import { SeaWindow } from '@/components/SeaWindow';

const chart: SeaChart = JSON.parse(readFileSync('static/db/sea-chart.json', 'utf-8'));
const islands: IslandTile[] = JSON.parse(readFileSync('static/db/islands.json', 'utf-8'));

function makeLoader(fail = false): DataLoader {
  return {
    loadSeaChart: fail ? () => Promise.reject(new Error('offline')) : async () => chart,
    loadIslands: async () => islands,
    loadMap: async () => ({ cells: [], edges: {} }),
  } as unknown as DataLoader;
}

const readAt = (row: number, col: number) => (key: string) =>
  key === SEA_POSITION_PREF_KEY ? serializeSeaPosition({ row, col, source: 'move', at: 0 }) : null;

describe('SeaWindow', () => {
  it('draws 13 × 11 squares with the ship in the middle', async () => {
    const { container } = render(h(SeaWindow, { loader: makeLoader(), readPref: readAt(-7, -3), atSea: true, onOpenChart: vi.fn() }));
    await waitFor(() => expect(container.querySelectorAll('.lc-sea-square')).toHaveLength(143));
    const here = container.querySelector('.lc-sea-square.here')!;
    expect(here.getAttribute('data-row')).toBe('-7');
    expect(here.getAttribute('data-col')).toBe('-3');
    expect(here.textContent).toContain('⛵');
  });

  it('points toward the nearest harbour when none is in view', async () => {
    const { container } = render(h(SeaWindow, { loader: makeLoader(), readPref: readAt(-7, -3), atSea: true, onOpenChart: vi.fn() }));
    await waitFor(() => expect(container.querySelector('.lc-sea-arrow')).not.toBeNull());
    expect(container.querySelector('.lc-sea-arrow')!.getAttribute('data-dir')).toBe('SE'); // harbour 13 at (1, 3)
  });

  it('shows no arrow when a harbour is in view', async () => {
    const { container } = render(h(SeaWindow, { loader: makeLoader(), readPref: readAt(0, 3), atSea: true, onOpenChart: vi.fn() }));
    await waitFor(() => expect(container.querySelectorAll('.lc-sea-square')).toHaveLength(143));
    expect(container.querySelector('.lc-sea-arrow')).toBeNull();
  });

  it('says the position is lost when none is stored', async () => {
    render(h(SeaWindow, { loader: makeLoader(), readPref: () => null, atSea: true, onOpenChart: vi.fn() }));
    expect(await screen.findByText(/Elvesztettük a helyzeted/)).toBeTruthy();
  });

  it('opens the full chart when clicked', async () => {
    const onOpenChart = vi.fn();
    const { container } = render(h(SeaWindow, { loader: makeLoader(), readPref: readAt(-7, -3), atSea: true, onOpenChart }));
    await waitFor(() => expect(container.querySelector('.lc-sea-chart')).not.toBeNull());
    fireEvent.click(container.querySelector('.lc-sea-chart')!);
    expect(onOpenChart).toHaveBeenCalledTimes(1);
  });

  it('says so when the chart cannot be loaded', async () => {
    render(h(SeaWindow, { loader: makeLoader(true), readPref: readAt(-7, -3), atSea: true, onOpenChart: vi.fn() }));
    expect(await screen.findByText('Nem sikerült betölteni a tengeri térképet.')).toBeTruthy();
  });

  it('reads the position again when told the page has resolved it', async () => {
    let row = -7;
    const readPref = (key: string) => (key === SEA_POSITION_PREF_KEY ? serializeSeaPosition({ row, col: -3, source: 'move', at: 0 }) : null);
    const { container, rerender } = render(h(SeaWindow, { loader: makeLoader(), readPref, atSea: true, version: 0, onOpenChart: vi.fn() }));
    await waitFor(() => expect(container.querySelector('.lc-sea-square.here')?.getAttribute('data-row')).toBe('-7'));
    row = -8;
    rerender(h(SeaWindow, { loader: makeLoader(), readPref, atSea: true, version: 1, onOpenChart: vi.fn() }));
    await waitFor(() => expect(container.querySelector('.lc-sea-square.here')?.getAttribute('data-row')).toBe('-8'));
  });
});
