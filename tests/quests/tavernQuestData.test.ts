import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseTavernImage } from '../../scripts/quests/parseTavernQuest.mjs';
import type { Quest, LockType } from '@/shared/data';

const quests: Quest[] = JSON.parse(readFileSync('static/db/tavern-quests.json', 'utf-8'));
const monsters = JSON.parse(readFileSync('static/db/monsters.json', 'utf-8'));
const monsterIds = new Set<number>(monsters.map((m: { id: number }) => m.id));

const LOCKS: LockType[] = ['vas', 'rez', 'bronz', 'ezust', 'arany', 'platina', 'tolvaj', 'cso'];

/**
 * Mirrors `resolveMonster` from `scrapeTavern.mjs` closely enough to recreate
 * the `isMonster` predicate `parseTavernImage` needs to disambiguate a token
 * like `tolvaj` (thief lock suffix vs. the second word of some monster
 * names) — see that parser's doc comment on `parseTavernImage`. Aliases are
 * included even though they only ever settle a *final* unresolved base,
 * never a marker-token ambiguity in the current data, so this stays a
 * faithful mirror rather than a partial one that could silently drift from
 * the real predicate.
 */
const SPRITE_ALIASES: Record<string, number> = {
  'fureszfogu_%2520posvanyalligator': 65,
  orult_banyasztorp: 26,
  skivei_orvgyilkos: 151,
  nyamvadt_varazlotanonc: 12,
  unikornis: 83,
  donna_brutalisa: 56,
  minus: 132,
};

function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

interface MonsterEntry { id: number; name: string; image: string }
const byId = new Map<number, MonsterEntry>((monsters as MonsterEntry[]).map((m) => [m.id, m]));
const byBase = new Map<string, MonsterEntry>();
const byName = new Map<string, MonsterEntry>();
for (const m of monsters as MonsterEntry[]) {
  const base = m.image.replace(/^.*\//, '').replace(/\.[a-z]+$/i, '');
  if (base && !byBase.has(base)) byBase.set(base, m);
  const name = fold(m.name);
  if (name && !byName.has(name)) byName.set(name, m);
}

function resolveMonster(base: string): MonsterEntry | null {
  return byBase.get(base)
    ?? byBase.get(`${base}_k`)
    ?? byName.get(fold(base))
    ?? byId.get(SPRITE_ALIASES[base])
    ?? null;
}

const isMonster = (name: string): boolean => resolveMonster(name) !== null;

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

  // Mirrors questData.test.ts's regression guard for task 18: `hasQuestion`
  // must track the image, not `question !== null`. Aggregate totals alone
  // (the test above) cannot catch a marker/parse mismatch that cancels out
  // in the count — e.g. one cell losing its marker while another gains a
  // spurious one — so this recomputes the image-derived fact per cell.
  it('recomputes hasQuestion from rawImage for every cell and finds no mismatch', () => {
    const mismatches: string[] = [];
    for (const q of quests) {
      for (const c of q.cells) {
        const imageSaysQuestion = parseTavernImage(c.rawImage, isMonster).question as boolean;
        if (imageSaysQuestion !== c.hasQuestion) {
          mismatches.push(`${q.id} cell ${c.row},${c.col}: rawImage="${c.rawImage}"`);
        }
      }
    }
    expect(mismatches).toEqual([]);
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
