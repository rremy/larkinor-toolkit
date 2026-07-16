import { h } from 'preact';
import { useMemo } from 'preact/hooks';
import { DatabaseApp } from '@/database/DatabaseApp';
import { createDataLoader, gmSource } from '@/shared/data';

// Static DB assets live under the relative path `static/db/` in both dev and
// production — only the origin differs. Mirrors the DATA_BASE_URL resolution
// in `src/main.ts`, but the userscript serves static assets at `/static/db`
// (unlike the standalone DB app's `/db`).
const DATA_BASE_URL = import.meta.env.DEV
  ? new URL('/static/db', import.meta.url).href
  : 'https://example.invalid/larkinor/static/db';

export interface DatabaseOverlayProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Full-screen overlay hosting the ported `DatabaseApp` explorer/map, backed by
 * GM-cached fetches. `DatabaseApp` renders its own `.lc-db` root, so the
 * explorer/map styles already scoped under `.lc-db` in theme.css apply here
 * without any extra wiring.
 */
export function DatabaseOverlay({ open, onClose }: DatabaseOverlayProps) {
  // The loader must not be rebuilt on every render, but it also must not be
  // created (and start GM_xmlhttpRequest calls) while the overlay is closed —
  // so the hook is called unconditionally and only used once open.
  const loader = useMemo(() => createDataLoader(gmSource(), DATA_BASE_URL), []);

  if (!open) return null;

  return (
    <div class="lc-db-overlay">
      <button class="lc-db-overlay-close" aria-label="Bezárás" onClick={onClose}>✕</button>
      <div class="lc-db-overlay-body">
        <DatabaseApp loader={loader} />
      </div>
    </div>
  );
}
