import { h, type VNode } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { DataLoader, MapData, MapCell } from '@/shared/data';
import {
  DISTRICT_CLASS, DISTRICT_SHORT, POI_EMOJI, POI_LABEL, HUB_ID, MAP_SIDES,
  CLAN_POI, buildShopOwners, cellWalls, layoutCells, type GridPos, type IslandMapData, type ShopOwners,
} from './mapMeta';
import { CellDetail } from './CellDetail';
import { Legend } from './Legend';
import type { PrefStore } from '../DatabaseApp';
import { MAP_POSITION_PREF_KEY } from '@/shared/prefKeys';
import { parseMapPosition } from '@/shared/mapPosition';

/** The city's own 10×10 block, always drawn even where nothing is explored. */
const GRID_SIZE = 10;

interface MapViewProps {
  loader: DataLoader;
  /**
   * Cell id to select, scroll to and flash — set from the `#map/<cell>` route
   * (deep link or a shop's location link). Re-focuses whenever it changes.
   */
  targetCellId?: string | null;
  /**
   * Where the tile the player was last seen on is read from
   * (`MAP_POSITION_PREF_KEY`). Absent, or holding nothing — the standalone
   * site, another origin, never does — the map draws no marker.
   */
  prefStore?: PrefStore;
  /**
   * Draw this island instead of loading the city (Thord-Artin): its cells sit at
   * their own squares, and each writes its tile name where a city cell writes
   * its id. The player's tile comes from `hereCellId`, not the city position.
   */
  island?: IslandMapData;
  hereCellId?: string | null;
  /**
   * Whether to pin the player's city tile. The tile is only ever the last one
   * walked in town, so away from town (at sea, on another island, or lost)
   * pinning it would show a stale square as the player's own.
   */
  showHere?: boolean;
}

/** A cell to select and scroll to; `animate` glides there and flashes it. */
interface FocusTarget {
  id: string;
  animate: boolean;
}

/** How long the target cell keeps its focus-pulse highlight (ms). */
const FOCUS_MS = 3800;

/** The pin on the tile the player was last seen on. */
function HerePin(): VNode {
  return <span class="map-here-pin" title="Itt állsz">📍</span>;
}

/** Does a cell contain a POI matching the active `data-poi` filter? */
function cellMatchesFilter(cell: MapCell, poi: string): boolean {
  if (poi === CLAN_POI) return cell.clanHouses.length > 0;
  return cell.buildings.some((b) => b.icon === poi);
}

/** Inclusive `[min, max]` over `values`, widened to cover the city block unless drawing an island. */
function span(values: number[], cityBlock: boolean): [number, number] {
  if (!cityBlock) return [Math.min(...values), Math.max(...values)];
  return [Math.min(0, ...values), Math.max(GRID_SIZE - 1, ...values)];
}

/**
 * District grid + legend + cell detail. Cells are placed by `layoutCells`, so
 * tiles outside the city block — the strip north of row 0, the démonsziget
 * east of 68 — get rows and columns of their own. Ported from the MAP module's
 * `renderGrid`/`showCellDetail`/`applyFilter` (explorer.html:786-936).
 */
