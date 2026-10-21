import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseImage } from '../../scripts/quests/parseQuest.mjs';
import { parseArchiveImage } from '../../scripts/quests/parseArchiveQuest.mjs';
import type { Quest, LockType } from '@/shared/data';
import { cellKey, cellKeys, outsideMazeCells, splitEdges } from '@/database/quests/questMeta';

const quests: Quest[] = JSON.parse(readFileSync('static/db/quests.json', 'utf-8'));
const monsters = JSON.parse(readFileSync('static/db/monsters.json', 'utf-8'));
const monsterIds = new Set<number>(monsters.map((m: { id: number }) => m.id));

const LOCKS: LockType[] = ['vas', 'rez', 'bronz', 'ezust', 'arany', 'platina', 'tolvaj', 'cso', 'varazs'];

/** 1–45 come from larkinorcenter.hu, the rest from archived lc.kew1n.hu pages. */
const fromArchive = (q: Quest) => q.floor !== undefined || Number(q.id) > 45;

describe('static/db/quests.json', () => {
  it('holds royal quests 1–63 in order, with 59\'s cellar floors after its ground floor', () => {
    const numbers = Array.from({ length: 63 }, (_, i) => String(i + 1));
    const ids = numbers.flatMap((n) => (n === '59' ? ['59', '59-1', '59-2', '59-3'] : [n]));
    expect(quests.map((q) => q.id)).toEqual(ids);
    expect(quests.every((q) => q.set === 'royal')).toBe(true);
    // Floors share their quest's title; the id and `floor` tell them apart.
    expect(quests.map((q) => q.title)).toEqual(ids.map((id) => id.split('-')[0]));
    expect(quests.filter((q) => q.floor).map((q) => `${q.id}:${q.floor}`))
      .toEqual(['59:F', '59-1:−1', '59-2:−2', '59-3:−3']);
  });

  it('gives every quest a description and a reward', () => {
    for (const q of quests) {
      expect(q.description, `quest ${q.id}`).toBeTruthy();
      expect(q.reward, `quest ${q.id}`).toBeTruthy();
    }
  });

  it('keeps every cell inside its declared grid', () => {
    for (const q of quests) {
      expect(q.cells.length, `quest ${q.id}`).toBe(q.rows * q.cols);
      for (const c of q.cells) {
        expect(c.row, `quest ${q.id}`).toBeGreaterThanOrEqual(0);
        expect(c.row, `quest ${q.id}`).toBeLessThan(q.rows);
        expect(c.col, `quest ${q.id}`).toBeGreaterThanOrEqual(0);
        expect(c.col, `quest ${q.id}`).toBeLessThan(q.cols);
      }
    }
  });

  it('uses only known lock types on doors and keys', () => {
    for (const q of quests) {
      for (const c of q.cells) {
        for (const key of cellKeys(c)) expect(LOCKS, `quest ${q.id}`).toContain(key);
        for (const edge of Object.values(c.edges)) {
          if (edge.kind === 'door') expect(LOCKS, `quest ${q.id}`).toContain(edge.lock);
        }
      }
    }
  });

  it('resolves every monster id against monsters.json', () => {
    for (const q of quests) {
      for (const c of q.cells) {
        if (c.monsterId !== null) {
          expect(monsterIds.has(c.monsterId), `quest ${q.id} monster ${c.monsterId}`).toBe(true);
        }
      }
    }
  });

  it('sets hasQuestion on every cell whose image is a question tile, regardless of parse success', () => {
    // Regression guard for task 18: `hasQuestion` must track the image, not
    // `question !== null`. This is the invariant that would have caught the
    // original bug in CI — 42 cells across 10 quests had a question image
    // but a null `question`, and rendered no marker at all.
    const mismatches: string[] = [];
    for (const q of quests.filter((quest) => !fromArchive(quest))) {
      for (const c of q.cells) {
        const imageSaysQuestion = parseImage(c.rawImage).question as boolean;
        if (imageSaysQuestion !== c.hasQuestion) {
          mismatches.push(`quest ${q.id} cell ${c.row},${c.col}: rawImage="${c.rawImage}"`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('sets hasQuestion on every archived question tile, whatever its text parsed to', () => {
    // The archived pages also mark questions in the label (`kérdés!!!`) and
    // by their `--->` choices, so the image only ever adds — never decides
    // alone that a cell is not a question.
    const missed = quests.filter(fromArchive).flatMap((q) => q.cells
      .filter((c) => parseArchiveImage(c.rawImage).question && !c.hasQuestion)
      .map((c) => `quest ${q.id} cell ${c.row},${c.col}`));
    expect(missed).toEqual([]);
  });

  it('provides a key cell for every lock that appears on a door, except this known set', () => {
    // The source genuinely omits a key for some door/quest pairs — the UI
    // states "nincs kulcs ebben a küldetésben" for these rather than treating
    // it as a data error. Pinned to the exact measured set (not merely
    // "recorded") so a future re-scrape that gains or loses one fails the
    // build instead of silently drifting.
    const missing: string[] = [];
    for (const q of quests) {
      const keysHere = new Set(q.cells.flatMap(cellKeys));
      const locksHere = new Set(
        q.cells.flatMap((c) => Object.values(c.edges))
          .filter((e) => e.kind === 'door')
          .map((e) => (e as { lock: LockType }).lock),
      );
      for (const lock of locksHere) if (!keysHere.has(lock)) missing.push(`${q.id}:${lock}`);
    }
    expect(missing.sort()).toEqual([
      '18:arany', '18:bronz', '18:ezust', '18:tolvaj',
      '27:bronz', '27:tolvaj',
      '32:arany', '32:bronz', '32:vas',
      '39:vas',
      '41:bronz',
      '42:rez',
      // The archived pages leave many more unrecorded: quest 49 mentions only
      // its vas and varázs keys anywhere on the page, for seven other locks.
      '47:bronz', '48:tolvaj',
      '49:arany', '49:bronz', '49:cso', '49:ezust', '49:platina', '49:rez', '49:tolvaj',
      '50:platina', '50:varazs', '51:tolvaj', '52:tolvaj', '53:bronz', '53:varazs',
      '54:bronz', '54:ezust',
      '55:arany', '55:ezust', '55:platina', '55:varazs',
      '56:bronz', '56:cso', '57:bronz',
      '59-1:vas', '59:arany', '59:bronz', '59:cso', '59:rez',
      '60:tolvaj', '62:cso', '63:bronz', '63:ezust',
    ]);
  });
});

describe('maze shape of static/db/quests.json', () => {
  it('counts the cells outside the drawn maze, and never one holding content', () => {
    // The royal mazes are drawn inside a bounding grid that is often larger
    // than the shape, and the leftover cells render as void. Pinned to the
    // measured total so a re-scrape that changes a maze's outline fails here
    // rather than silently blacking out rooms — the bug this replaced painted
    // all 576 blank cells void, 200 of them real rooms.
    let outside = 0;
    const withContent: string[] = [];
    for (const quest of quests) {
      for (const key of outsideMazeCells(quest)) {
        outside++;
        const cell = quest.cells.find((c) => cellKey(c) === key);
        if (cell === undefined) throw new Error(`quest ${quest.id}: unknown cell ${key}`);
        const empty = cell.monsterId == null && !cell.key && !cell.questItem && !cell.portal
          && !cell.hasQuestion && !cell.trap && !cell.death && !cell.boss && cell.narration === '';
        if (!empty) withContent.push(`${quest.id}:${key}`);
      }
    }
    expect(withContent).toEqual([]);
    // 377 from larkinorcenter.hu; 34 in archived quest 52's irregular outline
    // and 6 in 58's.
    expect(outside).toBe(417);
  });
});

describe('one-sided doors in static/db/quests.json', () => {
  it('finds the doors royal quest 44 draws from one side only', () => {
    const q44 = quests.find((q) => q.id === '44') as Quest;
    const split = splitEdges(q44);
    expect(split.size).toBe(54);
    // Open going east from (0,2), a thief's door coming back west from (0,3).
    expect(split.has('0,3:W')).toBe(true);
    expect(split.has('0,2:E')).toBe(false);
    // Two different doors on one line: both halves are drawn.
    expect(split.has('4,3:E') && split.has('4,4:W')).toBe(true);
  });
});

describe('monster links in static/db/quests.json', () => {
  const byId = new Map<number, { name: string; level: number }>(
    monsters.map((m: { id: number; name: string; level: number }) => [m.id, m]),
  );

  it('never links a `*` elite — the quests use the base monsters', () => {
    const elite = quests.flatMap((q) => q.cells
      .filter((c) => c.monsterId != null && byId.get(c.monsterId)?.name.startsWith('*'))
      .map((c) => `${q.id}:${c.row},${c.col}`));
    expect(elite).toEqual([]);
  });

  it('keeps each cell\'s name in step with the monster it links', () => {
    for (const q of quests) {
      for (const c of q.cells) {
        if (c.monsterId != null) expect(c.monsterName, `${q.id}:${c.row},${c.col}`).toBe(byId.get(c.monsterId)?.name);
      }
    }
  });

  it('links quest 4\'s drunken sailor at level 7, not the level-133 elite', () => {
    const q4 = quests.find((q) => q.id === '4') as Quest;
    const sailor = q4.cells.find((c) => c.monsterName === 'Részeg matróz');
    expect(sailor?.monsterId).toBe(40);
    expect(byId.get(40)?.level).toBe(7);
  });
});

describe('the archived royal quests 46–63', () => {
  const archived = quests.filter(fromArchive);

  it('parses 18 pages into 21 mazes, quest 59 being four floors', () => {
    expect(archived).toHaveLength(21);
    expect(archived.reduce((n, q) => n + q.cells.length, 0)).toBe(2114);
  });

  it('gives each floor of 59 its own grid, but one brief', () => {
    const floors = quests.filter((q) => q.title === '59');
    expect(floors.map((q) => `${q.rows}x${q.cols}`)).toEqual(['10x10', '10x10', '10x10', '10x10']);
    expect(new Set(floors.map((q) => q.description)).size).toBe(1);
    // The way in is on the ground floor only; the cellars are reached by lift.
    expect(floors.map((q) => q.cells.filter((c) => c.portal === 'entrance').length)).toEqual([1, 0, 0, 0]);
  });

  it('records the varázs lock the larkinorcenter.hu quests never use', () => {
    const doors = archived.flatMap((q) => q.cells.flatMap((c) => Object.values(c.edges)))
      .filter((e) => e.kind === 'door' && e.lock === 'varazs');
    expect(doors.length).toBeGreaterThan(0);
    expect(quests.filter((q) => !fromArchive(q)).flatMap((q) => q.cells.flatMap(cellKeys))).not.toContain('varazs');
  });

  // Six cells give more than one key; the label lists them all.
  it('keeps every key of a cell that gives several', () => {
    const multi = archived.flatMap((q) => q.cells.filter((c) => c.extraKeys).map((c) => `${q.id}:${cellKeys(c).join('+')}`));
    expect(multi.sort()).toEqual([
      '52:vas+rez', '56:varazs+rez+ezust+platina', '57:vas+rez+cso+ezust+arany+tolvaj',
      '60:bronz+vas', '60:ezust+rez', '60:rez+platina',
    ]);
  });

  it('spells ő and ű right, never as the õ/û the pages carry', () => {
    const text = archived.flatMap((q) => [q.description, q.reward, ...q.cells.map((c) => c.narration)]).join(' ');
    expect(text).not.toMatch(/[õûÕÛ]/);
    expect(text).toMatch(/ő/);
  });

  it('never links an archived cell to a * elite', () => {
    const elites = archived.flatMap((q) => q.cells).filter((c) => c.monsterName?.startsWith('*'));
    expect(elites).toEqual([]);
  });
});
