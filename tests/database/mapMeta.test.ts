import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { MapCell, MapData } from '@/shared/data';
import {
  parseId, layoutCells, cellWalls, DISTRICT_SHORT, buildShopOwners,
  DISTRICT_SWATCHES, POI_LEGEND, CLAN_POI, POI_EMOJI, POI_LABEL,
} from '@/database/map/mapMeta';

function cell(imageId: string, exits: string[] = [], blockers: string[] = []): MapCell {
  return {
    imageId, imageSrc: `/tajk/${imageId}.gif`, district: 'erdő', buildings: [], clanHouses: [],
    exits: Object.fromEntries(exits.map((d) => [d, 'erdő'])),
    blockers: Object.fromEntries(blockers.map((d) => [d, { icon: 'tenger.gif', title: 'tengerpart' }])),
    firstCoords: [0, 0],
  };
}

describe('parseId', () => {
  it('splits imageId into row/col (row*10+col)', () => {
    expect(parseId('54')).toEqual({ row: 5, col: 4 });
    expect(parseId('7')).toEqual({ row: 0, col: 7 });
  });

  it('reads the strip above the city as row -1', () => {
    expect(parseId('-14')).toEqual({ row: -1, col: 4 });
  });

  it('declines an id outside the scheme', () => {
    expect(parseId('41-13')).toBeNull();
  });
});

describe('layoutCells', () => {
  it('places a tile by the moves that reach it, not by its name', () => {
    const cells = [cell('44'), cell('45'), cell('41-13')];
    const edges = { '44:E': '45', '45:E': '41-13' };
    const pos = layoutCells(cells, edges);
    expect(pos.get('45')).toEqual({ row: 4, col: 5 });
    expect(pos.get('41-13')).toEqual({ row: 4, col: 6 });
  });

  it('falls back to the id for a tile no move reaches, but never stacks two tiles', () => {
    const cells = [cell('44'), cell('45'), cell('12'), cell('99')];
    const edges = { '44:E': '99' };
    const pos = layoutCells(cells, edges);
    expect(pos.get('12')).toEqual({ row: 1, col: 2 });
    expect(pos.get('99')).toEqual({ row: 4, col: 5 });
    // 45's own slot went to 99, which a recorded move put there.
    expect(pos.has('45')).toBe(false);
  });

  it('ignores blocked edges', () => {
    const pos = layoutCells([cell('44')], { '44:E': 'blocked' });
    expect([...pos.keys()]).toEqual(['44']);
  });
});

describe('cellWalls', () => {
  it('reports the sides with neither an exit nor a blocker', () => {
    expect(cellWalls(cell('07', ['S', 'W']))).toEqual(['N', 'E']);
    expect(cellWalls(cell('41', ['N', 'E', 'S'], ['W']))).toEqual([]);
  });
});

describe('committed map data', () => {
  const map: MapData = JSON.parse(readFileSync('static/db/map-data.json', 'utf-8'));
  const pos = layoutCells(map.cells, map.edges);

  it('places every tile, each where its id says when the id is a position', () => {
    expect(pos.size).toBe(map.cells.length);
    for (const c of map.cells) {
      const named = parseId(c.imageId);
      if (named) expect(pos.get(c.imageId), c.imageId).toEqual(named);
    }
  });

  it('puts the démonsziget tile east of 68 and the north strip above row 0', () => {
    expect(pos.get('41-13')).toEqual({ row: 6, col: 9 });
    expect(pos.get('-11')).toEqual({ row: -1, col: 1 });
    expect(pos.get('-15')).toEqual({ row: -1, col: 5 });
  });

  it('agrees with every recorded move in both directions', () => {
    const step = { N: [-1, 0], S: [1, 0], E: [0, 1], W: [0, -1] } as const;
    for (const [key, target] of Object.entries(map.edges)) {
      if (target === 'blocked') continue;
      const [id, side] = key.split(':') as [string, keyof typeof step];
      const from = pos.get(id)!;
      expect(pos.get(target), key).toEqual({ row: from.row + step[side][0], col: from.col + step[side][1] });
    }
  });

  it('finds the 13 plain walls the data records', () => {
    const walls = map.cells.flatMap((c) => cellWalls(c).map((side) => `${c.imageId}:${side}`));
    expect(walls.sort()).toEqual([
      '02:E', '02:N', '06:N', '07:E', '07:N', '18:E', '18:N',
      '28:E', '38:E', '48:E', '58:E', '88:E', '88:S',
    ]);
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
