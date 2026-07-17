import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { FreeMove } from '../src/pages/FreeMove';
import { buildMonsterDatabase, type Monster } from '../src/shared/data/monsters';
import type { FreeMoveState } from '../src/utils/domExtract';
import { getEnabledHotkeys, setEnabledHotkeys } from '../src/utils/config';

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
    attack: null,
    settingsButton: null,
    restButton: null,
    statusIcons: [],
    actions: [{ label: 'Körülnéz', trigger: vi.fn() }],
    narration: 'Valami Vérszomjas moszkitóraj csámborog a közelben!',
    narrationLinks: [],
    ...overrides,
  };
}

describe('FreeMove', () => {
  it('wraps the hero image and stat bar together so the stat bar can overlay the image', () => {
    const { container } = render(<FreeMove state={buildState()} db={null} />);
    const hero = container.querySelector('.lc-hero')!;
    expect(hero).not.toBeNull();
    expect(hero.querySelector('.lc-hero-img')).not.toBeNull();
    expect(hero.querySelector('.lc-stat-bar')).not.toBeNull();
  });

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

  it('renders the settings and rest buttons as NavPad corners', () => {
    const settings = { label: 'Beállítások', iconUrl: 'https://x/klap.gif', trigger: vi.fn() };
    const rest = { label: 'Pihensz egy kicsit', iconUrl: 'https://x/pihen.gif', trigger: vi.fn() };
    const { container } = render(<FreeMove state={buildState({ settingsButton: settings, restButton: rest })} db={null} />);
    const left = container.querySelector('.lc-navpad-corner--left');
    const right = container.querySelector('.lc-navpad-corner--right');
    expect(left?.querySelector('img')?.getAttribute('src')).toBe('https://x/klap.gif');
    expect(right?.querySelector('img')?.getAttribute('src')).toBe('https://x/pihen.gif');
    fireEvent.click(left!);
    expect(settings.trigger).toHaveBeenCalledTimes(1);
  });

  it('promotes an enabled+available action to the hotkey icon row and drops it from the buttons', () => {
    setEnabledHotkeys(['kajal']);
    const state = buildState({
      actions: [
        { label: 'kajálsz', actionKey: 'kajal', trigger: vi.fn() },
        { label: 'imádkozol', actionKey: 'imadkozas', trigger: vi.fn() },
      ],
    });
    const { container } = render(<FreeMove state={state} db={null} />);
    const row = container.querySelector('.lc-hotkeys');
    expect(row).not.toBeNull();
    expect(row!.querySelectorAll('.lc-hotkey').length).toBe(1);
    expect(row!.querySelector('img')?.getAttribute('src')).toBe('https://l2.larkinor.hu/2/ikon/sc_kaja.gif');
    const btnLabels = Array.from(container.querySelectorAll('.lc-btn')).map(b => b.textContent);
    expect(btnLabels).not.toContain('kajálsz');
    expect(btnLabels).toContain('imádkozol');
  });

  it('renders the hotkey row inside the navpad section, below the grid', () => {
    setEnabledHotkeys(['kajal']);
    const state = buildState({ actions: [{ label: 'kajálsz', actionKey: 'kajal', trigger: vi.fn() }] });
    const { container } = render(<FreeMove state={state} db={null} />);
    const navpad = container.querySelector('.lc-navpad')!;
    const hotkeys = navpad.querySelector('.lc-hotkeys');
    expect(hotkeys).not.toBeNull(); // inside the navpad section
    const grid = navpad.querySelector('.lc-navpad-grid')!;
    // eslint-disable-next-line no-bitwise
    expect(grid.compareDocumentPosition(hotkeys!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('fires the action trigger when a hotkey icon is tapped', () => {
    setEnabledHotkeys(['kajal']);
    const trigger = vi.fn();
    const state = buildState({ actions: [{ label: 'kajálsz', actionKey: 'kajal', trigger }] });
    const { container } = render(<FreeMove state={state} db={null} />);
    fireEvent.click(container.querySelector('.lc-hotkey')!);
    expect(trigger).toHaveBeenCalledTimes(1);
  });

  it('does not promote an enabled hotkey that is not currently available', () => {
    setEnabledHotkeys(['vargyogy']); // not present among actions
    const state = buildState({ actions: [{ label: 'kajálsz', actionKey: 'kajal', trigger: vi.fn() }] });
    const { container } = render(<FreeMove state={state} db={null} />);
    expect(container.querySelector('.lc-hotkeys')).toBeNull();
    expect(Array.from(container.querySelectorAll('.lc-btn')).map(b => b.textContent)).toContain('kajálsz');
  });

  it('opens the config drawer from the stat-bar gear', () => {
    setEnabledHotkeys([]);
    const { container } = render(<FreeMove state={buildState()} db={null} />);
    expect(container.querySelector('.lc-drawer')).toBeNull();
    fireEvent.click(container.querySelector('.lc-statbar-gear')!);
    expect(container.querySelector('.lc-config-hotkeys')).not.toBeNull();
  });

  it('enabling a hotkey in the config promotes it immediately and persists', () => {
    setEnabledHotkeys([]);
    const state = buildState({ actions: [{ label: 'kajálsz', actionKey: 'kajal', trigger: vi.fn() }] });
    const { container } = render(<FreeMove state={state} db={null} />);
    fireEvent.click(container.querySelector('.lc-statbar-gear')!);
    fireEvent.click(container.querySelector('.lc-config-hotkey[data-key="kajal"]')!);
    expect(container.querySelector('.lc-hotkeys .lc-hotkey')).not.toBeNull();
    expect(getEnabledHotkeys()).toContain('kajal');
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

  it('opens the database overlay from the Adatbázis icon button, and closes it', () => {
    const { container } = render(<FreeMove state={buildState()} db={null} />);
    expect(container.querySelector('.lc-db-overlay')).toBeNull();

    fireEvent.click(screen.getByLabelText('Adatbázis'));
    expect(document.querySelector('.lc-db-overlay')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Bezárás'));
    expect(document.querySelector('.lc-db-overlay')).toBeNull();
  });
});
