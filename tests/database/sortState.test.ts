import { describe, it, expect } from 'vitest';
import { DEFAULT_SORT, parseSortState, serialiseSortState } from '@/database/explorer/columns';

describe('parseSortState', () => {
  it('reads back what it wrote', () => {
    expect(parseSortState(serialiseSortState({ key: 'price', asc: false }), 'weapons'))
      .toEqual({ key: 'price', asc: false });
  });

  it('falls back to the tab default for nothing stored', () => {
    expect(parseSortState(null, 'weapons')).toEqual({ key: 'maxDamage', asc: false });
    expect(parseSortState(null, 'armors')).toEqual({ key: 'defense', asc: false });
  });

  it('falls back for garbage', () => {
    for (const raw of ['not json', 'null', '[]', '{"key":"price"}', '{"key":1,"asc":true}']) {
      expect(parseSortState(raw, 'items'), raw).toEqual(DEFAULT_SORT.items);
    }
  });

  // A column the tab does not show could never be clicked off again.
  it('falls back for a column the tab does not have', () => {
    expect(parseSortState(serialiseSortState({ key: 'hp', asc: true }), 'weapons')).toEqual(DEFAULT_SORT.weapons);
  });
});
