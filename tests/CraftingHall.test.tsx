import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { CraftingHall } from '../src/pages/CraftingHall';
import { BuildingLobby } from '../src/pages/BuildingLobby';
import type { CraftingHallState, BuildingLobbyState } from '../src/utils/craftingExtract';
import type { DataLoader } from '../src/shared/data';

const loader = {
  loadWeapons: () => Promise.resolve([]),
  loadArmors: () => Promise.resolve([]),
  loadItems: () => Promise.resolve([]),
} as unknown as DataLoader;

const control = (label: string) => ({ label, iconUrl: '', trigger: vi.fn() });

function hall(side: CraftingHallState['side']): CraftingHallState {
  return {
    hall: 'forge', gold: 1168, narration: 'Wulfthor eléd siet.',
    owned: new Map(), options: [], craft: vi.fn(), exit: control('Kilepes az epuletbol'), side,
  };
}

describe('CraftingHall', () => {
  it('shows the narration, the money and the exit', async () => {
    const state = hall(null);
    render(<CraftingHall state={state} loader={loader} />);
    expect(screen.getByText('Wulfthor eléd siet.')).toBeTruthy();
    expect(screen.getByText(/1\s?168/)).toBeTruthy();
    fireEvent.click(screen.getByText('Kilepes az epuletbol'));
    expect(state.exit!.trigger).toHaveBeenCalled();
  });

  it('keeps trap ordering reachable, pricing it through the page', () => {
    const price = vi.fn(() => '290');
    const order = vi.fn();
    render(<CraftingHall state={hall({ kind: 'trap', traps: [{ index: 0, label: 'Hurokzár' }, { index: 1, label: 'Pengegép' }], price, order })} loader={loader} />);
    fireEvent.click(screen.getByText('Csapda'));
    fireEvent.change(screen.getByLabelText('Csapda fajtája'), { target: { value: '1' } });
    fireEvent.input(screen.getByLabelText('Erősség'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Mennyi?' }));
    expect(price).toHaveBeenCalledWith(1, 3);
    expect(screen.getByText(/290/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Megrendel' }));
    expect(order).toHaveBeenCalledWith(1, 3);
  });

  it('never orders a trap at a strength the screen does not show', () => {
    const order = vi.fn();
    render(<CraftingHall state={hall({ kind: 'trap', traps: [{ index: 0, label: 'Hurokzár' }], price: vi.fn(() => ''), order })} loader={loader} />);
    fireEvent.click(screen.getByText('Csapda'));
    const strength = screen.getByLabelText('Erősség') as HTMLInputElement;
    fireEvent.input(strength, { target: { value: '' } });
    expect(strength.value).toBe('');
    const orderButton = screen.getByRole('button', { name: 'Megrendel' }) as HTMLButtonElement;
    expect(orderButton.disabled).toBe(true);
    fireEvent.click(orderButton);
    expect(order).not.toHaveBeenCalled();
    fireEvent.input(strength, { target: { value: '4' } });
    fireEvent.click(orderButton);
    expect(order).toHaveBeenCalledWith(0, 4);
  });

  it('fills the slots by hand for what the database has no recipe for', () => {
    const state = {
      ...hall(null),
      options: [
        { id: '0', count: 1168, name: 'ezüst' },
        { id: '251', count: 20, name: 'sárkányfog' },
        { id: '252', count: 10, name: 'sárkánykarom' },
      ],
    };
    render(<CraftingHall state={state} loader={loader} />);
    fireEvent.click(screen.getByText('Kézi kitöltés'));
    const go = screen.getByRole('button', { name: 'Kitöltés és készítés' }) as HTMLButtonElement;
    // Nothing chosen yet: nothing to submit.
    expect(go.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('1. alapanyag'), { target: { value: '251' } });
    fireEvent.input(screen.getByLabelText('1. mennyiség'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('3. alapanyag'), { target: { value: '252' } });
    fireEvent.input(screen.getByLabelText('3. mennyiség'), { target: { value: '5' } });
    fireEvent.input(screen.getByLabelText('Kézi darabszám'), { target: { value: '2' } });
    fireEvent.click(go);
    expect(state.craft).toHaveBeenCalledWith([
      { id: '251', name: 'sárkányfog', qty: 10 },
      { id: '252', name: 'sárkánykarom', qty: 5 },
    ], 2);
  });

  it('refuses a hand-filled slot with an ingredient but no amount', () => {
    const state = { ...hall(null), options: [{ id: '251', count: 20, name: 'sárkányfog' }] };
    render(<CraftingHall state={state} loader={loader} />);
    fireEvent.click(screen.getByText('Kézi kitöltés'));
    fireEvent.change(screen.getByLabelText('1. alapanyag'), { target: { value: '251' } });
    const go = screen.getByRole('button', { name: 'Kitöltés és készítés' }) as HTMLButtonElement;
    expect(go.disabled).toBe(true);
  });

  it('keeps spell learning reachable', () => {
    const learn = vi.fn();
    render(<CraftingHall state={hall({ kind: 'spell', spells: [{ value: '1', label: 'gyógyvarázs' }, { value: '6', label: 'manapajzs' }], learnLabel: 'Megtanulsz egy uj varázslatot', learn })} loader={loader} />);
    fireEvent.click(screen.getByText('Varázslatok'));
    fireEvent.change(screen.getByLabelText('Varázslat'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Megtanulsz egy uj varázslatot' }));
    expect(learn).toHaveBeenCalledWith('6');
  });
});

describe('BuildingLobby', () => {
  it('lists every control with the exit last', () => {
    const state: BuildingLobbyState = {
      title: 'Erőd', gold: 1168, narration: 'Belépsz Szendrin erődjébe...',
      controls: [control('belépsz a kovácsok termébe.'), control('Fejleszted az igazi kovácsmesterséged!')],
      exit: control('Kilepes az epuletbol'),
    };
    const { container } = render(<BuildingLobby state={state} />);
    const labels = [...container.querySelectorAll('.lc-home-act')].map((b) => b.textContent?.trim());
    expect(labels).toEqual(['belépsz a kovácsok termébe.', 'Fejleszted az igazi kovácsmesterséged!', 'Kilepes az epuletbol']);
    fireEvent.click(screen.getByText('belépsz a kovácsok termébe.'));
    expect(state.controls[0].trigger).toHaveBeenCalled();
  });
});
