import { h, type ComponentChildren, type JSX } from 'preact';
import { useState } from 'preact/hooks';
import { getPanelMinimized, setPanelMinimized } from '@/utils/config';

export interface DockedPanelProps {
  open: boolean;
  onClose: () => void;
  /**
   * GM key remembering this panel's minimised state. Per-panel, so the database
   * and the inventory are independent of one another.
   */
  storageKey: string;
  /**
   * Offer the minimise control, which docks the panel into the empty page beside
   * the game instead of covering it. Desktop only — a phone viewport is barely
   * the game's width, so there is nowhere to dock.
   */
  minimizable?: boolean;
  children?: ComponentChildren;
}

/**
 * Shell for a full-screen-or-docked panel: the window controls, the minimised
 * placement, and the remembered choice. Extracted so the database and the
 * inventory share one implementation rather than each carrying its own copy of
 * the persistence logic.
 *
 * The `lc-db-overlay*` class names predate the second caller and are historical
 * — the styles themselves are generic panel chrome, and renaming them would
 * churn several unrelated test files for no behavioural gain.
 */
export function DockedPanel({
  open,
  onClose,
  storageKey,
  minimizable = false,
  children,
}: DockedPanelProps): JSX.Element | null {
  const [minimized, setMinimized] = useState(() => getPanelMinimized(storageKey));

  if (!open) return null;

  const toggleMinimized = () => {
    const next = !minimized;
    setMinimized(next);
    setPanelMinimized(storageKey, next);
  };

  // A stored preference must not dock the panel where there is nowhere to dock.
  const docked = minimizable && minimized;

  return (
    <div class={`lc-db-overlay${docked ? ' lc-db-overlay--minimized' : ''}`}>
      {minimizable && (
        <button
          class="lc-db-overlay-minimize"
          aria-label={minimized ? 'Teljes méret' : 'Kis méret'}
          title={minimized ? 'Teljes méret' : 'Kis méret — a játék mellé'}
          aria-pressed={minimized}
          onClick={toggleMinimized}
        >
          {minimized ? '□' : '–'}
        </button>
      )}
      <button class="lc-db-overlay-close" aria-label="Bezárás" onClick={onClose}>✕</button>
      <div class="lc-db-overlay-body">{children}</div>
    </div>
  );
}
