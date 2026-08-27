import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { activateDungeonPosition, clearDungeonPosition } from '../src/utils/activateDungeonPosition';
import {
  ACTIVE_ROYAL_QUEST_PREF_KEY,
  QUEST_MOVE_PREF_KEY,
  QUEST_POSITION_PREF_KEY,
  QUEST_SET_PREF_KEY,
  questClearedKey,
  questSelectedKey,
} from '@/shared/prefKeys';
import { parseQuestPosition, serialiseQuestPosition } from '@/shared/questPosition';
import { parseCleared } from '@/shared/questCleared';
import type { SideObservations } from '../src/utils/dungeonPosition';
import type { DataLoader, Quest, QuestCell, Side } from '@/shared/data';

const royal: Quest[] = JSON.parse(readFileSync('static/db/quests.json', 'utf-8'));
const tavern: Quest[] = JSON.parse(readFileSync('static/db/tavern-quests.json', 'utf-8'));

/** The live capture: royal quest 35, cell (0,6), reached by resting. */
const RESTED_AT_0_6 = `Pihensz egy kicsit...
Regenerálódott némi életpontod!
${royal.find((q) => q.id === '35')!.cells.find((c) => c.row === 0 && c.col === 6)!.narration}`;

const OBSERVED_AT_0_6: SideObservations = { N: 'wall', E: 'wall', S: 'open', W: 'open' };

const quest35 = royal.find((q) => q.id === '35')!;
const observed = (cell?: { edges: Record<'N' | 'E' | 'S' | 'W', { kind: string }> }) => ({
  sides: cell
    ? Object.fromEntries((['N', 'E', 'S', 'W'] as const)
        .map((s) => [s, cell.edges[s].kind === 'open' ? 'open' : 'wall'])) as SideObservations
    : OBSERVED_AT_0_6,
  enemy: false,
  question: false,
});

function makeLoader(overrides: Partial<DataLoader> = {}): DataLoader {
  return {
    loadQuests: async () => royal,
    loadTavernQuests: async () => tavern,
    loadWeapons: async () => [],
    loadArmors: async () => [],
    loadItems: async () => [],
    loadMonsters: async () => ({}) as never,
    loadMap: async () => ({}) as never,
    loadItemShops: async () => ({}) as never,
    loadWeaponShops: async () => ({}) as never,
    ...overrides,
  } as DataLoader;
}

/** A pref store backed by a plain map, so reads see what writes did. */
function makePrefs(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    read: (key: string) => store.get(key) ?? null,
    write: vi.fn((key: string, value: string) => { store.set(key, value); }),
    stored: store,
  };
}

