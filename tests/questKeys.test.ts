import { describe, it, expect } from 'vitest';
import { killKeys } from '@/shared/questKeys';
import type { QuestCell } from '@/shared/data';

const cell = (partial: Partial<QuestCell>): QuestCell => ({
  row: 0, col: 0,
  edges: { N: { kind: 'open' }, E: { kind: 'open' }, S: { kind: 'open' }, W: { kind: 'open' } },
  monsterId: null, monsterName: null, boss: false, key: null, questItem: false, portal: null,
  trap: false, death: false, narration: '', drops: null, hasQuestion: false, question: null, rawImage: '',
  ...partial,
});

describe('killKeys', () => {
  it('yields every key a monster carried', () => {
    expect(killKeys(cell({ monsterId: 1, key: 'vas', extraKeys: ['rez'] }))).toEqual(['vas', 'rez']);
  });

  it('yields nothing for a monster without a key', () => {
    expect(killKeys(cell({ monsterId: 1 }))).toEqual([]);
  });

  // Answered is not the same as answered right.
  it('yields nothing for a question tile, with or without a monster', () => {
    expect(killKeys(cell({ hasQuestion: true, key: 'platina' }))).toEqual([]);
    expect(killKeys(cell({ monsterId: 1, hasQuestion: true, key: 'platina' }))).toEqual([]);
  });
});
