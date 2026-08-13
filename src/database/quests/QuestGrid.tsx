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
        // Trap and question cells get one big centred icon instead of a
        // corner badge (see CLAUDE.md / task 17). Trap wins if a cell were
        // ever both — not observed in the current data, but a trap is the
        // more dangerous fact, so this ordering is a defensive default.
        const bigIcon: 'trap' | 'question' | null = cell.trap
          ? 'trap'
          : cell.question != null ? 'question' : null;
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
            {bigIcon && (
              // Overlays the sprite rather than replacing it (quest 27, cell
              // 1,2 is both a question and a monster encounter).
              // font-size is set inline from tileSize, rather than via a CSS
              // container-query unit, so `.quest-cell` never needs
              // `container-type` — that would give every cell its own
              // stacking context and scope `.quest-edge`'s z-index inside
              // it, letting a later cell's background paint over the wall
              // line it shares with the cell before it. See theme.css.
              <span
                class={`quest-big-icon ${bigIcon}`}
                title={bigIcon === 'trap' ? 'csapda' : 'kérdés'}
                style={{ fontSize: `${Math.round(tileSize * 0.55)}px` }}
              >
                {bigIcon === 'trap' ? BADGE.trap : BADGE.question}
              </span>
            )}
            <div class="quest-badges">
              {/* Entrance, quest item, death and the trap/question corner
                  badge itself are dropped on a big-icon tile to keep it
                  clear of clutter. Key, exit and boss stay: 10 cells pair a
                  question with a key the door lookup depends on, 1 pairs a
                  trap with the quest's exit, and 1 pairs a question with a
                  boss — hiding any of those would silently break a lookup
                  or hide the way out. */}
              {cell.portal === 'entrance' && !bigIcon && (
                <span class="quest-badge entrance" title="bejárat">{BADGE.entrance}</span>
              )}
              {cell.portal === 'exit' && <span class="quest-badge exit" title="kijárat">{BADGE.exit}</span>}
              {cell.key && (
                <span class={`quest-badge key lock-${cell.key}`} title={LOCK_LABEL[cell.key]}>{BADGE.key}</span>
              )}
              {cell.questItem && !bigIcon && (
                <span class="quest-badge quest-item" title="küldetés tárgy">{BADGE.questItem}</span>
              )}
              {cell.death && !bigIcon && <span class="quest-badge death" title="halál">{BADGE.death}</span>}
              {/* No separate `!bigIcon` trap/question corner badges here: bigIcon
                  is truthy exactly when cell.trap or cell.question is, so the
                  big icon above always replaces them — nothing to guard. */}
              {cell.boss && <span class="quest-badge boss" title="boss">{BADGE.boss}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
