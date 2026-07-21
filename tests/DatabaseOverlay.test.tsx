import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { DatabaseOverlay } from '../src/components/DatabaseOverlay';

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
});
