import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { DatabaseOverlay } from '../src/components/DatabaseOverlay';
import { DB_MINIMIZED_KEY, DB_ROUTE_KEY, getPanelMinimized, setPanelMinimized, getDbRoute } from '../src/utils/config';

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
  });
  afterEach(() => { location.hash = ''; });

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
