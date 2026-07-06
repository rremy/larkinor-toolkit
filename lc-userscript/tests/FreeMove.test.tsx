import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { FreeMove } from '../src/pages/FreeMove';
import { buildMonsterDatabase, type Monster } from '../src/data/monsters';
import type { FreeMoveState } from '../src/utils/domExtract';

const MONSTERS: Monster[] = [
  { id: 1, name: 'Vérszomjas moszkitóraj', image: '/pic/szornyk/moszkitoraj_k.gif', level: 1, hp: 6, mp: 4, attackType: 'Szúró', debuff: 'fertőzés', magicWeapon: false, location: 'Larkinor', drops: [] },
];

function buildState(overrides: Partial<FreeMoveState> = {}): FreeMoveState {
  return {
    playerName: 'Hős',
    gold: 100,
    hp: 8,
    hpMax: 10,
    mp: 4,
    mpMax: 5,
    locationImageUrl: 'https://l2.larkinor.hu/tajk/12.gif',
    locationName: 'Városközpont',
    directions: [{ dir: 'north', label: 'Észak', trigger: vi.fn() }],
    buildings: [{ label: 'fegyverbolt', iconUrl: 'https://l2.larkinor.hu/ikon/fegyverbolt.gif', trigger: vi.fn() }],
    actions: [{ label: 'Körülnéz', trigger: vi.fn() }],
    narration: 'Valami Vérszomjas moszkitóraj csámborog a közelben!',
    ...overrides,
  };
}

describe('FreeMove', () => {
  it('renders the hero image with the location src', () => {
    const state = buildState();
    render(<FreeMove state={state} db={null} />);
    const img = screen.getByAltText('Városközpont') as HTMLImageElement;
    expect(img.src).toBe('https://l2.larkinor.hu/tajk/12.gif');
  });

  it('renders an action button and triggers it on click', () => {
    const state = buildState();
    render(<FreeMove state={state} db={null} />);
    const btn = screen.getByText('Körülnéz');
    fireEvent.click(btn);
    expect(state.actions[0].trigger).toHaveBeenCalled();
  });

  it('renders a NavPad direction button', () => {
    const state = buildState();
    const { container } = render(<FreeMove state={state} db={null} />);
    expect(container.querySelector('.lc-navpad-btn')).not.toBeNull();
  });

  it('renders a building button and triggers it on click', () => {
    const state = buildState();
    const { container } = render(<FreeMove state={state} db={null} />);
    const btn = container.querySelector('.lc-building-btn') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    expect(btn.textContent).toContain('fegyverbolt');
    fireEvent.click(btn);
    expect(state.buildings[0].trigger).toHaveBeenCalled();
  });

  it('opens the MonsterCard when a monster link in the narration is clicked, and closes it', () => {
    const state = buildState();
    const db = buildMonsterDatabase(MONSTERS);
    const { container } = render(<FreeMove state={state} db={db} />);

    const link = container.querySelector('.lc-monster-link');
    expect(link).not.toBeNull();
    fireEvent.click(link!);

    const dialog = screen.getByRole('dialog', { name: 'Vérszomjas moszkitóraj' });
    expect(dialog).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /bezár|close|×/i }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
