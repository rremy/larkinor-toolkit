import { h, type JSX } from 'preact';

export interface CapacityMeterProps {
  label: string;
  /** Weight currently used, in kg. */
  used: number;
  /** Capacity, in kg. */
  max: number;
  /** Optional leading glyph (e.g. "⌂" or "🎒"). */
  icon?: string;
}

/** Rounds to 2 decimals and formats with Hungarian grouping. */
function kg(n: number): string {
  return (Math.round(n * 100) / 100).toLocaleString('hu-HU');
}

export function CapacityMeter({ label, used, max, icon }: CapacityMeterProps): JSX.Element {
  const pct = max > 0 ? Math.min(100, (used / max) * 100) : 0;
  const level = pct > 95 ? 'crit' : pct > 80 ? 'warn' : 'ok';
  return (
    <div class="lc-cap">
      <div class="lc-cap-head">
        <span class="lc-cap-label">{icon && <span class="lc-cap-icon">{icon}</span>}{label}</span>
        <span class="lc-cap-val"><b>{kg(used)}</b> / {kg(max)} kg</span>
      </div>
      <div class="lc-cap-track">
        <div class={`lc-cap-fill lc-cap-fill--${level}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
