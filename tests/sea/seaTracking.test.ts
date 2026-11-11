import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { SeaChart, IslandTile, Side } from '@/shared/data';
import { indexChart, type SeaSide } from '@/shared/seaChart';
import type { SeaPosition, SeaPositionSource } from '@/shared/seaPosition';
import { parseSeaPosition, serializeSeaPosition } from '@/shared/seaPosition';
import type { LearnedTiles } from '@/shared/learnedTiles';
import type { SeaPageObservation } from '@/utils/seaExtract';
import { resolveSeaPosition, type SeaPageInput } from '@/utils/seaTracking';

const chart: SeaChart = JSON.parse(readFileSync('static/db/sea-chart.json', 'utf-8'));
const islands: IslandTile[] = JSON.parse(readFileSync('static/db/islands.json', 'utf-8'));
const idx = indexChart(chart, islands);

const at = (row: number, col: number, source: SeaPositionSource = 'move'): SeaPosition => ({ row, col, source, at: 0 });

function sea(o: Partial<SeaPageObservation>): SeaPageInput {
  return { kind: 'observed', observation: { place: 'sea', sides: {}, islandImage: null, departed: false, sailed: false, ...o } };
}

function island(image: string, sides: Partial<Record<Side, SeaSide>>): SeaPageInput {
  return { kind: 'observed', observation: { place: 'island', sides, islandImage: image, departed: false, sailed: false } };
}

const r = (prev: SeaPosition | null, step: Side | null, page: SeaPageInput, learned: LearnedTiles = {}) =>
  resolveSeaPosition(prev, step, page, idx, learned, 1);

const OPEN = { N: 'sea', E: 'sea', S: 'sea', W: 'sea' } as const;

