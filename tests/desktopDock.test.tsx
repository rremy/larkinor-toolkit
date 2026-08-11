import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/preact';
import { JSDOM } from 'jsdom';
import { DesktopDock } from '../src/desktop/DesktopDock';
import { DOCK_COLLAPSED_KEY, ENABLED_HOTKEYS_KEY } from '../src/utils/config';
import type { FreeMoveState } from '../src/utils/domExtract';
import { buildMonsterDatabase, type Monster } from '../src/shared/data/monsters';

function makeState(overrides: Partial<FreeMoveState> = {}): FreeMoveState {
  return {
    playerName: 'Remy',
    gold: 100,
    hp: 200,
    hpMax: 300,
    mp: 50,
    mpMax: 80,
    locationImageUrl: '',
    locationName: 'harcos-negyed',
    directions: [],
    buildings: [],
    attack: null,
    settingsButton: null,
    restButton: null,
    statusIcons: [],
    actions: [
      { label: 'kajálsz', actionKey: 'kajal', trigger: vi.fn() },
      { label: 'imádkozol', actionKey: 'imadkozas', trigger: vi.fn() },
      { label: 'ásol', actionKey: 'as', trigger: vi.fn() },
    ],
    narration: '',
    narrationLinks: [],
    ...overrides,
  };
}

describe('DesktopDock', () => {
  beforeEach(() => {
    GM_setValue(DOCK_COLLAPSED_KEY, '');
    GM_setValue(ENABLED_HOTKEYS_KEY, '[]');
  });

  it('renders enabled actions as icon hotkeys and the rest as text buttons', () => {
    GM_setValue(ENABLED_HOTKEYS_KEY, JSON.stringify(['kajal']));
    const { container } = render(
      <DesktopDock doc={document} state={makeState()} db={null} />
    );
    expect(container.querySelectorAll('.lc-dock-hotkey').length).toBe(1);
    // The two non-enabled actions fall through to text buttons.
    const labels = Array.from(container.querySelectorAll('.lc-dock-btn')).map(b => b.textContent);
    expect(labels).toContain('imádkozol');
    expect(labels).toContain('ásol');
  });

  it('fires the original action trigger when a hotkey is clicked', () => {
    GM_setValue(ENABLED_HOTKEYS_KEY, JSON.stringify(['kajal']));
    const state = makeState();
    const { container } = render(<DesktopDock doc={document} state={state} db={null} />);
    fireEvent.click(container.querySelector('.lc-dock-hotkey')!);
    expect(state.actions[0].trigger).toHaveBeenCalledTimes(1);
  });

  it('omits the attack button when there is no encounter', () => {
    const { container } = render(<DesktopDock doc={document} state={makeState()} db={null} />);
    expect(container.querySelector('.lc-dock-btn--attack')).toBeNull();
  });

  it('renders the attack button and fires its trigger during an encounter', () => {
    const attack = { label: 'Támadás!!!', iconUrl: 'https://l2.larkinor.hu/2/ikon/tamadas.gif', trigger: vi.fn() };
    const { container } = render(
      <DesktopDock doc={document} state={makeState({ attack })} db={null} />
    );
    const btn = container.querySelector('.lc-dock-btn--attack')!;
    fireEvent.click(btn);
    expect(attack.trigger).toHaveBeenCalledTimes(1);
  });

  it('shows only the config and database buttons in dbButtonOnly mode', () => {
    const { container } = render(
      <DesktopDock doc={document} state={null} db={null} dbButtonOnly />
    );
    expect(container.querySelector('.lc-dock-hotkey')).toBeNull();
    expect(container.querySelector('.lc-dock-config')).not.toBeNull();
    expect(container.querySelector('.lc-dock-db')).not.toBeNull();
  });

  it('degrades to dbButtonOnly when the action list comes back empty', () => {
    const { container } = render(
      <DesktopDock doc={document} state={makeState({ actions: [] })} db={null} />
    );
    expect(container.querySelector('.lc-dock-btn--attack')).toBeNull();
    expect(container.querySelector('.lc-dock-db')).not.toBeNull();
  });

  it('opens the database overlay from the dock button', () => {
    const { container } = render(<DesktopDock doc={document} state={makeState()} db={null} />);
    expect(container.querySelector('.lc-db-overlay')).toBeNull();
    fireEvent.click(container.querySelector('.lc-dock-db')!);
    expect(container.querySelector('.lc-db-overlay')).not.toBeNull();
  });

  it('opens the config drawer as a centered modal', () => {
    const { container } = render(<DesktopDock doc={document} state={makeState()} db={null} />);
    fireEvent.click(container.querySelector('.lc-dock-config')!);
    const backdrop = container.querySelector('.lc-drawer-backdrop')!;
    expect(backdrop.classList.contains('lc-drawer-backdrop--center')).toBe(true);
  });

  it('collapses and persists the collapsed flag', () => {
    const { container } = render(<DesktopDock doc={document} state={makeState()} db={null} />);
    fireEvent.click(container.querySelector('.lc-dock-toggle')!);
    expect(container.querySelector('.lc-dock--collapsed')).not.toBeNull();
    expect(GM_getValue(DOCK_COLLAPSED_KEY, '')).toBe('true');
    // Collapsed dock hides the action rows but keeps the toggle reachable.
    expect(container.querySelector('.lc-dock-row')).toBeNull();
    expect(container.querySelector('.lc-dock-toggle')).not.toBeNull();
  });

  it('starts collapsed when the stored flag says so', () => {
    GM_setValue(DOCK_COLLAPSED_KEY, 'true');
    const { container } = render(<DesktopDock doc={document} state={makeState()} db={null} />);
    expect(container.querySelector('.lc-dock--collapsed')).not.toBeNull();
  });

  it('enhances the narration in the supplied document once a db is available', () => {
    const gameDoc = new JSDOM(
      '<html><body><font face="Comic sans MS">Valami Sírrabló csámborog a közelben!</font></body></html>'
    ).window.document;

    const sirrablo: Monster = {
      id: 7, name: 'Sírrabló', image: '/pic/szornyk/sirrablo_k.gif', level: 3,
      hp: 40, mp: 0, attackType: 'Szúró/Vágó', debuff: '', magicWeapon: false,
      location: 'temető', drops: [],
    };

    render(
      <DesktopDock doc={gameDoc} state={makeState()} db={buildMonsterDatabase([sirrablo])} />
    );

    expect(gameDoc.querySelector('a.lc-narr-link')?.textContent).toBe('Sírrabló');
  });

  it('does not enhance the narration while the db is still loading', () => {
    const gameDoc = new JSDOM(
      '<html><body><font face="Comic sans MS">Valami Sírrabló csámborog a közelben!</font></body></html>'
    ).window.document;

    render(<DesktopDock doc={gameDoc} state={makeState()} db={null} />);

    expect(gameDoc.querySelector('a.lc-narr-link')).toBeNull();
  });
});
