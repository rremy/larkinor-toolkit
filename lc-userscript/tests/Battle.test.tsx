import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { Battle } from '../src/pages/Battle';
import { buildMonsterDatabase, type Monster } from '../src/data/monsters';
import type { BattleState } from '../src/utils/domExtract';

const MONSTERS: Monster[] = [
  { id: 1, name: 'Vérszomjas moszkitóraj', image: '/pic/szornyk/moszkitoraj_k.gif', level: 3, hp: 6, mp: 4, attackType: 'Szúró', debuff: 'fertőzés', magicWeapon: false, location: 'Larkinor', drops: [] },
];

function buildState(overrides: Partial<BattleState> = {}): BattleState {
  return {
    monsterName: 'Vérszomjas moszkitóraj',
    monsterHp: 5,
    monsterImageUrl: 'https://l2.larkinor.hu/pic/szornyk/moszkitoraj_k.gif',
    narration: 'A szörny rád támad!',
    narrationLinks: [],
    actions: [
      { label: 'Bal kezes támadás', trigger: vi.fn() },
      { label: 'Menekülés', trigger: vi.fn() },
    ],
    hp: 8,
    hpMax: 10,
    mp: 4,
    mpMax: 5,
    ...overrides,
  };
}

describe('Battle', () => {
  it('renders the hero image with the monster src', () => {
    const state = buildState();
    const db = buildMonsterDatabase(MONSTERS);
    render(<Battle state={state} db={db} />);
    const img = screen.getByAltText('Vérszomjas moszkitóraj') as HTMLImageElement;
    expect(img.src).toBe('https://l2.larkinor.hu/pic/szornyk/moszkitoraj_k.gif');
  });

  it('shows the monster hp', () => {
    const state = buildState();
    const db = buildMonsterDatabase(MONSTERS);
    const { container } = render(<Battle state={state} db={db} />);
    expect(container.querySelector('.lc-battle-hp')?.textContent).toBe('❤ 5');
  });

  it('shows the level badge from the DB monster', () => {
    const state = buildState();
    const db = buildMonsterDatabase(MONSTERS);
    const { container } = render(<Battle state={state} db={db} />);
    expect(container.querySelector('.lc-battle-level-badge')?.textContent).toBe('Szint 3');
  });

  it('opens the MonsterCard when the monster name is clicked, and closes it', () => {
    const state = buildState();
    const db = buildMonsterDatabase(MONSTERS);
    const { container } = render(<Battle state={state} db={db} />);

    const link = container.querySelector('.lc-monster-link');
    expect(link).not.toBeNull();
    fireEvent.click(link!);

    const dialog = screen.getByRole('dialog', { name: 'Vérszomjas moszkitóraj' });
    expect(dialog).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /bezár|close|×/i }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('calls the action trigger when an action button is clicked', () => {
    const state = buildState();
    const db = buildMonsterDatabase(MONSTERS);
    render(<Battle state={state} db={db} />);

    fireEvent.click(screen.getByText('Menekülés'));
    expect(state.actions[1].trigger).toHaveBeenCalled();
  });

  it('places the two attack actions together in a single row, flee/spells outside it', () => {
    const state = buildState({
      actions: [
        { label: 'Bal kezes támadás', trigger: vi.fn(), kind: 'attack' },
        { label: 'Jobb kezes támadás', trigger: vi.fn(), kind: 'attack' },
        { label: 'Menekülés', trigger: vi.fn(), kind: 'flee' },
        { label: 'Tűz varázslat', trigger: vi.fn(), kind: 'spell' },
      ],
    });
    const { container } = render(<Battle state={state} db={null} />);
    const row = container.querySelector('.lc-battle-attacks');
    expect(row).not.toBeNull();
    const rowButtons = row!.querySelectorAll('button');
    expect(rowButtons.length).toBe(2);
    expect(row!.textContent).toContain('Bal kezes támadás');
    expect(row!.textContent).toContain('Jobb kezes támadás');
    expect(row!.textContent).not.toContain('Menekülés');
    // flee and spell still rendered elsewhere on the page
    expect(screen.getByText('Menekülés')).toBeTruthy();
    expect(screen.getByText('Tűz varázslat')).toBeTruthy();
  });

  it('renders the spell actions as an icon row (with original icons)', () => {
    const state = buildState({
      actions: [
        { label: 'Bal', trigger: vi.fn(), kind: 'attack' },
        { label: 'Jobb', trigger: vi.fn(), kind: 'attack' },
        { label: 'Föld varázslat', trigger: vi.fn(), kind: 'spell', iconUrl: 'https://x/fold.gif' },
        { label: 'Tűz varázslat', trigger: vi.fn(), kind: 'spell', iconUrl: 'https://x/tuz.gif' },
      ],
    });
    const { container } = render(<Battle state={state} db={null} />);
    const spellRow = container.querySelector('.lc-battle-spells');
    expect(spellRow).not.toBeNull();
    const imgs = spellRow!.querySelectorAll('img');
    expect(imgs.length).toBe(2);
    expect(imgs[0].getAttribute('src')).toBe('https://x/fold.gif');
    // spells are not mixed into the attack row
    expect(container.querySelector('.lc-battle-attacks')!.textContent).not.toContain('varázslat');
  });

  it('a spell icon button is labelled and triggers its action', () => {
    const state = buildState({
      actions: [{ label: 'Tűz varázslat', trigger: vi.fn(), kind: 'spell', iconUrl: 'https://x/tuz.gif' }],
    });
    render(<Battle state={state} db={null} />);
    const btn = screen.getByRole('button', { name: 'Tűz varázslat' });
    fireEvent.click(btn);
    expect(state.actions[0].trigger).toHaveBeenCalledTimes(1);
  });

  it('triggers the correct attack when a row button is clicked', () => {
    const state = buildState({
      actions: [
        { label: 'Bal kezes támadás', trigger: vi.fn(), kind: 'attack' },
        { label: 'Jobb kezes támadás', trigger: vi.fn(), kind: 'attack' },
      ],
    });
    render(<Battle state={state} db={null} />);
    fireEvent.click(screen.getByText('Jobb kezes támadás'));
    expect(state.actions[1].trigger).toHaveBeenCalledTimes(1);
  });

  it('renders the monster name as plain text with no link or level badge when not in the DB', () => {
    const state = buildState({ monsterName: 'Ismeretlen szörny' });
    const db = buildMonsterDatabase(MONSTERS);
    const { container } = render(<Battle state={state} db={db} />);

    expect(screen.getByText('Ismeretlen szörny')).toBeTruthy();
    expect(container.querySelector('.lc-monster-link')).toBeNull();
    expect(container.querySelector('.lc-battle-level-badge')).toBeNull();
  });
});
