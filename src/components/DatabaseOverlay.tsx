import { h } from 'preact';
import { useMemo } from 'preact/hooks';
import { DatabaseApp } from '@/database/DatabaseApp';
import { createDataLoader, gmSource } from '@/shared/data';
import { USERSCRIPT_DATA_BASE_URL } from '@/shared/publicUrl';
import { DockedPanel } from '@/components/DockedPanel';
import { DB_MINIMIZED_KEY } from '@/utils/config';

// Resolved once in @/shared/publicUrl and shared with both boot modules. Note
// this is the *userscript* data URL (`/static/db`); the standalone database app
// resolves its own relative to the page it is served from (src/database/main.tsx).
const DATA_BASE_URL = USERSCRIPT_DATA_BASE_URL;

export interface DatabaseOverlayProps {
  open: boolean;
  onClose: () => void;
  /** Entity id to open on (weapon/armor/item) — e.g. a monster's dropped item. */
  initialItemId?: number;
  /** Entity name to open on (weapon/armor/item) — e.g. a Home page inventory item. */
  initialItemName?: string;
  /** Offer the minimise control (desktop only — see DockedPanel). */
  minimizable?: boolean;
}

/**
 * Hosts the ported `DatabaseApp` explorer/map in a `DockedPanel`, backed by
 * GM-cached fetches. `DatabaseApp` renders its own `.lc-db` root, so the
 * explorer/map styles already scoped under `.lc-db` in theme.css apply here
 * without any extra wiring.
 */
export function DatabaseOverlay({
  open,
  onClose,
  initialItemId,
  initialItemName,
  minimizable = false,
}: DatabaseOverlayProps) {
  // The loader must not be rebuilt on every render, but it also must not be
  // created (and start GM_xmlhttpRequest calls) while the panel is closed — so
  // the hook is called unconditionally and DockedPanel renders nothing, and
  // therefore mounts no DatabaseApp, until `open`.
  const loader = useMemo(() => createDataLoader(gmSource(), DATA_BASE_URL), []);

  return (
    <DockedPanel title="Adatbázis" open={open} onClose={onClose} storageKey={DB_MINIMIZED_KEY} minimizable={minimizable}>
      <DatabaseApp loader={loader} routing="memory" initialItemId={initialItemId} initialItemName={initialItemName} />
    </DockedPanel>
  );
}
