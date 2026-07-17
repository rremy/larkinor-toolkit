import { h, type VNode } from 'preact';
import type { MapCell } from '@/shared/data';
import { parseId, POI_EMOJI, POI_LABEL } from './mapMeta';

const TERRAIN_BASE = 'https://l2.larkinor.hu';

interface CellDetailProps {
  cell: MapCell | null;
  /** Building-icon → shop-owner name for this cell (e.g. `vegyesbolt.gif`). */
  owners?: Record<string, string>;
}

/**
 * Detail panel for a selected map cell — district, buildings (with shop owner
 * where known), clan houses and blocked exits. Ported from `showCellDetail`
 * (explorer.html:868-892).
 */
export function CellDetail(props: CellDetailProps): VNode {
  const { cell, owners = {} } = props;

  if (!cell) {
    return (
      <div class="cell-detail">
        <div class="placeholder">Válassz egy mezőt a térképen.</div>
      </div>
    );
  }

  const { row, col } = parseId(cell.imageId);
  const blockerEntries = Object.entries(cell.blockers ?? {});

  return (
    <div class="cell-detail">
      <h3>
        {cell.district} <span class="meta">(id {cell.imageId})</span>
      </h3>
      <div class="meta">row {row} · col {col}</div>
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
      {blockerEntries.length > 0 && (
        <div>
          <strong>Lezárt kijáratok:</strong>
          <ul class="list">
            {blockerEntries.map(([dir, blocker]) => (
              <li key={dir}>
                <strong>{dir}</strong>: {blocker.title ?? blocker.icon}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
