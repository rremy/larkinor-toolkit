import type { LockType, Quest, QuestCell, Side } from '@/shared/data';

/**
 * Maze tile sizes offered by the zoom control, and the one applied before any
 * pref is loaded. Held here rather than duplicated in both QuestGrid (which
 * needs the default as its `tileSize` fallback) and QuestView (which needs
 * both to drive the zoom `<select>`) — the same drift hazard `prefKeys.ts`
 * exists to eliminate for the pref key itself.
 */
export const TILE_SIZES = [40, 56, 72];
export const DEFAULT_TILE = 56;

/** Hungarian key names, as the game prints them. */
export const LOCK_LABEL: Record<LockType, string> = {
  vas: 'vaskulcs',
  rez: 'rézkulcs',
  bronz: 'bronzkulcs',
  ezust: 'ezüstkulcs',
  arany: 'aranykulcs',
  platina: 'platinakulcs',
  tolvaj: 'tolvajkulcs',
  cso: 'csőkulcs',
};

/** Badge glyphs overlaid on maze cells. */
export const BADGE = {
  key: '🔑',
  questItem: '📜',
  entrance: '⬇',
  exit: '🚪',
  trap: '⚠',
  death: '💀',
  question: '❓',
  boss: '★',
} as const;

export const SIDES: Side[] = ['N', 'E', 'S', 'W'];

/** Hungarian side names, used in door tooltips. */
export const SIDE_LABEL: Record<Side, string> = {
  N: 'észak', E: 'kelet', S: 'dél', W: 'nyugat',
};

/**
 * Label for the `szel` edge kind, shown as its tooltip and in the grid
 * caption. Resolved from "undetermined" during Task 14: every occurrence
 * borders either off-grid space or an empty filler cell, never a real room,
 * so it marks the edge of the drawn maze shape rather than a passage —
 * `szél` as "edge/margin", not "wind". See the design doc.
 */
export const SZEL_LABEL = 'labirintus széle';

/** True when this quest contains at least one `szel` edge. */
export function hasSzelEdges(quest: Quest): boolean {
  return quest.cells.some((c) => SIDES.some((s) => c.edges[s].kind === 'szel'));
}

/** Neighbour offset per side, with the side facing back from that neighbour. */
const NEIGHBOUR: Record<Side, { dRow: number; dCol: number; facing: Side }> = {
  N: { dRow: -1, dCol: 0, facing: 'S' },
  E: { dRow: 0, dCol: 1, facing: 'W' },
  S: { dRow: 1, dCol: 0, facing: 'N' },
  W: { dRow: 0, dCol: -1, facing: 'E' },
};

/** Grid position key, as used by `outsideMazeCells`. */
export function cellKey(cell: { row: number; col: number }): string {
  return `${cell.row},${cell.col}`;
}

/**
 * True when the cell holds nothing at all: no creature, no marker, no text.
 * Such a cell carries the source's blank tile — `nop.jpg` (a plain white
 * 125×145 image) or the tavern set's `black.jpg` — which the source uses for
 * two different things, an empty room *inside* the maze and the untouched
 * canvas *around* an irregularly shaped one. Blankness alone cannot tell those
 * apart; `outsideMazeCells` can.
 *
 * The extra marker exclusions are not redundant with `narration === ''`:
 * `parseTavernTitle` moves all text into `question`, so every tavern question
 * tile has an empty narration while being a real room.
 */
function isBlank(cell: QuestCell): boolean {
  return cell.narration === '' && cell.monsterId == null && !cell.portal
    && !cell.hasQuestion && !cell.key && !cell.questItem
    && !cell.trap && !cell.death && !cell.boss;
}

/** True when the cell draws any of its own four sides. */
function drawsAnyEdge(cell: QuestCell): boolean {
  return SIDES.some((side) => cell.edges[side].kind !== 'open');
}

