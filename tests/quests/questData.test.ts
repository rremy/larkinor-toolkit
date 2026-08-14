import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseImage } from '../../scripts/quests/parseQuest.mjs';
import type { Quest, LockType } from '@/shared/data';

const quests: Quest[] = JSON.parse(readFileSync('static/db/quests.json', 'utf-8'));
const monsters = JSON.parse(readFileSync('static/db/monsters.json', 'utf-8'));
const monsterIds = new Set<number>(monsters.map((m: { id: number }) => m.id));

const LOCKS: LockType[] = ['vas', 'rez', 'bronz', 'ezust', 'arany', 'platina', 'tolvaj', 'cso'];

describe('static/db/quests.json', () => {
  it('holds a contiguous run of royal quests starting at 1', () => {
    expect(quests.length).toBeGreaterThanOrEqual(45);
    expect(quests.map((q) => q.id)).toEqual(quests.map((_, i) => String(i + 1)));
    expect(quests.every((q) => q.set === 'royal')).toBe(true);
    expect(quests.map((q) => q.title)).toEqual(quests.map((_, i) => String(i + 1)));
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
        if (c.key) expect(LOCKS, `quest ${q.id}`).toContain(c.key);
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
    for (const q of quests) {
      for (const c of q.cells) {
        const imageSaysQuestion = parseImage(c.rawImage).question as boolean;
        if (imageSaysQuestion !== c.hasQuestion) {
          mismatches.push(`quest ${q.id} cell ${c.row},${c.col}: rawImage="${c.rawImage}"`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('provides a key cell for every lock that appears on a door, except this known set', () => {
    // The source genuinely omits a key for some door/quest pairs — the UI
    // states "nincs kulcs ebben a küldetésben" for these rather than treating
    // it as a data error. Pinned to the exact measured set (not merely
    // "recorded") so a future re-scrape that gains or loses one fails the
    // build instead of silently drifting.
    const missing: string[] = [];
    for (const q of quests) {
      const keysHere = new Set(q.cells.map((c) => c.key).filter(Boolean));
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
    ]);
  });
});
