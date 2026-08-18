import { h, type JSX } from 'preact';
import type { CompareColumn, CompareValue } from '@/shared/compare';

export interface CompareCardProps {
  /** The hovered item's name. */
  name: string;
  columns: CompareColumn[];
  /** Viewport coordinates of the card's top-left corner. */
  x: number;
  y: number;
}

function renderValue(value: CompareValue): string {
  if (value === null) return '—';
  if (typeof value === 'boolean') return value ? 'igen' : 'nem';
  return value.toLocaleString('hu');
}

/**
 * The hover/long-press diff: the hovered item against what is worn, one column
 * per compared slot.
 *
 * The inline `color` on the table is not decoration. This renders inside the
 * live game page, which is quirks mode — where table cells do not inherit
 * `color` from an ancestor and would come out black on our dark panel. Set
 * inline rather than in the stylesheet so it cannot be lost to specificity.
 */
export function CompareCard({ name, columns, x, y }: CompareCardProps): JSX.Element | null {
  if (columns.length === 0) return null;
  const labels = columns[0].rows.map((r) => r.label);

  return (
    <div class="lc-cmp" style={{ left: `${x}px`, top: `${y}px` }} role="tooltip">
      <div class="lc-cmp-title">{name}</div>
      <table style={{ color: 'var(--text)' }}>
        <thead>
          <tr>
            <th />
            {columns.map((col) => (
              <th key={col.slot}>
                <span class="lc-cmp-slot">{col.slotLabel}</span>
                <span class="lc-cmp-current">{col.currentName}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labels.map((label, i) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              {columns.map((col) => {
                const row = col.rows[i];
                return (
                  <td key={col.slot} class={`lc-cmp-${row.direction}`}>
                    <span class="lc-cmp-from">{renderValue(row.current)}</span>
                    <span class="lc-cmp-arrow" aria-hidden="true">→</span>
                    <span class="lc-cmp-to">{renderValue(row.candidate)}</span>
                    {row.delta && <span class="lc-cmp-delta">{row.delta}</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
