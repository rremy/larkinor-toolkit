import { h } from 'preact';
import { render, screen, fireEvent, waitFor } from '@testing-library/preact';
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { MapTab } from '@/database/map/MapTab';
import type { DataLoader, IslandTile, MapData, SeaChart } from '@/shared/data';
import type { PrefStore } from '@/database/DatabaseApp';
import { MAP_MODE_PREF_KEY, SEA_POSITION_PREF_KEY } from '@/shared/prefKeys';
import { parseSeaPosition, serializeSeaPosition, SEA_POSITION_EVENT, type SeaPosition } from '@/shared/seaPosition';

const chart: SeaChart = JSON.parse(readFileSync('static/db/sea-chart.json', 'utf-8'));
const islands: IslandTile[] = JSON.parse(readFileSync('static/db/islands.json', 'utf-8'));

const map: MapData = {
  cells: [{
    imageId: '13', imageSrc: '/tajk/13.gif', district: 'kezdő-negyed',
    buildings: [{ name: 'kikötő', icon: 'kikoto.gif' }], clanHouses: [], exits: {}, blockers: {}, firstCoords: [0, 0],
  }],
  edges: {},
};

function makeLoader(failSea = false): DataLoader {
  return {
    loadWeapons: async () => [], loadArmors: async () => [], loadItems: async () => [],
    loadMonsters: async () => ({}) as never,
    loadMap: async () => map,
    loadItemShops: async () => ({ shops: [] }),
    loadWeaponShops: async () => ({ shops: [] }),
    loadQuests: async () => [], loadTavernQuests: async () => [],
    loadSeaChart: failSea ? () => Promise.reject(new Error('offline')) : async () => chart,
    loadIslands: async () => islands,
  };
}

function storeWith(values: Record<string, string>): PrefStore & { values: Record<string, string> } {
  return { values, read: (key) => values[key] ?? null, write: (key, value) => { values[key] = value; } };
}

const at = (row: number, col: number, source: SeaPosition['source'] = 'move', image?: string) =>
  serializeSeaPosition({ row, col, source, at: 0, ...(image ? { image } : {}) });

function cell(id: string): Element | null {
  return document.querySelector(`td.cell[data-id="${id}"]`);
}

function square(row: number, col: number): Element | null {
  return document.querySelector(`.lc-sea-square[data-row="${row}"][data-col="${col}"]`);
}

const pressed = () => document.querySelector('.map-mode-switch button[aria-pressed="true"]')?.textContent;

