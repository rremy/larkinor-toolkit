import { describe, it, expect } from 'vitest';
import { foldAccents, matchesSearch } from '@/shared/text';

describe('foldAccents', () => {
  it('strips Hungarian accents and lowercases', () => {
    expect(foldAccents('ŐrÜtő')).toBe('oruto');
  });

  it('covers the whole Hungarian accented set', () => {
    expect(foldAccents('áéíóöőúüű ÁÉÍÓÖŐÚÜŰ')).toBe('aeiooouuu aeiooouuu');
  });

  it('leaves unaccented text alone', () => {
    expect(foldAccents('Kard 12')).toBe('kard 12');
  });
});

describe('matchesSearch', () => {
  it('finds an accented name typed without accents', () => {
    // The case that prompted this: nobody types the accents.
    expect(matchesSearch('Gyíkbőr', 'gyikbor')).toBe(true);
  });

  it('finds an unaccented name typed with accents', () => {
    expect(matchesSearch('Kard', 'kárd')).toBe(true);
  });

  it('matches on a substring, not just a prefix', () => {
    expect(matchesSearch('elementál eszencia', 'eszencia')).toBe(true);
  });

  it('ignores case', () => {
    expect(matchesSearch('Vámpír kard', 'VÁMPÍR')).toBe(true);
  });

  it('still rejects a genuine non-match', () => {
    expect(matchesSearch('Gyíkbőr', 'kard')).toBe(false);
  });

  it('matches everything for an empty or whitespace query', () => {
    expect(matchesSearch('Gyíkbőr', '')).toBe(true);
    expect(matchesSearch('Gyíkbőr', '   ')).toBe(true);
  });

  it('ignores surrounding whitespace in the query', () => {
    expect(matchesSearch('Gyíkbőr', '  gyikbor  ')).toBe(true);
  });
});
