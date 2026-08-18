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
  /** When set, renders a database button (opens the DB overlay). Free-move only. */
  onDatabase?: () => void;
  /**
   * When set, renders a question-mark button opening the DB overlay straight on
   * its quests view. Dungeon only — the same gating the desktop dock applies to
   * its "Küldetések" button, since that is where a maze is being walked.
   */
  onQuests?: () => void;
}

/** Simple stacked-cylinder database glyph, tinted via currentColor. */
function DbIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
      <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
    </svg>
  );
}

/** Question mark in a circle, drawn in the same line style as DbIcon. */
function QuestIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </svg>
  );
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

export function StatBar({ hp, hpMax, mp, mpMax, gold, statusIcons, onConfig, onDatabase, onQuests }: StatBarProps) {
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
      {(gold !== undefined || onConfig || onDatabase || onQuests) && (
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
          {(onQuests || onDatabase || onConfig) && (
            <span class="lc-statbar-btns">
              {onQuests && (
                <button class="lc-statbar-btn lc-statbar-quests" aria-label="Küldetések" onClick={() => onQuests()}><QuestIcon /></button>
              )}
              {onDatabase && (
                <button class="lc-statbar-btn lc-statbar-db" aria-label="Adatbázis" onClick={() => onDatabase()}><DbIcon /></button>
              )}
              {onConfig && (
                <button class="lc-statbar-btn lc-statbar-gear" aria-label="Beállítások" onClick={() => onConfig()}>⚙</button>
              )}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
