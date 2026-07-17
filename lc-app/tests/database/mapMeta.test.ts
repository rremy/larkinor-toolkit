import { describe, it, expect } from 'vitest';
import {
  parseId, DISTRICT_SHORT, buildShopOwners,
  DISTRICT_SWATCHES, POI_LEGEND, CLAN_POI, POI_EMOJI, POI_LABEL,
} from '@/database/map/mapMeta';

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

describe('buildShopOwners', () => {
  it('maps item shops to vegyesbolt and weapon shops to fegyverbolt per cell', () => {
    const owners = buildShopOwners(
      [{ cellId: '77', owner: 'Öreg Gerard' }],
      [{ cellId: '77', owner: 'Nyúvadt Greg' }, { cellId: '44', owner: 'Thorgard' }],
    );
    expect(owners['77']).toEqual({
      'vegyesbolt.gif': 'Öreg Gerard',
      'fegyverbolt.gif': 'Nyúvadt Greg',
    });
    expect(owners['44']).toEqual({ 'fegyverbolt.gif': 'Thorgard' });
    expect(owners['13']).toBeUndefined();
  });
});

describe('legend data', () => {
  it('lists districts with a swatch class and the clan POI filter', () => {
    expect(DISTRICT_SWATCHES.some((d) => d.cls === 'varos' && d.label === 'városközpont')).toBe(true);
    const clan = POI_LEGEND.find((p) => p.poi === CLAN_POI);
    expect(clan?.clan).toBe(true);
    expect(POI_LEGEND.some((p) => p.poi === 'fegyverbolt.gif')).toBe(true);
  });

  it('has no home (sajátház) POI anywhere', () => {
    expect(POI_LEGEND.some((p) => p.poi === 'sajathaz.gif')).toBe(false);
    expect(POI_EMOJI['sajathaz.gif']).toBeUndefined();
    expect(POI_LABEL['sajathaz.gif']).toBeUndefined();
  });
});
