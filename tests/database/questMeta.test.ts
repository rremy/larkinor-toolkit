import { describe, it, expect } from 'vitest';
import {
  LOCK_LABEL, SZEL_LABEL, outcomeValence, coordLabel, keyCellsFor, locksIn, hasSzelEdges,
  outsideMazeCells, cellKey,
} from '@/database/quests/questMeta';
import type { Quest, QuestCell, Edge } from '@/shared/data';

const openEdges = (): Record<'N'|'E'|'S'|'W', Edge> => ({
  N: { kind: 'open' }, E: { kind: 'open' }, S: { kind: 'open' }, W: { kind: 'open' },
});

function cell(partial: Partial<QuestCell>): QuestCell {
  return {
    row: 0, col: 0, edges: openEdges(), monsterId: null, monsterName: null,
    boss: false, key: null, questItem: false, portal: null, trap: false,
    death: false, narration: '', drops: null, hasQuestion: false, question: null, rawImage: '',
    ...partial,
  };
}

function quest(cells: QuestCell[]): Quest {
  return { id: '1', set: 'royal', title: '1', description: '', reward: '', rows: 2, cols: 2, cells };
}

describe('LOCK_LABEL', () => {
  it('names every lock in Hungarian', () => {
    expect(LOCK_LABEL.vas).toBe('vaskulcs');
    expect(LOCK_LABEL.ezust).toBe('ezüstkulcs');
    expect(LOCK_LABEL.cso).toBe('csőkulcs');
    expect(Object.keys(LOCK_LABEL)).toHaveLength(8);
  });
});

describe('outcomeValence', () => {
  it('marks death as fatal', () => {
    expect(outcomeValence('HALÁL')).toBe('fatal');
    expect(outcomeValence('Halál')).toBe('fatal');
  });

  it('marks damage, poison and curses as bad', () => {
    expect(outcomeValence('3 méreg')).toBe('bad');
    expect(outcomeValence('4 átok')).toBe('bad');
    expect(outcomeValence('-20000 ÉP')).toBe('bad');
    expect(outcomeValence('Elveszted a bal kezedben levő tárgyat')).toBe('bad');
  });

  it('marks healing and loot as good', () => {
    expect(outcomeValence('max ÉP')).toBe('good');
    expect(outcomeValence('Gyógyulsz')).toBe('good');
    expect(outcomeValence('30 ezüst')).toBe('good');
    expect(outcomeValence('1 db kincs')).toBe('good');
  });

  it('marks nothing-happens as neutral', () => {
    expect(outcomeValence('semmi')).toBe('neutral');
    expect(outcomeValence('')).toBe('neutral');
    expect(outcomeValence('Kaméleon')).toBe('neutral');
  });

  it('does not read a `--` drop separator as a negative-ÉP sign, but still catches real damage', () => {
    expect(outcomeValence('1000 éves hulla -- 6 db kincs')).toBe('good');
    expect(outcomeValence('-20000 ÉP')).toBe('bad');
  });

  it('marks non-silver/gold key rewards as good too', () => {
    expect(outcomeValence('platinakulcs')).toBe('good');
    expect(outcomeValence('tolvajkulcs')).toBe('good');
  });
});

describe('coordLabel', () => {
  it('renders 1-based Hungarian row/column labels', () => {
    expect(coordLabel({ row: 0, col: 0 })).toBe('1. sor, 1. oszlop');
    expect(coordLabel({ row: 2, col: 1 })).toBe('3. sor, 2. oszlop');
  });
});

describe('hasSzelEdges', () => {
  it('is false for a quest with only open/wall/door edges', () => {
    const q = quest([
      cell({ row: 0, col: 0, edges: { ...openEdges(), E: { kind: 'wall' } } }),
      cell({ row: 0, col: 1, edges: { ...openEdges(), W: { kind: 'door', lock: 'vas' } } }),
    ]);
    expect(hasSzelEdges(q)).toBe(false);
  });

  it('is true as soon as one edge is a szel marker', () => {
    const q = quest([
      cell({ row: 0, col: 0 }),
      cell({ row: 0, col: 1, edges: { ...openEdges(), N: { kind: 'szel' } } }),
    ]);
    expect(hasSzelEdges(q)).toBe(true);
  });

  it('has a non-empty Hungarian label naming the edge of the maze', () => {
    expect(SZEL_LABEL).toBe('labirintus széle');
  });
});

