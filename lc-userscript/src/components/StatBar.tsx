import { h } from 'preact';
import type { StatusIcon } from '@/utils/domExtract';

export interface StatBarProps {
  hp: number;
  hpMax: number;
  mp: number;
  mpMax: number;
  gold?: number;
  statusIcons?: StatusIcon[];
  /** When set, renders a gear button (opens the local config). Free-move only. */
  onConfig?: () => void;
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

export function StatBar({ hp, hpMax, mp, mpMax, gold, statusIcons, onConfig }: StatBarProps) {
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
      {(gold !== undefined || onConfig) && (
        <div class="lc-stat-row lc-stat-gold">
          {gold !== undefined && <span class="lc-stat-label">💰</span>}
          {gold !== undefined && <span class="lc-stat-value">{gold}</span>}
          {statusIcons && statusIcons.length > 0 && (
            <span class="lc-status-icons">
              {statusIcons.map((icon, i) => (
                <img key={i} class="lc-status-icon" src={icon.iconUrl} title={icon.label} alt={icon.label} />
              ))}
            </span>
          )}
          {onConfig && (
            <button class="lc-statbar-gear" aria-label="Beállítások" onClick={() => onConfig()}>⚙</button>
          )}
        </div>
      )}
    </div>
  );
}
