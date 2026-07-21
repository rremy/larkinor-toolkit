import { h, type JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { HomeItem } from '@/utils/homeExtract';

export interface InventoryRowProps {
  item: HomeItem;
  /** Glyph on the move button (e.g. "🎒" or "⌂"). */
  moveGlyph: string;
  /** Accessible title / tooltip for the move button. */
  moveTitle: string;
  onMove: (qty: number) => void;
  onOpenDetail: () => void;
}

function kg(n: number): string {
  return (Math.round(n * 10000) / 10000).toLocaleString('hu-HU');
}

const TYPE_LABEL: Record<string, string> = { fegyver: 'fegyver', vért: 'vért' };

export function InventoryRow({ item, moveGlyph, moveTitle, onMove, onOpenDetail }: InventoryRowProps): JSX.Element {
  const [qty, setQty] = useState<number>(item.amount);
  const single = item.amount <= 1;
  const clamp = (n: number): number => Math.max(1, Math.min(item.amount, n));

  return (
    <div class="lc-inv-row">
      <div class="lc-inv-cell">
        <div class="lc-inv-name-line">
          <button class="lc-inv-name" onClick={onOpenDetail}>{item.name}</button>
          {TYPE_LABEL[item.type] && <span class="lc-inv-badge">{TYPE_LABEL[item.type]}</span>}
          {item.magical && <span class="lc-inv-badge">mágikus</span>}
        </div>
        <div class="lc-inv-meta">
          <span>×<b>{item.amount.toLocaleString('hu-HU')}</b></span>
          <span>{kg(item.weight)} kg/db</span>
          <span>Σ <b>{kg(item.totalWeight)}</b> kg</span>
        </div>
      </div>
      <div class="lc-inv-move">
        {!single && (
          <div class="lc-inv-qty">
            <button aria-label="Kevesebb" onClick={() => setQty((q) => clamp(q - 1))}>−</button>
            <input
              value={String(qty)}
              inputMode="numeric"
              style={{ width: `${Math.max(3, String(qty).length + 1)}ch` }}
              onInput={(e) => setQty(clamp(parseInt((e.target as HTMLInputElement).value, 10) || 1))}
            />
            <button aria-label="Több" onClick={() => setQty((q) => clamp(q + 1))}>+</button>
          </div>
        )}
        <button class="lc-inv-move-btn" title={moveTitle} onClick={() => onMove(single ? 1 : qty)}>
          {moveGlyph}
        </button>
      </div>
    </div>
  );
}
