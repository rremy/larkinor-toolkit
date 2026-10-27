import { h, type ComponentChildren, type JSX } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { getPanelMinimized, setPanelMinimized } from '@/utils/config';

/**
 * The panels currently open, outermost first. Panels nest — an inventory item
 * opens the database over it — so Escape has to close the innermost one and
 * leave the rest standing.
 *
 * Module-level rather than context because the panels do not share a Preact
 * tree in every case, and the stack has to survive across them.
 */
interface OpenPanel {
  close: () => void;
  /** Read live: minimising does not re-register the panel. */
  docked: () => boolean;
}

const openPanels: OpenPanel[] = [];

/**
 * A panel docked beside the game leaves the game playable, so it leaves the
 * keyboard to the game too: Escape closes only a full-size panel, and only a
 * full-size one stands the game's shortcuts down.
 */
function innermostBlocking(): OpenPanel | undefined {
  for (let i = openPanels.length - 1; i >= 0; i -= 1) {
    if (!openPanels[i].docked()) return openPanels[i];
  }
  return undefined;
}

function handleEscape(event: KeyboardEvent): void {
  if (event.code !== 'Escape') return;
  if (event.ctrlKey || event.altKey || event.metaKey) return;
  const panel = innermostBlocking();
  if (!panel) return;
  event.preventDefault();
  panel.close();
}

/**
 * True while a full-size panel is open — it covers the game, so the game's
 * shortcuts and the other Escape handlers stand down. A panel docked beside
 * the game does not count.
 */
export function hasBlockingPanel(): boolean {
  return innermostBlocking() !== undefined;
}

export interface DockedPanelProps {
  open: boolean;
  onClose: () => void;
  /**
   * GM key remembering this panel's minimised state. Per-panel, so the database
   * and the inventory are independent of one another.
   */
  storageKey: string;
  /** Shown in the panel's header bar, beside the window controls. */
  title: string;
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
  title,
  minimizable = false,
  children,
}: DockedPanelProps): JSX.Element | null {
  const [minimized, setMinimized] = useState(() => getPanelMinimized(storageKey));

  // Read through a ref so the registration below does not have to re-run — and
  // reorder the stack — every time the parent passes a fresh onClose.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // The same for the docked state, which the stack reads at keydown time.
  const dockedRef = useRef(false);

  useEffect(() => {
    if (!open) return;

    const panel: OpenPanel = { close: () => onCloseRef.current(), docked: () => dockedRef.current };
    openPanels.push(panel);
    if (openPanels.length === 1) document.addEventListener('keydown', handleEscape);

    return () => {
      const at = openPanels.indexOf(panel);
      if (at >= 0) openPanels.splice(at, 1);
      if (openPanels.length === 0) document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  if (!open) return null;

  const toggleMinimized = () => {
    const next = !minimized;
    setMinimized(next);
    setPanelMinimized(storageKey, next);
  };

  // A stored preference must not dock the panel where there is nowhere to dock.
  const docked = minimizable && minimized;
  dockedRef.current = docked;

  return (
    <div class={`lc-db-overlay${docked ? ' lc-db-overlay--minimized' : ''}`}>
      {/* A real header bar, not controls floating over the content. They used to
          be position: fixed in the corner, which sat on top of whatever the panel
          happened to put there — the market's second column header, for one. */}
      <header class="lc-panel-head">
        <h2 class="lc-panel-title">{title}</h2>
        <div class="lc-panel-controls">
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
        </div>
      </header>
      <div class="lc-db-overlay-body">{children}</div>
    </div>
  );
}