describe('keyCellsFor / locksIn', () => {
  it('finds the cells yielding a lock, and lists locks present on doors', () => {
    const q = quest([
      cell({ row: 0, col: 0, edges: { ...openEdges(), E: { kind: 'door', lock: 'vas' } } }),
      cell({ row: 1, col: 1, key: 'vas' }),
      cell({ row: 1, col: 0, key: 'arany' }),
    ]);
    expect(keyCellsFor(q, 'vas')).toHaveLength(1);
    expect(keyCellsFor(q, 'vas')[0]).toMatchObject({ row: 1, col: 1 });
    expect(keyCellsFor(q, 'platina')).toEqual([]);
    // Only locks that actually gate a door, deduped.
    expect(locksIn(q)).toEqual(['vas']);
  });
});

describe('outsideMazeCells', () => {
  /** 3×3 grid built from the `room`/`blank` helpers below. */
  function grid(cells: QuestCell[]): Quest {
    return { id: '1', set: 'royal', title: '1', description: '', reward: '', rows: 3, cols: 3, cells };
  }
  const room = (row: number, col: number, partial: Partial<QuestCell> = {}): QuestCell =>
    cell({ row, col, narration: 'Egy szoba.', ...partial });
  const blank = (row: number, col: number, partial: Partial<QuestCell> = {}): QuestCell =>
    cell({ row, col, ...partial });

  it('treats a blank cell that draws none of its own edges and touches off-grid space as outside', () => {
    const q = grid([
      blank(0, 0), room(0, 1), room(0, 2),
      room(1, 0), room(1, 1), room(1, 2),
      room(2, 0), room(2, 1), room(2, 2),
    ]);
    expect([...outsideMazeCells(q)]).toEqual(['0,0']);
  });

  it('spreads inwards through undrawn blanks, so a notch cut into the shape is outside too', () => {
    // The shape of royal quest 30's column 4: an undrawn strip running from
    // the top edge into the grid.
    const q = grid([
      room(0, 0), blank(0, 1), room(0, 2),
      room(1, 0), blank(1, 1), room(1, 2),
      room(2, 0), room(2, 1), room(2, 2),
    ]);
    expect([...outsideMazeCells(q)].sort()).toEqual(['0,1', '1,1']);
  });

  it('stops at a drawn wall, so a blank room walled off from the canvas stays a room', () => {
    const q = grid([
      room(0, 0), blank(0, 1, { edges: { ...openEdges(), S: { kind: 'wall' } } }), room(0, 2),
      room(1, 0), blank(1, 1), room(1, 2),
      room(2, 0), room(2, 1), room(2, 2),
    ]);
    // (0,1) draws its own south wall, so it is part of the maze and never a
    // stepping stone; (1,1) is then enclosed by rooms and is a room itself.
    expect([...outsideMazeCells(q)]).toEqual([]);
  });

  it('keeps a blank cell a locked door opens into inside the maze', () => {
    // `demon_hadur` cell 6,3 (labelled 7:4): no monster, no marker, and the
    // far side of a platinum door. A door is never drawn into empty canvas.
    const q = grid([
      room(0, 0), room(0, 1), room(0, 2),
      room(1, 0), room(1, 1), room(1, 2),
      room(2, 0), room(2, 1),
      blank(2, 2, {
        edges: { N: { kind: 'door', lock: 'platina' }, E: { kind: 'wall' }, S: { kind: 'wall' }, W: { kind: 'wall' } },
      }),
    ]);
    expect([...outsideMazeCells(q)]).toEqual([]);
  });

  it('treats a blank pocket its neighbours mark off with szel as outside', () => {
    // Royal quest 39's cell (3,10): a one-cell hole ringed by four szel edges.
    // Fully enclosed, so the flood cannot reach it from off-grid, but szel
    // means the drawing stops there — what lies beyond is canvas.
    const q = grid([
      room(0, 0), room(0, 1, { edges: { ...openEdges(), S: { kind: 'szel' } } }), room(0, 2),
      room(1, 0, { edges: { ...openEdges(), E: { kind: 'szel' } } }),
      blank(1, 1),
      room(1, 2, { edges: { ...openEdges(), W: { kind: 'szel' } } }),
      room(2, 0), room(2, 1, { edges: { ...openEdges(), N: { kind: 'szel' } } }), room(2, 2),
    ]);
    expect([...outsideMazeCells(q)]).toEqual(['1,1']);
  });

  it('never reports a cell holding content, however walled in the canvas around it', () => {
    const q = grid([
      blank(0, 0), blank(0, 1), blank(0, 2),
      blank(1, 0), room(1, 1), blank(1, 2),
      blank(2, 0), blank(2, 1), blank(2, 2),
    ]);
    expect(outsideMazeCells(q).has(cellKey({ row: 1, col: 1 }))).toBe(false);
    expect(outsideMazeCells(q).size).toBe(8);
  });
});
