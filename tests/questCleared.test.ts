import { describe, it, expect } from 'vitest';
import { parseCleared, serialiseCleared } from '@/shared/questCleared';
import { questClearedKey } from '@/shared/prefKeys';

describe('questCleared', () => {
  it('round-trips a set of cell keys', () => {
    const cells = new Set(['0,0', '3,4', '12,7']);
    expect(parseCleared(serialiseCleared(cells))).toEqual(cells);
  });

  it('keys a pref per set and quest', () => {
    expect(questClearedKey('royal', '39')).toBe('lc-quest-cleared-royal-39');
    expect(questClearedKey('tavern', 'GY.I.K')).toBe('lc-quest-cleared-tavern-GY.I.K');
  });

  // Progress, unlike a position, is long-lived — so an unreadable value must
  // degrade to "nothing cleared yet" rather than make the caller give up.
  it('degrades to an empty set on anything unusable', () => {
    expect(parseCleared(null)).toEqual(new Set());
    expect(parseCleared('')).toEqual(new Set());
    expect(parseCleared('not json')).toEqual(new Set());
    expect(parseCleared('{"version":99,"cells":["1,1"]}')).toEqual(new Set());
    expect(parseCleared('{"version":1,"cells":"1,1"}')).toEqual(new Set());
  });

  it('drops entries that are not cell keys', () => {
    expect(parseCleared('{"version":1,"cells":["1,1","nope",7,null,"2,-1"]}')).toEqual(new Set(['1,1']));
  });

  it('serialises deterministically, so an unchanged set does not churn the store', () => {
    expect(serialiseCleared(new Set(['3,4', '0,0']))).toBe(serialiseCleared(new Set(['0,0', '3,4'])));
  });
});
