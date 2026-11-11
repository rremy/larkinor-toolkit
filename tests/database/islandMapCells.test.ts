import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { IslandTile } from '@/shared/data';
import { islandMapCells, DISTRICT_CLASS, POI_EMOJI } from '@/database/map/mapMeta';

const islands: IslandTile[] = JSON.parse(readFileSync('static/db/islands.json', 'utf-8'));
const ta = islandMapCells(islands.filter((t) => t.island === 'Thord-Artin'));

describe('islandMapCells', () => {
  it('turns every Thord-Artin tile into a city-map cell at its own square', () => {
    const lapapaly = ta.cells.find((c) => c.imageId === 'nagysziget/szig_2-10')!;
    expect(lapapaly).toMatchObject({ imageSrc: '/tajk/nagysziget/szig_2-10.gif', district: 'mocsár' });
    expect(ta.positions.get('nagysziget/szig_2-10')).toEqual({ row: -22, col: 24 });
    expect(ta.names['nagysziget/szig_2-10']).toBe('Lápapály');
  });

  it('draws its buildings with the city map’s icons, keeping what is still unbuilt', () => {
    const south = ta.cells.find((c) => c.imageId === 'nagysziget/szig_5-1')!;
    expect(south.buildings[0]).toMatchObject({ icon: 'kikoto.gif', note: '493575 építőkő szükséges' });
    const altar = ta.cells.find((c) => c.imageId === 'nagysziget/szig_2-9')!;
    expect(altar.buildings.map((b) => POI_EMOJI[b.icon])).toEqual(['🕯️', '🗼']);
  });

  it('gives every island district a city-map colour', () => {
    for (const cell of ta.cells.filter((c) => c.district)) expect(DISTRICT_CLASS[cell.district], cell.district).toBeDefined();
  });
});
