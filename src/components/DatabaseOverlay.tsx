import { h } from 'preact';
import { useMemo } from 'preact/hooks';
import { DatabaseApp, type PrefStore, type RouteStore } from '@/database/DatabaseApp';
import { createDataLoader, gmSource } from '@/shared/data';
import { USERSCRIPT_DATA_BASE_URL } from '@/shared/publicUrl';
import { DockedPanel } from '@/components/DockedPanel';
import { DB_MINIMIZED_KEY, getDbRoute, setDbRoute, getPref, setPref } from '@/utils/config';

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
  /**
   * Tab to open on (currently only 'quests') — the desktop dock's dungeon-only
   * "Küldetések" button. See DatabaseApp's `initialTab` for the precedence
   * rules against `initialItemId`/`initialItemName`.
   */
  initialTab?: 'quests';
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
  initialTab,
  minimizable = false,
}: DatabaseOverlayProps) {
  // The loader must not be rebuilt on every render, but it also must not be
  // created (and start GM_xmlhttpRequest calls) while the panel is closed — so
  // the hook is called unconditionally and DockedPanel renders nothing, and
  // therefore mounts no DatabaseApp, until `open`.
  const loader = useMemo(() => createDataLoader(gmSource(), DATA_BASE_URL), []);

  // Remembers the tab and selection across the reload the game performs on every
  // action, so a minimised database comes back showing what it showed before.
  // Opening on a specific entity still wins: those props navigate on mount and
  // the navigation itself overwrites the stored route.
  const routeStore = useMemo<RouteStore>(() => ({ read: getDbRoute, write: setDbRoute }), []);

  // Same idea, generalised: any hosted view (currently just the quest maze's
  // zoom) can remember a value under its own key, surviving the same reload.
  const prefStore = useMemo<PrefStore>(() => ({ read: getPref, write: setPref }), []);

  return (
    <DockedPanel title="Adatbázis" open={open} onClose={onClose} storageKey={DB_MINIMIZED_KEY} minimizable={minimizable}>
      <DatabaseApp
        loader={loader}
        routing="memory"
        routeStore={routeStore}
        prefStore={prefStore}
        initialItemId={initialItemId}
        initialItemName={initialItemName}
        initialTab={initialTab}
      />
    </DockedPanel>
  );
}
