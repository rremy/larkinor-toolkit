import { describe, it, expect } from 'vitest';
import { parseQuestPosition, serialiseQuestPosition, type QuestPosition } from '@/shared/questPosition';

const AT_0_6: QuestPosition = {
  set: 'royal',
  questId: '35',
  cells: [{ row: 0, col: 6 }],
  exact: true,
  source: 'narration',
};

describe('questPosition round trip', () => {
  it('reads back what it wrote', () => {
    expect(parseQuestPosition(serialiseQuestPosition(AT_0_6))).toEqual(AT_0_6);
  });

  it('keeps several candidates', () => {
    const ambiguous: QuestPosition = {
      set: 'tavern',
      questId: 'GY.I.K',
      cells: [{ row: 1, col: 2 }, { row: 3, col: 4 }],
      exact: false,
      source: 'move',
    };
    expect(parseQuestPosition(serialiseQuestPosition(ambiguous))).toEqual(ambiguous);
  });
});

describe('parseQuestPosition', () => {
  it('reads no stored value as no position', () => {
    expect(parseQuestPosition(null)).toBeNull();
    expect(parseQuestPosition('')).toBeNull();
  });

  it('drops a value it cannot parse', () => {
    expect(parseQuestPosition('not json')).toBeNull();
  });

  it('drops a version it does not recognise', () => {
    expect(parseQuestPosition(JSON.stringify({ ...AT_0_6, version: 99 }))).toBeNull();
    expect(parseQuestPosition(JSON.stringify(AT_0_6))).toBeNull();
  });

  it('drops an unknown quest set', () => {
    expect(parseQuestPosition(JSON.stringify({ version: 2, ...AT_0_6, set: 'kocsma' }))).toBeNull();
  });

  it('drops a missing or empty quest id', () => {
    expect(parseQuestPosition(JSON.stringify({ version: 2, ...AT_0_6, questId: '' }))).toBeNull();
    expect(parseQuestPosition(JSON.stringify({ version: 2, ...AT_0_6, questId: 35 }))).toBeNull();
  });

  it('drops a position with no cells', () => {
    expect(parseQuestPosition(JSON.stringify({ version: 2, ...AT_0_6, cells: [] }))).toBeNull();
    expect(parseQuestPosition(JSON.stringify({ version: 2, ...AT_0_6, cells: 'nope' }))).toBeNull();
  });

  it('drops a cell that is not a whole non-negative coordinate', () => {
    for (const cell of [{ row: -1, col: 0 }, { row: 1.5, col: 0 }, { row: 0 }, { row: '0', col: 0 }]) {
      expect(parseQuestPosition(JSON.stringify({ version: 2, ...AT_0_6, cells: [cell] }))).toBeNull();
    }
  });

  // The flag decides how confidently the grid draws the marker, so it is
  // recomputed from the cells rather than believed.
  it('derives exact from the cell count instead of trusting it', () => {
    const lying = JSON.stringify({
      version: 2,
      set: 'royal',
      questId: '35',
      cells: [{ row: 0, col: 6 }, { row: 1, col: 1 }],
      exact: true,
    });
    expect(parseQuestPosition(lying)?.exact).toBe(false);

    const modest = JSON.stringify({ version: 2, ...AT_0_6, exact: false });
    expect(parseQuestPosition(modest)?.exact).toBe(true);
  });

  it('round-trips the source', () => {
    const position: QuestPosition = {
      set: 'royal', questId: '35', cells: [{ row: 0, col: 6 }], exact: true, source: 'move',
    };
    expect(parseQuestPosition(serialiseQuestPosition(position))).toEqual(position);
  });

  // A stored v1 value costs one step in the maze to replace, so it is dropped
  // rather than migrated — the same argument the module already makes.
  it('drops a version-1 value', () => {
    expect(parseQuestPosition(JSON.stringify({
      version: 1, set: 'royal', questId: '35', cells: [{ row: 0, col: 6 }], exact: true,
    }))).toBeNull();
  });

  it('defaults an unrecognised source to narration', () => {
    const parsed = parseQuestPosition(JSON.stringify({
      version: 2, set: 'royal', questId: '35', cells: [{ row: 0, col: 6 }], exact: true, source: 'psychic',
    }));
    expect(parsed?.source).toBe('narration');
  });
});
