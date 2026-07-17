import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { DataLoader } from '@/shared/data';
import type { EntityTab } from './explorer/columns';
import { TAB_LABEL } from './explorer/labels';
import { ExplorerView } from './explorer/ExplorerView';
import { MapView } from './map/MapView';

export interface DatabaseAppProps {
  loader: DataLoader;
  /**
   * `'hash'` (default) routes through the global `location.hash` — used by the
   * standalone DB page so links/back-button/reload behave as a real page.
   * `'memory'` keeps the route in component state only — used when this
   * component is mounted as an overlay on the live game page, so it never
   * touches the game's browser history or leaves a stray `#tab/id` fragment
   * on the game URL after closing.
   */
  routing?: 'hash' | 'memory';
}

type Tab = EntityTab | 'map';

const EXPLORER_TABS: EntityTab[] = ['weapons', 'armors', 'items', 'monsters'];
const TABS: Tab[] = [...EXPLORER_TABS, 'map'];
const TAB_LABELS: Record<Tab, string> = { ...TAB_LABEL, map: 'Térkép' };

interface Route {
  tab: Tab;
  /** Selected entity id on explorer tabs (null on the map tab). */
  id: number | null;
  /** Selected/target cell id on the map tab (null on explorer tabs). */
  cell: string | null;
}

function isTab(value: string): value is Tab {
  return (TABS as string[]).includes(value);
}

const DEFAULT_ROUTE: Route = { tab: 'weapons', id: null, cell: null };

/** Build a route from a tab + raw `#tab/param` segment (param is per-tab). */
function routeFor(tab: Tab, param: string | null): Route {
  if (tab === 'map') return { tab, id: null, cell: param };
  return { tab, id: param != null ? Number(param) : null, cell: null };
}

function parseHash(): Route {
  const m = (location.hash || '').match(/^#([a-z]+)(?:\/(-?\d+))?$/);
  if (!m || !isTab(m[1])) return DEFAULT_ROUTE;
  return routeFor(m[1] as Tab, m[2] ?? null);
}

function hashFor(tab: Tab, param: string | null): string {
  return param != null ? `#${tab}/${param}` : `#${tab}`;
}

export function DatabaseApp(props: DatabaseAppProps) {
  const { loader, routing = 'hash' } = props;
  const [route, setRoute] = useState<Route>(() => (routing === 'hash' ? parseHash() : DEFAULT_ROUTE));

  useEffect(() => {
    if (routing !== 'hash') return;
    const onHashChange = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHashChange);
    // Ensure the address bar reflects the initial (possibly defaulted) route.
    if (!location.hash) navigate(route.tab, null);
    return () => window.removeEventListener('hashchange', onHashChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routing]);

  function navigate(tab: Tab, param: string | null) {
    if (routing !== 'hash') { setRoute(routeFor(tab, param)); return; }
    const next = hashFor(tab, param);
    if (location.hash !== next) location.hash = next;
    else setRoute(routeFor(tab, param));
  }

  function onSelect(id: number | null) {
    navigate(route.tab, id != null ? String(id) : null);
  }

  /** Open the map with a specific cell selected (shop location links). */
  function showCell(cellId: string) {
    navigate('map', cellId);
  }

  /**
   * Resolve a cross-reference jump. Monster references navigate directly;
   * entity references (recipe/drops) may point at a weapon, armor or item, so
   * search all three loaded datasets for the id (mirrors the legacy
   * `jumpToEntry`). The loader caches responses, so repeat lookups are cheap.
   */
  async function onJump(tab: EntityTab, id: number) {
    if (tab === 'monsters') { navigate('monsters', String(id)); return; }
    const [weapons, armors, items] = await Promise.all([
      loader.loadWeapons(), loader.loadArmors(), loader.loadItems(),
    ]);
    if (weapons.some((w) => w.id === id)) navigate('weapons', String(id));
    else if (armors.some((a) => a.id === id)) navigate('armors', String(id));
    else if (items.some((it) => it.id === id)) navigate('items', String(id));
  }

  return (
    <div class="lc-db">
      <header class="top">
        <h1>Larkinor adatbázis</h1>
        <div class="tabs">
          {TABS.map((t) => (
            <div
              key={t}
              class={`tab${t === route.tab ? ' active' : ''}`}
              onClick={() => navigate(t, null)}
            >
              {TAB_LABELS[t]}
            </div>
          ))}
        </div>
      </header>
      {route.tab === 'map' ? (
        <MapView loader={loader} targetCellId={route.cell} />
      ) : (
        <ExplorerView
          loader={loader}
          tab={route.tab}
          selectedId={route.id}
          onSelect={onSelect}
          onJump={onJump}
          onShowCell={showCell}
        />
      )}
    </div>
  );
}
