import { h } from 'preact';

export interface StatBarProps {
  hp: number;
  hpMax: number;
  mp: number;
  mpMax: number;
  gold?: number;
}

function Bar({ value, max, className }: { value: number; max: number; className: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div class="lc-stat-bar-track">
      <div
        class={`lc-stat-bar-fill ${className}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function StatBar({ hp, hpMax, mp, mpMax, gold }: StatBarProps) {
  return (
    <div class="lc-stat-bar lc-section">
      <div class="lc-stat-row">
        <span class="lc-stat-label lc-stat-label--hp">❤</span>
        <Bar value={hp} max={hpMax} className="lc-stat-bar-fill--hp" />
        <span class="lc-stat-value">{hp} / {hpMax}</span>
      </div>
      <div class="lc-stat-row">
        <span class="lc-stat-label lc-stat-label--mp">✨</span>
        <Bar value={mp} max={mpMax} className="lc-stat-bar-fill--mp" />
        <span class="lc-stat-value">{mp} / {mpMax}</span>
      </div>
      {gold !== undefined && (
        <div class="lc-stat-row lc-stat-gold">
          <span class="lc-stat-label">💰</span>
          <span class="lc-stat-value">{gold}</span>
        </div>
      )}
    </div>
  );
}
