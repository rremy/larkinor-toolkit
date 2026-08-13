import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { DatabaseOverlay } from '../src/components/DatabaseOverlay';
import { DB_MINIMIZED_KEY, DB_ROUTE_KEY, QUEST_TILE_KEY, getPanelMinimized, setPanelMinimized, getDbRoute, getPref } from '../src/utils/config';

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
