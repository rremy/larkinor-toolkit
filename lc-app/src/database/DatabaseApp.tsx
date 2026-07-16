import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { DataLoader } from '@/shared/data';
import type { EntityTab } from './explorer/columns';
import { TAB_LABEL } from './explorer/labels';
import { ExplorerView } from './explorer/ExplorerView';

export interface DatabaseAppProps {
  loader: DataLoader;
}

const TABS: EntityTab[] = ['weapons', 'armors', 'items', 'monsters'];

interface Route {
  tab: EntityTab;
  id: number | null;
}

function parseHash(): Route {
  const m = (location.hash || '').match(/^#([a-z]+)(?:\/(-?\d+))?$/);
  if (!m || !TABS.includes(m[1] as EntityTab)) return { tab: 'weapons', id: null };
  return { tab: m[1] as EntityTab, id: m[2] != null ? Number(m[2]) : null };
}

function hashFor(tab: EntityTab, id: number | null): string {
  return id != null ? `#${tab}/${id}` : `#${tab}`;
}

export function DatabaseApp(props: DatabaseAppProps) {
  const { loader } = props;
  const [route, setRoute] = useState<Route>(() => parseHash());

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHashChange);
    // Ensure the address bar reflects the initial (possibly defaulted) route.
    if (!location.hash) navigate(route.tab, route.id);
    return () => window.removeEventListener('hashchange', onHashChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function navigate(tab: EntityTab, id: number | null) {
    const next = hashFor(tab, id);
    if (location.hash !== next) location.hash = next;
    else setRoute({ tab, id });
  }

  function onSelect(id: number | null) {
    navigate(route.tab, id);
  }

  /**
   * Resolve a cross-reference jump. Monster references navigate directly;
   * entity references (recipe/drops) may point at a weapon, armor or item, so
   * search all three loaded datasets for the id (mirrors the legacy
   * `jumpToEntry`). The loader caches responses, so repeat lookups are cheap.
   */
  async function onJump(tab: EntityTab, id: number) {
    if (tab === 'monsters') { navigate('monsters', id); return; }
    const [weapons, armors, items] = await Promise.all([
      loader.loadWeapons(), loader.loadArmors(), loader.loadItems(),
    ]);
    if (weapons.some((w) => w.id === id)) navigate('weapons', id);
    else if (armors.some((a) => a.id === id)) navigate('armors', id);
    else if (items.some((it) => it.id === id)) navigate('items', id);
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
              {TAB_LABEL[t]}
            </div>
          ))}
        </div>
      </header>
      <ExplorerView
        loader={loader}
        tab={route.tab}
        selectedId={route.id}
        onSelect={onSelect}
        onJump={onJump}
      />
    </div>
  );
}
