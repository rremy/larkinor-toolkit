import { h } from 'preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/preact';
import { InventoryRow } from '../src/components/InventoryRow';
import { LoadoutContext } from '../src/components/LoadoutContext';
import { emptySlots, type Loadout } from '../src/shared/loadout';
import type { HomeItem } from '../src/utils/homeExtract';

const loadout: Loadout = {
  version: 2, playerLevel: 30, capturedAt: 1,
  slots: {
    ...emptySlots(),
    head: { name: 'ent sisak', kind: 'vért', type: 'fejre', level: 20, maxDamage: null, spread: null, defense: 16, magical: false, vampiric: false },
  },
};

const item: HomeItem = {
  index: 0, name: 'jobb sisak', type: 'vért', weight: 1, amount: 1, totalWeight: 1,
  price: 10, magical: false,
  attrs: [['Név', 'jobb sisak'], ['Min. szint', '21'], ['Védelem', '20'], ['Fajta', 'fejre']],
};

const mount = (it: HomeItem, onOpenDetail: () => void = () => {}) =>
  render(
    <LoadoutContext.Provider value={loadout}>
      <InventoryRow item={it} moveGlyph="🎒" moveTitle="Hátizsákba" onMove={() => {}} onOpenDetail={onOpenDetail} />
    </LoadoutContext.Provider>,
  );

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('inventory compare', () => {
  it('diffs a stored armour against the worn one on hover', async () => {
    mount(item);
    fireEvent.mouseEnter(document.querySelector('.lc-inv-name-line')!, { clientX: 5, clientY: 5 });
    await vi.advanceTimersByTimeAsync(200);

    expect(document.querySelector('.lc-cmp')).not.toBeNull();
    expect(screen.getByText('Fej')).toBeTruthy();
    expect(document.querySelector('.lc-cmp-better')).not.toBeNull();
  });

  it('leaves a plain item alone', async () => {
    mount({ ...item, name: 'ásó', type: 'tárgy', attrs: [['Név', 'ásó']] });
    fireEvent.mouseEnter(document.querySelector('.lc-inv-name-line')!, { clientX: 5, clientY: 5 });
    await vi.advanceTimersByTimeAsync(200);
    expect(document.querySelector('.lc-cmp')).toBeNull();
  });

  it('still opens the item detail when the name is clicked', () => {
    const onOpenDetail = vi.fn();
    mount(item, onOpenDetail);
    fireEvent.click(screen.getByText('jobb sisak'));
    expect(onOpenDetail).toHaveBeenCalledTimes(1);
  });
});
