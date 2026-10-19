import { h, type VNode } from 'preact';
import type { LockType, MonsterDatabase, Quest, QuestCell } from '@/shared/data';
import { LOCK_LABEL, coordLabel, keyCellsFor, locksIn } from './questMeta';

interface QuestKeyLegendProps {
  quest: Quest;
  monsters: MonsterDatabase;
  activeLock: LockType | null;
  onHoverLock(lock: LockType | null): void;
  onSelectCell(cell: QuestCell): void;
  /** Whether the maze currently draws its walls; drives the eye toggle. */
  wallsVisible: boolean;
  onToggleWalls(): void;
}

/** Outline eye, crossed out when `crossed` — the walls are hidden. */
function EyeIcon(props: { crossed: boolean }): VNode {
  return (
    <svg
      class="quest-walls-icon"
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
 * The legend's heading, with the wall toggle beside it. Sits here because the
 * keys are what remain worth reading on a maze stripped down to its doors.
 */
function LegendHead(props: { wallsVisible: boolean; onToggleWalls(): void }): VNode {
  const { wallsVisible, onToggleWalls } = props;
  const label = wallsVisible ? 'Falak elrejtése' : 'Falak megjelenítése';
  return (
    <div class="quest-legend-head">
      <h3>Kulcsok</h3>
      <button
        type="button"
        class="quest-walls-toggle"
        aria-pressed={wallsVisible}
        aria-label={label}
        title={label}
        onClick={onToggleWalls}
      >
        <EyeIcon crossed={!wallsVisible} />
      </button>
    </div>
  );
}

/**
 * Every lock gating a door in this quest, and where its key is.
 *
 * The discoverable counterpart to the door hover hint: hover does not exist on
 * touch and is not keyboard-reachable, so the same information is always on
 * screen here.
 */
export function QuestKeyLegend(props: QuestKeyLegendProps): VNode {
  const { quest, monsters, activeLock, onHoverLock, onSelectCell, wallsVisible, onToggleWalls } = props;
  const head = <LegendHead wallsVisible={wallsVisible} onToggleWalls={onToggleWalls} />;
  const locks = locksIn(quest);

  if (locks.length === 0) {
    return (
      <div class="quest-legend">
        {head}
        <div class="placeholder">Ebben a küldetésben nincs zárt ajtó.</div>
      </div>
    );
  }

  return (
    <div class="quest-legend">
      {head}
      <ul class="list">
        {locks.map((lock) => {
          const cells = keyCellsFor(quest, lock);
          return (
            <li
              key={lock}
              class={`quest-legend-row${activeLock === lock ? ' active' : ''}`}
              onMouseEnter={() => onHoverLock(lock)}
              onMouseLeave={() => onHoverLock(null)}
            >
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
