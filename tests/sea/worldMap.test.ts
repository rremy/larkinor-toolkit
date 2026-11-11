import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { IslandTile, SeaChart } from '@/shared/data';
import { indexChart } from '@/shared/seaChart';
import type { SeaPosition } from '@/shared/seaPosition';
import { placeOf, parseWorldMap } from '@/shared/worldMap';

const chart: SeaChart = JSON.parse(readFileSync('static/db/sea-chart.json', 'utf-8'));
const islands: IslandTile[] = JSON.parse(readFileSync('static/db/islands.json', 'utf-8'));
const idx = indexChart(chart, islands);

const at = (row: number, col: number, source: SeaPosition['source'] = 'move', image?: string): SeaPosition =>
  ({ row, col, source, at: 0, ...(image ? { image } : {}) });

describe('placeOf', () => {
  it('is nowhere without a position', () => {
    expect(placeOf(null, idx)).toBeNull();
  });

  it('is Larkinor on any city tile, the strip north of row 0 included', () => {
    expect(placeOf(at(4, 4, 'city'), idx)).toBe('larkinor');
    expect(placeOf(at(-1, 4, 'city'), idx)).toBe('larkinor');
    expect(placeOf(at(1, 3, 'harbour'), idx)).toBe('larkinor'); // harbour 13's building
  });

  it('is Thord-Artin on one of its tiles, by picture even before the chart loads', () => {
    expect(placeOf(at(-22, 25, 'tile', 'nagysziget/szig_3-10'), null)).toBe('thord-artin');
    expect(placeOf(at(-22, 24, 'harbour'), idx)).toBe('thord-artin'); // Lápapály's harbour building
  });

  it('is the sea on the ship, beside Thord-Artin included', () => {
    expect(placeOf(at(-7, -3), idx)).toBe('sea');
    expect(placeOf(at(-22, 23, 'move'), idx)).toBe('sea');
  });

  it('is the sea on the ship inside the city block (harbour 13’s departure square)', () => {
    expect(placeOf(at(0, 3, 'departure'), idx)).toBe('sea');
    expect(placeOf(at(0, 3, 'departure'), null)).toBe('sea');
    expect(placeOf(at(0, 3, 'manual'), idx)).toBe('sea');
    expect(placeOf(at(4, 4, 'manual'), idx)).toBe('larkinor');
  });

  it('falls back to the sea chart on an island with no map of its own', () => {
    expect(placeOf(at(-24, 1, 'tile', 'szighar/szighar_1-1'), idx)).toBe('sea');
  });
});

describe('parseWorldMap', () => {
  it('reads the stored view, the old city/sea values included', () => {
    expect(parseWorldMap('thord-artin')).toBe('thord-artin');
    expect(parseWorldMap('city')).toBe('larkinor');
    expect(parseWorldMap('sea')).toBe('sea');
    expect(parseWorldMap('')).toBeNull();
    expect(parseWorldMap(null)).toBeNull();
  });
});
