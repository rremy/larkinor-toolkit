import { describe, it, expect } from 'vitest';
import { applyFilters, sortRows, foldAccents } from '@/database/explorer/filters';
import type { FilterDef } from '@/database/explorer/filters';

const rows = [
  { name: 'Kard', level: 5, magical: true },
  { name: 'őrbot', level: 2, magical: false },
  { name: 'Balta', level: 5, magical: true },
];

describe('foldAccents', () => {
  it('strips Hungarian accents and lowercases', () => {
    expect(foldAccents('ŐrÜtő')).toBe('oruto');
  });
});

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
