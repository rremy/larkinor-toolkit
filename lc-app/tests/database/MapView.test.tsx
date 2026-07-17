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
    ],
  };
  const itemShops: ShopData = { shops: [{ cellId: '44', owner: 'Szaiva', itemCount: 0, items: [] }] };
  const weaponShops: ShopData = { shops: [{ cellId: '44', owner: 'Thorgard', itemCount: 0, items: [] }] };
  return {
    loadWeapons: async () => [], loadArmors: async () => [], loadItems: async () => [],
    loadMonsters: async () => ({ byName: new Map(), getByName: () => undefined }),
    loadMap: async () => map,
    loadItemShops: async () => itemShops,
    loadWeaponShops: async () => weaponShops,
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
