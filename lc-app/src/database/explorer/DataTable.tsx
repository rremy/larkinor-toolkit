import { h, type VNode } from 'preact';
import { useState } from 'preact/hooks';
import type { ColumnDef } from './columns';
import { sortRows } from './filters';

interface DataTableProps<T> {
  columns: ColumnDef[];
  rows: T[];
  onSelect: (row: T) => void;
  selected?: T;
  /** Initial sort column; falls back to the first non-numeric column. */
  defaultSortKey?: string;
  /** Initial sort direction (default ascending). */
  defaultSortAsc?: boolean;
}

const ROW_CAP = 2000;

/** Render a single cell value following the legacy `fmt` rules. */
function formatCell(value: unknown, col: ColumnDef): VNode | string {
  if (value == null || value === '') return <span class="dim">—</span>;
  if (col.bool) {
    return value
      ? <span class="badge yes">Igen</span>
      : <span class="badge no">Nem</span>;
  }
  if (col.num && typeof value === 'number') return value.toLocaleString('hu');
  return String(value);
}

export function DataTable<T extends Record<string, unknown>>(
  props: DataTableProps<T>,
): VNode {
  const { columns, rows, onSelect, selected, defaultSortKey, defaultSortAsc } = props;
  const firstSortable = columns.find((c) => !c.num) ?? columns[0];
  const [sortKey, setSortKey] = useState<string>(
    defaultSortKey ?? (firstSortable ? firstSortable.key : ''),
  );
  const [sortAsc, setSortAsc] = useState(defaultSortAsc ?? true);

  const sortCol = columns.find((c) => c.key === sortKey);
  const sorted = sortKey ? sortRows(rows, sortKey, sortAsc, !!sortCol?.num) : rows;
  const slice = sorted.slice(0, ROW_CAP);

  function onHeaderClick(key: string) {
    if (key === sortKey) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  return (
    <table class="db">
      <thead>
        <tr>
          {columns.map((c) => {
            const cls = c.key === sortKey ? `sorted ${sortAsc ? 'asc' : 'desc'}` : '';
            return (
              <th key={c.key} class={cls} onClick={() => onHeaderClick(c.key)}>
                {c.label}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {slice.map((row) => {
          const isSelected = selected != null && selected.id === row.id;
          return (
            <tr
              key={String(row.id)}
              class={`row${isSelected ? ' selected' : ''}`}
              onClick={() => onSelect(row)}
            >
              {columns.map((c) => (
                <td key={c.key} class={c.cls || ''}>{formatCell(row[c.key], c)}</td>
              ))}
            </tr>
          );
        })}
        {sorted.length > ROW_CAP && (
          <tr>
            <td colSpan={columns.length} class="dim center">
              …további {(sorted.length - ROW_CAP).toLocaleString('hu')} sor (szűkíts a szűrőkkel)
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
