import { h } from 'preact';
import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { ExplorerView } from '@/database/explorer/ExplorerView';
import { buildMonsterDatabase, type DataLoader } from '@/shared/data';
import type { PrefStore } from '@/database/DatabaseApp';
import { explorerFiltersKey, explorerSortKey } from '@/shared/prefKeys';

function makePrefStore(initial: Record<string, string> = {}): PrefStore & { store: Record<string, string> } {
  const store: Record<string, string> = { ...initial };
  return { store, read: (key) => store[key] ?? null, write: (key, value) => { store[key] = value; } };
}

const weapon = (id: number, name: string, maxDamage = 1) => ({
  id, name, level: 1, type: 'Szúró', maxDamage, spread: 0, avgDamage: 1, price: 1, marketPrice: null,
  weight: 1, magical: false, vampiric: false, craftableAt: '', special: '', minLevel: null,
  recipe: [], droppedBy: [], availability: [], shops: [],
});
const armor = (id: number, name: string, defense = 1) => ({
  id, name, level: 1, type: 'Sisak', defense, price: 1, marketPrice: null,
  weight: 1, magical: false, craftableAt: '', special: '', minLevel: null, recipe: [], droppedBy: [],
});

const loader = {
  loadWeapons: async () => [weapon(1, 'Kard', 10), weapon(2, 'Balta', 20)],
  loadArmors: async () => [armor(3, 'Sisak', 5), armor(4, 'Csizma', 8)],
  loadItems: async () => [],
  loadMonsters: async () => buildMonsterDatabase([]),
} as unknown as DataLoader;

const mount = (prefStore: PrefStore, tab: 'weapons' | 'armors' = 'weapons') => render(
  <ExplorerView loader={loader} tab={tab} selectedId={null} prefStore={prefStore}
    onSelect={() => {}} onJump={() => {}} onShowCell={() => {}} />,
);

const searchBox = () => screen.getByPlaceholderText('kezdj el írni…') as HTMLInputElement;

describe('ExplorerView filters', () => {
  // The game reloads the page on every action, which remounts the overlay.
  it('restores a search after a remount', async () => {
    const prefStore = makePrefStore();
    const first = mount(prefStore);
    await screen.findByText('2 találat (2 összesen)');
    fireEvent.input(searchBox(), { target: { value: 'kard' } });
    first.unmount();

    mount(prefStore);
    await screen.findByText('1 találat (2 összesen)');
    expect(searchBox().value).toBe('kard');
  });

  it('keeps each tab\'s search across a switch to another tab and back', async () => {
    const prefStore = makePrefStore({ [explorerFiltersKey('weapons')]: JSON.stringify({ name: 'kard' }) });
    const view = mount(prefStore, 'weapons');
    await screen.findByText('1 találat (2 összesen)');

    view.rerender(<ExplorerView loader={loader} tab="armors" selectedId={null} prefStore={prefStore}
      onSelect={() => {}} onJump={() => {}} onShowCell={() => {}} />);
    await screen.findByText('2 találat (2 összesen)');
    expect(searchBox().value).toBe('');

    view.rerender(<ExplorerView loader={loader} tab="weapons" selectedId={null} prefStore={prefStore}
      onSelect={() => {}} onJump={() => {}} onShowCell={() => {}} />);
    await screen.findByText('1 találat (2 összesen)');
    expect(searchBox().value).toBe('kard');
  });

  it('forgets the filters only when they are cleared', async () => {
    const prefStore = makePrefStore({ [explorerFiltersKey('weapons')]: JSON.stringify({ name: 'kard' }) });
    mount(prefStore);
    await screen.findByText('1 találat (2 összesen)');

    fireEvent.click(screen.getByRole('button', { name: 'Szűrők törlése' }));

    await waitFor(() => expect(searchBox().value).toBe(''));
    expect(JSON.parse(prefStore.store[explorerFiltersKey('weapons')])).toEqual({});
  });
});

const header = (label: string) => screen.getByRole('columnheader', { name: label });
const firstRowName = () => screen.getAllByRole('row')[1].querySelector('.name')?.textContent;

describe('ExplorerView sort', () => {
  it('opens weapons on max damage and armours on defence, strongest first', async () => {
    const view = mount(makePrefStore(), 'weapons');
    await screen.findByText('2 találat (2 összesen)');
    expect(firstRowName()).toBe('Balta');
    expect(header('Max seb.').className).toBe('sorted desc');

    view.rerender(<ExplorerView loader={loader} tab="armors" selectedId={null} prefStore={makePrefStore()}
      onSelect={() => {}} onJump={() => {}} onShowCell={() => {}} />);
    await waitFor(() => expect(firstRowName()).toBe('Csizma'));
    expect(header('Védelem').className).toBe('sorted desc');
  });

  it('restores the chosen column and direction after a remount', async () => {
    const prefStore = makePrefStore();
    const first = mount(prefStore);
    await screen.findByText('2 találat (2 összesen)');
    fireEvent.click(header('Név'));
    fireEvent.click(header('Név'));
    expect(JSON.parse(prefStore.store[explorerSortKey('weapons')])).toEqual({ key: 'name', asc: false });
    first.unmount();

    mount(prefStore);
    await screen.findByText('2 találat (2 összesen)');
    expect(header('Név').className).toBe('sorted desc');
    expect(firstRowName()).toBe('Kard');
  });

  it('keeps each tab\'s sort across a switch to another tab and back', async () => {
    const prefStore = makePrefStore({ [explorerSortKey('weapons')]: JSON.stringify({ key: 'name', asc: true }) });
    const view = mount(prefStore, 'weapons');
    await screen.findByText('2 találat (2 összesen)');
    expect(firstRowName()).toBe('Balta');

    view.rerender(<ExplorerView loader={loader} tab="armors" selectedId={null} prefStore={prefStore}
      onSelect={() => {}} onJump={() => {}} onShowCell={() => {}} />);
    await waitFor(() => expect(header('Védelem').className).toBe('sorted desc'));

    view.rerender(<ExplorerView loader={loader} tab="weapons" selectedId={null} prefStore={prefStore}
      onSelect={() => {}} onJump={() => {}} onShowCell={() => {}} />);
    await waitFor(() => expect(header('Név').className).toBe('sorted asc'));
  });

  // Sorting is not a filter: clearing the filters leaves the order alone.
  it('keeps the sort when the filters are cleared', async () => {
    const prefStore = makePrefStore({ [explorerSortKey('weapons')]: JSON.stringify({ key: 'name', asc: false }) });
    mount(prefStore);
    await screen.findByText('2 találat (2 összesen)');
    fireEvent.click(screen.getByRole('button', { name: 'Szűrők törlése' }));
    expect(header('Név').className).toBe('sorted desc');
  });
});
