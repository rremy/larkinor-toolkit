// The player's detected position inside a quest maze, as it is stored and read
// back.
//
// Deliberately free of DOM, GM_* and `src/utils/**` imports, for the same
// reason as `loadout.ts`: the writer is the userscript's boot and the reader is
// `src/database/quests/**`, which ships in the standalone bundle and must stay
// GM-free (see the header of prefKeys.ts). The detection itself lives in
// `src/utils/dungeonPosition.ts`; this module is only the shape they agree on.

import type { QuestSet } from '@/shared/data';

/** A maze coordinate, in the quest data's own 0-based row/column terms. */
export interface QuestPositionCell {
  row: number;
  col: number;
}

export interface QuestPosition {
  set: QuestSet;
  /** The quest whose maze the player is in — `Quest.id`. */
  questId: string;
  /**
   * Every cell consistent with the page: one entry when `exact`, several when
   * the narration and walls could not separate them.
   */
  cells: QuestPositionCell[];
  /**
   * Whether the position is pinned to a single cell. The grid marks an exact
   * position confidently and a candidate set tentatively, so a stored position
   * never claims more certainty than the page supported.
   */
  exact: boolean;
  /**
   * How the position was arrived at: matched against the page's narration and
   * walls, carried forward from the previous cell through a step the player
   * took, held over from the previous page because no step was taken at all, or
   * — on a labyrinth's entry page, where the game prints its own "you got in"
   * line instead of the cell's text — inferred from the quest's entrance tile.
   *
   * Not rendered — a step confirmed by the drawn walls is not a guess to be
   * hedged, and a second visual language for "you are here" would read as a
   * second player. The field is load-bearing for one decision, though: the
   * auto-clear of finished tiles requires `'narration'`, because only the
   * page's own words about *this* cell justify writing permanent progress.
   */
  source: 'narration' | 'move' | 'entrance' | 'stay';
}

/**
 * Wire-format version, and the drift gate.
 *
 * A stored position is worth nothing beyond the page load that produced it — a
 * discarded one costs a single step in the maze — so an unrecognised version is
 * dropped outright rather than migrated.
 */
const VERSION = 3;

export function serialiseQuestPosition(position: QuestPosition): string {
  return JSON.stringify({ version: VERSION, ...position });
}

/**
 * Parse a stored position, or null if there is none or it cannot be trusted.
 *
 * Strict about its own shape: a corrupt or superseded value must read as "no
 * position known", because the alternative is drawing a confident marker on a
 * cell nobody detected.
 */
export function parseQuestPosition(raw: string | null): QuestPosition | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<QuestPosition> & { version?: unknown };
    if (parsed?.version !== VERSION) return null;
    if (parsed.set !== 'royal' && parsed.set !== 'tavern') return null;
    if (typeof parsed.questId !== 'string' || parsed.questId === '') return null;
    if (!Array.isArray(parsed.cells) || parsed.cells.length === 0) return null;

    const cells: QuestPositionCell[] = [];
    for (const cell of parsed.cells) {
      if (typeof cell?.row !== 'number' || typeof cell?.col !== 'number') return null;
      if (!Number.isInteger(cell.row) || !Number.isInteger(cell.col)) return null;
      if (cell.row < 0 || cell.col < 0) return null;
      cells.push({ row: cell.row, col: cell.col });
    }

    // Defaulted rather than rejected: an unknown source is a diagnostic detail,
    // and the cells — the part that actually places a marker — are unaffected.
    const source = parsed.source === 'move' || parsed.source === 'entrance'
      || parsed.source === 'stay'
      ? parsed.source
      : 'narration';

    // Derived rather than trusted: `exact` drives how loudly the grid draws the
    // marker, and a stored `true` beside three cells would draw three confident
    // markers. The cell count is the fact; the flag is a summary of it.
    return { set: parsed.set, questId: parsed.questId, cells, exact: cells.length === 1, source };
  } catch {
    return null;
  }
}
