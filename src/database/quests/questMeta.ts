import type { Edge, LockType, Quest, QuestCell, Side } from '@/shared/data';

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
  varazs: 'varázskulcs',
};

/** Serialise a hidden-locks set for `questHiddenLocksKey`; sorted, so stable. */
export function serialiseHiddenLocks(locks: ReadonlySet<LockType>): string {
  return JSON.stringify([...locks].sort());
}

/**
 * Parse a stored hidden-locks set. Anything unreadable, and any entry that is
 * not a lock this build knows, is dropped: the cost is a door shown again,
 * never one hidden that should not be.
 */
export function parseHiddenLocks(raw: string | null): Set<LockType> {
  if (!raw) return new Set();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter(
      // Own keys only: a plain `in` would let `toString` through the prototype.
      (lock): lock is LockType =>
        typeof lock === 'string' && Object.prototype.hasOwnProperty.call(LOCK_LABEL, lock),
    ));
  } catch {
    return new Set();
  }
}

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
  /** The player's detected cell. Distinct from every marker above. */
  here: '📍',
  /** A cell whose work is done — monster killed, question answered, trap sprung. */
  cleared: '✓',
} as const;

/** Tooltip for a cell the player was pinned to, and for one of several candidates. */
export const HERE_LABEL = 'itt vagy';
export const MAYBE_HERE_LABEL = 'talán itt vagy';
/** Tooltip and button copy for a cell the player is done with. */
export const CLEARED_LABEL = 'teljesítve';

export const SIDES: Side[] = ['N', 'E', 'S', 'W'];

const OPPOSITE: Record<Side, Side> = { N: 'S', E: 'W', S: 'N', W: 'E' };
const STEP: Record<Side, [number, number]> = { N: [-1, 0], E: [0, 1], S: [1, 0], W: [0, -1] };

/** Key for one side of one cell in the set {@link splitEdges} returns. */
export function edgeKey(cell: { row: number; col: number }, side: Side): string {
  return `${cellKey(cell)}:${side}`;
}

function sameEdge(a: Edge, b: Edge): boolean {
  return a.kind === b.kind && (a.kind !== 'door' || (b.kind === 'door' && a.lock === b.lock));
}

/**
 * Sides whose two halves disagree where a door is involved — the door is drawn
 * on one cell only, or the two cells draw different doors on the same line.
 *
 * The source writes each cell's four sides independently, and the game shows
 * a door from one side only: in royal quest 44 a corridor can be open going
 * east and barred by a thief's door coming back west. Drawing both halves on
 * the shared line hides that — a one-sided door looks like any other, and of
 * two different doors only the later-painted one shows — so the grid draws
 * each half of a split side inside its own cell instead.
 *
 * Limited to sides with a door on either half. A wall facing an open side is
 * common in the source's irregular drawing (royal quest 30 alone has 80), and
 * redrawing all of those would reshape mazes nobody reported as wrong.
 */
export function splitEdges(quest: Quest): ReadonlySet<string> {
  const byKey = new Map(quest.cells.map((c) => [cellKey(c), c]));
  const split = new Set<string>();
  for (const cell of quest.cells) {
    for (const side of SIDES) {
      const edge = cell.edges[side];
      // An open half draws nothing, so there is nothing to move off the line.
      if (edge.kind === 'open') continue;
      const [dr, dc] = STEP[side];
      const neighbour = byKey.get(cellKey({ row: cell.row + dr, col: cell.col + dc }));
      if (!neighbour) continue;
      const facing = neighbour.edges[OPPOSITE[side]];
      if (edge.kind !== 'door' && facing.kind !== 'door') continue;
      if (!sameEdge(edge, facing)) split.add(edgeKey(cell, side));
    }
  }
  return split;
}

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

/** Every key this cell yields, in the order the source lists them. */
export function cellKeys(cell: QuestCell): LockType[] {
  return cell.key ? [cell.key, ...(cell.extraKeys ?? [])] : [];
}

/** Cells in this quest that yield the given lock's key. */
export function keyCellsFor(quest: Quest, lock: LockType): QuestCell[] {
  return quest.cells.filter((c) => cellKeys(c).includes(lock));
}

/** A quest's chip label: its title, plus the floor for a multi-floor quest. */
export function questChipLabel(quest: Quest): string {
  return quest.floor ? `${quest.title} ${quest.floor}` : quest.title;
}

/** A quest's heading: `12. küldetés` for royal (with its floor), the title for tavern. */
export function questHeading(quest: Quest): string {
  if (quest.set !== 'royal') return quest.title;
  const floor = quest.floor === 'F' ? ' · földszint' : quest.floor ? ` · ${quest.floor}. szint` : '';
  return `${quest.title}. küldetés${floor}`;
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