describe('MapTab — the map of where you are', () => {
  it('opens on Larkinor in town', async () => {
    render(h(MapTab, { loader: makeLoader(), prefStore: storeWith({ [SEA_POSITION_PREF_KEY]: at(4, 4, 'city') }) }));
    await waitFor(() => expect(pressed()).toBe('Larkinor'));
  });

  it('opens on Larkinor on the strip north of row 0', async () => {
    render(h(MapTab, { loader: makeLoader(), prefStore: storeWith({ [SEA_POSITION_PREF_KEY]: at(-1, 4, 'city') }) }));
    await waitFor(() => expect(pressed()).toBe('Larkinor'));
  });

  it('opens on Thord-Artin on one of its tiles, the player marked', async () => {
    render(h(MapTab, { loader: makeLoader(), prefStore: storeWith({ [SEA_POSITION_PREF_KEY]: at(-22, 25, 'tile', 'nagysziget/szig_3-10') }) }));
    await waitFor(() => expect(cell('nagysziget/szig_3-10')?.classList.contains('here')).toBe(true));
    expect(pressed()).toBe('Thord-Artin');
    expect(cell('nagysziget/szig_3-10')!.querySelector('.row-id')?.textContent).toBe('Kígyófa');
  });

  it('opens on the sea chart on the ship', async () => {
    render(h(MapTab, { loader: makeLoader(), prefStore: storeWith({ [SEA_POSITION_PREF_KEY]: at(-7, -3) }) }));
    await waitFor(() => expect(square(-7, -3)?.classList.contains('here')).toBe(true));
    expect(pressed()).toBe('Tenger');
  });

  it('shows an island with no map of its own on the sea chart', async () => {
    render(h(MapTab, { loader: makeLoader(), prefStore: storeWith({ [SEA_POSITION_PREF_KEY]: at(-24, 1, 'tile', 'szighar/szighar_1-1') }) }));
    await waitFor(() => expect(pressed()).toBe('Tenger'));
  });

  it('draws Thord-Artin in the city map’s style, and only Thord-Artin', async () => {
    render(h(MapTab, { loader: makeLoader(), prefStore: storeWith({ [SEA_POSITION_PREF_KEY]: at(-22, 25, 'tile', 'nagysziget/szig_3-10') }) }));
    await waitFor(() => expect(cell('nagysziget/szig_2-10')).not.toBeNull());
    expect(document.querySelector('table.map-grid')).not.toBeNull();
    expect(cell('nagysziget/szig_2-10')!.className).toContain('mocsar');
    expect(cell('13')).toBeNull();
  });

  it('follows the player to another place while they have not picked a map', async () => {
    const store = storeWith({ [SEA_POSITION_PREF_KEY]: at(4, 4, 'city') });
    render(h(MapTab, { loader: makeLoader(), prefStore: store }));
    await waitFor(() => expect(pressed()).toBe('Larkinor'));
    store.values[SEA_POSITION_PREF_KEY] = at(-22, 24, 'tile', 'nagysziget/szig_2-10');
    document.dispatchEvent(new CustomEvent(SEA_POSITION_EVENT));
    await waitFor(() => expect(pressed()).toBe('Thord-Artin'));
    await waitFor(() => expect(cell('nagysziget/szig_2-10')?.classList.contains('here')).toBe(true));
  });

  it('keeps a map the player picked', async () => {
    const store = storeWith({ [SEA_POSITION_PREF_KEY]: at(4, 4, 'city') });
    render(h(MapTab, { loader: makeLoader(), prefStore: store }));
    fireEvent.click(screen.getByRole('button', { name: 'Tenger' }));
    expect(store.values[MAP_MODE_PREF_KEY]).toBe('sea');
    store.values[SEA_POSITION_PREF_KEY] = at(-22, 24, 'tile', 'nagysziget/szig_2-10');
    document.dispatchEvent(new CustomEvent(SEA_POSITION_EVENT));
    await new Promise((r) => setTimeout(r, 0));
    expect(pressed()).toBe('Tenger');
  });

  it('goes back to the map of where you are when asked again (the minimap’s click)', async () => {
    const store = storeWith({ [SEA_POSITION_PREF_KEY]: at(-7, -3) });
    const { rerender } = render(h(MapTab, { loader: makeLoader(), prefStore: store, placeRequest: 1 }));
    fireEvent.click(screen.getByRole('button', { name: 'Larkinor' }));
    rerender(h(MapTab, { loader: makeLoader(), prefStore: store, placeRequest: 2 }));
    await waitFor(() => expect(pressed()).toBe('Tenger'));
  });

  it('opens on the remembered map when there is no position (the standalone site)', async () => {
    render(h(MapTab, { loader: makeLoader(), prefStore: storeWith({ [MAP_MODE_PREF_KEY]: 'thord-artin' }) }));
    await waitFor(() => expect(pressed()).toBe('Thord-Artin'));
  });

  it('obeys a routed city cell and the #map/sea route', async () => {
    const { unmount } = render(h(MapTab, { loader: makeLoader(), targetCellId: '13', prefStore: storeWith({ [SEA_POSITION_PREF_KEY]: at(-7, -3) }) }));
    await waitFor(() => expect(pressed()).toBe('Larkinor'));
    unmount();
    render(h(MapTab, { loader: makeLoader(), targetCellId: 'sea', prefStore: storeWith({}) }));
    await waitFor(() => expect(pressed()).toBe('Tenger'));
  });
});

