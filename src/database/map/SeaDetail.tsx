import { h, type VNode } from 'preact';
import type { IslandTile, MapCell, SeaSquare } from '@/shared/data';
import { CellDetail } from './CellDetail';
import type { GridPos } from './mapMeta';

interface SeaDetailProps {
  row: number;
  col: number;
  square: SeaSquare | null;
  tile: IslandTile | null;
  /** The city cell on this square, when it is part of the city block. */
  cityCell: MapCell | null;
  cityPosition: GridPos | null;
  isHere: boolean;
  /** Offered in-game only: sets the stored position to this square. */
  onSetHere?: () => void;
}

const KIND_LABEL: Record<string, string> = {
  unexplored: 'Felderítetlen szárazföld',
  unknown: 'Bizonytalan mező — hajóról még senki nem látta',
  land: 'Szárazföld',
};

/** What is known about one square of the sea chart. */
export function SeaDetail(props: SeaDetailProps): VNode {
  const { row, col, square, tile, cityCell, cityPosition, isHere, onSetHere } = props;
  const setHere = onSetHere && (
    <button type="button" class="map-here-btn" onClick={onSetHere}>📍 Itt állok</button>
  );
  if (cityCell) {
    return (
      <div>
        <CellDetail cell={cityCell} position={cityPosition} isHere={isHere} />
        {setHere}
      </div>
    );
  }
  const title = tile?.name ?? (square ? (square.harbour ? 'Kikötő' : KIND_LABEL[square.kind]) : 'Nyílt tenger');
  return (
    <div class="cell-detail">
      <h3>{square?.harbour ? `⚓ ${title}` : title}</h3>
      <div class="meta">sor {row} · oszlop {col}</div>
      {isHere && <div class="here-note">📍 Itt állsz</div>}
      {tile && <div>{tile.island}{tile.district ? ` · ${tile.district}` : ''}</div>}
      {!tile && square?.district && <div>{square.district} (a rajongói térkép szerint)</div>}
      {tile?.buildings && tile.buildings.length > 0 && (
        <div>
          <strong>Épületek:</strong>
          <ul class="list">
            {tile.buildings.map((b) => (
              <li key={b.name}>
                {b.name} — {b.ready ? 'kész' : b.note ?? 'nem kész'}
              </li>
            ))}
          </ul>
        </div>
      )}
      {setHere}
    </div>
  );
}