export function MapView(props: MapViewProps): VNode {
  const { loader, targetCellId = null, prefStore, island, hereCellId = null, showHere = true } = props;
  // Read once: the game reloads the page on every step, remounting the view.
  const [cityHereId] = useState(() => parseMapPosition(prefStore?.read(MAP_POSITION_PREF_KEY) ?? null));
  const hereId = island ? hereCellId : showHere ? cityHereId : null;
  const [map, setMap] = useState<MapData | null>(() => (island ? { cells: island.cells, edges: {} } : null));
  const [owners, setOwners] = useState<ShopOwners>({});
  const [selectedId, setSelectedId] = useState<string | null>(targetCellId ?? hereId);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  // A fresh object per request, so asking for the same cell twice focuses twice.
  // A routed target wins; otherwise the map opens on the player. Only a routed
  // target is animated: the player's tile is focused on every page load, and
  // the game reloads on every step, so a glide and a flash each time would be
  // noise rather than news.
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(() => {
    if (targetCellId) return { id: targetCellId, animate: true };
    return hereId ? { id: hereId, animate: false } : null;
  });
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const gridRef = useRef<HTMLTableElement>(null);

  useEffect(() => {
    if (island) return undefined;
    let cancelled = false;
    Promise.all([loader.loadMap(), loader.loadItemShops(), loader.loadWeaponShops()])
      .then(([map, itemShops, weaponShops]) => {
        if (cancelled) return;
        setMap(map);
        setOwners(buildShopOwners(itemShops.shops, weaponShops.shops));
      });
    return () => { cancelled = true; };
  }, [loader]);

  useEffect(() => {
    if (targetCellId) setFocusTarget({ id: targetCellId, animate: true });
  }, [targetCellId]);

  // Focus the requested cell: select it and scroll it into view; an animated
  // focus glides there and flashes the pulse highlight for a few seconds
  // (ported from the legacy `focusCell`).
  useEffect(() => {
    if (!focusTarget || !map) return;
    const { id, animate } = focusTarget;
    setSelectedId(id);
    const raf = requestAnimationFrame(() => {
      const td = gridRef.current?.querySelector(`td.cell[data-id="${id}"]`);
      // Guarded rather than optional-chained, like the quest maze's scroll: jsdom
      // ships no scrollIntoView, and a missing scroll must not break the selection.
      if (td && typeof td.scrollIntoView === 'function') {
        td.scrollIntoView({ block: 'center', inline: 'center', behavior: animate ? 'smooth' : 'auto' });
      }
    });
    if (!animate) return () => cancelAnimationFrame(raf);
    setFocusedId(id);
    const timer = setTimeout(() => setFocusedId(null), FOCUS_MS);
    return () => { cancelAnimationFrame(raf); clearTimeout(timer); };
  }, [focusTarget, map]);

  const positions = useMemo(
    () => (island ? island.positions : map ? layoutCells(map.cells, map.edges ?? {}) : new Map<string, GridPos>()),
    [map, island],
  );

  if (!map) {
    return (
      <div class="map-view">
        <div class="map-stats">Betöltés…</div>
      </div>
    );
  }

  const { cells } = map;
  const cellById = new Map(cells.map((c) => [c.imageId, c]));
  const districtCount = new Set(cells.map((c) => c.district)).size;
  const selectedCell = selectedId != null ? cellById.get(selectedId) ?? null : null;

  const cellAt = new Map<string, MapCell>();
  for (const cell of cells) {
    const pos = positions.get(cell.imageId);
    if (pos) cellAt.set(`${pos.row},${pos.col}`, cell);
  }
  const placed = [...positions.values()];
  const [minRow, maxRow] = span(placed.map((p) => p.row), !island);
  const [minCol, maxCol] = span(placed.map((p) => p.col), !island);
  const rowIndexes = Array.from({ length: maxRow - minRow + 1 }, (_, i) => minRow + i);
  const colIndexes = Array.from({ length: maxCol - minCol + 1 }, (_, i) => minCol + i);

  const toggleFilter = (poi: string) =>
    setActiveFilter((current) => (current === poi ? null : poi));

  return (
    <div class={`map-view${activeFilter ? ' filter-active' : ''}`}>
      <div class="map-stats">
        {island
          ? <>{cellById.size} mező · {districtCount} negyed · a rajongói térkép (larkinorcenter.hu) alapján</>
          : <>{cellById.size} mező felderítve · {districtCount} negyed · grid ID kódolás{' '}<code>&lt;sor&gt;&lt;oszlop&gt;</code> (sor 0 = észak)</>}
        {hereId && (
          <button type="button" class="map-here-btn" onClick={() => setFocusTarget({ id: hereId, animate: false })}>
            📍 Ugrás a helyemre
          </button>
        )}
      </div>
      <div class="map-layout">
        <div class="map-wrap">
          <table class="map-grid" ref={gridRef}>
            <thead>
              <tr>
                <th />
                {colIndexes.map((c) => <th key={c}>col {c}</th>)}
              </tr>
            </thead>
            <tbody>
              {rowIndexes.map((r) => (
                <tr key={r}>
                  <th class="rh">r{r}</th>
                  {colIndexes.map((c) => {
                    const cell = cellAt.get(`${r},${c}`);
                    if (!cell) {
                      const id = `${r}${c}`;
                      return (
                        <td
                          key={c}
                          data-id={id}
                          class={`cell unexplored${id === hereId ? ' here' : ''}`}
                          onClick={() => setSelectedId(id)}
                        >
                          {id === hereId && <HerePin />}
                        </td>
                      );
                    }
                    const id = cell.imageId;
                    const districtClass = DISTRICT_CLASS[cell.district] ?? '';
                    const matches = activeFilter != null && cellMatchesFilter(cell, activeFilter);
                    const classes = ['cell', districtClass];
                    if (id === HUB_ID) classes.push('hub');
                    if (id === selectedId) classes.push('selected');
                    if (id === focusedId) classes.push('focused');
                    if (id === hereId) classes.push('here');
                    if (matches) classes.push('match');
                    const blockers = cell.blockers ?? {};
                    const walls = cellWalls(cell);
                    return (
                      <td
                        key={c}
                        data-id={id}
                        class={classes.filter(Boolean).join(' ')}
                        onClick={() => setSelectedId(id)}
                      >
                        <div class="inner">
                          <div class="label">{DISTRICT_SHORT[cell.district] ?? cell.district}</div>
                          <div class="pois">
                            {cell.buildings.map((b) => (
                              <span
                                key={b.icon + b.name}
                                class={`poi${activeFilter === b.icon ? ' matched' : ''}`}
                                title={POI_LABEL[b.icon] ?? b.name ?? b.icon}
                              >
                                {POI_EMOJI[b.icon] ?? '?'}
                              </span>
                            ))}
                            {cell.clanHouses.map((ch) => (
                              <span
                                key={ch.name}
                                class={`poi clan${activeFilter === CLAN_POI ? ' matched' : ''}`}
                                title={ch.name || 'klánház'}
                              >C</span>
                            ))}
                          </div>
                          <div class="row-id">{island ? island.names[id] ?? '' : id}</div>
                        </div>
                        {id === hereId && <HerePin />}
                        {MAP_SIDES.map((dir) => {
                          const blocker = blockers[dir];
                          if (blocker) {
                            return <div key={dir} class={`blocker ${dir}`} title={blocker.title ?? blocker.icon} />;
                          }
                          if (walls.includes(dir)) return <div key={dir} class={`wall ${dir}`} title="fal" />;
                          return null;
                        })}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div class="map-side">
          <CellDetail
            cell={selectedCell}
            position={selectedCell ? positions.get(selectedCell.imageId) ?? null : null}
            owners={selectedId != null ? owners[selectedId] : undefined}
            isHere={selectedId != null && selectedId === hereId}
            title={island && selectedId != null ? island.names[selectedId] : undefined}
          />
          <Legend activeFilter={activeFilter} onToggleFilter={toggleFilter} />
        </div>
      </div>
    </div>
  );
}
