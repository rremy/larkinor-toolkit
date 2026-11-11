import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { SeaChart, IslandTile } from '@/shared/data';
import { indexChart, harbourById, contradicts, STEP } from '@/shared/seaChart';

const chart: SeaChart = JSON.parse(readFileSync('static/db/sea-chart.json', 'utf-8'));
const islands: IslandTile[] = JSON.parse(readFileSync('static/db/islands.json', 'utf-8'));
const idx = indexChart(chart, islands);

describe('indexChart', () => {
  it('looks squares and tiles up by position and picture', () => {
    expect(idx.squareAt(1, 3)).toMatchObject({ harbour: true });
    expect(idx.squareAt(0, 3)).toBeNull();
    expect(idx.tileByImage('nagysziget/szig_2-10')).toMatchObject({ row: -22, col: 24 });
    expect(idx.tileAt(-22, 24)?.name).toBe('Lápapály');
    expect(idx.harbours).toHaveLength(9);
  });

  it('knows which way each step goes', () => {
    expect(STEP.N).toEqual({ row: -1, col: 0 });
    expect(STEP.E).toEqual({ row: 0, col: 1 });
  });
});

describe('harbourById', () => {
  it('reads the row and col a harbour picture runs together', () => {
    expect(harbourById(idx, '-2224')).toMatchObject({ row: -22, col: 24 });
    expect(harbourById(idx, '-241')).toMatchObject({ row: -24, col: 1 });
    expect(harbourById(idx, '84')).toMatchObject({ row: 8, col: 4 });
    expect(harbourById(idx, '13')).toMatchObject({ row: 1, col: 3 });
  });

  it('reads a harbour whose column is negative', () => {
    expect(harbourById(idx, '-20-3')).toMatchObject({ row: -20, col: -3 });
  });

  it('is null for an id naming no harbour', () => {
    expect(harbourById(idx, '999')).toBeNull();
    expect(harbourById(idx, '44')).toBeNull();
  });
});

describe('contradicts', () => {
  it('accepts the page that leaves harbour 13', () => {
    expect(contradicts(idx, 0, 3, 'sea', { N: 'sea', S: 'harbour', W: 'land', E: 'land' })).toBe(false);
  });

  it('rejects land where the chart has open sea', () => {
    expect(contradicts(idx, 0, 3, 'sea', { N: 'land' })).toBe(true);
  });

  it('rejects open sea where the chart has land', () => {
    expect(contradicts(idx, -1, 3, 'sea', { E: 'sea' })).toBe(true); // -14 is szikla
  });

  it('rejects open sea where the chart has a harbour', () => {
    expect(contradicts(idx, 0, 3, 'sea', { S: 'sea' })).toBe(true);
  });

  it('skips a square nobody has seen from a ship', () => {
    expect(contradicts(idx, -22, 2, 'sea', { N: 'sea' })).toBe(false); // north is (−23, 2), unknown
  });

  it('takes coast beside chart land on an island as no information', () => {
    expect(contradicts(idx, -24, 2, 'island', { S: 'coast' })).toBe(false);
  });

  it('rejects a walkable side where the chart has sea, on an island', () => {
    expect(contradicts(idx, -22, 24, 'island', { W: 'walk' })).toBe(true);
  });

  it('accepts the Thord-Artin harbour tile as measured', () => {
    expect(contradicts(idx, -22, 24, 'island', { N: 'walk', W: 'coast', E: 'walk', S: 'walk' })).toBe(false);
  });
});
