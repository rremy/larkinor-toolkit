import { describe, it, expect } from 'vitest';
import { withAnswers } from '../../scripts/quests/questAnswers.mjs';

const edges = { N: { kind: 'wall' }, E: { kind: 'wall' }, S: { kind: 'wall' }, W: { kind: 'wall' } };

function quest(cells: object[]): object {
  return { id: 'miniatur_hanghordozo', set: 'tavern', cells };
}

function cell(row: number, col: number, extra: object): object {
  return { row, col, edges, hasQuestion: true, question: null, ...extra };
}

const asked = (n: number) => ({
  question: { prompt: '?', choices: Array.from({ length: n }, (_, i) => ({ index: i + 1, text: `${i + 1}`, outcome: '' })) },
});

const full = () => [cell(1, 1, asked(3)), cell(1, 6, asked(4)), cell(3, 1, {}), cell(3, 5, asked(2))];

describe('withAnswers', () => {
  it('leaves a quest without answers untouched', () => {
    const q = { id: 'GOMB', set: 'tavern', cells: [] };
    expect(withAnswers(q)).toBe(q);
  });

  it('aborts when the source repaired a question kept by hand', () => {
    const cells = full();
    cells[2] = cell(3, 1, asked(3));
    expect(() => withAnswers(quest(cells))).toThrow(/drop the hand-written copy/);
  });

  it('aborts when the answered tile is no longer a question', () => {
    const cells = full();
    cells[0] = cell(1, 1, { hasQuestion: false });
    expect(() => withAnswers(quest(cells))).toThrow(/holds no question/);
  });

  it('aborts when the right choice no longer exists', () => {
    const cells = full();
    cells[1] = cell(1, 6, asked(2));
    expect(() => withAnswers(quest(cells))).toThrow(/no choice 3/);
  });
});
