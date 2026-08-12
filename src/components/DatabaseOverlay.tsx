import { h } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { DatabaseApp } from '@/database/DatabaseApp';
import { createDataLoader, gmSource } from '@/shared/data';
import { getDbMinimized, setDbMinimized } from '@/utils/config';

// Static DB assets live under the relative path `static/db/` in both dev and
// production — only the origin differs. Mirrors the DATA_BASE_URL resolution
// in `src/mobile/boot.ts` and `src/desktop/boot.ts`, but the userscript
// serves static assets at `/static/db` (unlike the standalone DB app's `/db`).
const DATA_BASE_URL = import.meta.env.DEV
  ? new URL('/static/db', import.meta.url).href
  : 'https://example.invalid/larkinor/static/db';

export interface DatabaseOverlayProps {
  open: boolean;
  onClose: () => void;
  /** Entity id to open on (weapon/armor/item) — e.g. a monster's dropped item. */
  initialItemId?: number;
  /** Entity name to open on (weapon/armor/item) — e.g. a Home page inventory item. */
  initialItemName?: string;
  /**
   * Offer the minimise control, which docks the overlay into the empty space
   * beside the game instead of covering the page. Desktop only — on a phone the
   * viewport is barely the game's width, so there is no space to dock into.
   */
  minimizable?: boolean;
}

/**
 * Full-screen overlay hosting the ported `DatabaseApp` explorer/map, backed by
 * GM-cached fetches. `DatabaseApp` renders its own `.lc-db` root, so the
 * explorer/map styles already scoped under `.lc-db` in theme.css apply here
 * without any extra wiring.
 *
 * When `minimizable` and minimised it occupies only the strip to the right of
 * the game — the game is 791px wide and desktop windows are far wider — leaving
 * the game visible and playable alongside it. The choice is remembered across
 * page loads, which matters because the game navigates on every action.
 */
export function DatabaseOverlay({
  open,
  onClose,
  initialItemId,
  initialItemName,
  minimizable = false,
}: DatabaseOverlayProps) {
  // The loader must not be rebuilt on every render, but it also must not be
  // created (and start GM_xmlhttpRequest calls) while the overlay is closed —
  // so the hook is called unconditionally and only used once open.
  const loader = useMemo(() => createDataLoader(gmSource(), DATA_BASE_URL), []);
  const [minimized, setMinimized] = useState(() => getDbMinimized());

  if (!open) return null;

  const toggleMinimized = () => {
    const next = !minimized;
    setMinimized(next);
    setDbMinimized(next);
  };

  // A stored preference must not dock the overlay where there is nowhere to dock.
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
      <div class="lc-db-overlay-body">
        <DatabaseApp loader={loader} routing="memory" initialItemId={initialItemId} initialItemName={initialItemName} />
      </div>
    </div>
  );
}