describe('MapTab — squares and their details', () => {
  it('shows a Thord-Artin tile with its name, district and buildings', async () => {
    render(h(MapTab, { loader: makeLoader(), prefStore: storeWith({ [MAP_MODE_PREF_KEY]: 'thord-artin' }) }));
    await waitFor(() => expect(cell('nagysziget/szig_2-10')).not.toBeNull());
    fireEvent.click(cell('nagysziget/szig_2-10')!);
    expect(screen.getByRole('heading', { name: /Lápapály/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /mocsár/ })).toBeTruthy();
    const places = document.querySelector('.cell-detail ul.list')!.textContent!;
    expect(places).toContain('kikötő');
    expect(places).not.toContain('szükséges');
  });

  it('shows the stone an unfinished harbour still needs', async () => {
    render(h(MapTab, { loader: makeLoader(), prefStore: storeWith({ [MAP_MODE_PREF_KEY]: 'thord-artin' }) }));
    await waitFor(() => expect(cell('nagysziget/szig_5-1')).not.toBeNull());
    fireEvent.click(cell('nagysziget/szig_5-1')!);
    expect(screen.getByText(/493575 építőkő szükséges/)).toBeTruthy();
  });

  it('shows the city cell detail for a square of the city block on the sea chart', async () => {
    render(h(MapTab, { loader: makeLoader(), targetCellId: 'sea', prefStore: storeWith({}) }));
    await waitFor(() => expect(square(1, 3)).not.toBeNull());
    fireEvent.click(square(1, 3)!);
    expect(screen.getByRole('heading', { name: /kezdő-negyed/ })).toBeTruthy();
  });

  it('moves the detail panel along with the player until a square is picked', async () => {
    const store = storeWith({ [SEA_POSITION_PREF_KEY]: at(-6, -3) });
    render(h(MapTab, { loader: makeLoader(), prefStore: store }));
    expect(await screen.findByText('sor -6 · oszlop -3')).toBeTruthy();
    store.values[SEA_POSITION_PREF_KEY] = at(-7, -3);
    document.dispatchEvent(new CustomEvent(SEA_POSITION_EVENT));
    expect(await screen.findByText('sor -7 · oszlop -3')).toBeTruthy();
  });

  it('lets the player set their square by hand, in-game only, and tells the page', async () => {
    const heard = vi.fn();
    document.addEventListener(SEA_POSITION_EVENT, heard);
    const store = storeWith({});
    render(h(MapTab, { loader: makeLoader(), targetCellId: 'sea', prefStore: store, tracksPosition: true }));
    await waitFor(() => expect(square(-7, -3)).not.toBeNull());
    fireEvent.click(square(-7, -3)!);
    fireEvent.click(screen.getByRole('button', { name: /Itt állok/ }));
    expect(parseSeaPosition(store.values[SEA_POSITION_PREF_KEY])).toMatchObject({ row: -7, col: -3, source: 'manual' });
    expect(heard).toHaveBeenCalled();
    await waitFor(() => expect(square(-7, -3)?.classList.contains('here')).toBe(true));
    document.removeEventListener(SEA_POSITION_EVENT, heard);
  });

  it('offers no hand-set position on the standalone site', async () => {
    render(h(MapTab, { loader: makeLoader(), targetCellId: 'sea', prefStore: storeWith({}) }));
    await waitFor(() => expect(square(-7, -3)).not.toBeNull());
    fireEvent.click(square(-7, -3)!);
    expect(screen.queryByRole('button', { name: /Itt állok/ })).toBeNull();
  });

  it('draws no marker and no jump button without a stored position', async () => {
    render(h(MapTab, { loader: makeLoader(), targetCellId: 'sea', prefStore: storeWith({}) }));
    await waitFor(() => expect(square(0, 3)).not.toBeNull());
    expect(document.querySelector('.lc-sea-square.here')).toBeNull();
    expect(screen.queryByRole('button', { name: /Ugrás a helyemre/ })).toBeNull();
  });

  it('says so when the chart cannot be loaded', async () => {
    render(h(MapTab, { loader: makeLoader(true), targetCellId: 'sea', prefStore: storeWith({}) }));
    expect(await screen.findByText('Nem sikerült betölteni a tengeri térképet.')).toBeTruthy();
  });
});
