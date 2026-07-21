import { h, type JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { HomeItem } from '@/utils/homeExtract';
import { InventoryRow } from '@/components/InventoryRow';

export interface InventoryListProps {
  items: HomeItem[];
  moveGlyph: string;
  moveTitle: string;
  onMove: (item: HomeItem, qty: number) => void;
  onOpenDetail: (item: HomeItem) => void;
}

type SortKey = 'name' | 'weight' | 'totalWeight' | 'amount' | 'price';

const SORT_OPTIONS: Array<[SortKey, string]> = [
  ['name', 'Név'],
  ['weight', 'Súly'],
  ['totalWeight', 'Összsúly'],
  ['amount', 'Mennyiség'],
  ['price', 'Ár'],
];

export function InventoryList({ items, moveGlyph, moveTitle, onMove, onOpenDetail }: InventoryListProps): JSX.Element {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [asc, setAsc] = useState(true);

  const q = query.trim().toLowerCase();
  const dir = asc ? 1 : -1;
  const visible = items
    .filter((it) => it.name.toLowerCase().includes(q))
    .sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name, 'hu') * dir;
      return ((a[sortKey] ?? 0) - (b[sortKey] ?? 0)) * dir;
    });

  return (
    <div>
      <div class="lc-inv-toolbar">
        <label class="lc-inv-search">
          <span aria-hidden="true">⌕</span>
          <input
            placeholder="Keresés név szerint…"
            value={query}
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          />
        </label>
        <select
          class="lc-inv-sort"
          aria-label="Rendezés"
          value={sortKey}
          onChange={(e) => setSortKey((e.target as HTMLSelectElement).value as SortKey)}
        >
          {SORT_OPTIONS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <button class="lc-inv-dir" aria-label="Sorrend" onClick={() => setAsc((v) => !v)}>{asc ? '↓' : '↑'}</button>
      </div>
      <div class="lc-inv-list">
        {visible.map((it) => (
          <InventoryRow
            key={it.index}
            item={it}
            moveGlyph={moveGlyph}
            moveTitle={moveTitle}
            onMove={(qty) => onMove(it, qty)}
            onOpenDetail={() => onOpenDetail(it)}
          />
        ))}
      </div>
    </div>
  );
}
