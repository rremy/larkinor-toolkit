import { h, type VNode } from 'preact';
import type { MapCell } from '@/shared/data';
import { cellWalls, POI_EMOJI, POI_LABEL, type GridPos } from './mapMeta';

const TERRAIN_BASE = 'https://l2.larkinor.hu';

interface CellDetailProps {
  cell: MapCell | null;
  /** Where the map view placed the cell; null when it could not be placed. */
  position?: GridPos | null;
  /** Building-icon → shop-owner name for this cell (e.g. `vegyesbolt.gif`). */
  owners?: Record<string, string>;
}

/**
 * Detail panel for a selected map cell — district, buildings (with shop owner
 * where known), clan houses and closed sides (coast and plain walls). Ported from `showCellDetail`
 * (explorer.html:868-892).
 */
export function CellDetail(props: CellDetailProps): VNode {
  const { cell, position = null, owners = {} } = props;

  if (!cell) {
    return (
      <div class="cell-detail">
        <div class="placeholder">Válassz egy mezőt a térképen.</div>
      </div>
    );
  }

  const closedSides: [string, string][] = [
    ...Object.entries(cell.blockers ?? {}).map(
      ([dir, blocker]): [string, string] => [dir, blocker.title ?? blocker.icon],
    ),
    ...cellWalls(cell).map((dir): [string, string] => [dir, 'fal']),
  ];

  return (
    <div class="cell-detail">
      <h3>
        {cell.district} <span class="meta">(id {cell.imageId})</span>
      </h3>
      {position && <div class="meta">row {position.row} · col {position.col}</div>}
      <img class="terrain" src={`${TERRAIN_BASE}${cell.imageSrc}`} alt="" loading="lazy" />
      {cell.buildings.length > 0 && (
        <div>
          <strong>Helyek:</strong>
          <ul class="list">
            {cell.buildings.map((b) => {
              const owner = owners[b.icon];
              return (
                <li key={b.icon + b.name}>
                  {POI_EMOJI[b.icon] ?? ''} {POI_LABEL[b.icon] ?? b.name ?? b.icon}
                  {owner ? <span class="qty"> ({owner})</span> : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {cell.clanHouses.length > 0 && (
        <div>
          <strong>Klánok:</strong>
          <ul class="list">
            {cell.clanHouses.map((c) => (
              <li key={c.name}>{c.name}</li>
            ))}
          </ul>
        </div>
      )}
      {closedSides.length > 0 && (
        <div>
          <strong>Lezárt kijáratok:</strong>
          <ul class="list">
            {closedSides.map(([dir, label]) => (
              <li key={dir}>
                <strong>{dir}</strong>: {label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
