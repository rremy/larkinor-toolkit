import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { DatabaseOverlay } from '../src/components/DatabaseOverlay';
import { DB_MINIMIZED_KEY, getPanelMinimized, setPanelMinimized } from '../src/utils/config';

describe('DatabaseOverlay', () => {
  beforeEach(() => { location.hash = ''; });
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
