import { h } from 'preact';
import { render, screen, fireEvent, waitFor } from '@testing-library/preact';
import { describe, it, expect } from 'vitest';
import { MapView } from '@/database/map/MapView';
import type { DataLoader, MapData, ShopData } from '@/shared/data';

function makeLoader(): DataLoader {
  const map: MapData = {
    cells: [
      {
        imageId: '44', imageSrc: '/tajk/44.gif', district: 'városközpont',
        buildings: [
          { name: 'vegyesbolt', icon: 'vegyesbolt.gif' },
          { name: 'fegyverbolt', icon: 'fegyverbolt.gif' },
        ],
        clanHouses: [], exits: {}, blockers: {}, firstCoords: [0, 0],
      },
      {
        imageId: '13', imageSrc: '/tajk/13.gif', district: 'kezdő-negyed',
        buildings: [{ name: 'templom', icon: 'templom.gif' }],
        clanHouses: [], exits: {}, blockers: {}, firstCoords: [0, 0],
      },
      {
        imageId: '49', imageSrc: '/tajk/49.gif', district: 'sziklabarlangok',
        buildings: [], clanHouses: [], exits: { W: 'városközpont', E: 'démonsziget' },
        blockers: { S: { icon: 'tenger.gif', title: 'délre tengerpart' } }, firstCoords: [0, 0],
      },
      {
        imageId: '41-13', imageSrc: '/tajk/41-13.gif', district: 'démonsziget',
        buildings: [], clanHouses: [], exits: { W: 'sziklabarlangok' }, blockers: {},
        firstCoords: [0, 0],
      },
    ],
    edges: { '44:E': '45', '45:E': '46', '46:E': '47', '47:E': '48', '48:E': '49', '49:E': '41-13' },
  };
  const itemShops: ShopData = { shops: [{ cellId: '44', owner: 'Szaiva', itemCount: 0, items: [] }] };
  const weaponShops: ShopData = { shops: [{ cellId: '44', owner: 'Thorgard', itemCount: 0, items: [] }] };
  return {
    loadWeapons: async () => [], loadArmors: async () => [], loadItems: async () => [],
    loadMonsters: async () => ({
      byName: new Map(), byId: new Map(),
      getByName: () => undefined, getById: () => undefined,
    }),
    loadMap: async () => map,
    loadItemShops: async () => itemShops,
    loadWeaponShops: async () => weaponShops,
    loadQuests: async () => [],
    loadTavernQuests: async () => [],
  };
}

describe('MapView', () => {
  it('renders the district colour legend and filterable POI list', async () => {
    render(<MapView loader={makeLoader()} />);
    await screen.findByText('Negyedek');
    expect(screen.getByText('POI ikonok')).toBeTruthy();
    // A filterable POI row is clickable.
    expect(screen.getByText('fegyverbolt')).toBeTruthy();
  });

  it('shows shop-owner names when a tile is selected', async () => {
    const { container } = render(<MapView loader={makeLoader()} />);
    await screen.findByText('Negyedek');
    const hub = container.querySelector('td.cell.hub') as HTMLElement;
    fireEvent.click(hub);
    // Owners come from item shops (vegyesbolt) and weapon shops (fegyverbolt).
    await waitFor(() => expect(screen.getByText(/Szaiva/)).toBeTruthy());
    expect(screen.getByText(/Thorgard/)).toBeTruthy();
  });

  it('selects and flashes the cell passed via targetCellId', async () => {
    const { container } = render(<MapView loader={makeLoader()} targetCellId="44" />);
    // Cell 44's detail (a városközpont tile) shows without any click.
    await waitFor(() => expect(screen.getByText(/Szaiva/)).toBeTruthy());
    // The target cell carries the focus-pulse class (applied post-commit).
    await waitFor(() =>
      expect(container.querySelector('td.cell.focused[data-id="44"]')).toBeTruthy(),
    );
  });

  it('gives a tile beyond the city block a column of its own', async () => {
    const { container } = render(<MapView loader={makeLoader()} />);
    await screen.findByText('Negyedek');
    // 49 → 41-13 extends the grid to col 10, east of the city's last column.
    expect(screen.getByText('col 10')).toBeTruthy();
    const island = container.querySelector('td.cell[data-id="41-13"]') as HTMLElement;
    expect(island.classList.contains('demon')).toBe(true);
    const row4 = island.parentElement as HTMLElement;
    expect([...row4.children].indexOf(island)).toBe(11); // row header + cols 0..10
    fireEvent.click(island);
    await waitFor(() => expect(screen.getByText('row 4 · col 10')).toBeTruthy());
  });

  it('draws plain walls apart from the coast, and lists both as closed', async () => {
    const { container } = render(<MapView loader={makeLoader()} />);
    await screen.findByText('Negyedek');
    const tile = container.querySelector('td.cell[data-id="49"]') as HTMLElement;
    expect(tile.querySelector('.blocker.S')).toBeTruthy();
    expect(tile.querySelector('.wall.N')).toBeTruthy();
    expect(tile.querySelector('.wall.S')).toBeNull();
    expect(tile.querySelectorAll('.wall, .blocker').length).toBe(2);
    fireEvent.click(tile);
    await waitFor(() => expect(container.querySelector('.cell-detail h3')).toBeTruthy());
    const closed = [...container.querySelectorAll('.cell-detail li')].map((li) => li.textContent);
    expect(closed).toEqual(['S: délre tengerpart', 'N: fal']);
  });

  it('highlights matching cells when a POI filter is active', async () => {
    const { container } = render(<MapView loader={makeLoader()} />);
    await screen.findByText('Negyedek');
    fireEvent.click(screen.getByText('fegyverbolt'));
    const view = container.querySelector('.map-view') as HTMLElement;
    expect(view.classList.contains('filter-active')).toBe(true);
    // Only cell 44 has a fegyverbolt → it gets the match class.
    const matched = container.querySelectorAll('td.cell.match');
    expect(matched.length).toBe(1);
    expect(matched[0].querySelector('.row-id')?.textContent).toBe('44');
  });
});
