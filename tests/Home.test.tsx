import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/preact';
import { Home } from '../src/pages/Home';
import type { HomeState, HomeItem } from '../src/utils/homeExtract';

function item(over: Partial<HomeItem>): HomeItem {
  return { index: 0, name: 'x', type: 'tárgy', weight: 1, amount: 1, totalWeight: 1, price: null, magical: false, attrs: [], ...over };
}

function state(over: Partial<HomeState> = {}): HomeState {
  return {
    playerName: 'Remy',
    house: { used: 130, max: 140, items: [item({ index: 0, name: 'agyar', amount: 6, weight: 4, totalWeight: 24 })], move: vi.fn() },
    backpack: { used: 105, max: 107, items: [item({ index: 0, name: 'halcsont', amount: 89, weight: 0.2, totalWeight: 17.8 })], move: vi.fn() },
    traps: [{ label: 'zuhanórács', strength: 7, leszerel: vi.fn() }],
    actions: {
      everythingToBackpack: { label: 'mind', iconUrl: '', trigger: vi.fn() },
      magicChair: null, recoverLost: null, settings: null,
      exit: { label: 'kilép', iconUrl: '', trigger: vi.fn() },
    },
    ...over,
  };
}

describe('Home', () => {
  it('shows the house inventory by default', () => {
    render(<Home state={state()} />);
    expect(screen.getByText('agyar')).toBeTruthy();
  });

  it('switches to the backpack tab', () => {
    render(<Home state={state()} />);
    fireEvent.click(screen.getByText(/Hátizsák/));
    expect(screen.getByText('halcsont')).toBeTruthy();
  });

  it('house move button drives the house container move()', () => {
    const s = state();
    render(<Home state={s} />);
    // Single row with amount 6 → qty defaults to 6.
    screen.getByTitle('Hátizsákba').click();
    expect(s.house.move).toHaveBeenCalledWith(s.house.items[0], 6);
  });

  it('general tab fires an action trigger', () => {
    const s = state();
    render(<Home state={s} />);
    fireEvent.click(screen.getByText(/Általános/));
    fireEvent.click(screen.getByText('Mindent a hátizsákba'));
    expect(s.actions.everythingToBackpack!.trigger).toHaveBeenCalledTimes(1);
  });
});
