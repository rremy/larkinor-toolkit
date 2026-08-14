import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Quest, LockType } from '@/shared/data';

const quests: Quest[] = JSON.parse(readFileSync('static/db/tavern-quests.json', 'utf-8'));
const monsters = JSON.parse(readFileSync('static/db/monsters.json', 'utf-8'));
const monsterIds = new Set<number>(monsters.map((m: { id: number }) => m.id));

const LOCKS: LockType[] = ['vas', 'rez', 'bronz', 'ezust', 'arany', 'platina', 'tolvaj', 'cso'];

describe('static/db/tavern-quests.json', () => {
  it('holds all 37 tavern quests with unique slug ids and titles', () => {
    expect(quests).toHaveLength(37);
    expect(new Set(quests.map((q) => q.id)).size).toBe(37);
    for (const q of quests) {
      expect(q.set, q.id).toBe('tavern');
      expect(q.id, 'id').toBeTruthy();
      expect(q.title, q.id).toBeTruthy();
    }
  });

  it('gives every quest a description and a reward', () => {
    for (const q of quests) {
      expect(q.description, q.id).toBeTruthy();
      expect(q.reward, q.id).toBeTruthy();
    }
  });

  it('keeps every cell inside its declared grid', () => {
    for (const q of quests) {
      expect(q.cells.length, q.id).toBe(q.rows * q.cols);
      for (const c of q.cells) {
        expect(c.row, q.id).toBeGreaterThanOrEqual(0);
        expect(c.row, q.id).toBeLessThan(q.rows);
        expect(c.col, q.id).toBeGreaterThanOrEqual(0);
        expect(c.col, q.id).toBeLessThan(q.cols);
      }
    }
  });

  // The whole point of the alias list: with it, nothing is left dangling.
  it('resolves every creature sprite to a monster in monsters.json', () => {
    for (const q of quests) {
      for (const c of q.cells) {
        if (c.monsterName == null) continue;
        expect(c.monsterId, `${q.id} ${c.row},${c.col} ${c.rawImage}`).not.toBeNull();
        expect(monsterIds).toContain(c.monsterId);
      }
    }
  });

  it('uses only known lock types on doors and keys', () => {
    for (const q of quests) {
      for (const c of q.cells) {
        if (c.key) expect(LOCKS, q.id).toContain(c.key);
        for (const edge of Object.values(c.edges)) {
          if (edge.kind === 'door') expect(LOCKS, q.id).toContain(edge.lock);
        }
      }
    }
  });

  // Image-derived, so it must not track parse success. 15 of the 147 tiles
  // have a title too short to yield options; they keep the marker and show
  // no card, exactly as the royal set does.
  it('marks 147 question tiles, of which 132 carry parsed options', () => {
    const cells = quests.flatMap((q) => q.cells);
    expect(cells.filter((c) => c.hasQuestion)).toHaveLength(147);
    expect(cells.filter((c) => c.question)).toHaveLength(132);
    for (const c of cells) {
      if (c.question) expect(c.hasQuestion).toBe(true);
    }
  });

  // Tavern answers have no outcomes anywhere in the source; if a future
  // scrape starts producing them, that is new information, not noise.
  it('carries no outcome text on any tavern choice', () => {
    for (const q of quests) {
      for (const c of q.cells) {
        for (const choice of c.question?.choices ?? []) {
          expect(choice.outcome, `${q.id} ${c.row},${c.col}`).toBe('');
        }
      }
    }
  });
});
