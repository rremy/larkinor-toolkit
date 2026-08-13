import { h, type VNode } from 'preact';
import type { LockType, MonsterDatabase, Quest, QuestCell } from '@/shared/data';
import { monsterImageUrl } from '@/components/MonsterCard';
import { BADGE, LOCK_LABEL, SIDES, SIDE_LABEL, SZEL_LABEL, coordLabel } from './questMeta';

interface QuestGridProps {
  quest: Quest;
  monsters: MonsterDatabase;
  selected: QuestCell | null;
  onSelect(cell: QuestCell): void;
  /** Lock whose key cells are highlighted, driven by door hover/focus. */
  highlightLock?: LockType | null;
  /** Which door is being probed, so only that edge shows as active. */
  onProbeLock?(lock: LockType | null): void;
  /** Tile edge length in px, driven by the zoom control. */
  tileSize?: number;
}

const DEFAULT_TILE = 56;

/**
 * The quest maze.
 *
 * Rendered as CSS grid + divs rather than a `<table>` on purpose: the in-game
 * page runs in quirks mode, where table cells do not inherit `color` and end up
 * black-on-dark. See CLAUDE.md.
 */
export function QuestGrid(props: QuestGridProps): VNode {
  const {
    quest, monsters, selected, onSelect,
    highlightLock = null, onProbeLock, tileSize = DEFAULT_TILE,
  } = props;

  return (
    <div
      class="quest-grid"
      // Fixed-px columns: the tiles take their size from the column, so the
      // zoom control needs no CSS custom property.
      style={{ gridTemplateColumns: `repeat(${quest.cols}, ${tileSize}px)` }}
    >
      {quest.cells.map((cell) => {
        const monster = cell.monsterId != null ? monsters.getById(cell.monsterId) : undefined;
        const isSelected = selected != null && selected.row === cell.row && selected.col === cell.col;
        const keyHit = highlightLock != null && cell.key === highlightLock;
        const classes = ['quest-cell'];
        if (isSelected) classes.push('selected');
        if (keyHit) classes.push('key-hit');
        if (cell.narration === '' && !monster && !cell.portal) classes.push('void');
        // Tint the hit glow with the hovered lock's colour; --quest-key-glow
        // is the fallback for the (impossible in practice) case of a keyHit
        // without a highlightLock.
        const cellStyle = keyHit && highlightLock != null
          ? { '--hit': `var(--lock-${highlightLock})` }
          : undefined;

        return (
          <div
            key={`${cell.row}-${cell.col}`}
            class={classes.join(' ')}
            data-row={cell.row}
            data-col={cell.col}
            style={cellStyle}
            onClick={() => onSelect(cell)}
            title={coordLabel(cell)}
          >
            {SIDES.map((side) => {
              const edge = cell.edges[side];
              if (edge.kind === 'open') return null;
              const edgeClasses = ['quest-edge', side];
              if (edge.kind === 'wall') edgeClasses.push('wall');
              if (edge.kind === 'szel') edgeClasses.push('szel');
              if (edge.kind === 'door') edgeClasses.push('door', `lock-${edge.lock}`);
              const isDoor = edge.kind === 'door';
              return (
                <div
                  key={side}
                  class={edgeClasses.join(' ')}
                  tabIndex={isDoor ? 0 : undefined}
                  role={isDoor ? 'button' : undefined}
                  aria-label={isDoor
                    ? `${LOCK_LABEL[edge.lock]} ajtó ${SIDE_LABEL[side]} felé`
                    : undefined}
                  title={isDoor
                    ? `${LOCK_LABEL[edge.lock]} ajtó`
                    : edge.kind === 'szel' ? SZEL_LABEL : undefined}
                  onMouseEnter={isDoor ? () => onProbeLock?.(edge.lock) : undefined}
                  onMouseLeave={isDoor ? () => onProbeLock?.(null) : undefined}
                  onFocus={isDoor ? () => onProbeLock?.(edge.lock) : undefined}
                  onBlur={isDoor ? () => onProbeLock?.(null) : undefined}
                  onClick={isDoor
                    ? (e: MouseEvent) => { e.stopPropagation(); onProbeLock?.(edge.lock); }
                    : undefined}
                />
              );
            })}
            {monster && (
              <img
                class="quest-sprite"
                src={monsterImageUrl(monster.image)}
                alt={monster.name}
                loading="lazy"
              />
            )}
            <div class="quest-badges">
              {cell.portal === 'entrance' && <span class="quest-badge entrance" title="bejárat">{BADGE.entrance}</span>}
              {cell.portal === 'exit' && <span class="quest-badge exit" title="kijárat">{BADGE.exit}</span>}
              {cell.key && (
                <span class={`quest-badge key lock-${cell.key}`} title={LOCK_LABEL[cell.key]}>{BADGE.key}</span>
              )}
              {cell.questItem && <span class="quest-badge quest-item" title="küldetés tárgy">{BADGE.questItem}</span>}
              {cell.trap && <span class="quest-badge trap" title="csapda">{BADGE.trap}</span>}
              {cell.death && <span class="quest-badge death" title="halál">{BADGE.death}</span>}
              {cell.question && <span class="quest-badge question" title="kérdés">{BADGE.question}</span>}
              {cell.boss && <span class="quest-badge boss" title="boss">{BADGE.boss}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
