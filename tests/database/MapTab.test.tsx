import { h } from 'preact';
import { render, screen, fireEvent, waitFor } from '@testing-library/preact';
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { MapTab } from '@/database/map/MapTab';
import type { DataLoader, IslandTile, MapData, SeaChart } from '@/shared/data';
import type { PrefStore } from '@/database/DatabaseApp';
import { MAP_MODE_PREF_KEY, SEA_POSITION_PREF_KEY } from '@/shared/prefKeys';
import { parseSeaPosition, serializeSeaPosition, SEA_POSITION_EVENT } from '@/shared/seaPosition';

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

const at = (row: number, col: number) => serializeSeaPosition({ row, col, source: 'move', at: 0 });

function square(row: number, col: number): Element | null {
  return document.querySelector(`.lc-sea-square[data-row="${row}"][data-col="${col}"]`);
}

describe('MapTab', () => {
  it('opens on the sea chart with the ship marked when the player is off the city island', async () => {
    render(h(MapTab, { loader: makeLoader(), prefStore: storeWith({ [SEA_POSITION_PREF_KEY]: at(-7, -3) }) }));
    await waitFor(() => expect(square(-7, -3)?.classList.contains('here')).toBe(true));
    expect(screen.getByRole('button', { name: 'Tenger' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('opens on the city map when the player is in the city', async () => {
    render(h(MapTab, { loader: makeLoader(), prefStore: storeWith({ [SEA_POSITION_PREF_KEY]: at(1, 3) }) }));
    expect(screen.getByRole('button', { name: 'Város' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('remembers the view chosen with the switch', async () => {
    const store = storeWith({});
    render(h(MapTab, { loader: makeLoader(), prefStore: store }));
    fireEvent.click(screen.getByRole('button', { name: 'Tenger' }));
    expect(store.values[MAP_MODE_PREF_KEY]).toBe('sea');
    await waitFor(() => expect(square(0, 3)).not.toBeNull());
  });

  it('opens on the sea chart when the route asks for it', async () => {
    render(h(MapTab, { loader: makeLoader(), targetCellId: 'sea', prefStore: storeWith({}) }));
    await waitFor(() => expect(square(0, 3)).not.toBeNull());
  });

  it('shows a Thord-Artin tile with its name, district and buildings', async () => {
    render(h(MapTab, { loader: makeLoader(), targetCellId: 'sea', prefStore: storeWith({}) }));
    await waitFor(() => expect(square(-22, 24)).not.toBeNull());
    fireEvent.click(square(-22, 24)!);
    expect(screen.getByRole('heading', { name: /Lápapály/ })).toBeTruthy();
    expect(screen.getByText(/Thord-Artin/)).toBeTruthy();
    expect(screen.getByText(/Kikötő/).textContent).toContain('kész');
  });

  it('shows the stone an unfinished harbour still needs', async () => {
    render(h(MapTab, { loader: makeLoader(), targetCellId: 'sea', prefStore: storeWith({}) }));
    await waitFor(() => expect(square(-13, 27)).not.toBeNull());
    fireEvent.click(square(-13, 27)!);
    expect(screen.getByText(/493575 építőkő szükséges/)).toBeTruthy();
  });

  it('shows the city cell detail for a square of the city block', async () => {
    render(h(MapTab, { loader: makeLoader(), targetCellId: 'sea', prefStore: storeWith({}) }));
    await waitFor(() => expect(square(1, 3)).not.toBeNull());
    fireEvent.click(square(1, 3)!);
    expect(screen.getByRole('heading', { name: /kezdő-negyed/ })).toBeTruthy();
  });

  it('lets the player set their square by hand, in-game only', async () => {
    const store = storeWith({});
    render(h(MapTab, { loader: makeLoader(), targetCellId: 'sea', prefStore: store, tracksPosition: true }));
    await waitFor(() => expect(square(-7, -3)).not.toBeNull());
    fireEvent.click(square(-7, -3)!);
    fireEvent.click(screen.getByRole('button', { name: /Itt állok/ }));
    expect(parseSeaPosition(store.values[SEA_POSITION_PREF_KEY])).toMatchObject({ row: -7, col: -3, source: 'manual' });
    await waitFor(() => expect(square(-7, -3)?.classList.contains('here')).toBe(true));
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

  it('says so when the sea chart cannot be loaded', async () => {
    render(h(MapTab, { loader: makeLoader(true), targetCellId: 'sea', prefStore: storeWith({}) }));
    expect(await screen.findByText('Nem sikerült betölteni a tengeri térképet.')).toBeTruthy();
  });

  it('follows a position stored after it opened, switching to the sea chart', async () => {
    const store = storeWith({ [SEA_POSITION_PREF_KEY]: at(1, 3) });
    render(h(MapTab, { loader: makeLoader(), prefStore: store }));
    expect(screen.getByRole('button', { name: 'Város' }).getAttribute('aria-pressed')).toBe('true');
    store.values[SEA_POSITION_PREF_KEY] = at(-22, 25);
    document.dispatchEvent(new CustomEvent(SEA_POSITION_EVENT));
    await waitFor(() => expect(square(-22, 25)?.classList.contains('here')).toBe(true));
  });

  it('keeps the view the player chose when the position changes', async () => {
    const store = storeWith({ [SEA_POSITION_PREF_KEY]: at(1, 3) });
    render(h(MapTab, { loader: makeLoader(), prefStore: store }));
    fireEvent.click(screen.getByRole('button', { name: 'Város' }));
    store.values[SEA_POSITION_PREF_KEY] = at(-22, 25);
    document.dispatchEvent(new CustomEvent(SEA_POSITION_EVENT));
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByRole('button', { name: 'Város' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('moves the detail panel along with the player until a square is picked', async () => {
    const store = storeWith({ [SEA_POSITION_PREF_KEY]: at(-22, 25) });
    render(h(MapTab, { loader: makeLoader(), prefStore: store }));
    expect(await screen.findByRole('heading', { name: /Kígyófa/ })).toBeTruthy();
    store.values[SEA_POSITION_PREF_KEY] = at(-22, 24);
    document.dispatchEvent(new CustomEvent(SEA_POSITION_EVENT));
    expect(await screen.findByRole('heading', { name: /Lápapály/ })).toBeTruthy();
  });
});

