import { describe, it, expect } from 'vitest';
import {
  LOCK_LABEL, SZEL_LABEL, outcomeValence, coordLabel, keyCellsFor, locksIn, hasSzelEdges,
} from '@/database/quests/questMeta';
import type { Quest, QuestCell, Edge } from '@/shared/data';

const openEdges = (): Record<'N'|'E'|'S'|'W', Edge> => ({
  N: { kind: 'open' }, E: { kind: 'open' }, S: { kind: 'open' }, W: { kind: 'open' },
});

function cell(partial: Partial<QuestCell>): QuestCell {
  return {
    row: 0, col: 0, edges: openEdges(), monsterId: null, monsterName: null,
    boss: false, key: null, questItem: false, portal: null, trap: false,
    death: false, narration: '', drops: null, question: null, rawImage: '',
    ...partial,
  };
}

function quest(cells: QuestCell[]): Quest {
  return { id: 1, description: '', reward: '', rows: 2, cols: 2, cells };
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
