import { h, type JSX } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { CompareColumn, CompareValue } from '@/shared/compare';

/** Keep-inside-the-viewport breathing room. */
const EDGE_MARGIN_PX = 8;
/**
 * Gap when flipping to the pointer's other side: twice the offset the trigger
 * already applied, so the flipped card clears the pointer by as much as the
 * unflipped one does.
 */
const FLIP_GAP_PX = 24;

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
  if (typeof value === 'string') return value;
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
  const ref = useRef<HTMLDivElement>(null);
  // How far the card had to move to stay on screen. Kept as a delta rather than
  // an absolute position because a transformed ancestor (the collapsed dock sets
  // `transform`) makes a fixed element's `left` relative to that ancestor, not
  // the viewport — a delta is correct either way.
  const [adjust, setAdjust] = useState({ dx: 0, dy: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // Nothing measurable means nothing to fit — and, more importantly, a rect
    // that does not reflect the offset we already applied would make the delta
    // grow on every pass instead of converging. Bail rather than loop.
    if (rect.width === 0 && rect.height === 0) return;
    // Where the card sits before any adjustment, in viewport coordinates.
    const baseLeft = rect.left - adjust.dx;
    const baseTop = rect.top - adjust.dy;
    const maxRight = window.innerWidth - EDGE_MARGIN_PX;
    const maxBottom = window.innerHeight - EDGE_MARGIN_PX;

    let dx = 0;
    let dy = 0;
    if (baseLeft + rect.width > maxRight) {
      // Prefer flipping to the pointer's left, which keeps the hovered row
      // visible; fall back to clamping when the card is too wide to fit there.
      const flipped = baseLeft - rect.width - FLIP_GAP_PX;
      dx = (flipped >= EDGE_MARGIN_PX ? flipped : maxRight - rect.width) - baseLeft;
    }
    if (baseLeft + dx < EDGE_MARGIN_PX) dx = EDGE_MARGIN_PX - baseLeft;
    if (baseTop + rect.height > maxBottom) dy = maxBottom - rect.height - baseTop;
    if (baseTop + dy < EDGE_MARGIN_PX) dy = EDGE_MARGIN_PX - baseTop;

    // Converges: once applied, the next run computes the same delta.
    if (dx !== adjust.dx || dy !== adjust.dy) setAdjust({ dx, dy });
  }, [x, y, columns, adjust]);

  if (columns.length === 0) return null;
  const labels = columns[0].rows.map((r) => r.label);

  return (
    <div
      class="lc-cmp"
      ref={ref}
      style={{ left: `${x + adjust.dx}px`, top: `${y + adjust.dy}px` }}
      role="tooltip"
    >
      <div class="lc-cmp-title">{name}</div>
      <table style={{ color: 'var(--text)' }}>
        <thead>
          <tr>
            <th />
            {columns.map((col) => (
              <th key={col.slot} colSpan={2} class="lc-cmp-slot">{col.slotLabel}</th>
            ))}
          </tr>
          <tr>
            {/* The equipped item, then the hovered one. Labelled "új" rather
                than repeated by name: the title already names it, and with two
                hands the name would appear three times over. */}
            <th />
            {columns.map((col) => [
              <th key={`${col.slot}-cur`} class="lc-cmp-sub">{col.currentName}</th>,
              <th key={`${col.slot}-new`} class="lc-cmp-sub">új</th>,
            ])}
          </tr>
        </thead>
        <tbody>
          {labels.map((label, i) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              {columns.map((col) => {
                const row = col.rows[i];
                return [
                  <td key={`${col.slot}-cur`} class="lc-cmp-cur">{renderValue(row.current)}</td>,
                  <td key={`${col.slot}-new`} class={`lc-cmp-${row.direction}`}>
                    {renderValue(row.candidate)}
                    {row.delta && <span class="lc-cmp-delta">{`(${row.delta})`}</span>}
                  </td>,
                ];
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
