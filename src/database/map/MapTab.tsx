import { h, type VNode } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { DataLoader, MapData } from '@/shared/data';
import { indexChart, type ChartIndex } from '@/shared/seaChart';
import { parseSeaPosition, serializeSeaPosition, SEA_POSITION_EVENT, type SeaPosition } from '@/shared/seaPosition';
import { placeOf, parseWorldMap, THORD_ARTIN, WORLD_MAPS, WORLD_MAP_LABEL, type WorldMap } from '@/shared/worldMap';
import { MAP_MODE_PREF_KEY, SEA_POSITION_PREF_KEY } from '@/shared/prefKeys';
import type { PrefStore } from '../DatabaseApp';
import { MapView } from './MapView';
import { SeaChartView, type ChartBounds } from './SeaChartView';
import { SeaDetail } from './SeaDetail';
import { islandMapCells, layoutCells } from './mapMeta';

/** The route segment that asks the map tab for the sea chart: `#map/sea`. */
export const SEA_ROUTE_CELL = 'sea';

/** Thord-Artin's squares are large enough to carry their names. */
const ISLAND_CELL = 64;

interface MapTabProps {
  loader: DataLoader;
  /** A routed city cell, or {@link SEA_ROUTE_CELL} for the sea chart. */
  targetCellId?: string | null;
  prefStore?: PrefStore;
  /** In-game only: the player's square can be set by hand. */
  tracksPosition?: boolean;
  /**
   * Bumped by the minimap's click: show the map of where the player is,
   * dropping any map picked by hand. Never stored as a route, so it cannot
   * outrank the player's whereabouts on a later open.
   */
  placeRequest?: number;
}

/** The map a route asks for, which holds for this open like a pick. */
function routedMap(targetCellId: string | null): WorldMap | null {
  if (targetCellId === SEA_ROUTE_CELL) return 'sea';
  return targetCellId ? 'larkinor' : null;
}

/**
 * The Térkép tab: Larkinor (the city map), Thord-Artin, or the sea chart.
 * It shows the map of where the player is — and follows them to another as
 * they move — until they pick one by hand.
 */
export function MapTab(props: MapTabProps): VNode {
  const { loader, targetCellId = null, prefStore, tracksPosition = false, placeRequest } = props;
  const [here, setHere] = useState(() => parseSeaPosition(prefStore?.read(SEA_POSITION_PREF_KEY) ?? null));
  const [data, setData] = useState<{ index: ChartIndex; city: MapData } | null>(null);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<WorldMap | null>(() => routedMap(targetCellId));

  useEffect(() => {
    let cancelled = false;
    Promise.all([loader.loadSeaChart(), loader.loadIslands(), loader.loadMap()])
      .then(([chart, islands, city]) => { if (!cancelled) setData({ index: indexChart(chart, islands), city }); })
      .catch((err) => {
        console.warn('[Larkinor UI] Sea chart could not be loaded:', err);
        if (!cancelled) setFailed(true);
      });
    return () => { cancelled = true; };
  }, [loader]);

  const firstRoute = useRef(true);
  useEffect(() => {
    if (firstRoute.current) { firstRoute.current = false; return; }
    setPicked(routedMap(targetCellId));
  }, [targetCellId]);

  useEffect(() => {
    if (placeRequest) setPicked(null);
  }, [placeRequest]);

  // The page stores its position after the chart loads, which can be after this
  // tab opened (a database left open across a step): follow it when it lands.
  useEffect(() => {
    const onPosition = () => setHere(parseSeaPosition(prefStore?.read(SEA_POSITION_PREF_KEY) ?? null));
    document.addEventListener(SEA_POSITION_EVENT, onPosition);
    return () => document.removeEventListener(SEA_POSITION_EVENT, onPosition);
  }, [prefStore]);

  const auto = placeOf(here, data?.index ?? null);
  // Thord-Artin drawn by the city map, in its style.
  const thordArtin = useMemo(
    () => (data ? islandMapCells(data.index.tiles.filter((t) => t.island === THORD_ARTIN)) : null),
    [data],
  );
  const hereTile = here && data && auto === 'thord-artin'
    ? (here.image ?? data.index.tileAt(here.row, here.col)?.image ?? null)
    : null;
  const view: WorldMap = picked ?? auto ?? parseWorldMap(prefStore?.read(MAP_MODE_PREF_KEY) ?? null) ?? 'larkinor';

  const choose = (next: WorldMap) => {
    setPicked(next);
    prefStore?.write(MAP_MODE_PREF_KEY, next);
  };

  const setHereByHand = (row: number, col: number) => {
    const position: SeaPosition = { row, col, source: 'manual', at: Date.now() };
    prefStore?.write(SEA_POSITION_PREF_KEY, serializeSeaPosition(position));
    setHere(position);
    // The minimap beside the game reads the same store; tell it.
    document.dispatchEvent(new CustomEvent(SEA_POSITION_EVENT));
  };

  let body: VNode;
  if (view === 'larkinor') {
    body = <MapView loader={loader} targetCellId={targetCellId === SEA_ROUTE_CELL ? null : targetCellId} prefStore={prefStore} showHere={auto === 'larkinor'} />;
  } else if (failed) {
    body = <div class="map-view"><div class="map-stats">Nem sikerült betölteni a tengeri térképet.</div></div>;
  } else if (!data) {
    body = <div class="map-view"><div class="map-stats">Betöltés…</div></div>;
  } else if (view === 'thord-artin' && thordArtin) {
    body = <MapView key={`ta-${hereTile ?? ''}`} loader={loader} island={thordArtin} hereCellId={hereTile} />;
  } else {
    body = (
      <ChartPane
        key={view}
        view={view}
        index={data.index}
        city={data.city}
        here={here}
        atSea={auto === 'sea' && here !== null && data.index.squareAt(here.row, here.col) === null}
        onSetHere={tracksPosition ? setHereByHand : undefined}
      />
    );
  }

  return (
    <div class="map-tab">
      <div class="map-mode-switch">
        {WORLD_MAPS.map((m) => (
          <button key={m} type="button" aria-pressed={view === m} class={view === m ? 'active' : ''} onClick={() => choose(m)}>
            {WORLD_MAP_LABEL[m]}
          </button>
        ))}
      </div>
      {body}
    </div>
  );
}

