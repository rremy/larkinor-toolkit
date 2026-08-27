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
  enemySides: {},
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
    await activateDungeonPosition('Pihensz egy kicsit...', { sides: {}, enemySides: {}, question: false }, makeLoader(), prefs.read, prefs.write);

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

  // The active-quest pref never expires — the game just stops printing the line
  // — so it must not outrank the maze the player is provably in. This narration
  // is unique within quest 11 and within quest 38 and appears in no other royal
  // quest, so whichever of the two is searched first wins: with the stale active
  // quest in front (the old order) every such page was attributed to 38.
  it('searches the previous position\'s quest before a stale active quest', async () => {
    const SHARED_TRAP = 'Csapda! Egy kés-prés lepett meg. A csapda 3 életpontot sebzett rajtad!';
    const here = royal.find((q) => q.id === '11')!.cells.find((c) => c.narration === SHARED_TRAP)!;
    const prefs = makePrefs({
      [QUEST_SET_PREF_KEY]: 'royal',
      [ACTIVE_ROYAL_QUEST_PREF_KEY]: '38',
      [questSelectedKey('royal')]: '38',
      // Where the player was one dungeon page ago: quest 11, and within a chain
      // of dungeon pages the quest cannot change.
      [QUEST_POSITION_PREF_KEY]: serialiseQuestPosition({
        set: 'royal', questId: '11', cells: [{ row: here.row, col: here.col }],
        exact: true, source: 'narration',
      }),
    });

    const position = await activateDungeonPosition(
      SHARED_TRAP, { sides: {}, enemySides: {}, question: false },
      makeLoader(), prefs.read, prefs.write,
    );

    expect(position?.questId).toBe('11');
    expect(prefs.write).not.toHaveBeenCalledWith(questSelectedKey('royal'), '38');
  });

  // An ambiguous match is not evidence of which maze the player is in, so it
  // must not relocate the reader's tab — which is also what defuses a stale
  // active quest: it can no longer drag the selection to the wrong labyrinth.
  it('leaves the remembered quest alone when the match is ambiguous', async () => {
    // Quest 16's "Hopp, zsákutca. Akkor vissza." is shared by (7,7) and (8,7).
    const prefs = makePrefs({ [QUEST_SET_PREF_KEY]: 'royal', [questSelectedKey('royal')]: '12' });

    const position = await activateDungeonPosition(
      'Hopp, zsákutca. Akkor vissza.', { sides: {}, enemySides: {}, question: false },
      makeLoader(), prefs.read, prefs.write,
    );

    expect(position?.exact).toBe(false);
    expect(position?.questId).toBe('16');
    expect(prefs.write).not.toHaveBeenCalledWith(questSelectedKey('royal'), expect.anything());
    // The marker itself is still stored — it is honest about being tentative.
    expect(parseQuestPosition(prefs.stored.get(QUEST_POSITION_PREF_KEY)!)?.exact).toBe(false);
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

  /**
   * Monsters are read from the **neighbours**, because that is the only monster
   * evidence a dungeon page carries: the composed picture draws
   * `ellenfel_<side>.gif` in a neighbour's slot while that neighbour's creature
   * is alive, and nothing at all about the cell being stood on.
   *
   * The fixture is the live measurement of 2026-08-27 — royal quest 39, cell
   * (9,3), whose four neighbours all hold monsters in the data and which drew
   * silhouettes on exactly three sides. The fourth, east, was the vampire the
   * player had already killed.
   */
  it('marks a neighbour cleared when its silhouette is absent through an open side', async () => {
    const prefs = makePrefs({ [QUEST_SET_PREF_KEY]: 'royal', [questSelectedKey('royal')]: '39' });
    const here = royal.find((q) => q.id === '39')!.cells.find((c) => c.row === 9 && c.col === 3)!;

    const position = await activateDungeonPosition(
      here.narration,
      { sides: observed(here).sides, enemySides: { N: true, S: true, W: true }, question: false },
      makeLoader(), prefs.read, prefs.write,
    );

    expect(position?.cells).toEqual([{ row: 9, col: 3 }]);
    // Only the east neighbour, whose creature is gone. The three that still draw
    // one are alive, and (9,3) itself is not spoken for by this page at all.
    expect(parseCleared(prefs.stored.get(questClearedKey('royal', '39')) ?? null))
      .toEqual(new Set(['9,4']));
  });

  it('leaves every neighbour alone while all four silhouettes are drawn', async () => {
    const prefs = makePrefs({ [QUEST_SET_PREF_KEY]: 'royal', [questSelectedKey('royal')]: '39' });
    const here = royal.find((q) => q.id === '39')!.cells.find((c) => c.row === 9 && c.col === 3)!;

    await activateDungeonPosition(
      here.narration,
      { sides: observed(here).sides, enemySides: { N: true, E: true, S: true, W: true }, question: false },
      makeLoader(), prefs.read, prefs.write,
    );

    expect(parseCleared(prefs.stored.get(questClearedKey('royal', '39')) ?? null)).toEqual(new Set());
  });

  // Sight is limited to open sides: the game cannot draw what is behind a wall
  // or a closed door, so an absent silhouette there proves nothing.
  it('never reads through a wall or a door', async () => {
    const quest = royal.find((q) => q.id === '39')!;
    const walled = quest.cells.find((c) => {
      const blocked = (['N', 'E', 'S', 'W'] as const).filter((s) => c.edges[s].kind !== 'open');
      if (blocked.length === 0 || c.narration.trim() === '') return false;
      // …with a monster-bearing neighbour behind one of those blocked sides.
      const delta = { N: [-1, 0], E: [0, 1], S: [1, 0], W: [0, -1] } as const;
      return blocked.some((s) => {
        const n = quest.cells.find((o) => o.row === c.row + delta[s][0] && o.col === c.col + delta[s][1]);
        return n?.monsterId != null;
      });
    });
    if (!walled) return; // no such geometry in the corpus quest
    const prefs = makePrefs({ [QUEST_SET_PREF_KEY]: 'royal', [questSelectedKey('royal')]: '39' });

    await activateDungeonPosition(
      walled.narration,
      { sides: observed(walled).sides, enemySides: {}, question: false },
      makeLoader(), prefs.read, prefs.write,
    );

    const cleared = parseCleared(prefs.stored.get(questClearedKey('royal', '39')) ?? null);
    const delta = { N: [-1, 0], E: [0, 1], S: [1, 0], W: [0, -1] } as const;
    for (const side of ['N', 'E', 'S', 'W'] as const) {
      if (walled.edges[side].kind === 'open') continue;
      const n = quest.cells.find(
        (o) => o.row === walled.row + delta[side][0] && o.col === walled.col + delta[side][1],
      );
      if (n) expect(cleared.has(`${n.row},${n.col}`)).toBe(false);
    }
  });

  it('marks a trap cell cleared on arrival', async () => {
    const trapCell = quest35.cells.find((c) => c.trap && c.narration !== '');
    if (!trapCell) return; // the fixture quest has no narrated trap
    const prefs = makePrefs({ [QUEST_SET_PREF_KEY]: 'royal', [questSelectedKey('royal')]: '35' });

    await activateDungeonPosition(
      trapCell.narration, { sides: {}, enemySides: {}, question: false },
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

  // Same argument one tier down: an entrance inferred from the game's "you got
  // in" line is a class inference, not the page's account of this cell, so it
  // must not write permanent progress either — and a quest whose entrance holds
  // a monster would otherwise have it marked killed on arrival.
  it('clears nothing for a position inferred from the entrance', async () => {
    const withMonsterEntrance = royal.find((q) => {
      const e = q.cells.find((c) => c.portal === 'entrance');
      return e != null && (e.monsterId != null || e.trap || e.hasQuestion);
    });
    // Not every corpus has such a quest; fall back to any entrance, since the
    // assertion is that *nothing* is written either way.
    const quest = withMonsterEntrance ?? royal.find((q) => q.cells.some((c) => c.portal === 'entrance'))!;
    const entrance = quest.cells.find((c) => c.portal === 'entrance')!;

    const prefs = makePrefs({
      [QUEST_SET_PREF_KEY]: 'royal',
      [questSelectedKey('royal')]: quest.id,
    });

    const position = await activateDungeonPosition(
      'Sikerült bejutnod a labirintusba.',
      observed(entrance),
      makeLoader(), prefs.read, prefs.write,
    );

    expect(position).toEqual({
      set: 'royal',
      questId: quest.id,
      cells: [{ row: entrance.row, col: entrance.col }],
      exact: true,
      source: 'entrance',
    });
    expect(parseCleared(prefs.stored.get(questClearedKey('royal', quest.id)) ?? null)).toEqual(new Set());
  });

  /**
   * The page after a kill, as measured live: the game prints only
   * `"Továbbjöttél északra."` — it never reprints a cell's text — and no step is
   * pending, because the battle page came in between and no direction was
   * clicked since. The held position names the cell, and the neighbour that has
   * stopped drawing a silhouette is the one that was killed.
   */
  it('marks a neighbour cleared from a position held across a fight', async () => {
    const quest = royal.find((q) => q.id === '39')!;
    const here = quest.cells.find((c) => c.row === 9 && c.col === 3)!;

    const prefs = makePrefs({
      [QUEST_SET_PREF_KEY]: 'royal',
      [questSelectedKey('royal')]: '39',
      // Where the player was before the fight — the battle page no longer
      // clears this, which is what makes the kill attributable at all.
      [QUEST_POSITION_PREF_KEY]: serialiseQuestPosition({
        set: 'royal', questId: '39', cells: [{ row: 9, col: 3 }], exact: true, source: 'narration',
      }),
    });

    const position = await activateDungeonPosition(
      'Továbbjöttél északra.',                       // no cell text, no step
      { sides: observed(here).sides, enemySides: { N: true, S: true, W: true }, question: false },
      makeLoader(), prefs.read, prefs.write,
    );

    expect(position).toEqual({
      set: 'royal', questId: '39', cells: [{ row: 9, col: 3 }], exact: true, source: 'stay',
    });
    expect(parseCleared(prefs.stored.get(questClearedKey('royal', '39')) ?? null))
      .toEqual(new Set(['9,4']));
  });

  /**
   * Arriving by a step the page confirms (`"Továbbjöttél nyugatra."`, naming the
   * direction clicked) is trustworthy enough to write from — the live walk of
   * 2026-08-27, (9,4) → (9,3).
   */
  it('marks a neighbour cleared after a step the page confirms', async () => {
    const quest = royal.find((q) => q.id === '39')!;
    const to = quest.cells.find((c) => c.row === 9 && c.col === 3)!;

    const prefs = makePrefs({
      [QUEST_SET_PREF_KEY]: 'royal',
      [questSelectedKey('royal')]: '39',
      [QUEST_POSITION_PREF_KEY]: serialiseQuestPosition({
        set: 'royal', questId: '39', cells: [{ row: 9, col: 4 }], exact: true, source: 'narration',
      }),
      [QUEST_MOVE_PREF_KEY]: 'W',
    });

    const position = await activateDungeonPosition(
      'Továbbjöttél nyugatra.',
      { sides: observed(to).sides, enemySides: { N: true, S: true, W: true }, question: false },
      makeLoader(), prefs.read, prefs.write,
    );

    expect(position?.cells).toEqual([{ row: 9, col: 3 }]);
    expect(parseCleared(prefs.stored.get(questClearedKey('royal', '39')) ?? null))
      .toEqual(new Set(['9,4']));
  });

  /**
   * The refused move the gate exists for: a direction was clicked, the game did
   * not let the player through, and the page never confirms the step. The
   * predicted cell may be wrong, so none of its neighbours may be marked.
   */
  it('marks nothing when a step was clicked but the page never confirms it', async () => {
    const quest = royal.find((q) => q.id === '39')!;
    const to = quest.cells.find((c) => c.row === 9 && c.col === 3)!;

    const prefs = makePrefs({
      [QUEST_SET_PREF_KEY]: 'royal',
      [questSelectedKey('royal')]: '39',
      [QUEST_POSITION_PREF_KEY]: serialiseQuestPosition({
        set: 'royal', questId: '39', cells: [{ row: 9, col: 4 }], exact: true, source: 'narration',
      }),
      [QUEST_MOVE_PREF_KEY]: 'W',
    });

    await activateDungeonPosition(
      'Az ajtó zárva van.',
      { sides: observed(to).sides, enemySides: { N: true, S: true, W: true }, question: false },
      makeLoader(), prefs.read, prefs.write,
    );

    expect(parseCleared(prefs.stored.get(questClearedKey('royal', '39')) ?? null)).toEqual(new Set());
  });

  it('clears nothing when the position is ambiguous', async () => {
    // Quest 16's narration "Hopp, zsákutca. Akkor vissza." is shared by two
    // cells, (7,7) and (8,7) — verified unique to this quest in the corpus —
    // so no single cell can be credited with the clearing.
    const prefs = makePrefs({ [QUEST_SET_PREF_KEY]: 'royal' });

    const position = await activateDungeonPosition(
      'Hopp, zsákutca. Akkor vissza.', { sides: {}, enemySides: {}, question: false },
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
