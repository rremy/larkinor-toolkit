import { h, type VNode } from 'preact';
import type { Weapon, Armor, Item } from '@/shared/data';
import type { Monster } from '@/shared/data/monsters';
import { monsterImageUrl } from '@/components/MonsterCard';
import type { EntityTab } from './columns';
import { DETAIL_FIELDS } from './labels';

type Entity = Weapon | Armor | Item | Monster;

interface DetailPanelProps {
  tab: EntityTab;
  entity: Entity | null;
  onClose: () => void;
  onJump: (tab: EntityTab, id: number) => void;
}

/** Render a stat value: booleans as badges, numbers Hungarian-localised. */
function renderValue(value: unknown): VNode | string {
  if (typeof value === 'boolean') {
    return value
      ? <span class="badge yes">Igen</span>
      : <span class="badge no">Nem</span>;
  }
  if (typeof value === 'number') return value.toLocaleString('hu');
  return String(value);
}

export function DetailPanel(props: DetailPanelProps): VNode | null {
  const { tab, entity, onClose, onJump } = props;
  if (!entity) {
    return (
      <aside class="db-detail">
        <div class="placeholder">Válassz egy sort a részletekhez</div>
      </aside>
    );
  }

  // Access optional cross-reference fields without narrowing per entity type.
  const rec = entity as unknown as Record<string, unknown>;
  const fields = DETAIL_FIELDS[tab];
  const image = typeof rec.image === 'string' ? rec.image : null;

  const shops = Array.isArray(rec.shops)
    ? [...(rec.shops as { cellId: string; owner: string; price: number }[])].sort((a, b) => a.price - b.price)
    : [];
  const recipe = Array.isArray(rec.recipe)
    ? (rec.recipe as { name: string; qty: number; id: string }[])
    : [];
  const droppedBy = Array.isArray(rec.droppedBy)
    ? (rec.droppedBy as { monsterId: number; qty: number }[])
    : [];
  const drops = Array.isArray(rec.drops)
    ? (rec.drops as { name: string; qty: number; id: number }[])
    : [];

  return (
    <aside class="db-detail">
      <button type="button" class="close-detail" title="Bezárás" onClick={onClose}>×</button>
      <h2>{String(rec.name)}</h2>
      <div class="meta">
        {tab} · ID {String(rec.id)}
        {image && (
          <img class="monster-thumb" src={monsterImageUrl(image)} alt="" />
        )}
      </div>

      <dl class="stats">
        {fields.map(([key, label]) => {
          const value = rec[key];
          if (value == null || value === '') return null;
          return [
            <dt key={`${key}-dt`}>{label}</dt>,
            <dd key={`${key}-dd`}>{renderValue(value)}</dd>,
          ];
        })}
      </dl>

      {shops.length > 0 && (
        <div>
          <h3>Boltokban kapható ({shops.length})</h3>
          <ul>
            {shops.map((s, i) => (
              <li key={i}>
                <span class="qty">{s.price.toLocaleString('hu')} ezüst</span> · {s.owner} · mező {s.cellId} a térképen
              </li>
            ))}
          </ul>
        </div>
      )}

      {recipe.length > 0 && (
        <div>
          <h3>Recept</h3>
          <ul>
            {recipe.map((c, i) => (
              <li key={i}>
                <span class="qty">{c.qty}× </span>
                {c.id
                  ? <a class="ref" onClick={() => onJump('items', Number(c.id))}>{c.name}</a>
                  : c.name}
              </li>
            ))}
          </ul>
        </div>
      )}

      {droppedBy.length > 0 && (
        <div>
          <h3>Dobják ({droppedBy.length} szörny)</h3>
          <ul>
            {droppedBy.map((d, i) => (
              <li key={i}>
                <a class="ref" onClick={() => onJump('monsters', d.monsterId)}>szörny #{d.monsterId}</a>
                <span class="qty"> · {d.qty}× dobja</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {drops.length > 0 && (
        <div>
          <h3>Dobott tárgyak</h3>
          <ul>
            {drops.map((d, i) => (
              <li key={i}>
                <span class="qty">{d.qty}× </span>
                {d.id
                  ? <a class="ref" onClick={() => onJump('items', Number(d.id))}>{d.name}</a>
                  : d.name}
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}
