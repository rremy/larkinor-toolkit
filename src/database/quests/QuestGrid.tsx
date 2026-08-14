import { h, type VNode } from 'preact';
import type { LockType, MonsterDatabase, Quest, QuestCell } from '@/shared/data';
import { monsterImageUrl } from '@/components/MonsterCard';
import { BADGE, DEFAULT_TILE, LOCK_LABEL, SIDES, SIDE_LABEL, SZEL_LABEL, coordLabel } from './questMeta';

/** Glyph and Hungarian label for each centred tile marker. */
const BIG_ICON = {
  objective: { glyph: BADGE.questItem, title: 'küldetés tárgy' },
  trap: { glyph: BADGE.trap, title: 'csapda' },
  question: { glyph: BADGE.question, title: 'kérdés' },
} as const;

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
        // Driven by `hasQuestion` (the source image), not `question !== null`
        // (whether the title text happened to parse) — the marker must
        // survive a parse miss (task 18).
        // The objective outranks both: it is the one tile the quest exists
        // for, and unlike a trap or a question it is unique per quest. When it
        // wins, the marker it displaced falls back to a corner badge below, so
        // no fact is lost.
        const bigIcon: 'objective' | 'trap' | 'question' | null = cell.questItem
          ? 'objective'
          : cell.trap ? 'trap'
          : cell.hasQuestion ? 'question' : null;
        const classes = ['quest-cell'];
        // The one tile the quest is about — exactly one per quest across both
        // sets — gets a ring on the tile itself, not just a corner badge.
        if (cell.questItem) classes.push('objective');
        if (isSelected) classes.push('selected');
        if (keyHit) classes.push('key-hit');
        // `narration === ''` alone is not a reliable "empty filler" proxy on
        // the tavern set: `parseTavernTitle` moves all text into `question`
        // and leaves `narration: ''` on every question tile, so without these
        // extra exclusions 141 question tiles, 9 key tiles and 1 quest-item
        // tile painted as void even though they carry real content. Royal
        // cells are unaffected — none of them combine an empty narration with
        // any of these markers, since the royal parser always leaves some
        // narration behind on a real room.
        if (
          cell.narration === '' && !monster && !cell.portal
          && !cell.hasQuestion && !cell.key && !cell.questItem
          && !cell.trap && !cell.death && !cell.boss
        ) classes.push('void');
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
                title={BIG_ICON[bigIcon].title}
                style={{ fontSize: `${Math.round(tileSize * (bigIcon === 'objective' ? 0.275 : 0.55))}px` }}
              >
                {BIG_ICON[bigIcon].glyph}
              </span>
            )}
            <div class="quest-badges">
              {/* Entrance and death are dropped on a big-icon tile to keep it
                  clear of clutter. Key, exit, quest item and boss stay: 10
                  cells pair a question with a key the door lookup depends
                  on, 1 pairs a trap with the quest's exit, 1 pairs a
                  question with a boss, and quest 27 cell (1,1) is
                  simultaneously the question, the quest objective and the
                  exit — hiding any of those would silently break a lookup,
                  hide the way out, or hide the one item you are there to
                  collect. */}
              {cell.portal === 'entrance' && !bigIcon && (
                <span class="quest-badge entrance" title="bejárat">{BADGE.entrance}</span>
              )}
              {cell.portal === 'exit' && <span class="quest-badge exit" title="kijárat">{BADGE.exit}</span>}
              {cell.key && (
                <span class={`quest-badge key lock-${cell.key}`} title={LOCK_LABEL[cell.key]}>{BADGE.key}</span>
              )}
              {/* No quest-item chip: the objective is the centred glyph now,
                  so a corner copy would be redundant clutter on the one tile
                  that least needs it. */}
              {cell.death && !bigIcon && <span class="quest-badge death" title="halál">{BADGE.death}</span>}
              {/* A trap or question displaced by the objective keeps a corner
                  badge, so promoting the objective never hides a fact. Guarded
                  on the big icon rather than on the objective so each marker is
                  shown exactly once. */}
              {cell.trap && bigIcon !== 'trap' && (
                <span class="quest-badge trap" title="csapda">{BADGE.trap}</span>
              )}
              {cell.hasQuestion && bigIcon !== 'question' && (
                <span class="quest-badge question" title="kérdés">{BADGE.question}</span>
              )}
              {cell.boss && <span class="quest-badge boss" title="boss">{BADGE.boss}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