/**
 * The cells that are not part of the maze at all: blank canvas left around a
 * maze whose drawn shape is smaller or more irregular than its bounding grid.
 *
 * Only these should render as void. Emptiness on its own must never decide it —
 * that was the original bug, painting 200 royal and 537 tavern *rooms* as solid
 * black. `demon_hadur` was the clearest case: 8 of its 96 cells came out black,
 * two of them the far side of a locked door, so the map claimed a platinum key
 * opened onto rock.
 *
 * A cell belongs to the maze if the source drew anything about it, and the
 * source only writes side classes on cells it has drawn — so a cell declaring
 * any wall, door or `szel` of its own is inside, full stop. The remaining
 * blanks are ambiguous on their own and are resolved by where they sit: the
 * canvas is a region reachable from off-grid space, so this floods inwards from
 * every blank-and-undrawn cell touching the grid's edge, crossing only
 * undrawn boundaries between two such cells. That distinguishes the two shapes
 * that look identical cell-by-cell:
 *   - royal quest 30's column 4 — an undrawn strip running in from the top
 *     edge, which the flood reaches, so it is canvas;
 *   - royal quest 30's cell (2,1) — an undrawn blank whose four walls are all
 *     drawn by its neighbours, which the flood cannot reach, so it is a room.
 * A neighbour's wall is deliberately not read as evidence about *this* cell:
 * the maze's outer wall is drawn by the rooms along its rim, and taking that as
 * "inside" would swallow the entire canvas next to it. A neighbour's `szel` is
 * the one exception, and seeds the flood: it means the drawing stops at that
 * side (see SZEL_LABEL), so what lies beyond it is canvas even when fully
 * enclosed. Exactly one cell needs this — royal quest 39's (3,10), a one-cell
 * hole ringed by four `szel` edges — and it is safe by measurement as well as
 * by meaning: across both sets no `szel` edge faces a cell holding content, nor
 * a blank cell that draws any side of its own.
 */
export function outsideMazeCells(quest: Quest): ReadonlySet<string> {
  const byPosition = new Map(quest.cells.map((c) => [cellKey(c), c]));
  const candidates = new Map(
    quest.cells.filter((c) => isBlank(c) && !drawsAnyEdge(c)).map((c) => [cellKey(c), c]),
  );
  const neighbourOf = (cell: QuestCell, side: Side): QuestCell | undefined =>
    byPosition.get(cellKey({
      row: cell.row + NEIGHBOUR[side].dRow,
      col: cell.col + NEIGHBOUR[side].dCol,
    }));

  const outside = new Set<string>();
  // Seeds: an undrawn blank with a side facing off the grid — nothing separates
  // it from the space around the drawing — or one a neighbour has marked off
  // with `szel`. Missing cells count as off-grid too, so a non-rectangular
  // `cells` array needs no special case.
  const queue = [...candidates.values()].filter((c) => SIDES.some((side) => {
    const neighbour = neighbourOf(c, side);
    return neighbour === undefined || neighbour.edges[NEIGHBOUR[side].facing].kind === 'szel';
  }));
  for (const cell of queue) outside.add(cellKey(cell));

  while (queue.length > 0) {
    const cell = queue.pop() as QuestCell;
    for (const side of SIDES) {
      const next = neighbourOf(cell, side);
      if (next === undefined || outside.has(cellKey(next))) continue;
      if (!candidates.has(cellKey(next))) continue;
      // Either side may hold the line: the source draws a shared wall once.
      if (cell.edges[side].kind !== 'open') continue;
      if (next.edges[NEIGHBOUR[side].facing].kind !== 'open') continue;
      outside.add(cellKey(next));
      queue.push(next);
    }
  }
  return outside;
}

export type Valence = 'good' | 'bad' | 'fatal' | 'neutral';

/**
 * Classify a choice outcome so the Q&A card can colour it. Ordered most
 * specific first: `-20000 ÉP` must not read as the "ÉP" gain case.
 */
export function outcomeValence(text: string): Valence {
  const t = text.toLowerCase();
  if (!t) return 'neutral';
  if (/hal[áa]l/.test(t)) return 'fatal';
  if (/(?<!-)-\s*\d/.test(t)) return 'bad';
  if (/m[ée]reg|[áa]tok|fert[őo]z[ée]s|elveszted|veszt|s[ée]r[üu]l/.test(t)) return 'bad';
  if (/^semmi\b|^nincs\b/.test(t)) return 'neutral';
  if (/max [ée]p|gy[óo]gyul|ez[üu]st|arany|kulcs|kincs|\d+\s*db\s/.test(t)) return 'good';
  return 'neutral';
}

/** 1-based Hungarian position label, e.g. `3. sor, 2. oszlop`. */
export function coordLabel(cell: { row: number; col: number }): string {
  return `${cell.row + 1}. sor, ${cell.col + 1}. oszlop`;
}

/** Cells in this quest that yield the given lock's key. */
export function keyCellsFor(quest: Quest, lock: LockType): QuestCell[] {
  return quest.cells.filter((c) => c.key === lock);
}

/** Every lock that gates at least one door in this quest, deduped and ordered. */
export function locksIn(quest: Quest): LockType[] {
  const found = new Set<LockType>();
  for (const cell of quest.cells) {
    for (const side of SIDES) {
      const edge = cell.edges[side];
      if (edge.kind === 'door') found.add(edge.lock);
    }
  }
  return (Object.keys(LOCK_LABEL) as LockType[]).filter((l) => found.has(l));
}
