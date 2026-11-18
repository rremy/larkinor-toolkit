import { h } from 'preact';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { ExplorerView } from '@/database/explorer/ExplorerView';
import { buildMonsterDatabase, type DataLoader } from '@/shared/data';
import type { Monster } from '@/shared/data/monsters';
import type { PrefStore } from '@/database/DatabaseApp';
import { FAVOURITE_MONSTERS_PREF_KEY } from '@/shared/prefKeys';

function makePrefStore(initial: Record<string, string> = {}): PrefStore & { store: Record<string, string> } {
  const store: Record<string, string> = { ...initial };
  return { store, read: (key) => store[key] ?? null, write: (key, value) => { store[key] = value; } };
}

const monster = (id: number, name: string, level: number): Monster => ({
  id, name, level, image: '', hp: 10, mp: 0, attackType: '', debuff: '', magicWeapon: false, location: '', drops: [],
});

const loader = {
  loadWeapons: async () => [],
  loadArmors: async () => [],
  loadItems: async () => [],
  loadMonsters: async () => buildMonsterDatabase([
    monster(1, 'Sírrabló', 3), monster(2, 'Kék lándzsás', 40), monster(3, 'Zombi', 90),
  ]),
} as unknown as DataLoader;

const mount = (prefStore: PrefStore | undefined, selectedId: number | null = null) => render(
  <ExplorerView loader={loader} tab="monsters" selectedId={selectedId} prefStore={prefStore}
    onSelect={() => {}} onJump={() => {}} onShowCell={() => {}} />,
);

const favouriteFilter = (container: Element) =>
  [...container.querySelectorAll('.field')].find((f) => f.textContent?.includes('Kedvenc'))!.querySelector('select')!;

describe('ExplorerView favourite monsters', () => {
  it('shows a heart beside a favourite, whatever the stored case', async () => {
    const { container } = mount(makePrefStore({ [FAVOURITE_MONSTERS_PREF_KEY]: '["kék lándzsás"]' }));
    await screen.findByText('3 találat (3 összesen)');
    expect(screen.getByRole('columnheader', { name: '♥' })).toBeTruthy();
    const hearts = container.querySelectorAll('.db-fav-heart');
    expect(hearts).toHaveLength(1);
    expect(hearts[0].closest('tr')!.textContent).toContain('Kék lándzsás');
  });

  it('filters down to the favourites', async () => {
    const { container } = mount(makePrefStore({ [FAVOURITE_MONSTERS_PREF_KEY]: '["sírrabló"]' }));
    await screen.findByText('3 találat (3 összesen)');
    fireEvent.change(favouriteFilter(container), { target: { value: 'yes' } });
    await screen.findByText('1 találat (3 összesen)');
  });

  it('toggles a favourite from the detail panel, and the table follows', async () => {
    const prefStore = makePrefStore();
    const { container } = mount(prefStore, 1);
    await screen.findByText('3 találat (3 összesen)');
    const heart = container.querySelector<HTMLButtonElement>('.db-detail .lc-fav-btn')!;
    expect(heart.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(heart);

    await waitFor(() => expect(container.querySelectorAll('.db-fav-heart')).toHaveLength(1));
    expect(prefStore.store[FAVOURITE_MONSTERS_PREF_KEY]).toBe('["sírrabló"]');
    expect(container.querySelector('.db-detail .lc-fav-btn')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('offers no favourites without a store to keep them in', async () => {
    const { container } = mount(undefined, 1);
    await screen.findByText('3 találat (3 összesen)');
    expect(screen.queryByRole('columnheader', { name: '♥' })).toBeNull();
    expect(screen.queryByText('Kedvenc')).toBeNull();
    expect(container.querySelector('.lc-fav-btn')).toBeNull();
  });
});
