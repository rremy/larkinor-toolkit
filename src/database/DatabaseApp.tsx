import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { DataLoader } from '@/shared/data';
import type { EntityTab } from './explorer/columns';
import { TAB_LABEL } from './explorer/labels';
import { ExplorerView } from './explorer/ExplorerView';
import { MapView } from './map/MapView';
import { QuestView } from './quests/QuestView';

/**
 * Somewhere to keep the current route across remounts, for `'memory'` routing.
 *
 * Injected rather than imported so this component — which also ships in the
 * standalone site bundle — stays free of any GM_* dependency. The in-game
 * overlay supplies a GM-backed implementation; the standalone page supplies
 * none and keeps using the URL hash.
 */
export interface RouteStore {
  /** The stored route, or null if there is none. */
  read(): string | null;
  write(route: string): void;
}

/**
 * Somewhere to keep a named preference across remounts — e.g. the quest
 * maze's zoom, which should survive the reload the game performs on every
 * action, same as the route above.
 *
 * Deliberately generic and key-based rather than named after the one value it
 * happens to store first: a second tile-size-shaped prop bolted onto
 * `DatabaseAppProps` for the next preference would not age well, and the
 * maze zoom is unlikely to be the last thing worth remembering here. Callers
 * pick their own key (a plain string) and own its value's parsing/validation
 * — this store only persists opaque strings.
 *
 * Injected rather than imported for the same reason as `RouteStore`: this
 * component also ships in the standalone site bundle, which has no GM_* APIs.
 * The in-game overlay supplies a GM-backed implementation; the standalone
 * page supplies a `localStorage`-backed one.
 */
export interface PrefStore {
  /** The stored value for `key`, or null if there is none. */
  read(key: string): string | null;
  write(key: string, value: string): void;
}

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
  /**
   * Optional persistence for `'memory'` routing: the route is read from here on
   * mount and written back on every navigation. Ignored under `'hash'` routing,
   * where the URL already is the store.
   */
  routeStore?: RouteStore;
  /**
   * Optional keyed preference persistence, passed straight through to any
   * hosted view that wants to remember something across remounts (currently
   * just `QuestView`'s zoom). Absent under the standalone build's default
   * boot and in tests, both of which are expected to behave exactly as if it
   * were never wired up.
   */
  prefStore?: PrefStore;
  /**
   * Entity id to open on mount (weapon/armor/item) — resolved to its tab. Used
   * when the overlay is opened from a monster's dropped-item link.
   */
  initialItemId?: number;
  /** Entity name to open on mount — resolved to its tab+id. Used from the Home page. */
  initialItemName?: string;
  /**
   * Tab to open on mount, bypassing whatever `routeStore` had remembered.
   * Currently only `'quests'`, for the desktop dock's dungeon-only
   * "Küldetések" button — the whole point of that button is to land on
   * quests regardless of what the panel last showed, so this must win over
   * the stored route. Deliberately narrow (one literal, not `Tab`): nothing
   * else opens on an arbitrary tab, and a general tab-routing prop would be
   * speculative API surface nobody needs yet.
   *
   * `initialItemId`/`initialItemName` are more specific (a particular
   * entity within a tab) and must still win if somehow supplied alongside
   * this — see the effect below for how that precedence is enforced.
   */
  initialTab?: 'quests';
  /**
   * Nonce accompanying `initialTab`, bumped by the caller on every press.
   *
   * `initialTab` alone cannot drive a repeated navigation: the effect below
   * depends on it, but pressing the same dock button twice hands this
   * component the same `'quests'` literal both times, which is not a state
   * change and so re-fires nothing — the overlay would silently stay on
   * whatever tab the user had navigated to in between. Depending on this
   * value too (bumped on every press, even to the same tab) forces the
   * effect to run again regardless of whether `initialTab` itself changed.
   */
  initialTabKey?: number;
}

type Tab = EntityTab | 'map' | 'quests';

const EXPLORER_TABS: EntityTab[] = ['weapons', 'armors', 'items', 'monsters'];
const TABS: Tab[] = [...EXPLORER_TABS, 'map', 'quests'];
const TAB_LABELS: Record<Tab, string> = { ...TAB_LABEL, map: 'Térkép', quests: 'Küldetések' };

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

/**
 * Serialise to `tab[/param]`. The param is an entity id on explorer tabs and a
 * map cell id on the map tab; both are numeric strings, so one grammar covers
 * them (map cell ids are the game's `imageId`, e.g. "54").
 */
