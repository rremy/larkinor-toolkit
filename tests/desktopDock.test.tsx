import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/preact';
import { JSDOM } from 'jsdom';
import { DesktopDock } from '../src/desktop/DesktopDock';
import { DOCK_COLLAPSED_KEY, ENABLED_HOTKEYS_KEY, INVENTORY_OPEN_KEY, DB_OPEN_KEY, DB_ROUTE_KEY } from '../src/utils/config';
import type { FreeMoveState } from '../src/utils/domExtract';
import type { HomeState } from '../src/utils/homeExtract';
import { buildMonsterDatabase, type Monster } from '../src/shared/data/monsters';
import { USERSCRIPT_DATA_BASE_URL } from '../src/shared/publicUrl';

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
    // The inventory panel persists its open state. Without clearing it, the test
    // that opens the panel leaves every later test with modalOpen true, which
    // suppresses all the keyboard shortcuts.
    GM_setValue(INVENTORY_OPEN_KEY, '');
    // Same hazard for the database panel, which now persists open state too: a
    // test that opens it would otherwise leave every later test with modalOpen
    // true, silently suppressing all the keyboard shortcuts.
    GM_setValue(DB_OPEN_KEY, '');
    GM_setValue(DB_ROUTE_KEY, '');
  });

  it('renders enabled actions as icon hotkeys and the rest as text buttons', () => {
    GM_setValue(ENABLED_HOTKEYS_KEY, JSON.stringify(['kajal']));
    const { container } = render(
      <DesktopDock doc={document} state={makeState()} db={null} />
    );
    expect(container.querySelectorAll('.lc-hotkey').length).toBe(1);
    // The two non-enabled actions fall through to text buttons.
    const labels = Array.from(container.querySelectorAll('.lc-dock-btn')).map(b => b.textContent);
    expect(labels).toContain('imádkozol');
    expect(labels).toContain('ásol');
  });

  it('fires the original action trigger when a hotkey is clicked', () => {
    GM_setValue(ENABLED_HOTKEYS_KEY, JSON.stringify(['kajal']));
    const state = makeState();
    const { container } = render(<DesktopDock doc={document} state={state} db={null} />);
    fireEvent.click(container.querySelector('.lc-hotkey')!);
    expect(state.actions[0].trigger).toHaveBeenCalledTimes(1);
  });

  it('renders no attack button during an encounter', () => {
    // The game page already presents the encounter attack as a single click,
    // so a dock button would only duplicate it.
    const attack = { label: 'Támadás!!!', iconUrl: 'https://l2.larkinor.hu/2/ikon/tamadas.gif', trigger: vi.fn() };
    const { container } = render(
      <DesktopDock doc={document} state={makeState({ attack })} db={null} />
    );

    const labels = [...container.querySelectorAll('.lc-dock-btn')].map(b => b.textContent?.trim());
    expect(labels).not.toContain('Támadás!!!');
    expect(container.querySelector('img[src*="tamadas"]')).toBeNull();
  });

  it('still fires the attack from the Space shortcut during an encounter', () => {
    // Dropping the button must not drop the keyboard path — Space is the
    // affordance the page genuinely lacks.
    const gameDoc = new JSDOM('<html><body></body></html>').window.document;
    const attack = { label: 'Támadás!!!', iconUrl: '', trigger: vi.fn() };
    render(<DesktopDock doc={gameDoc} state={makeState({ attack })} db={null} />);

    act(() => {
      gameDoc.body.dispatchEvent(
        new gameDoc.defaultView!.KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true })
      );
    });

    expect(attack.trigger).toHaveBeenCalledTimes(1);
  });

  it('shows only the config and database buttons in dbButtonOnly mode', () => {
    const { container } = render(
      <DesktopDock doc={document} state={null} db={null} dbButtonOnly />
    );
    expect(container.querySelector('.lc-hotkey')).toBeNull();
    expect(container.querySelector('.lc-dock-config')).not.toBeNull();
    expect(container.querySelector('.lc-dock-db')).not.toBeNull();
  });

  describe('battle monster sheet', () => {
    const GOBLIN: Monster = {
      id: 12, name: 'Goblin harcművészek', image: '/pic/szornyk/goblinharcmuvesz_k.gif',
      level: 12, hp: 112, mp: 0, attackType: 'Szúró/Vágó', debuff: '', magicWeapon: false,
      location: 'harcos-negyed', drops: [{ qty: 1, name: 'goblinfül', id: 88 }],
    };
    const withGoblin = () => buildMonsterDatabase([GOBLIN]);

    it('offers no Adatlap button away from a fight', () => {
      const { container } = render(<DesktopDock doc={document} state={makeState()} db={withGoblin()} />);
      expect(container.querySelector('.lc-dock-monster')).toBeNull();
    });

    it('opens the monster card for the monster being fought', () => {
      const { container } = render(
        <DesktopDock doc={document} state={null} db={withGoblin()} battleMonsterName="Goblin harcművészek" dbButtonOnly />
      );

      fireEvent.click(container.querySelector<HTMLElement>('.lc-dock-monster')!);

      // The card carries what the battle screen does not: level and drops.
      expect(container.querySelector('.lc-mc-name')!.textContent).toBe('Goblin harcművészek');
      expect(container.textContent).toContain('Szint 12');
      expect(container.textContent).toContain('goblinfül');
    });

    it('waits for the database rather than showing a dead button', () => {
      const { container } = render(
        <DesktopDock doc={document} state={null} db={null} battleMonsterName="Goblin harcművészek" dbButtonOnly />
      );
      expect(container.querySelector('.lc-dock-monster')).toBeNull();
    });

    it('warns rather than silently omitting the button for an unknown monster', () => {
      // A name the database does not know means a data gap or a mismatch — the
      // encoding kind has bitten this project before — so it must not pass quietly.
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { container } = render(
        <DesktopDock doc={document} state={null} db={withGoblin()} battleMonsterName="Nincs ilyen szörny" dbButtonOnly />
      );

      expect(container.querySelector('.lc-dock-monster')).toBeNull();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Nincs ilyen szörny'));
      warn.mockRestore();
    });
  });

  it('offers no Készlet button away from the Home page', () => {
    const { container } = render(<DesktopDock doc={document} state={makeState()} db={null} />);
    expect(container.querySelector('.lc-dock-inventory')).toBeNull();
  });

  it('opens the inventory panel from the Készlet button on the Home page', () => {
    const homeState = {
      playerName: 'Remy',
      house: { used: 123.769, max: 140, items: [], move: vi.fn() },
      backpack: { used: 53.1555, max: 111, items: [], move: vi.fn() },
      traps: [],
      actions: { everythingToBackpack: null, magicChair: null, recoverLost: null, settings: null, exit: null },
    } as unknown as HomeState;

    const { container } = render(
      <DesktopDock doc={document} state={null} db={null} homeState={homeState} dbButtonOnly />
    );

    expect(container.querySelector('.lc-db-overlay')).toBeNull();
    fireEvent.click(container.querySelector('.lc-dock-inventory')!);
    expect(document.querySelector('.lc-db-overlay')).not.toBeNull();
    expect(document.querySelector('.lc-home-split')).not.toBeNull();
  });

  describe('database panel persistence', () => {
    it('is closed on a first visit', () => {
      const { container } = render(<DesktopDock doc={document} state={makeState()} db={null} />);
      expect(container.querySelector('.lc-db-overlay')).toBeNull();
    });

    it('reopens after the page reload every game action causes', () => {
      const { container, unmount } = render(
        <DesktopDock doc={document} state={makeState()} db={null} />
      );
      fireEvent.click(container.querySelector('.lc-dock-db')!);
      expect(document.querySelector('.lc-db-overlay')).not.toBeNull();

      // The reload: the whole dock is torn down and mounted afresh.
      unmount();
      render(<DesktopDock doc={document} state={makeState()} db={null} />);
      expect(document.querySelector('.lc-db-overlay')).not.toBeNull();
    });

    it('stays closed once closed, rather than reopening on every action', () => {
      const { container, unmount } = render(
        <DesktopDock doc={document} state={makeState()} db={null} />
      );
      fireEvent.click(container.querySelector('.lc-dock-db')!);
      fireEvent.click(document.querySelector('.lc-db-overlay-close')!);
      expect(document.querySelector('.lc-db-overlay')).toBeNull();

      unmount();
      render(<DesktopDock doc={document} state={makeState()} db={null} />);
      expect(document.querySelector('.lc-db-overlay')).toBeNull();
    });
  });

  describe('dungeon quests shortcut', () => {
    // The loader caches quests.json/monsters.json under a fixed GM key in
    // tests (no `?v=` tag), so clear it before stubbing a fresh response —
    // otherwise a stale response cached by an earlier test could satisfy this
    // block's own stub without the mock ever being called.
    function clearQuestDataCache() {
      const base = `lc_cache:${USERSCRIPT_DATA_BASE_URL}`;
      for (const file of ['quests.json', 'monsters.json']) {
        GM_setValue(`${base}/${file}`, '');
        GM_setValue(`${base}/${file}:v`, '');
      }
    }

    function stubQuestData() {
      clearQuestDataCache();
      const stubQuest = {
        id: 1, description: 'Teszt küldetés', reward: '1 db ezüst', rows: 1, cols: 1,
        cells: [{
          row: 0, col: 0,
          edges: { N: { kind: 'open' }, E: { kind: 'open' }, S: { kind: 'open' }, W: { kind: 'open' } },
          monsterId: null, monsterName: null, boss: false, key: null, questItem: false,
          portal: null, trap: false, death: false, narration: '', drops: null, hasQuestion: false,
          question: null, rawImage: '',
        }],
      };
      vi.mocked(GM_xmlhttpRequest).mockImplementation(((opts: {
        url: string;
        onload?: (res: { status: number; responseText: string }) => void;
      }) => {
        if (opts.url.includes('quests.json')) {
          opts.onload?.({ status: 200, responseText: JSON.stringify([stubQuest]) });
        } else if (opts.url.includes('monsters.json')) {
          opts.onload?.({ status: 200, responseText: JSON.stringify([]) });
        }
      }) as unknown as typeof GM_xmlhttpRequest);
    }

    afterEach(() => {
      vi.mocked(GM_xmlhttpRequest).mockReset();
    });

    it('offers no Küldetések button outside a dungeon', () => {
      const { container } = render(<DesktopDock doc={document} state={makeState()} db={null} />);
      expect(container.querySelector('.lc-dock-quests')).toBeNull();
    });

    it('offers a Küldetések button in a dungeon, with no other layout change', () => {
      const { container } = render(
        <DesktopDock doc={document} state={makeState()} db={null} inDungeon />
      );
      expect(container.querySelector('.lc-dock-quests')).not.toBeNull();
      // Everything else about the dock is unchanged: the plain Adatbázis
      // button and config gear are still there, side by side with it.
      expect(container.querySelector('.lc-dock-db')).not.toBeNull();
      expect(container.querySelector('.lc-dock-config')).not.toBeNull();
    });

    it('opens the database overlay on the quests view, not merely the panel', async () => {
      stubQuestData();
      const { container } = render(
        <DesktopDock doc={document} state={makeState()} db={null} inDungeon />
      );

      fireEvent.click(container.querySelector('.lc-dock-quests')!);

      // Assert on the rendered quest content, not just that the panel opened —
      // a bug that opened the overlay on the wrong tab would still leave the
      // panel visible.
      expect((await screen.findAllByText('Teszt küldetés')).length).toBeGreaterThan(0);
    });

    it('leaves the plain Adatbázis button opening on the stored route, unchanged', () => {
      GM_setValue(DB_ROUTE_KEY, 'monsters');
      const { container } = render(
        <DesktopDock doc={document} state={makeState()} db={null} inDungeon />
      );

      fireEvent.click(container.querySelector('.lc-dock-db')!);

      expect(document.querySelector('.lc-db-overlay')).not.toBeNull();
      expect(document.querySelector('.lc-db .tab.active')?.textContent).toBe('Szörnyek');
    });
  });

  it('degrades to dbButtonOnly when the action list comes back empty', () => {
    const { container } = render(
      <DesktopDock doc={document} state={makeState({ actions: [] })} db={null} />
    );
    expect(container.querySelector('.lc-hotkey')).toBeNull();
    const labels = [...container.querySelectorAll('.lc-dock-btn')].map(b => b.textContent?.trim());
    expect(labels).toEqual(['⚙', 'Adatbázis']);
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

  it('moves the character with an arrow key press on the game document', () => {
    const gameDoc = new JSDOM('<html><body></body></html>').window.document;
    const north = { dir: 'north' as const, label: 'északra', trigger: vi.fn() };

    render(<DesktopDock doc={gameDoc} state={makeState({ directions: [north] })} db={null} />);

    const event = new gameDoc.defaultView!.KeyboardEvent('keydown', { code: 'ArrowUp', bubbles: true, cancelable: true });
    act(() => {
      gameDoc.body.dispatchEvent(event);
    });

    expect(north.trigger).toHaveBeenCalledTimes(1);
  });

  it('opens the database overlay from the Q shortcut', () => {
    const gameDoc = new JSDOM('<html><body></body></html>').window.document;
    const { container } = render(<DesktopDock doc={gameDoc} state={makeState()} db={null} />);

    act(() => {
      gameDoc.body.dispatchEvent(
        new gameDoc.defaultView!.KeyboardEvent('keydown', { code: 'KeyQ', bubbles: true, cancelable: true })
      );
    });

    expect(container.querySelector('.lc-db-overlay')).not.toBeNull();
  });

  it('closes an open modal with Escape', () => {
    const gameDoc = new JSDOM('<html><body></body></html>').window.document;
    const { container } = render(<DesktopDock doc={gameDoc} state={makeState()} db={null} />);

    fireEvent.click(container.querySelector('.lc-dock-config')!);
    expect(container.querySelector('.lc-drawer-backdrop')).not.toBeNull();

    act(() => {
      gameDoc.body.dispatchEvent(
        new gameDoc.defaultView!.KeyboardEvent('keydown', { code: 'Escape', bubbles: true, cancelable: true })
      );
    });

    expect(container.querySelector('.lc-drawer-backdrop')).toBeNull();
  });
});
