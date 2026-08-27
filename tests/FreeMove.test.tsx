import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/preact';
import { FreeMove } from '../src/pages/FreeMove';
import { buildMonsterDatabase, type Monster } from '../src/shared/data/monsters';
import type { FreeMoveState } from '../src/utils/domExtract';
import { getEnabledHotkeys, setEnabledHotkeys, DB_ROUTE_KEY } from '../src/utils/config';
import { USERSCRIPT_DATA_BASE_URL } from '../src/shared/publicUrl';

const MONSTERS: Monster[] = [
  { id: 1, name: 'Vérszomjas moszkitóraj', image: '/pic/szornyk/moszkitoraj_k.gif', level: 1, hp: 6, mp: 4, attackType: 'Szúró', debuff: 'fertőzés', magicWeapon: false, location: 'Larkinor', drops: [] },
];

function questCell() {
  return {
    row: 0, col: 0,
    edges: { N: { kind: 'open' }, E: { kind: 'open' }, S: { kind: 'open' }, W: { kind: 'open' } },
    monsterId: null, monsterName: null, boss: false, key: null, questItem: false,
    portal: null, trap: false, death: false, narration: '', drops: null, hasQuestion: false,
    question: null, rawImage: '',
  };
}

// Mirrors the helper in tests/Dungeon.test.tsx: stubs the quests.json/monsters.json
// GM-cached fetches so the quests tab renders real, distinguishable content instead of
// staying empty — needed to prove *which* quest (or tab) actually rendered, not just
// that the overlay mounted.
function stubQuestData(quests: Array<{ id: string; description: string }> = [{ id: '1', description: 'Teszt küldetés' }]) {
  const base = `lc_cache:${USERSCRIPT_DATA_BASE_URL}`;
  for (const file of ['quests.json', 'monsters.json']) {
    GM_setValue(`${base}/${file}`, '');
    GM_setValue(`${base}/${file}:v`, '');
  }
  const stubQuests = quests.map((q) => ({
    id: q.id, description: q.description, reward: '1 db ezüst', rows: 1, cols: 1,
    cells: [questCell()],
  }));
  vi.mocked(GM_xmlhttpRequest).mockImplementation(((opts: {
    url: string;
    onload?: (res: { status: number; responseText: string }) => void;
  }) => {
    if (opts.url.includes('quests.json')) {
      opts.onload?.({ status: 200, responseText: JSON.stringify(stubQuests) });
    } else if (opts.url.includes('monsters.json')) {
      opts.onload?.({ status: 200, responseText: JSON.stringify([]) });
    }
  }) as unknown as typeof GM_xmlhttpRequest);
}

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

  describe('active-quest link', () => {
    // The loader caches quests.json/monsters.json under a fixed GM key in tests
    // (no `?v=` tag), and the overlay remembers its last route under DB_ROUTE_KEY —
    // both must be cleared between tests, or one test's navigation leaks into the
    // next test's "fresh" overlay mount.
    afterEach(() => {
      vi.mocked(GM_xmlhttpRequest).mockReset();
      GM_setValue(DB_ROUTE_KEY, '');
    });

    it('opens the quests tab on the active quest named in the narration', async () => {
      stubQuestData([
        { id: '1', description: 'Első küldetés' },
        { id: '39', description: 'Második küldetés' },
      ]);
      const state = buildState({ narration: 'Sétálsz.\nAktuális küldetés: (39)' });
      const { container } = render(<FreeMove state={state} db={null} />);

      fireEvent.click(container.querySelector('.lc-quest-link')!);

      // Assert on the rendered quest content, not just that the panel opened —
      // a bug that opened the overlay on the wrong tab (or the right tab but
      // the wrong quest) would still leave `.lc-db` mounted.
      expect((await screen.findAllByText('Második küldetés')).length).toBeGreaterThan(0);
    });

    it('does not force the plain database button back into a quest after the link was used', async () => {
      // Regression test: FreeMove.tsx used to leave `questRoute` set after the
      // quest link navigated the overlay, so a later open of the overlay from
      // any *other* affordance (here, the plain "Adatbázis" icon) force-navigated
      // back into that quest — because DockedPanel unmounts DatabaseApp on
      // close, so the next open is a fresh mount whose initialTab/initialQuest
      // effect fires again with the stale route still attached.
      stubQuestData([
        { id: '1', description: 'Első küldetés' },
        { id: '39', description: 'Második küldetés' },
      ]);
      const state = buildState({ narration: 'Sétálsz.\nAktuális küldetés: (39)' });
      const { container } = render(<FreeMove state={state} db={null} />);

      // 1) Follow the active-quest link — lands on quest 39.
      fireEvent.click(container.querySelector('.lc-quest-link')!);
      expect((await screen.findAllByText('Második küldetés')).length).toBeGreaterThan(0);

      // 2) The player browses away from quests, to prove a later re-navigation
      // to quests would be forced rather than merely "remembered".
      const monstersTab = [...document.querySelectorAll('.lc-db .tab')]
        .find((t) => t.textContent === 'Szörnyek') as HTMLElement;
      fireEvent.click(monstersTab);
      expect(document.querySelector('.lc-db .tab.active')?.textContent).toBe('Szörnyek');

      // 3) Close, then reopen from the plain "Adatbázis" icon — not the quest link.
      fireEvent.click(screen.getByLabelText('Bezárás'));
      expect(document.querySelector('.lc-db-overlay')).toBeNull();
      fireEvent.click(screen.getByLabelText('Adatbázis'));

      // The overlay must not have been forced back onto the quests tab, and
      // quest 39's content must not be showing.
      await waitFor(() => expect(document.querySelector('.lc-db-overlay')).not.toBeNull());
      expect(document.querySelector('.lc-db .tab.active')?.textContent).not.toBe('Küldetések');
      expect(screen.queryByText('Második küldetés')).toBeNull();
    });
  });
});