function serializeRoute(tab: Tab, param: string | null): string {
  return param != null ? `${tab}/${param}` : tab;
}

/** Inverse of `serializeRoute`. Anything unrecognised degrades to the default. */
function parseRoute(raw: string): Route {
  const m = raw.match(/^([a-z]+)(?:\/(-?\d+))?$/);
  if (!m || !isTab(m[1])) return DEFAULT_ROUTE;
  return routeFor(m[1] as Tab, m[2] ?? null);
}

function parseHash(): Route {
  return parseRoute((location.hash || '').replace(/^#/, ''));
}

function hashFor(tab: Tab, param: string | null): string {
  return `#${serializeRoute(tab, param)}`;
}

export function DatabaseApp(props: DatabaseAppProps) {
  const { loader, routing = 'hash', routeStore, prefStore, initialItemId, initialItemName, initialTab, initialTabKey } = props;
  const [route, setRoute] = useState<Route>(() => {
    if (routing === 'hash') return parseHash();
    const stored = routeStore?.read();
    return stored ? parseRoute(stored) : DEFAULT_ROUTE;
  });

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
    if (routing !== 'hash') {
      setRoute(routeFor(tab, param));
      routeStore?.write(serializeRoute(tab, param));
      return;
    }
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
   * Which explorer tab owns a given entity id? A weapon/armor/item id is unique
   * to one dataset, so search all three (mirrors the legacy `jumpToEntry`). The
   * loader caches responses, so repeat lookups are cheap.
   */
  async function resolveEntityTab(id: number): Promise<EntityTab | null> {
    const [weapons, armors, items] = await Promise.all([
      loader.loadWeapons(), loader.loadArmors(), loader.loadItems(),
    ]);
    if (weapons.some((w) => w.id === id)) return 'weapons';
    if (armors.some((a) => a.id === id)) return 'armors';
    if (items.some((it) => it.id === id)) return 'items';
    return null;
  }

  /** Resolve an entity by (case-insensitive) name across the three item datasets. */
  async function resolveEntityByName(name: string): Promise<{ tab: EntityTab; id: number } | null> {
    const norm = name.trim().toLowerCase();
    const [weapons, armors, items] = await Promise.all([
      loader.loadWeapons(), loader.loadArmors(), loader.loadItems(),
    ]);
    const w = weapons.find((x) => x.name.toLowerCase() === norm);
    if (w) return { tab: 'weapons', id: w.id };
    const a = armors.find((x) => x.name.toLowerCase() === norm);
    if (a) return { tab: 'armors', id: a.id };
    const it = items.find((x) => x.name.toLowerCase() === norm);
    if (it) return { tab: 'items', id: it.id };
    return null;
  }

  /** Resolve a cross-reference jump. Monsters navigate directly; others resolve. */
  async function onJump(tab: EntityTab, id: number) {
    if (tab === 'monsters') { navigate('monsters', String(id)); return; }
    const resolved = await resolveEntityTab(id);
    if (resolved) navigate(resolved, String(id));
  }

  // Opened on a specific dropped item: resolve its tab and jump there.
  useEffect(() => {
    if (initialItemId == null) return;
    let cancelled = false;
    resolveEntityTab(initialItemId).then((tab) => {
      if (!cancelled && tab) navigate(tab, String(initialItemId));
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialItemId]);

  // Opened on a specific item by name (Home page item link): resolve + jump.
  useEffect(() => {
    if (!initialItemName) return;
    let cancelled = false;
    resolveEntityByName(initialItemName).then((hit) => {
      if (!cancelled && hit) navigate(hit.tab, String(hit.id));
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialItemName]);

  // Opened directly on a tab (currently only 'quests'): navigate there on
  // mount, overriding whatever routeStore had remembered — that override is
  // the entire reason this prop exists.
  //
  // Precedence, made explicit rather than left to the effects' relative
  // timing: initialItemId/initialItemName name a specific entity, which is
  // more specific than a bare tab, so they must win if both are somehow
  // supplied. Backing off here (instead of racing this synchronous
  // navigate against those effects' async entity lookups) makes that
  // ordering guaranteed rather than incidental.
  useEffect(() => {
    if (!initialTab || initialItemId != null || initialItemName) return;
    navigate(initialTab, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTab, initialTabKey]);

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
      ) : route.tab === 'quests' ? (
        <QuestView
          loader={loader}
          questId={route.id}
          prefStore={prefStore}
          onSelectQuest={(id) => navigate('quests', String(id))}
          onJumpToMonster={(id) => navigate('monsters', String(id))}
        />
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
