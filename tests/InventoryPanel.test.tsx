import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { InventoryPanel } from '../src/desktop/InventoryPanel';
import { INVENTORY_MINIMIZED_KEY, DB_MINIMIZED_KEY, getPanelMinimized, setPanelMinimized } from '../src/utils/config';
import type { HomeItem, HomeState } from '../src/utils/homeExtract';

function item(name: string, amount: number, index: number): HomeItem {
  return {
    name, amount, index,
    type: 'tárgy',
    weight: 0.1,
    price: null,
    totalWeight: amount * 0.1,
    totalPrice: null,
    minLevel: null,
    extra: null,
    magic: false,
    raw: `Név: ${name}`,
  } as unknown as HomeItem;
}

/** Real figures from the live Home page: house 88% full, backpack 48%. */
function makeState(overrides: Partial<HomeState> = {}): HomeState {
  return {
    playerName: 'Remy',
    house: { used: 123.769, max: 140, items: [item('gyöngy', 34, 0), item('opál', 20, 1)], move: vi.fn() },
    backpack: { used: 53.1555, max: 111, items: [item('gyógyital', 26, 0)], move: vi.fn() },
    traps: [],
    actions: {
      everythingToBackpack: null, magicChair: null, recoverLost: null, settings: null, exit: null,
    },
    ...overrides,
  } as HomeState;
}

describe('InventoryPanel', () => {
  beforeEach(() => {
    GM_setValue(INVENTORY_MINIMIZED_KEY, '');
    GM_setValue(DB_MINIMIZED_KEY, '');
  });

  it('renders nothing when closed', () => {
    const { container } = render(<InventoryPanel open={false} state={makeState()} onClose={vi.fn()} />);
    expect(container.querySelector('.lc-db-overlay')).toBeNull();
  });

  it('shows both containers at once, with no tab to switch', () => {
    const { container } = render(<InventoryPanel open state={makeState()} onClose={vi.fn()} />);

    expect(container.querySelectorAll('.lc-home-col').length).toBe(2);
    expect(container.querySelector('.lc-home-tabs')).toBeNull();
    // House and backpack contents visible simultaneously — the whole point of
    // the split, and what a tabbed layout cannot do.
    expect(screen.getByText('gyöngy')).toBeTruthy();
    expect(screen.getByText('gyógyital')).toBeTruthy();
  });

  it('gives each container its own capacity meter', () => {
    // Seeing the receiving container's capacity while moving into it is the
    // reason to prefer the split; one shared meter would not do.
    const { container } = render(<InventoryPanel open state={makeState()} onClose={vi.fn()} />);

    expect(container.querySelectorAll('.lc-cap').length).toBe(2);
    expect(screen.getByText('Ház telítettsége')).toBeTruthy();
    expect(screen.getByText(/Hátizsák & test/)).toBeTruthy();
  });

  it('omits the Általános tab', () => {
    // The game's own Home page already offers those actions and traps as single
    // clicks, so repeating them beside it would be duplication.
    render(<InventoryPanel open state={makeState()} onClose={vi.fn()} />);
    expect(screen.queryByText('Általános')).toBeNull();
  });

  it('lifts the mobile page width cap so two columns have room', () => {
    // .lc-page caps at 600px and centres, which is right for a phone and
    // strangles two columns in a 700px panel.
    const { container } = render(<InventoryPanel open state={makeState()} onClose={vi.fn()} />);
    expect(container.querySelector('.lc-page--wide')).not.toBeNull();
  });

  it('moves an item from the container it was listed in', () => {
    const state = makeState();
    const { container } = render(<InventoryPanel open state={state} onClose={vi.fn()} />);

    const houseCol = container.querySelectorAll('.lc-home-col')[0];
    fireEvent.click(houseCol.querySelector('.lc-inv-move-btn')!);

    expect(state.house.move).toHaveBeenCalled();
    expect(state.backpack.move).not.toHaveBeenCalled();
  });

  it('closes from the window control', () => {
    const onClose = vi.fn();
    render(<InventoryPanel open state={makeState()} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Bezárás'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('docks beside the game and remembers the choice', () => {
    const { unmount } = render(<InventoryPanel open state={makeState()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Kis méret'));

    expect(document.querySelector('.lc-db-overlay')!.classList.contains('lc-db-overlay--minimized')).toBe(true);
    expect(getPanelMinimized(INVENTORY_MINIMIZED_KEY)).toBe(true);
    unmount();

    render(<InventoryPanel open state={makeState()} onClose={vi.fn()} />);
    expect(document.querySelector('.lc-db-overlay')!.classList.contains('lc-db-overlay--minimized')).toBe(true);
  });

  it('remembers its own minimised state, not the database\'s', () => {
    // Separate keys: minimising the database must not dock the inventory too.
    setPanelMinimized(DB_MINIMIZED_KEY, true);
    render(<InventoryPanel open state={makeState()} onClose={vi.fn()} />);
    expect(document.querySelector('.lc-db-overlay')!.classList.contains('lc-db-overlay--minimized')).toBe(false);
  });
});
