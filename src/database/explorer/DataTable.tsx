import { h, type VNode } from 'preact';
import { useState } from 'preact/hooks';
import type { ColumnDef } from './columns';
import { sortRows } from './filters';
import { useCompare } from '@/hooks/useCompare';
import type { CompareSubject } from '@/shared/compare';

interface DataTableProps<T> {
  columns: ColumnDef[];
  rows: T[];
  onSelect: (row: T) => void;
  selected?: T;
  /** Initial sort column; falls back to the first non-numeric column. */
  defaultSortKey?: string;
  /** Initial sort direction (default ascending). */
  defaultSortAsc?: boolean;
  /**
   * Turns a row into a compare subject, enabling the hover/long-press diff
   * against the worn set. Omitted for tabs with nothing to compare (items,
   * monsters), and inert in the standalone site, which has no loadout.
   */
  subjectOf?: (row: T) => CompareSubject | null;
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

interface DataRowProps<T> {
  row: T;
  columns: ColumnDef[];
  selected: boolean;
  onSelect: (row: T) => void;
  subject: CompareSubject | null;
}

/**
 * One table row. Its own component because `useCompare` is a hook: calling it
 * inside the rows' `.map()` would change the hook count whenever the filtered
 * row count changes.
 */
function DataRow<T extends Record<string, unknown>>(
  { row, columns, selected, onSelect, subject }: DataRowProps<T>,
): VNode {
  const cmp = useCompare(subject);
  return (
    <tr class={`row${selected ? ' selected' : ''}`} onClick={() => onSelect(row)} {...cmp.props}>
      {columns.map((c, i) => (
        <td key={c.key} class={c.cls || ''}>
          {formatCell(row[c.key], c)}
          {i === 0 && cmp.card}
        </td>
      ))}
    </tr>
  );
}

export function DataTable<T extends Record<string, unknown>>(
  props: DataTableProps<T>,
): VNode {
  const { columns, rows, onSelect, selected, defaultSortKey, defaultSortAsc, subjectOf } = props;
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
        {slice.map((row) => (
          <DataRow
            key={String(row.id)}
            row={row}
            columns={columns}
            selected={selected != null && selected.id === row.id}
            onSelect={onSelect}
            subject={subjectOf?.(row) ?? null}
          />
        ))}
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
