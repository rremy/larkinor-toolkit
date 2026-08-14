import { h, type VNode } from 'preact';
import type { LockType, MonsterDatabase, Quest, QuestCell } from '@/shared/data';
import { LOCK_LABEL, coordLabel, keyCellsFor, locksIn } from './questMeta';

interface QuestKeyLegendProps {
  quest: Quest;
  monsters: MonsterDatabase;
  activeLock: LockType | null;
  onHoverLock(lock: LockType | null): void;
  onSelectCell(cell: QuestCell): void;
}

/**
 * Every lock gating a door in this quest, and where its key is.
 *
 * The discoverable counterpart to the door hover hint: hover does not exist on
 * touch and is not keyboard-reachable, so the same information is always on
 * screen here.
 */
export function QuestKeyLegend(props: QuestKeyLegendProps): VNode {
  const { quest, monsters, activeLock, onHoverLock, onSelectCell } = props;
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
