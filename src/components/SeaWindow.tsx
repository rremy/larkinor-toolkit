import { h, type JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { DataLoader, MapData } from '@/shared/data';
import { indexChart, type ChartIndex } from '@/shared/seaChart';
import { parseSeaPosition } from '@/shared/seaPosition';
import { SEA_POSITION_PREF_KEY, type ReadPref } from '@/shared/prefKeys';
import { SeaChartView, nearestHarbourDirection, type ChartBounds, type ChartDirection } from '@/database/map/SeaChartView';

/** Squares drawn around the player: 13 across, 11 down. */
const HALF_WIDTH = 6;
const HALF_HEIGHT = 5;

const ARROW: Record<ChartDirection, string> = {
  N: '↑', S: '↓', E: '→', W: '←', NE: '↗', NW: '↖', SE: '↘', SW: '↙',
};

/** What a page at sea or on an island hands the window (built by the boots). */
export interface SeaWindowSource {
  loader: DataLoader;
  readPref: ReadPref;
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
}

/**
 * The squares around the player, shown while at sea or on an island other than
 * the city's. A click opens the whole chart in the database.
 */
export function SeaWindow({ loader, readPref, atSea, version = 0, onOpenChart }: SeaWindowProps): JSX.Element {
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

  // Read on every version: the boot resolves the position after mounting us.
  const here = useMemo(() => parseSeaPosition(readPref(SEA_POSITION_PREF_KEY)), [readPref, version]);

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
    const bounds: ChartBounds = {
      minRow: here.row - HALF_HEIGHT, maxRow: here.row + HALF_HEIGHT,
      minCol: here.col - HALF_WIDTH, maxCol: here.col + HALF_WIDTH,
    };
    const arrow = nearestHarbourDirection(data.index, here, bounds);
    body = (
      <div class="lc-sea-window-chart" onClick={onOpenChart} title="A teljes tengeri térkép megnyitása">
        <SeaChartView index={data.index} city={data.city} here={here} bounds={bounds} atSea={atSea} />
        {arrow && (
          <span class={`lc-sea-arrow lc-sea-arrow--${arrow}`} data-dir={arrow} title="A legközelebbi kikötő iránya">
            ⚓{ARROW[arrow]}
          </span>
        )}
      </div>
    );
  }
  return <div class="lc-sea-window">{body}</div>;
}