describe('activateDungeonPosition', () => {
  it('stores the cell it detected in the remembered quest', async () => {
    const prefs = makePrefs({ [QUEST_SET_PREF_KEY]: 'royal', [questSelectedKey('royal')]: '35' });
    const position = await activateDungeonPosition(
      RESTED_AT_0_6, observed(), makeLoader(), prefs.read, prefs.write,
    );

    expect(position).toEqual({
      set: 'royal', questId: '35', cells: [{ row: 0, col: 6 }], exact: true, source: 'narration',
    });
    expect(parseQuestPosition(prefs.stored.get(QUEST_POSITION_PREF_KEY)!)).toEqual(position);
  });

  // The store going stale is the normal way this breaks: the player walks into a
  // labyrinth without opening the quests tab first.
  it('corrects a stale remembered quest and stores the new selection', async () => {
    const prefs = makePrefs({ [QUEST_SET_PREF_KEY]: 'royal', [questSelectedKey('royal')]: '34' });
    const position = await activateDungeonPosition(
      RESTED_AT_0_6, observed(), makeLoader(), prefs.read, prefs.write,
    );

    expect(position?.questId).toBe('35');
    expect(prefs.write).toHaveBeenCalledWith(questSelectedKey('royal'), '35');
  });

  it('defaults to the royal set when nothing is remembered', async () => {
    const prefs = makePrefs();
    const loadTavernQuests = vi.fn(async () => tavern);
    const position = await activateDungeonPosition(
      RESTED_AT_0_6, observed(), makeLoader({ loadTavernQuests }), prefs.read, prefs.write,
    );

    expect(position?.set).toBe('royal');
    expect(loadTavernQuests).not.toHaveBeenCalled();
  });

  // Only the stored set is loaded: the other file is ~1.2MB and the player is
  // overwhelmingly likely to be in the kind of labyrinth they were reading.
  it('loads only the remembered set', async () => {
    const prefs = makePrefs({ [QUEST_SET_PREF_KEY]: 'tavern' });
    const loadQuests = vi.fn(async () => royal);
    await activateDungeonPosition(
      RESTED_AT_0_6, observed(), makeLoader({ loadQuests }), prefs.read, prefs.write,
    );

    expect(loadQuests).not.toHaveBeenCalled();
  });

  // A cell that prints nothing is routine, and must clear rather than leave the
  // previous cell's marker standing.
  it('clears the stored position when nothing matches', async () => {
    const prefs = makePrefs({
      [QUEST_SET_PREF_KEY]: 'royal',
      [questSelectedKey('royal')]: '35',
      [QUEST_POSITION_PREF_KEY]: '{"version":1,"set":"royal","questId":"35","cells":[{"row":9,"col":9}],"exact":true}',
    });
    const position = await activateDungeonPosition(
      'Pihensz egy kicsit...', observed(), makeLoader(), prefs.read, prefs.write,
    );

    expect(position).toBeNull();
    expect(prefs.write).toHaveBeenCalledWith(QUEST_POSITION_PREF_KEY, '');
    expect(parseQuestPosition(prefs.stored.get(QUEST_POSITION_PREF_KEY)!)).toBeNull();
  });

  // A stale selection must not be moved on a miss — the player may simply be
  // standing on an unnarrated cell of the quest they were reading.
  it('leaves the remembered quest alone when nothing matches', async () => {
    const prefs = makePrefs({ [QUEST_SET_PREF_KEY]: 'royal', [questSelectedKey('royal')]: '35' });
    await activateDungeonPosition('Pihensz egy kicsit...', { sides: {}, enemy: false, question: false }, makeLoader(), prefs.read, prefs.write);

    expect(prefs.write).not.toHaveBeenCalledWith(questSelectedKey('royal'), expect.anything());
  });

  // A failed fetch must also *forget* where the player was. The pending step is
  // consumed before the load is attempted, so the chain is already broken: were
  // the previous cell left standing, the next page would propagate from a
  // two-page-old position in the direction of the step after the one that
  // reached it — and, if the walls happened to agree, report a cell the player
  // has never visited as exact. This test used to pin the opposite (that
  // nothing was written at all).
  it('forgets the previous position when the quest data is unavailable', async () => {
    const prefs = makePrefs({
      [QUEST_SET_PREF_KEY]: 'royal',
      [QUEST_POSITION_PREF_KEY]: serialiseQuestPosition({
        set: 'royal', questId: '35', cells: [{ row: 0, col: 6 }], exact: true, source: 'narration',
      }),
      [QUEST_MOVE_PREF_KEY]: 'S',
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loader = makeLoader({ loadQuests: async () => { throw new Error('offline'); } });

    await expect(
      activateDungeonPosition(RESTED_AT_0_6, observed(), loader, prefs.read, prefs.write),
    ).resolves.toBeNull();
    expect(prefs.write).toHaveBeenCalledWith(QUEST_POSITION_PREF_KEY, '');
    expect(parseQuestPosition(prefs.stored.get(QUEST_POSITION_PREF_KEY)!)).toBeNull();
    // Never a quest selection: nothing was detected to justify moving it.
    expect(prefs.write).not.toHaveBeenCalledWith(questSelectedKey('royal'), expect.anything());
    warn.mockRestore();
  });

  it('survives a pref write throwing, and still reports the position', async () => {
    const prefs = makePrefs({ [QUEST_SET_PREF_KEY]: 'royal', [questSelectedKey('royal')]: '35' });
    prefs.write.mockImplementation(() => { throw new Error('storage full'); });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const position = await activateDungeonPosition(
      RESTED_AT_0_6, observed(), makeLoader(), prefs.read, prefs.write,
    );

    expect(position?.questId).toBe('35');
    warn.mockRestore();
  });

  it('prefers the quest the game names as active over the last browsed one', async () => {
    const prefs = makePrefs({
      [QUEST_SET_PREF_KEY]: 'royal',
      [questSelectedKey('royal')]: '12',
      [ACTIVE_ROYAL_QUEST_PREF_KEY]: '35',
    });
    const position = await activateDungeonPosition(
      RESTED_AT_0_6, observed(), makeLoader(), prefs.read, prefs.write,
    );
    expect(position?.questId).toBe('35');
  });

  it('carries the position through a pending step when the page prints no text', async () => {
    const from = quest35.cells.find((c) => c.edges.N.kind === 'open' && c.row > 0)!;
    const to = quest35.cells.find((c) => c.row === from.row - 1 && c.col === from.col)!;
    const prefs = makePrefs({
      [QUEST_SET_PREF_KEY]: 'royal',
      [questSelectedKey('royal')]: '35',
      [QUEST_POSITION_PREF_KEY]: serialiseQuestPosition({
        set: 'royal', questId: '35', cells: [{ row: from.row, col: from.col }],
        exact: true, source: 'narration',
      }),
      [QUEST_MOVE_PREF_KEY]: 'N',
    });

    const position = await activateDungeonPosition('', observed(to), makeLoader(), prefs.read, prefs.write);

    expect(position).toEqual({
      set: 'royal', questId: '35', cells: [{ row: to.row, col: to.col }], exact: true, source: 'move',
    });
    // Consumed, so the next page cannot replay it.
    expect(prefs.stored.get(QUEST_MOVE_PREF_KEY)).toBe('');
  });

  it('marks a killed monster cleared', async () => {
    const monsterCell = quest35.cells.find((c) => c.monsterId != null && c.narration !== '')!;
    const prefs = makePrefs({ [QUEST_SET_PREF_KEY]: 'royal', [questSelectedKey('royal')]: '35' });

    await activateDungeonPosition(
      monsterCell.narration,
      { sides: {}, enemy: false, question: false },
      makeLoader(), prefs.read, prefs.write,
    );

    expect(parseCleared(prefs.stored.get(questClearedKey('royal', '35')) ?? null))
      .toContain(`${monsterCell.row},${monsterCell.col}`);
  });

  it('leaves a monster that is still standing there alone', async () => {
    const monsterCell = quest35.cells.find((c) => c.monsterId != null && c.narration !== '')!;
    const prefs = makePrefs({ [QUEST_SET_PREF_KEY]: 'royal', [questSelectedKey('royal')]: '35' });

    await activateDungeonPosition(
      monsterCell.narration,
      { sides: {}, enemy: true, question: false },
      makeLoader(), prefs.read, prefs.write,
    );

    expect(parseCleared(prefs.stored.get(questClearedKey('royal', '35')) ?? null)).toEqual(new Set());
  });

  it('marks a trap cell cleared on arrival', async () => {
    const trapCell = quest35.cells.find((c) => c.trap && c.narration !== '');
    if (!trapCell) return; // the fixture quest has no narrated trap
    const prefs = makePrefs({ [QUEST_SET_PREF_KEY]: 'royal', [questSelectedKey('royal')]: '35' });

    await activateDungeonPosition(
      trapCell.narration, { sides: {}, enemy: false, question: false },
      makeLoader(), prefs.read, prefs.write,
    );

    expect(parseCleared(prefs.stored.get(questClearedKey('royal', '35')) ?? null))
      .toContain(`${trapCell.row},${trapCell.col}`);
  });

  // A step-propagated position is `exact` too, so `exact` alone can never be the
  // gate for a permanent mark. Concretely: the game refuses a move, the cell the
  // player is still standing in prints nothing, the prediction therefore wins —
  // and the monster on the *predicted* cell would be recorded as killed without
  // ever having been met.
  it('clears nothing for a position carried by the step alone', async () => {
    const STEP: Record<Side, [number, number]> = { N: [-1, 0], E: [0, 1], S: [1, 0], W: [0, -1] };
    const at = (row: number, col: number) => quest35.cells.find((c) => c.row === row && c.col === col);
    let step: { from: QuestCell; to: QuestCell; dir: Side } | null = null;
    for (const from of quest35.cells) {
      for (const dir of ['N', 'E', 'S', 'W'] as Side[]) {
        if (from.edges[dir].kind === 'wall' || from.edges[dir].kind === 'szel') continue;
        const to = at(from.row + STEP[dir][0], from.col + STEP[dir][1]);
        if (to?.monsterId != null) { step = { from, to, dir }; break; }
      }
      if (step) break;
    }
    expect(step).not.toBeNull();
    const { from, to, dir } = step!;

    const prefs = makePrefs({
      [QUEST_SET_PREF_KEY]: 'royal',
      [questSelectedKey('royal')]: '35',
      [QUEST_POSITION_PREF_KEY]: serialiseQuestPosition({
        set: 'royal', questId: '35', cells: [{ row: from.row, col: from.col }],
        exact: true, source: 'narration',
      }),
      [QUEST_MOVE_PREF_KEY]: dir,
    });

    // No narration at all, so only the step can resolve the position.
    const position = await activateDungeonPosition(
      '', observed(to), makeLoader(), prefs.read, prefs.write,
    );

    expect(position).toEqual({
      set: 'royal', questId: '35', cells: [{ row: to.row, col: to.col }], exact: true, source: 'move',
    });
    expect(parseCleared(prefs.stored.get(questClearedKey('royal', '35')) ?? null)).toEqual(new Set());
  });

  it('clears nothing when the position is ambiguous', async () => {
    // Quest 16's narration "Hopp, zsákutca. Akkor vissza." is shared by two
    // cells, (7,7) and (8,7) — verified unique to this quest in the corpus —
    // so no single cell can be credited with the clearing.
    const prefs = makePrefs({ [QUEST_SET_PREF_KEY]: 'royal' });

    const position = await activateDungeonPosition(
      'Hopp, zsákutca. Akkor vissza.', { sides: {}, enemy: false, question: false },
      makeLoader(), prefs.read, prefs.write,
    );

    expect(position?.exact).toBe(false);
    expect(parseCleared(prefs.stored.get(questClearedKey('royal', '16')) ?? null)).toEqual(new Set());
  });
});

describe('clearDungeonPosition', () => {
  it('blanks the stored position', () => {
    const writePref = vi.fn();
    clearDungeonPosition(writePref);
    expect(writePref).toHaveBeenCalledWith(QUEST_POSITION_PREF_KEY, '');
  });

  it('survives the write throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => clearDungeonPosition(() => { throw new Error('nope'); })).not.toThrow();
    warn.mockRestore();
  });
});
