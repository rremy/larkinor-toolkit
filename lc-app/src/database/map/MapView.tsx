import { h, type VNode } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { DataLoader, MapCell } from '@/shared/data';
import { DISTRICT_CLASS, DISTRICT_SHORT, POI_EMOJI, POI_LABEL } from './mapMeta';
import { CellDetail } from './CellDetail';

const GRID_SIZE = 10;
const HUB_ID = '44';

interface MapViewProps {
  loader: DataLoader;
}

/**
 * 10x10 district grid + cell detail. Ported from the MAP module's
 * `renderGrid`/`showCellDetail` (explorer.html:786-892).
 */
export function MapView(props: MapViewProps): VNode {
  const { loader } = props;
  const [cells, setCells] = useState<MapCell[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loader.loadMap().then((data) => {
      if (!cancelled) setCells(data.cells);
    });
    return () => { cancelled = true; };
  }, [loader]);

  if (!cells) {
    return (
      <div class="map-view">
        <div class="map-stats">Betöltés…</div>
      </div>
    );
  }

  const cellById = new Map(cells.map((c) => [c.imageId, c]));
  const districtCount = new Set(cells.map((c) => c.district)).size;
  const selectedCell = selectedId != null ? cellById.get(selectedId) ?? null : null;

  const rowIndexes = Array.from({ length: GRID_SIZE }, (_, i) => i);
  const colIndexes = Array.from({ length: GRID_SIZE }, (_, i) => i);

  return (
    <div class="map-view">
      <div class="map-stats">
        {cellById.size} mező felderítve · {districtCount} negyed · grid ID kódolás{' '}
        <code>&lt;sor&gt;&lt;oszlop&gt;</code> (sor 0 = észak)
      </div>
      <div class="map-layout">
        <div class="map-wrap">
          <table class="map-grid">
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
                    const id = `${r}${c}`;
                    const cell = cellById.get(id);
                    if (!cell) {
                      return (
                        <td
                          key={c}
                          class="cell unexplored"
                          onClick={() => setSelectedId(id)}
                        />
                      );
                    }
                    const districtClass = DISTRICT_CLASS[cell.district] ?? '';
                    const classes = ['cell', districtClass];
                    if (id === HUB_ID) classes.push('hub');
                    if (id === selectedId) classes.push('selected');
                    const blockers = cell.blockers ?? {};
                    return (
                      <td
                        key={c}
                        class={classes.filter(Boolean).join(' ')}
                        onClick={() => setSelectedId(id)}
                      >
                        <div class="inner">
                          <div class="label">{DISTRICT_SHORT[cell.district] ?? cell.district}</div>
                          <div class="pois">
                            {cell.buildings.map((b) => (
                              <span key={b.icon + b.name} class="poi" title={POI_LABEL[b.icon] ?? b.name ?? b.icon}>
                                {POI_EMOJI[b.icon] ?? '?'}
                              </span>
                            ))}
                            {cell.clanHouses.map((ch) => (
                              <span key={ch.name} class="poi clan" title={ch.name || 'klánház'}>C</span>
                            ))}
                          </div>
                          <div class="row-id">{id}</div>
                        </div>
                        {(['N', 'S', 'E', 'W'] as const).map((dir) => {
                          const blocker = blockers[dir];
                          if (!blocker) return null;
                          return <div key={dir} class={`blocker ${dir}`} title={blocker.title ?? blocker.icon} />;
                        })}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <CellDetail cell={selectedCell} />
      </div>
    </div>
  );
}