/** Thord-Artin's tiles and a one-square margin of sea around them. */
function islandBounds(index: ChartIndex): ChartBounds {
  const tiles = index.tiles.filter((t) => t.island === THORD_ARTIN);
  return {
    minRow: Math.min(...tiles.map((t) => t.row)) - 1,
    maxRow: Math.max(...tiles.map((t) => t.row)) + 1,
    minCol: Math.min(...tiles.map((t) => t.col)) - 1,
    maxCol: Math.max(...tiles.map((t) => t.col)) + 1,
  };
}

interface ChartPaneProps {
  view: 'thord-artin' | 'sea';
  index: ChartIndex;
  city: MapData;
  here: SeaPosition | null;
  atSea: boolean;
  onSetHere?: (row: number, col: number) => void;
}

/** One chart-drawn map (Thord-Artin or the sea) with its detail panel. */
function ChartPane({ view, index, city, here, atSea, onSetHere }: ChartPaneProps): VNode {
  const bounds = useMemo(() => (view === 'thord-artin' ? islandBounds(index) : undefined), [view, index]);
  const inView = (p: { row: number; col: number } | null): p is { row: number; col: number } =>
    p !== null && (!bounds || (p.row >= bounds.minRow && p.row <= bounds.maxRow && p.col >= bounds.minCol && p.col <= bounds.maxCol));
  const [selected, setSelected] = useState<{ row: number; col: number } | null>(inView(here) ? { row: here.row, col: here.col } : null);
  // The detail panel follows the player until a square is picked by hand.
  const picked = useRef(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (inView(here) && !picked.current) setSelected({ row: here.row, col: here.col });
  }, [here?.row, here?.col]);

  const scrollToHere = () => {
    const el = wrapRef.current?.querySelector('.lc-sea-square.here');
    // Guarded: jsdom ships no scrollIntoView, and a missing scroll must not break the view.
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center', inline: 'center' });
  };

  // Opens on the player, without a glide: the game reloads on every step.
  useEffect(() => { requestAnimationFrame(scrollToHere); }, [here?.row, here?.col]);

  const cityCells = useMemo(() => {
    const out = new Map<string, { cell: MapData['cells'][number]; pos: { row: number; col: number } }>();
    const positions = layoutCells(city.cells, city.edges ?? {});
    for (const cell of city.cells) {
      const pos = positions.get(cell.imageId);
      if (pos) out.set(`${pos.row},${pos.col}`, { cell, pos });
    }
    return out;
  }, [city]);

  const cityCell = selected ? cityCells.get(`${selected.row},${selected.col}`) ?? null : null;
  const shownHere = inView(here) ? here : null;
  return (
    <div class="map-view sea-view">
      <div class="map-stats">
        {view === 'sea'
          ? `${index.harbours.length} kikötő · a rajongói térkép (larkinorcenter.hu) alapján`
          : 'Thord-Artin · a rajongói térkép (larkinorcenter.hu) alapján'}
        {shownHere && (
          <button type="button" class="map-here-btn" onClick={() => { setSelected({ row: shownHere.row, col: shownHere.col }); scrollToHere(); }}>
            📍 Ugrás a helyemre
          </button>
        )}
      </div>
      <div class="map-layout">
        <div class="map-wrap" ref={wrapRef}>
          <SeaChartView
            index={index}
            city={city}
            here={shownHere}
            atSea={atSea}
            bounds={bounds}
            detail={view === 'thord-artin' ? 'names' : 'none'}
            cellSize={view === 'thord-artin' ? ISLAND_CELL : undefined}
            selected={selected}
            onSelect={(row, col) => { picked.current = true; setSelected({ row, col }); }}
          />
        </div>
        <div class="map-side">
          {selected ? (
            <SeaDetail
              row={selected.row}
              col={selected.col}
              square={index.squareAt(selected.row, selected.col)}
              tile={index.tileAt(selected.row, selected.col)}
              cityCell={cityCell?.cell ?? null}
              cityPosition={cityCell?.pos ?? null}
              isHere={here !== null && here.row === selected.row && here.col === selected.col}
              onSetHere={onSetHere ? () => onSetHere(selected.row, selected.col) : undefined}
            />
          ) : (
            <div class="cell-detail"><div class="placeholder">Válassz egy mezőt a térképen.</div></div>
          )}
        </div>
      </div>
    </div>
  );
}
