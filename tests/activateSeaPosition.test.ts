import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { DataLoader, IslandTile, SeaChart } from '@/shared/data';
import { SEA_LEARNED_TILES_PREF_KEY, SEA_MOVE_PREF_KEY, SEA_POSITION_PREF_KEY } from '@/shared/prefKeys';
import { parseSeaPosition, serializeSeaPosition } from '@/shared/seaPosition';
import { parseLearnedTiles } from '@/shared/learnedTiles';
import { activateSeaPosition, armSeaMoveTracking, isSeaOrIsland } from '@/utils/activateSeaPosition';
import { PageType } from '@/utils/pageDetector';

const chart: SeaChart = JSON.parse(readFileSync('static/db/sea-chart.json', 'utf-8'));
const islands: IslandTile[] = JSON.parse(readFileSync('static/db/islands.json', 'utf-8'));

function fixture(name: string): Document {
  return new DOMParser().parseFromString(readFileSync(`tests/fixtures/sea/${name}.html`, 'utf-8'), 'text/html');
}

function docWith(body: string): Document {
  return new DOMParser().parseFromString(`<html><body>${body}</body></html>`, 'text/html');
}

function makeLoader(fail = false): DataLoader {
  const reject = () => Promise.reject(new Error('offline'));
  return {
    loadSeaChart: vi.fn(fail ? reject : async () => chart),
    loadIslands: vi.fn(fail ? reject : async () => islands),
  } as unknown as DataLoader;
}

function store(initial: Record<string, string> = {}) {
  const prefs = new Map(Object.entries(initial));
  return {
    prefs,
    read: (key: string) => prefs.get(key) ?? null,
    write: (key: string, value: string) => { prefs.set(key, value); },
  };
}

const pos = (row: number, col: number, source = 'move') => serializeSeaPosition({ row, col, source: source as never, at: 0 });

describe('armSeaMoveTracking', () => {
  it('stores the direction of a sailing control when it is clicked', () => {
    const doc = fixture('sea-departed-13');
    const s = store();
    armSeaMoveTracking(doc, s.write);
    (doc.querySelector('input[title="északra hajózol - tenger"]') as HTMLElement).click();
    expect(s.prefs.get(SEA_MOVE_PREF_KEY)).toBe('N');
  });
});

describe('isSeaOrIsland', () => {
  it('is true at sea and on an island, false in the city', () => {
    expect(isSeaOrIsland(fixture('sea-departed-13'))).toBe(true);
    expect(isSeaOrIsland(fixture('island-szighar-1-1'))).toBe(true);
    expect(isSeaOrIsland(docWith('<img src="/tajk/13.gif">'))).toBe(false);
  });
});

describe('activateSeaPosition', () => {
  it('stores the city square of a city tile without loading the chart', async () => {
    const s = store();
    const loader = makeLoader();
    await activateSeaPosition(PageType.FreeMove, docWith('<img src="/tajk/13.gif">'), loader, s.read, s.write, 5);
    expect(parseSeaPosition(s.prefs.get(SEA_POSITION_PREF_KEY) ?? null)).toEqual({ row: 1, col: 3, source: 'city', at: 5 });
    expect(loader.loadSeaChart).not.toHaveBeenCalled();
  });

  it('puts the ship beside harbour 13 when it sets sail', async () => {
    const s = store({ [SEA_POSITION_PREF_KEY]: pos(1, 3, 'harbour') });
    await activateSeaPosition(PageType.FreeMove, fixture('sea-departed-13'), makeLoader(), s.read, s.write, 5);
    expect(parseSeaPosition(s.prefs.get(SEA_POSITION_PREF_KEY) ?? null)).toMatchObject({ row: 0, col: 3, source: 'departure' });
  });

  it('stores the harbour a harbour building names', async () => {
    const s = store();
    await activateSeaPosition(PageType.Harbour, docWith('<img src="/2/epulet/-2224kikoto.gif">'), makeLoader(), s.read, s.write, 5);
    expect(parseSeaPosition(s.prefs.get(SEA_POSITION_PREF_KEY) ?? null)).toMatchObject({ row: -22, col: 24, source: 'harbour' });
  });

  it('spends a pending step on any page, moving nothing', async () => {
    const s = store({ [SEA_POSITION_PREF_KEY]: pos(0, 3), [SEA_MOVE_PREF_KEY]: 'N' });
    await activateSeaPosition(PageType.Shop, docWith(''), makeLoader(), s.read, s.write, 5);
    expect(s.prefs.get(SEA_MOVE_PREF_KEY)).toBe('');
    expect(s.prefs.get(SEA_POSITION_PREF_KEY)).toBe(pos(0, 3));
  });

  it('advances through a sea fight', async () => {
    const s = store({ [SEA_POSITION_PREF_KEY]: pos(-7, -2), [SEA_MOVE_PREF_KEY]: 'W' });
    await activateSeaPosition(PageType.Battle, fixture('sea-battle'), makeLoader(), s.read, s.write, 5);
    expect(parseSeaPosition(s.prefs.get(SEA_POSITION_PREF_KEY) ?? null)).toMatchObject({ row: -7, col: -3 });
  });

  it('leaves the position alone when the chart cannot be loaded', async () => {
    const s = store({ [SEA_POSITION_PREF_KEY]: pos(1, 3, 'harbour') });
    await expect(activateSeaPosition(PageType.FreeMove, fixture('sea-departed-13'), makeLoader(true), s.read, s.write, 5)).resolves.toBeDefined();
    expect(s.prefs.get(SEA_POSITION_PREF_KEY)).toBe(pos(1, 3, 'harbour'));
  });

  it('remembers an island picture learned from a confirmed step', async () => {
    const s = store({ [SEA_POSITION_PREF_KEY]: pos(-24, 1, 'tile'), [SEA_MOVE_PREF_KEY]: 'E' });
    const doc = docWith(`
      <img src="/tajk/szigujj/szigujj_7-7.gif" title="harcos-negyed">
      <img src="/2/ikon/tenger.gif" title="északra tengerpart">`);
    await activateSeaPosition(PageType.FreeMove, doc, makeLoader(), s.read, s.write, 5);
    expect(parseLearnedTiles(s.prefs.get(SEA_LEARNED_TILES_PREF_KEY) ?? null)).toEqual({ 'szigujj/szigujj_7-7': { row: -24, col: 2 } });
  });

  it('clears the position when the page contradicts it', async () => {
    const s = store({ [SEA_POSITION_PREF_KEY]: pos(-7, -3) });
    await activateSeaPosition(PageType.FreeMove, fixture('sea-departed-13'), makeLoader(), s.read, s.write, 5);
    // A departure page states a harbour beside the ship; (−7, −3) is open sea, so the
    // chart's only fitting harbour (13) is taken instead — the old square is not kept.
    expect(parseSeaPosition(s.prefs.get(SEA_POSITION_PREF_KEY) ?? null)).toMatchObject({ row: 0, col: 3 });
    const t = store({ [SEA_POSITION_PREF_KEY]: pos(-7, -3) });
    const landAround = docWith(`
      <img src="/tajk/hajotengeren.gif">
      <img src="/2/ikon/szarazfold.gif" title="északra szárazföld">`);
    await activateSeaPosition(PageType.FreeMove, landAround, makeLoader(), t.read, t.write, 5);
    expect(t.prefs.get(SEA_POSITION_PREF_KEY)).toBe('');
  });
});
