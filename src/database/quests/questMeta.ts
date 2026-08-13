import type { LockType, Quest, QuestCell, Side } from '@/shared/data';

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
