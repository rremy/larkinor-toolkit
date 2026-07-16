import { describe, it, expect } from 'vitest';
import { parseId, DISTRICT_SHORT } from '@/database/map/mapMeta';

describe('parseId', () => {
  it('splits imageId into row/col (row*10+col)', () => {
    expect(parseId('54')).toEqual({ row: 5, col: 4 });
    expect(parseId('7')).toEqual({ row: 0, col: 7 });
  });
});
describe('DISTRICT_SHORT', () => {
  it('maps known districts', () => {
    expect(DISTRICT_SHORT['városközpont']).toBeTruthy();
  });
});
