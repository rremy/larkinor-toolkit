import { describe, it, expect } from 'vitest';
import { applyFilters, parseFilterState, serialiseFilterState, sortRows } from '@/database/explorer/filters';
import type { FilterDef } from '@/database/explorer/filters';

const rows = [
  { name: 'Kard', level: 5, magical: true },
  { name: 'őrbot', level: 2, magical: false },
  { name: 'Balta', level: 5, magical: true },
];

describe('applyFilters', () => {
  const defs: FilterDef[] = [
    { type: 'search', key: 'name', label: '' },
    { type: 'range', key: 'level', label: '' },
    { type: 'tri', key: 'magical', label: '' },
  ];
  it('accent-insensitive name search', () => {
    expect(applyFilters(rows, defs, { name: 'orbot' }).map(r => r.name)).toEqual(['őrbot']);
  });
  it('range min/max on level', () => {
    expect(applyFilters(rows, defs, { level_min: '5' }).map(r => r.name)).toEqual(['Kard', 'Balta']);
  });
  it('tri-state boolean', () => {
    expect(applyFilters(rows, defs, { magical: 'no' }).map(r => r.name)).toEqual(['őrbot']);
  });
});

describe('sortRows', () => {
  it('numeric ascending', () => {
    expect(sortRows(rows, 'level', true, true).map(r => r.level)).toEqual([2, 5, 5]);
  });
  it('string descending, accent-folded', () => {
    expect(sortRows(rows, 'name', false, false)[0].name).toBe('őrbot');
  });
});

describe('parseFilterState', () => {
  const defs: FilterDef[] = [
    { type: 'search', key: 'name', label: '' },
    { type: 'range', key: 'level', label: '' },
    { type: 'tri', key: 'magical', label: '' },
  ];

  it('reads back what was stored', () => {
    const state = { name: 'kard', level_min: '5', level_max: '20', magical: 'yes' };
    expect(parseFilterState(serialiseFilterState(state), defs)).toEqual(state);
  });

  // A filter the tab no longer has would hide rows behind a field the player
  // cannot see, so it is dropped rather than kept.
  it('keeps only the keys the tab still filters on, with non-empty text', () => {
    expect(parseFilterState(JSON.stringify({ name: 'kard', gone: 'x', level_min: 5, magical: '' }), defs))
      .toEqual({ name: 'kard' });
  });

  it('reads nothing, garbage or a non-object as no filter', () => {
    expect(parseFilterState(null, defs)).toEqual({});
    expect(parseFilterState('{not json', defs)).toEqual({});
    expect(parseFilterState('["name"]', defs)).toEqual({});
    expect(parseFilterState('null', defs)).toEqual({});
  });
});
