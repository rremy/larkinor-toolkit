import { h, type VNode } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { DataLoader, Weapon, Armor, Item } from '@/shared/data';
import type { Monster } from '@/shared/data/monsters';
import type { EntityTab } from './columns';
import { COLS, DEFAULT_SORT } from './columns';
import { FILTERS, applyFilters, type FilterState } from './filters';
import { DataTable } from './DataTable';
import { Filters } from './FilterBar';
import { DetailPanel } from './DetailPanel';
import { buildLookups, type DetailLookups } from './lookups';

type Row = Record<string, unknown>;
type Entity = Weapon | Armor | Item | Monster;

interface ExplorerViewProps {
  loader: DataLoader;
  tab: EntityTab;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  onJump: (tab: EntityTab, id: number) => void;
  /** Open the map focused on a shop's cell (from the detail panel). */
  onShowCell: (cellId: string) => void;
}

async function loadRows(loader: DataLoader, tab: EntityTab): Promise<Row[]> {
  switch (tab) {
    case 'weapons': return (await loader.loadWeapons()) as unknown as Row[];
    case 'armors': return (await loader.loadArmors()) as unknown as Row[];
    case 'items': return (await loader.loadItems()) as unknown as Row[];
    case 'monsters': {
      const db = await loader.loadMonsters();
      return [...db.byName.values()] as unknown as Row[];
    }
  }
}

export function ExplorerView(props: ExplorerViewProps): VNode {
  const { loader, tab, selectedId, onSelect, onJump, onShowCell } = props;
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterState, setFilterState] = useState<FilterState>({});
  const [lookups, setLookups] = useState<DetailLookups | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFilterState({});
    loadRows(loader, tab)
      .then((loaded) => { if (!cancelled) { setRows(loaded); setLoading(false); } })
      .catch(() => { if (!cancelled) { setRows([]); setLoading(false); } });
    return () => { cancelled = true; };
  }, [loader, tab]);

  // Cross-dataset lookups (reverse-crafting + monster-by-id) for the detail
  // panel. Loaded once; the loader caches, so this is cheap after first fetch.
  useEffect(() => {
    let cancelled = false;
    Promise.all([loader.loadWeapons(), loader.loadArmors(), loader.loadItems(), loader.loadMonsters()])
      .then(([w, a, i, mdb]) => {
        if (!cancelled) setLookups(buildLookups(w, a, i, [...mdb.byName.values()]));
      })
      .catch(() => { /* detail enrichment stays unavailable */ });
    return () => { cancelled = true; };
  }, [loader]);

  const visible = applyFilters(rows, FILTERS[tab], filterState);
  const selected = selectedId != null
    ? rows.find((r) => r.id === selectedId) ?? null
    : null;

  return (
    <div class={`db-view${selected ? ' has-selection' : ''}`}>
      <Filters defs={FILTERS[tab]} state={filterState} onChange={setFilterState} />
      <div class="counts">
        {loading
          ? 'Betöltés…'
          : `${visible.length.toLocaleString('hu')} találat (${rows.length.toLocaleString('hu')} összesen)`}
      </div>
      <div class="layout">
        <div class="table-wrap">
          <DataTable
            key={tab}
            columns={COLS[tab]}
            rows={visible}
            selected={selected ?? undefined}
            onSelect={(row) => onSelect(row.id as number)}
            defaultSortKey={DEFAULT_SORT[tab].key}
            defaultSortAsc={DEFAULT_SORT[tab].asc}
          />
        </div>
        <DetailPanel
          tab={tab}
          entity={selected as Entity | null}
          onClose={() => onSelect(null)}
          onJump={onJump}
          onShowCell={onShowCell}
          lookups={lookups ?? undefined}
        />
      </div>
    </div>
  );
}
