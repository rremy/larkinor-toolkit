import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { DatabaseOverlay } from '../src/components/DatabaseOverlay';
import { DB_MINIMIZED_KEY, DB_ROUTE_KEY, QUEST_TILE_KEY, getPanelMinimized, setPanelMinimized, getDbRoute, getPref } from '../src/utils/config';
import { QUEST_SELECTED_PREF_KEY } from '../src/shared/prefKeys';
import { USERSCRIPT_DATA_BASE_URL } from '../src/shared/publicUrl';

/** The label of the currently selected tab, or null if none is. */
function activeTab(): string | null {
  return document.querySelector('.lc-db .tab.active')?.textContent ?? null;
}

describe('DatabaseOverlay', () => {
  beforeEach(() => {
    location.hash = '';
    // The overlay now persists its route, so a test that switches tabs would
    // otherwise decide which tab every later test starts on.
    GM_setValue(DB_ROUTE_KEY, '');
    // Same hazard for the quest maze's remembered zoom.
    GM_setValue(QUEST_TILE_KEY, '');
    // ...and for the remembered quest selection.
    GM_setValue(QUEST_SELECTED_PREF_KEY, '');
  });
  afterEach(() => {
    location.hash = '';
    // A test that stubs GM_xmlhttpRequest (to feed the quest tab real data)
    // must not leak that implementation into later tests in this file.
    vi.mocked(GM_xmlhttpRequest).mockReset();
  });

  it('renders nothing when closed', () => {
    const { container } = render(<DatabaseOverlay open={false} onClose={() => {}} />);
    expect(container.querySelector('.lc-db-overlay')).toBeNull();
  });

  it('renders the database app and closes when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<DatabaseOverlay open onClose={onClose} />);
    expect(document.querySelector('.lc-db-overlay')).toBeTruthy();
    // The DatabaseApp mounts its own `.lc-db` root inside the overlay body.
    expect(document.querySelector('.lc-db-overlay .lc-db')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Bezárás'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('never touches the game page location.hash — it must not pollute browser history', () => {
    const hashBefore = location.hash;
    const onClose = vi.fn();
    const { unmount } = render(<DatabaseOverlay open onClose={onClose} />);

    // Switching tabs inside the in-game overlay must route in memory only.
    fireEvent.click(screen.getByText('Szörnyek'));
    expect(location.hash).toBe(hashBefore);

    fireEvent.click(screen.getByLabelText('Bezárás'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(location.hash).toBe(hashBefore);

    unmount();
    expect(location.hash).toBe(hashBefore);
  });

  it('renders quest content on the Küldetések tab and never touches location.hash', async () => {
    // The in-game overlay routes in memory; navigating inside it must never
    // write to the game page's URL. Stub GM_xmlhttpRequest so the quest tab
    // has real data to render, proving the quests branch (not just the tab
    // label) mounted under `routing="memory"`.
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
      // Other data files are left unresolved — this test never visits those tabs.
    }) as unknown as typeof GM_xmlhttpRequest);

    const hashBefore = location.hash;
    render(<DatabaseOverlay open onClose={vi.fn()} />);

    fireEvent.click(screen.getByText('Küldetések'));
    expect((await screen.findAllByText('Teszt küldetés')).length).toBeGreaterThan(0);
    expect(document.querySelector('.quest-grid-wrap')).toBeTruthy();

    // The invariant memory routing exists to protect: the game page's hash
    // must be untouched by this navigation.
    expect(location.hash).toBe(hashBefore);
  });

  it('accepts initialItemName without throwing', () => {
    const onClose = vi.fn();
    render(<DatabaseOverlay open onClose={onClose} initialItemName="opál" />);
    expect(document.querySelector('.lc-db-overlay .lc-db')).toBeTruthy();
  });

  describe('initialTab (the dungeon "Küldetések" shortcut)', () => {
    // Same cache hazard as the quest-content test above: the loader caches
    // quests.json/monsters.json under a fixed GM key in tests, so clear it
    // before stubbing a fresh response.
    function clearQuestDataCache() {
      const base = `lc_cache:${USERSCRIPT_DATA_BASE_URL}`;
      for (const file of ['quests.json', 'monsters.json']) {
        GM_setValue(`${base}/${file}`, '');
        GM_setValue(`${base}/${file}:v`, '');
      }
    }

    function stubQuestAndMonsterData() {
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

    it('lands on the quests tab even when a different route is stored — the precedence rule the button relies on', async () => {
      // A stored route from a previous session, deliberately not quests: the
      // button must win over it, not merely happen to agree with it.
      GM_setValue(DB_ROUTE_KEY, 'monsters');
      stubQuestAndMonsterData();

      render(<DatabaseOverlay open initialTab="quests" onClose={vi.fn()} />);

      expect(activeTab()).toBe('Küldetések');
      // Assert on quest content, not merely the tab label — a regression that
      // left the route on 'monsters' while mislabelling the active tab would
      // otherwise pass.
      expect((await screen.findAllByText('Teszt küldetés')).length).toBeGreaterThan(0);
    });

    it('still lets initialItemId win over initialTab when both are supplied', async () => {
      const stubItem = {
        id: 501, name: 'Teszt tárgy', weight: 1, price: 1, marketPrice: null, special: '',
        magical: false, craftableAt: '', minLevel: null, recipe: [], droppedBy: [], defense: null, shops: [],
      };
      vi.mocked(GM_xmlhttpRequest).mockImplementation(((opts: {
        url: string;
        onload?: (res: { status: number; responseText: string }) => void;
      }) => {
        if (opts.url.includes('weapons.json') || opts.url.includes('armors.json')) {
          opts.onload?.({ status: 200, responseText: JSON.stringify([]) });
        } else if (opts.url.includes('items.json')) {
          opts.onload?.({ status: 200, responseText: JSON.stringify([stubItem]) });
        }
      }) as unknown as typeof GM_xmlhttpRequest);

      render(<DatabaseOverlay open initialItemId={501} initialTab="quests" onClose={vi.fn()} />);

      // The list row and the detail panel both show the name, hence "All".
      expect((await screen.findAllByText('Teszt tárgy')).length).toBeGreaterThan(0);
      expect(activeTab()).toBe('Tárgyak');
    });
  });

  describe('remembered route', () => {
    it('opens on the default tab when nothing is stored', () => {
      render(<DatabaseOverlay open onClose={vi.fn()} />);
      expect(activeTab()).toBe('Fegyverek');
    });

    it('stores the tab when the user switches to it', () => {
      render(<DatabaseOverlay open onClose={vi.fn()} />);
      fireEvent.click(screen.getByText('Térkép'));
      expect(getDbRoute()).toBe('map');
    });

    it('comes back on the map after the reload a game action causes', () => {
      // The reported case: open the database, switch to the map, minimise, move,
      // and the reload must not drop you back on the weapons list.
      const { unmount } = render(<DatabaseOverlay open minimizable onClose={vi.fn()} />);
      fireEvent.click(screen.getByText('Térkép'));
      expect(activeTab()).toBe('Térkép');
      unmount();

      render(<DatabaseOverlay open minimizable onClose={vi.fn()} />);
      expect(activeTab()).toBe('Térkép');
    });

    it('restores a stored tab even without the minimise control (mobile)', () => {
      const { unmount } = render(<DatabaseOverlay open onClose={vi.fn()} />);
      fireEvent.click(screen.getByText('Szörnyek'));
      unmount();

      render(<DatabaseOverlay open onClose={vi.fn()} />);
      expect(activeTab()).toBe('Szörnyek');
    });

    it('falls back to the default tab when the stored route is unusable', () => {
      // A hand-edited or stale key must degrade, not render a blank panel.
      GM_setValue(DB_ROUTE_KEY, 'nonsense/../7');
      render(<DatabaseOverlay open onClose={vi.fn()} />);
      expect(activeTab()).toBe('Fegyverek');
    });

    it('still writes the route through the game page hash, not the URL', () => {
      const hashBefore = location.hash;
      render(<DatabaseOverlay open onClose={vi.fn()} />);
      fireEvent.click(screen.getByText('Térkép'));
      expect(getDbRoute()).toBe('map');
      expect(location.hash).toBe(hashBefore);
    });
  });

  describe('remembered quest zoom', () => {
    // The overlay is the surface this feature exists for: the game reloads on
    // every action, so the GM-backed PrefStore wiring in DatabaseOverlay is
    // what actually has to survive that reload, not just DatabaseApp's props.
    function stubQuestData() {
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

    it('changes the tile size to a supplied value', async () => {
      stubQuestData();
      render(<DatabaseOverlay open onClose={vi.fn()} />);
      fireEvent.click(screen.getByText('Küldetések'));
      const select = await screen.findByLabelText('Méret') as HTMLSelectElement;

      fireEvent.change(select, { target: { value: '40' } });
      expect(select.value).toBe('40');
      expect(getPref(QUEST_TILE_KEY)).toBe('40');
    });

    // The actual round trip: not just that write() was called, but that a
    // fresh mount reading from the same GM storage comes back with the size
    // that was set before the reload — the real-world case is the game
    // reloading the whole page after every action.
    it('survives the reload the game performs on every action', async () => {
      stubQuestData();
      const { unmount } = render(<DatabaseOverlay open onClose={vi.fn()} />);
      fireEvent.click(screen.getByText('Küldetések'));
      const select = await screen.findByLabelText('Méret') as HTMLSelectElement;
      fireEvent.change(select, { target: { value: '40' } });
      unmount();

      stubQuestData();
      render(<DatabaseOverlay open onClose={vi.fn()} />);
      fireEvent.click(screen.getByText('Küldetések'));
      const selectAfterReload = await screen.findByLabelText('Méret') as HTMLSelectElement;
      expect(selectAfterReload.value).toBe('40');
    });
  });

  describe('remembered quest selection', () => {
    // The overlay's tab bar always navigates with a null id (DatabaseApp.tsx's
    // `navigate(t, null)`), so its route store alone can't recover which quest
    // was selected after switching away and back — that's exactly the gap the
    // quest PrefStore (wired the same way as the zoom above) exists to close.
    // The loader caches quests.json/monsters.json under a fixed GM key (no
    // `?v=` tag in tests), so an earlier test in this file (e.g. "remembered
    // quest zoom" above, which stubs a single quest under the same file name)
    // leaves a cached response behind that would otherwise silently satisfy
    // this describe block's own two-quest stub without ever calling the mock.
    function clearQuestDataCache() {
      const base = `lc_cache:${USERSCRIPT_DATA_BASE_URL}`;
      for (const file of ['quests.json', 'monsters.json']) {
        GM_setValue(`${base}/${file}`, '');
        GM_setValue(`${base}/${file}:v`, '');
      }
    }

    function stubQuestData() {
      clearQuestDataCache();
      const cellFor = () => ({
        row: 0, col: 0,
        edges: { N: { kind: 'open' }, E: { kind: 'open' }, S: { kind: 'open' }, W: { kind: 'open' } },
        monsterId: null, monsterName: null, boss: false, key: null, questItem: false,
        portal: null, trap: false, death: false, narration: '', drops: null, hasQuestion: false,
        question: null, rawImage: '',
      });
      const stubQuests = [
        { id: 1, description: 'Első teszt küldetés', reward: '1 db ezüst', rows: 1, cols: 1, cells: [cellFor()] },
        { id: 2, description: 'Második teszt küldetés', reward: '2 db ezüst', rows: 1, cols: 1, cells: [cellFor()] },
      ];
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

    it('remembers the selected quest across a tab switch', async () => {
      stubQuestData();
      render(<DatabaseOverlay open onClose={vi.fn()} />);
      fireEvent.click(screen.getByText('Küldetések'));
      await screen.findByText('1. küldetés');

      fireEvent.click(document.querySelectorAll('.quest-chip')[1]);
      await screen.findByText('2. küldetés');

      // Switching away and back gives the quests tab a null id on return —
      // task 19's exact reported failure — so this only passes if the
      // restore reads the PrefStore rather than falling back to quest 1.
      fireEvent.click(screen.getByText('Fegyverek'));
      fireEvent.click(screen.getByText('Küldetések'));
      await screen.findByText('2. küldetés');
    });

    // The actual round trip through GM storage: not just that write() was
    // called, but that a fresh mount (the reload the game performs on every
    // action) comes back on the quest that was selected before it.
    it('survives the reload the game performs on every action', async () => {
      stubQuestData();
      const { unmount } = render(<DatabaseOverlay open onClose={vi.fn()} />);
      fireEvent.click(screen.getByText('Küldetések'));
      await screen.findByText('1. küldetés');
      fireEvent.click(document.querySelectorAll('.quest-chip')[1]);
      await screen.findByText('2. küldetés');
      unmount();

      stubQuestData();
      render(<DatabaseOverlay open onClose={vi.fn()} />);
      fireEvent.click(screen.getByText('Küldetések'));
      await screen.findByText('2. küldetés');
    });
  });

  describe('minimise control', () => {
    beforeEach(() => { GM_setValue(DB_MINIMIZED_KEY, ''); });

    it('is absent by default, so the mobile UI is unchanged', () => {
      render(<DatabaseOverlay open onClose={vi.fn()} />);
      expect(document.querySelector('.lc-db-overlay-minimize')).toBeNull();
    });

    it('docks the overlay beside the game and restores it', () => {
      render(<DatabaseOverlay open minimizable onClose={vi.fn()} />);
      const overlay = document.querySelector('.lc-db-overlay')!;
      expect(overlay.classList.contains('lc-db-overlay--minimized')).toBe(false);

      fireEvent.click(screen.getByLabelText('Kis méret'));
      expect(document.querySelector('.lc-db-overlay')!.classList.contains('lc-db-overlay--minimized')).toBe(true);

      fireEvent.click(screen.getByLabelText('Teljes méret'));
      expect(document.querySelector('.lc-db-overlay')!.classList.contains('lc-db-overlay--minimized')).toBe(false);
    });

    it('persists the choice', () => {
      const { unmount } = render(<DatabaseOverlay open minimizable onClose={vi.fn()} />);
      fireEvent.click(screen.getByLabelText('Kis méret'));
      expect(getPanelMinimized(DB_MINIMIZED_KEY)).toBe(true);
      unmount();

      // The game navigates on every action, so the overlay is re-created
      // constantly — it has to come back minimised.
      render(<DatabaseOverlay open minimizable onClose={vi.fn()} />);
      expect(document.querySelector('.lc-db-overlay')!.classList.contains('lc-db-overlay--minimized')).toBe(true);
    });

    it('ignores a stored preference where there is nowhere to dock', () => {
      // Mobile shares the storage key; a desktop choice must not dock the
      // overlay off-screen on a phone.
      setPanelMinimized(DB_MINIMIZED_KEY, true);
      render(<DatabaseOverlay open onClose={vi.fn()} />);
      expect(document.querySelector('.lc-db-overlay')!.classList.contains('lc-db-overlay--minimized')).toBe(false);
    });
  });
});
