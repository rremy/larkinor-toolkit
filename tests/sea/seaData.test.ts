import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { SeaChart, IslandTile } from '@/shared/data';

const chart: SeaChart = JSON.parse(readFileSync('static/db/sea-chart.json', 'utf-8'));
const islands: IslandTile[] = JSON.parse(readFileSync('static/db/islands.json', 'utf-8'));

const at = (row: number, col: number) => chart.squares.find((s) => s.row === row && s.col === col);
const tile = (image: string) => islands.find((t) => t.image === image);

describe('static/db/sea-chart.json', () => {
  it('spans the fan grid in our coordinates', () => {
    expect(chart.rows).toEqual({ min: -36, max: 35 });
    expect(chart.cols).toEqual({ min: -5, max: 42 });
  });

  it('lists exactly the real harbours', () => {
    const harbours = chart.squares.filter((s) => s.harbour).map((s) => [s.row, s.col]);
    expect(harbours.sort()).toEqual(
      [[-34, 25], [-24, 1], [-22, 24], [-20, -3], [-16, 25], [-13, 27], [1, 3], [4, 1], [8, 4]].sort(),
    );
  });

  it('drops the legend swatches inside the table', () => {
    expect(at(-35, -4)).toBeUndefined(); // fan (1, 1): the Feltöltés swatch column
    expect(at(-35, 34)).toBeUndefined(); // fan (1, 39): the Városközpont swatch
    expect(at(-29, 34)).toBeUndefined(); // fan (7, 39): the Kikötő swatch, not a harbour
  });

  it('marks the two uncertain squares unknown', () => {
    expect(at(-27, 9)?.kind).toBe('unknown');
    expect(at(-23, 2)?.kind).toBe('unknown');
  });

  it('keeps the city block as land, its harbours included', () => {
    expect(at(1, 3)).toMatchObject({ kind: 'land', harbour: true });
    expect(at(4, 4)).toMatchObject({ kind: 'land' });
    expect(at(0, 3)).toBeUndefined(); // the sea square north of harbour 13
  });

  it('records unexplored land as such', () => {
    expect(at(26, 30)?.kind).toBe('unexplored'); // the large southern island
  });
});

describe('static/db/islands.json', () => {
  it('places Thord-Artin by szig_<c>-<r>', () => {
    expect(tile('nagysziget/szig_2-10')).toMatchObject({
      row: -22, col: 24, name: 'Lápapály', island: 'Thord-Artin', district: 'mocsár',
    });
    expect(tile('nagysziget/szig_5-1')).toMatchObject({ row: -13, col: 27 });
  });

  it('puts every Thord-Artin tile on chart land', () => {
    const ta = islands.filter((t) => t.island === 'Thord-Artin');
    expect(ta.length).toBeGreaterThan(40);
    for (const t of ta) expect(at(t.row, t.col), t.image).toBeDefined();
  });

  it('prefers the commented name over the placeholder', () => {
    expect(tile('nagysziget/szig_3-22')?.name).toBe('Északi kikötő');
  });

  it('records harbour readiness', () => {
    expect(tile('nagysziget/szig_2-10')?.buildings).toContainEqual(expect.objectContaining({ name: 'Kikötő', ready: true }));
    expect(tile('nagysziget/szig_5-1')?.buildings?.[0]).toMatchObject({ name: 'Kikötő', ready: false });
  });

  it('seeds the small western island measured live', () => {
    const small = ['szighar/szighar_1-1', 'szighar/szighar_2-1', 'szigmag/szigmag_2--21'].map((i) => [tile(i)?.row, tile(i)?.col]);
    expect(small).toEqual([[-24, 1], [-24, 2], [-23, 1]]);
  });

  it('names each picture once', () => {
    const images = islands.map((t) => t.image);
    expect(new Set(images).size).toBe(images.length);
  });
});
