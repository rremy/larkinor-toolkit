import { h, type VNode } from 'preact';
import type { LockType, MonsterDatabase, Quest, QuestCell } from '@/shared/data';
import { LOCK_LABEL, coordLabel, keyCellsFor, locksIn } from './questMeta';

interface QuestKeyLegendProps {
  quest: Quest;
  monsters: MonsterDatabase;
  activeLock: LockType | null;
  onHoverLock(lock: LockType | null): void;
  onSelectCell(cell: QuestCell): void;
  /** Locks whose doors the maze currently leaves undrawn. */
  hiddenLocks: ReadonlySet<LockType>;
  onToggleLock(lock: LockType): void;
}

/** Outline eye, crossed out when `crossed` — that lock's doors are hidden. */
function EyeIcon(props: { crossed: boolean }): VNode {
  return (
    <svg
      class="quest-eye-icon"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {props.crossed && <line x1="3" y1="3" x2="21" y2="21" />}
    </svg>
  );
}

/**
 * Every lock gating a door in this quest, and where its key is.
 *
 * The discoverable counterpart to the door hover hint: hover does not exist on
 * touch and is not keyboard-reachable, so the same information is always on
 * screen here.
 *
 * Each row carries an eye that hides that lock's doors once the player holds
 * its key, so the maze shows only what still bars the way. It is offered on a
 * lock with no key in this quest too: nothing stops the player bringing one in.
 */
export function QuestKeyLegend(props: QuestKeyLegendProps): VNode {
  const { quest, monsters, activeLock, onHoverLock, onSelectCell, hiddenLocks, onToggleLock } = props;
  const locks = locksIn(quest);

  if (locks.length === 0) {
    return (
      <div class="quest-legend">
        <h3>Kulcsok</h3>
        <div class="placeholder">Ebben a küldetésben nincs zárt ajtó.</div>
      </div>
    );
  }

  return (
    <div class="quest-legend">
      <h3>Kulcsok</h3>
      <ul class="list">
        {locks.map((lock) => {
          const cells = keyCellsFor(quest, lock);
          const hidden = hiddenLocks.has(lock);
          const toggleLabel = `${LOCK_LABEL[lock]} ajtóinak ${hidden ? 'megjelenítése' : 'elrejtése'}`;
          return (
            <li
              key={lock}
              class={`quest-legend-row${activeLock === lock ? ' active' : ''}${hidden ? ' doors-hidden' : ''}`}
              onMouseEnter={() => onHoverLock(lock)}
              onMouseLeave={() => onHoverLock(null)}
            >
              <button
                type="button"
                class="quest-door-toggle"
                aria-pressed={!hidden}
                aria-label={toggleLabel}
                title={toggleLabel}
                onClick={() => onToggleLock(lock)}
              >
                <EyeIcon crossed={hidden} />
              </button>
              <span class={`quest-lock-swatch lock-${lock}`} />
              <span class="quest-lock-name">{LOCK_LABEL[lock]}</span>
              {cells.length === 0 ? (
                <span class="quest-lock-missing">nincs kulcs ebben a küldetésben</span>
              ) : (
                <span class="quest-lock-where">
                  {cells.map((cell) => {
                    const monster = cell.monsterId != null ? monsters.getById(cell.monsterId) : undefined;
                    return (
                      <button
                        key={`${cell.row}-${cell.col}`}
                        type="button"
                        class="quest-lock-link"
                        onClick={() => onSelectCell(cell)}
                      >
                        {coordLabel(cell)}{monster ? ` (${monster.name})` : ''}
                      </button>
                    );
                  })}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
