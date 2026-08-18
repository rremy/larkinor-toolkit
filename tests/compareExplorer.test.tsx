import { h } from 'preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/preact';
import { DataTable } from '../src/database/explorer/DataTable';
import { COLS } from '../src/database/explorer/columns';
import { LoadoutContext } from '../src/components/LoadoutContext';
import { fromArmor } from '../src/shared/compare';
import { emptySlots, type Loadout } from '../src/shared/loadout';

const loadout: Loadout = {
  version: 1, playerLevel: 30, capturedAt: 1,
  slots: {
    ...emptySlots(),
    head: { name: 'ent sisak', kind: 'vért', level: 20, maxDamage: null, spread: null, defense: 16, magical: false, vampiric: false },
  },
};

const rows = [{
  id: 1, name: 'jobb sisak', level: 21, type: 'Sisak', defense: 20,
  magical: false, weight: 1, price: 10, marketPrice: null, craftableAt: '',
}];

const mount = (value: Loadout | null, onSelect: (row: unknown) => void = () => {}) =>
  render(
    <LoadoutContext.Provider value={value}>
      <DataTable
        columns={COLS.armors}
        rows={rows as never}
        onSelect={onSelect as never}
        subjectOf={(row) => fromArmor(row as never)}
      />
    </LoadoutContext.Provider>,
  );

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('explorer compare', () => {
  it('opens the diff when a row is hovered', async () => {
    mount(loadout);
    fireEvent.mouseEnter(screen.getByText('jobb sisak').closest('tr')!, { clientX: 5, clientY: 5 });
    await vi.advanceTimersByTimeAsync(200);

    expect(document.querySelector('.lc-cmp')).not.toBeNull();
    expect(screen.getByText('Fej')).toBeTruthy();
    expect(screen.getByText('ent sisak')).toBeTruthy();
    // Védelem 16 → 20 is an upgrade.
    expect(document.querySelector('.lc-cmp-better')).not.toBeNull();
  });

  it('stays out of the way with no loadout — the standalone site', async () => {
    mount(null);
    fireEvent.mouseEnter(screen.getByText('jobb sisak').closest('tr')!, { clientX: 5, clientY: 5 });
    await vi.advanceTimersByTimeAsync(200);
    expect(document.querySelector('.lc-cmp')).toBeNull();
  });

  it('still selects the row it is hovering', () => {
    const onSelect = vi.fn();
    mount(loadout, onSelect);
    fireEvent.click(screen.getByText('jobb sisak').closest('tr')!);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
