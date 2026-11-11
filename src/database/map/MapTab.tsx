import { h, type VNode } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { DataLoader, MapData } from '@/shared/data';
import { indexChart, type ChartIndex } from '@/shared/seaChart';
import { isInCity, parseSeaPosition, serializeSeaPosition, SEA_POSITION_EVENT, type SeaPosition } from '@/shared/seaPosition';
import { MAP_MODE_PREF_KEY, SEA_POSITION_PREF_KEY } from '@/shared/prefKeys';
import type { PrefStore } from '../DatabaseApp';
import { MapView } from './MapView';
import { SeaChartView } from './SeaChartView';
import { SeaDetail } from './SeaDetail';
import { layoutCells } from './mapMeta';

/** The route segment that asks the map tab for the sea chart: `#map/sea`. */
export const SEA_ROUTE_CELL = 'sea';

type Mode = 'city' | 'sea';

interface MapTabProps {
  loader: DataLoader;
  /** A routed city cell, or {@link SEA_ROUTE_CELL} for the sea chart. */
  targetCellId?: string | null;
  prefStore?: PrefStore;
  /** In-game only: the player's square can be set by hand. */
  tracksPosition?: boolean;
}

/**
 * Picks the view to open on: a routed request first, then the player's own
 * whereabouts (off the city island means the sea chart), then the view last
 * chosen with the switch.
 */
function initialMode(targetCellId: string | null, here: SeaPosition | null, prefStore?: PrefStore): Mode {
  if (targetCellId === SEA_ROUTE_CELL) return 'sea';
  if (targetCellId) return 'city';
  if (here) return isInCity(here) ? 'city' : 'sea';
  return prefStore?.read(MAP_MODE_PREF_KEY) === 'sea' ? 'sea' : 'city';
}

/** The Térkép tab: the city map, or the sea chart of the whole archipelago. */
export function MapTab(props: MapTabProps): VNode {
  const { loader, targetCellId = null, prefStore, tracksPosition = false } = props;
  const [here, setHere] = useState(() => parseSeaPosition(prefStore?.read(SEA_POSITION_PREF_KEY) ?? null));
  const [mode, setMode] = useState<Mode>(() => initialMode(targetCellId, here, prefStore));
  // Once the player picks a view, a position arriving later no longer moves them.
  const chosen = useRef(false);

  // The page stores its position after the chart loads, which can be after this
  // tab opened (a database left open across a step): follow it when it lands.
  useEffect(() => {
    const onPosition = () => {
      const next = parseSeaPosition(prefStore?.read(SEA_POSITION_PREF_KEY) ?? null);
      setHere(next);
      if (!chosen.current && !targetCellId && next) setMode(isInCity(next) ? 'city' : 'sea');
    };
    document.addEventListener(SEA_POSITION_EVENT, onPosition);
    return () => document.removeEventListener(SEA_POSITION_EVENT, onPosition);
  }, [prefStore, targetCellId]);

  useEffect(() => {
    if (targetCellId === SEA_ROUTE_CELL) setMode('sea');
    else if (targetCellId) setMode('city');
  }, [targetCellId]);

  const choose = (next: Mode) => {
    chosen.current = true;
    setMode(next);
    prefStore?.write(MAP_MODE_PREF_KEY, next);
  };

  const setHereByHand = (row: number, col: number) => {
    const position: SeaPosition = { row, col, source: 'manual', at: Date.now() };
    prefStore?.write(SEA_POSITION_PREF_KEY, serializeSeaPosition(position));
    setHere(position);
  };

  return (
    <div class="map-tab">
      <div class="map-mode-switch">
        <button type="button" aria-pressed={mode === 'city'} class={mode === 'city' ? 'active' : ''} onClick={() => choose('city')}>Város</button>
        <button type="button" aria-pressed={mode === 'sea'} class={mode === 'sea' ? 'active' : ''} onClick={() => choose('sea')}>Tenger</button>
      </div>
      {mode === 'city' ? (
        <MapView loader={loader} targetCellId={targetCellId === SEA_ROUTE_CELL ? null : targetCellId} prefStore={prefStore} />
      ) : (
        <SeaView loader={loader} here={here} onSetHere={tracksPosition ? setHereByHand : undefined} />
      )}
    </div>
  );
}

interface SeaViewProps {
  loader: DataLoader;
  here: SeaPosition | null;
  onSetHere?: (row: number, col: number) => void;
}

function SeaView({ loader, here, onSetHere }: SeaViewProps): VNode {
  const [data, setData] = useState<{ index: ChartIndex; city: MapData } | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<{ row: number; col: number } | null>(here ? { row: here.row, col: here.col } : null);
  const wrapRef = useRef<HTMLDivElement>(null);

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

  const scrollToHere = () => {
    const el = wrapRef.current?.querySelector('.lc-sea-square.here');
    // Guarded: jsdom ships no scrollIntoView, and a missing scroll must not break the view.
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center', inline: 'center' });
  };

  // Opens on the player, without a glide: the game reloads on every step.
  useEffect(() => {
    if (data) requestAnimationFrame(scrollToHere);
  }, [data]);

  const cityCells = useMemo(() => {
    const out = new Map<string, { cell: MapData['cells'][number]; pos: { row: number; col: number } }>();
    if (!data) return out;
    const positions = layoutCells(data.city.cells, data.city.edges ?? {});
    for (const cell of data.city.cells) {
      const pos = positions.get(cell.imageId);
      if (pos) out.set(`${pos.row},${pos.col}`, { cell, pos });
    }
    return out;
  }, [data]);

  if (failed) return <div class="map-view"><div class="map-stats">Nem sikerült betölteni a tengeri térképet.</div></div>;
  if (!data) return <div class="map-view"><div class="map-stats">Betöltés…</div></div>;

  const { index } = data;
  const city = selected ? cityCells.get(`${selected.row},${selected.col}`) ?? null : null;
  return (
    <div class="map-view sea-view">
      <div class="map-stats">
        {index.harbours.length} kikötő · a rajongói térkép (larkinorcenter.hu) alapján
        {here && (
          <button type="button" class="map-here-btn" onClick={() => { setSelected({ row: here.row, col: here.col }); scrollToHere(); }}>
            📍 Ugrás a helyemre
          </button>
        )}
      </div>
      <div class="map-layout">
        <div class="map-wrap" ref={wrapRef}>
          <SeaChartView
            index={index}
            city={data.city}
            here={here}
            atSea={here !== null && !isInCity(here) && index.squareAt(here.row, here.col) === null}
            selected={selected}
            onSelect={(row, col) => setSelected({ row, col })}
          />
        </div>
        <div class="map-side">
          {selected ? (
            <SeaDetail
              row={selected.row}
              col={selected.col}
              square={index.squareAt(selected.row, selected.col)}
              tile={index.tileAt(selected.row, selected.col)}
              cityCell={city?.cell ?? null}
              cityPosition={city?.pos ?? null}
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
