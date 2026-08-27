import { h, type VNode } from 'preact';
import type { MonsterDatabase, QuestCell } from '@/shared/data';
import { monsterImageUrl } from '@/components/MonsterCard';
import { CLEARED_LABEL, LOCK_LABEL, SIDES, SIDE_LABEL, coordLabel } from './questMeta';
import { QuestQuestionCard } from './QuestQuestionCard';

interface QuestCellDetailProps {
  cell: QuestCell | null;
  monsters: MonsterDatabase;
  onJumpToMonster(id: number): void;
  /** Whether this cell is marked cleared. */
  cleared?: boolean;
  /**
   * Toggles the mark. Optional: without it no control is rendered, which is
   * what a read-only host (or a test that does not care) gets.
   */
  onToggleCleared?(cell: QuestCell): void;
}

/** Detail panel for the selected maze cell. */
export function QuestCellDetail(props: QuestCellDetailProps): VNode {
  const { cell, monsters, onJumpToMonster, cleared, onToggleCleared } = props;

  if (!cell) {
    return (
      <div class="quest-detail">
        <div class="placeholder">Válassz egy mezőt a labirintusban.</div>
      </div>
    );
  }

  const monster = cell.monsterId != null ? monsters.getById(cell.monsterId) : undefined;
  const markers: string[] = [];
  if (cell.portal === 'entrance') markers.push('bejárat');
  if (cell.portal === 'exit') markers.push('kijárat');
  if (cell.questItem) markers.push('küldetés tárgy');
  if (cell.trap) markers.push('csapda');
  if (cell.death) markers.push('halál');
  if (cell.boss) markers.push('boss');

  // flatMap rather than filter: TypeScript does not narrow a union through
  // `filter`, so this keeps `lock` typed without a cast.
  const doors = SIDES.flatMap((side) => {
    const edge = cell.edges[side];
    return edge.kind === 'door' ? [{ side, lock: edge.lock }] : [];
  });

  return (
    <div class="quest-detail">
      <h3>{coordLabel(cell)}</h3>

      {onToggleCleared && (
        <button
          type="button"
          class={`quest-clear-toggle${cleared ? ' active' : ''}`}
          aria-pressed={cleared === true}
          // The grid's own vocabulary for the state, kept as the tooltip while
          // the label says what the click does.
          title={cleared ? CLEARED_LABEL : undefined}
          onClick={() => onToggleCleared(cell)}
        >
          {cleared ? 'Visszavonás' : 'Teljesítve'}
        </button>
      )}

      {monster ? (
        <div class="quest-detail-monster">
          <img class="quest-detail-sprite" src={monsterImageUrl(monster.image)} alt="" loading="lazy" />
          <button type="button" class="quest-monster-link" onClick={() => onJumpToMonster(monster.id)}>
            {monster.name}
          </button>
          <span class="meta"> · {monster.level}. szint · {monster.hp} ÉP</span>
        </div>
      ) : cell.monsterName ? (
        <div class="quest-detail-monster">
          <span class="meta">{cell.monsterName}</span>
        </div>
      ) : null}

      {markers.length > 0 && <div class="quest-markers">{markers.join(' · ')}</div>}

      {cell.key && (
        <div class="quest-detail-key">Itt található: <strong>{LOCK_LABEL[cell.key]}</strong></div>
      )}

      {doors.length > 0 && (
        <div class="quest-detail-doors">
          Zárt ajtók:{' '}
          {doors.map((d) => (
            <span key={d.side}>{SIDE_LABEL[d.side]} ({LOCK_LABEL[d.lock]}){' '}</span>
          ))}
        </div>
      )}

      {cell.narration && <p class="quest-narration">{cell.narration}</p>}
      {cell.question && <QuestQuestionCard question={cell.question} />}
      {cell.drops && (
        <div class="quest-drops"><strong>Zsákmány:</strong> <span>{cell.drops}</span></div>
      )}
    </div>
  );
}
