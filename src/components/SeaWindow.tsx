import { h, type JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { DataLoader, MapData } from '@/shared/data';
import { indexChart, type ChartIndex } from '@/shared/seaChart';
import { parseSeaPosition, SEA_POSITION_EVENT } from '@/shared/seaPosition';
import { MINIMAP_HIDDEN_PREF_KEY, SEA_POSITION_PREF_KEY, type ReadPref, type WritePref } from '@/shared/prefKeys';
import { placeOf, WORLD_MAP_LABEL } from '@/shared/worldMap';
import { SeaChartView, nearestHarbourDirection, type ChartBounds, type ChartDirection } from '@/database/map/SeaChartView';

/** Squares drawn around the ship: 13 across, 11 down. */
const HALF_WIDTH = 6;
const HALF_HEIGHT = 5;

/** On land the squares carry building icons, so fewer and larger: 7 across, 5 down. */
const LAND_HALF_WIDTH = 3;
const LAND_HALF_HEIGHT = 2;
const LAND_CELL = 34;

const ARROW: Record<ChartDirection, string> = {
  N: '↑', S: '↓', E: '→', W: '←', NE: '↗', NW: '↖', SE: '↘', SW: '↙',
};

/** What a page at sea or on an island hands the window (built by the boots). */
export interface SeaWindowSource {
  loader: DataLoader;
  readPref: ReadPref;
  /** Stores whether the minimap is hidden (`MINIMAP_HIDDEN_PREF_KEY`). */
  writePref?: WritePref;
  atSea: boolean;
  version: number;
}

export interface SeaWindowProps {
  loader: DataLoader;
  readPref: ReadPref;
  /** On the ship (⛵) rather than on an island (📍). */
  atSea: boolean;
  /**
   * Bumped by the boot once this page's position has been worked out, which
   * happens after the first render (the chart loads asynchronously).
   */
  version?: number;
  onOpenChart: () => void;
  /** Collapsed to its header; the owner keeps the state. */
  hidden?: boolean;
  onToggleHidden?: () => void;
}

/**
 * The minimap: the squares around the player on the map of where they are —
 * Larkinor, Thord-Artin or the sea. A click opens that map in the database.
 */
export function SeaWindow({ loader, readPref, atSea, version = 0, onOpenChart, hidden = false, onToggleHidden }: SeaWindowProps): JSX.Element {
  const [data, setData] = useState<{ index: ChartIndex; city: MapData } | null>(null);
  const [failed, setFailed] = useState(false);

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

  // A position set by hand in the database arrives as an event, not a version.
  const [heard, setHeard] = useState(0);
  useEffect(() => {
    const onPosition = () => setHeard((n) => n + 1);
    document.addEventListener(SEA_POSITION_EVENT, onPosition);
    return () => document.removeEventListener(SEA_POSITION_EVENT, onPosition);
  }, []);

  // Read on every version: the boot resolves the position after mounting us.
  const here = useMemo(() => parseSeaPosition(readPref(SEA_POSITION_PREF_KEY)), [readPref, version, heard]);

  const place = placeOf(here, data?.index ?? null);
  const head = (
    <div class="lc-sea-window-head">
      <span class="lc-sea-window-title">{place ? WORLD_MAP_LABEL[place] : 'Térkép'}</span>
      {onToggleHidden && (
        <button type="button" class="lc-sea-window-toggle" aria-label={hidden ? 'Térkép megjelenítése' : 'Térkép elrejtése'} onClick={onToggleHidden}>
          {hidden ? '▸' : '▾'}
        </button>
      )}
    </div>
  );
  if (hidden) return <div class="lc-sea-window lc-sea-window--hidden">{head}</div>;

  let body: JSX.Element;
  if (failed) {
    body = <div class="lc-sea-window-note">Nem sikerült betölteni a tengeri térképet.</div>;
  } else if (!data) {
    body = <div class="lc-sea-window-note">Betöltés…</div>;
  } else if (!here) {
    body = (
      <div class="lc-sea-window-note">
        Elvesztettük a helyzeted — jelöld be a térképen (📍 Itt állok).
        <button type="button" class="lc-sea-window-open" onClick={onOpenChart}>Térkép megnyitása</button>
      </div>
    );
  } else {
    const onLand = place !== 'sea';
    const halfW = onLand ? LAND_HALF_WIDTH : HALF_WIDTH;
    const halfH = onLand ? LAND_HALF_HEIGHT : HALF_HEIGHT;
    const bounds: ChartBounds = {
      minRow: here.row - halfH, maxRow: here.row + halfH,
      minCol: here.col - halfW, maxCol: here.col + halfW,
    };
    const arrow = onLand ? null : nearestHarbourDirection(data.index, here, bounds);
    body = (
      <div class="lc-sea-window-chart" onClick={onOpenChart} title="A teljes térkép megnyitása">
        <SeaChartView
          index={data.index} city={data.city} here={here} bounds={bounds} atSea={atSea && !onLand}
          detail={onLand ? 'icons' : 'none'} cellSize={onLand ? LAND_CELL : undefined}
        />
        {arrow && (
          <span class={`lc-sea-arrow lc-sea-arrow--${arrow}`} data-dir={arrow} title="A legközelebbi kikötő iránya">
            ⚓{ARROW[arrow]}
          </span>
        )}
      </div>
    );
  }
  return <div class="lc-sea-window">{head}{body}</div>;
}

/** Whether the minimap is hidden, remembered across pages and characters. */
export function useMinimapHidden(source: SeaWindowSource | null): [boolean, () => void] {
  const [hidden, setHidden] = useState(() => source?.readPref(MINIMAP_HIDDEN_PREF_KEY) === '1');
  const toggle = () => {
    const next = !hidden;
    setHidden(next);
    source?.writePref?.(MINIMAP_HIDDEN_PREF_KEY, next ? '1' : '');
  };
  return [hidden, toggle];
}
