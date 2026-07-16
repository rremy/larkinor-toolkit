import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { DatabaseOverlay } from '../src/components/DatabaseOverlay';

describe('DatabaseOverlay', () => {
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
});