describe('resolveSeaPosition', () => {
  it('sets the position from a city tile', () => {
    expect(r(null, null, { kind: 'city', row: 1, col: 3 }).position).toMatchObject({ row: 1, col: 3, source: 'city' });
  });

  it('takes the harbour sailed into when its picture cannot be read', () => {
    expect(r(at(-19, -3), 'N', { kind: 'harbour', harbourId: null }).position).toMatchObject({ row: -20, col: -3, source: 'harbour' });
    expect(r(at(-19, -3), 'N', { kind: 'harbour', harbourId: '9999' }).position).toMatchObject({ row: -20, col: -3 });
  });

  it('keeps the old square when an unreadable harbour page follows no step into a harbour', () => {
    expect(r(at(-19, -3), 'W', { kind: 'harbour', harbourId: null })).toMatchObject({ keep: true });
  });

  it('learns the island tile a harbour building lets out onto', () => {
    const res = r(at(-20, -3, 'harbour'), null, island('szigmag/szigmag_2-1', { N: 'coast', E: 'walk' }));
    expect(res.position).toMatchObject({ row: -20, col: -3, image: 'szigmag/szigmag_2-1' });
    expect(res.learn).toEqual({ image: 'szigmag/szigmag_2-1', row: -20, col: -3 });
  });

  it('sets the harbour square from the harbour picture', () => {
    expect(r(null, null, { kind: 'harbour', harbourId: '-2224' }).position).toMatchObject({ row: -22, col: 24, source: 'harbour' });
  });

  it('puts a departing ship beside the harbour it left', () => {
    const page = sea({ departed: true, sides: { N: 'sea', S: 'harbour', W: 'land', E: 'land' } });
    expect(r(at(1, 3, 'harbour'), null, page).position).toMatchObject({ row: 0, col: 3, source: 'departure' });
  });

  it('finds the harbour from the chart when none is remembered', () => {
    const page = sea({ departed: true, sides: { N: 'sea', S: 'harbour', W: 'land', E: 'land' } });
    expect(r(null, null, page).position).toMatchObject({ row: 0, col: 3, source: 'departure' });
  });

  it('stores nothing when several harbours fit the departure page', () => {
    const res = r(null, null, sea({ departed: true, sides: { E: 'harbour' } }));
    expect(res.position).toBeNull();
    expect(res.lost).toBe(true);
  });

  it('moves one square for a step sailed', () => {
    const page = sea({ sailed: true, sides: { N: 'sea', W: 'sea', E: 'land', S: 'sea' } });
    expect(r(at(0, 3), 'N', page).position).toMatchObject({ row: -1, col: 3, source: 'move' });
  });

  it('loses the position when the page contradicts the chart', () => {
    const page = sea({ sailed: true, sides: { N: 'land', W: 'land', E: 'land', S: 'land' } });
    expect(r(at(0, 3), 'N', page)).toMatchObject({ position: null, lost: true });
  });

  it('loses the position when a step lands the ship on chart land', () => {
    expect(r(at(0, 3), 'S', sea({ sailed: true, sides: {} }))).toMatchObject({ position: null, lost: true });
  });

  it('advances through a sea fight by the step', () => {
    expect(r(at(-7, -2), 'W', { kind: 'battle', sailed: true }).position).toMatchObject({ row: -7, col: -3, source: 'move' });
  });

  it('keeps the position through a fight that is not at sea', () => {
    expect(r(at(-7, -2), 'W', { kind: 'battle', sailed: false })).toMatchObject({ keep: true });
  });

  it('holds the square on the page after a flee', () => {
    expect(r(at(-7, -3), null, sea({ sides: OPEN })).position).toMatchObject({ row: -7, col: -3 });
  });

  it('pins a Thord-Artin tile by its picture', () => {
    expect(r(at(5, 5), null, island('nagysziget/szig_3-10', { W: 'walk' })).position)
      .toMatchObject({ row: -22, col: 25, source: 'tile' });
  });

  it('pins a learned picture', () => {
    const learned = { 'szigx/a': { row: -24, col: 2 } };
    expect(r(null, null, island('szigx/a', {}), learned).position).toMatchObject({ row: -24, col: 2, source: 'tile' });
  });

  it('learns an unknown island picture from a confirmed step', () => {
    expect(r(at(-24, 1), 'E', island('szigvar/szigvar_9-9', { N: 'coast' })).learn)
      .toEqual({ image: 'szigvar/szigvar_9-9', row: -24, col: 2 });
  });

  it('learns nothing from a step the page contradicts', () => {
    const res = r(at(-24, 1), 'W', island('szigvar/szigvar_9-9', { E: 'walk' }));
    expect(res.learn).toBeNull();
    expect(res.lost).toBe(true);
  });

  it('does not pin a conflicting learned picture', () => {
    const learned: LearnedTiles = { 'szigx/a': { row: 1, col: 1, conflict: true } };
    expect(r(at(-24, 1), null, island('szigx/a', {}), learned).position).toMatchObject({ row: -24, col: 1 });
  });

  it('leaves the stored value alone on any other page', () => {
    expect(r(at(0, 3), 'N', { kind: 'other' })).toMatchObject({ keep: true });
  });

  it('replaces a ship position when a city tile is seen again (hómport home)', () => {
    expect(r(at(-20, 10), null, { kind: 'city', row: 4, col: 4 }).position).toMatchObject({ row: 4, col: 4, source: 'city' });
  });

  it('loses the position when a step is spent without the data to place it', () => {
    expect(resolveSeaPosition(at(0, 3), 'N', sea({ sailed: true }), null, {}, 1)).toMatchObject({ position: null, lost: true });
    expect(resolveSeaPosition(at(1, 3, 'harbour'), null, sea({ departed: true }), null, {}, 1)).toMatchObject({ lost: true });
  });

  it('keeps the stored value without data when nothing moved', () => {
    expect(resolveSeaPosition(at(0, 3), null, sea({ sides: OPEN }), null, {}, 1).keep).toBe(true);
  });

  it('flags a learned picture that tracking places elsewhere, and loses the position', () => {
    const learned: LearnedTiles = { 'szigx/a': { row: -23, col: 1 } };
    const res = r(at(-24, 1, 'tile'), 'E', island('szigx/a', {}), learned);
    expect(res).toMatchObject({ position: null, lost: true });
    expect(res.learn).toEqual({ image: 'szigx/a', row: -24, col: 2 });
  });

  it('learns nothing from a square set by hand', () => {
    expect(r(at(-24, 1, 'manual'), 'E', island('szigvar/szigvar_9-9', { N: 'coast' })).learn).toBeNull();
  });

  it('takes a step that leaves the same island picture as refused', () => {
    const prev = { ...at(-24, 1, 'tile'), image: 'szigvar/szigvar_1-1' };
    const res = r(prev, 'E', island('szigvar/szigvar_1-1', {}));
    expect(res.position).toMatchObject({ row: -24, col: 1 });
    expect(res.learn).toBeNull();
  });

  it('remembers the island picture with the position', () => {
    expect(r(at(-24, 1), 'E', island('szigvar/szigvar_9-9', {})).position).toMatchObject({ image: 'szigvar/szigvar_9-9' });
  });
});

describe('sea position storage', () => {
  it('round-trips', () => {
    const p = at(-22, 24, 'tile');
    expect(parseSeaPosition(serializeSeaPosition(p))).toEqual(p);
  });

  it('reads nothing from a malformed or empty value', () => {
    expect(parseSeaPosition('')).toBeNull();
    expect(parseSeaPosition('{"row":1}')).toBeNull();
    expect(parseSeaPosition('{"row":1,"col":2,"source":"teleport","at":0}')).toBeNull();
  });
});
