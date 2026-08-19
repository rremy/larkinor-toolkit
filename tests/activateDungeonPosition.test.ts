import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { activateDungeonPosition, clearDungeonPosition } from '../src/utils/activateDungeonPosition';
import { QUEST_POSITION_PREF_KEY, QUEST_SET_PREF_KEY, questSelectedKey } from '@/shared/prefKeys';
import { parseQuestPosition } from '@/shared/questPosition';
import type { SideObservations } from '../src/utils/dungeonPosition';
import type { DataLoader, Quest } from '@/shared/data';

const royal: Quest[] = JSON.parse(readFileSync('static/db/quests.json', 'utf-8'));
const tavern: Quest[] = JSON.parse(readFileSync('static/db/tavern-quests.json', 'utf-8'));

/** The live capture: royal quest 35, cell (0,6), reached by resting. */
const RESTED_AT_0_6 = `Pihensz egy kicsit...
Regenerálódott némi életpontod!
${royal.find((q) => q.id === '35')!.cells.find((c) => c.row === 0 && c.col === 6)!.narration}`;

const OBSERVED_AT_0_6: SideObservations = { N: 'wall', E: 'wall', S: 'open', W: 'open' };

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
      RESTED_AT_0_6, OBSERVED_AT_0_6, makeLoader(), prefs.read, prefs.write,
    );

    expect(position).toEqual({ set: 'royal', questId: '35', cells: [{ row: 0, col: 6 }], exact: true });
    expect(parseQuestPosition(prefs.stored.get(QUEST_POSITION_PREF_KEY)!)).toEqual(position);
  });

  // The store going stale is the normal way this breaks: the player walks into a
  // labyrinth without opening the quests tab first.
  it('corrects a stale remembered quest and stores the new selection', async () => {
    const prefs = makePrefs({ [QUEST_SET_PREF_KEY]: 'royal', [questSelectedKey('royal')]: '34' });
    const position = await activateDungeonPosition(
      RESTED_AT_0_6, OBSERVED_AT_0_6, makeLoader(), prefs.read, prefs.write,
    );

    expect(position?.questId).toBe('35');
    expect(prefs.write).toHaveBeenCalledWith(questSelectedKey('royal'), '35');
  });

  it('defaults to the royal set when nothing is remembered', async () => {
    const prefs = makePrefs();
    const loadTavernQuests = vi.fn(async () => tavern);
    const position = await activateDungeonPosition(
      RESTED_AT_0_6, OBSERVED_AT_0_6, makeLoader({ loadTavernQuests }), prefs.read, prefs.write,
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
      RESTED_AT_0_6, OBSERVED_AT_0_6, makeLoader({ loadQuests }), prefs.read, prefs.write,
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
      'Pihensz egy kicsit...', OBSERVED_AT_0_6, makeLoader(), prefs.read, prefs.write,
    );

    expect(position).toBeNull();
    expect(prefs.write).toHaveBeenCalledWith(QUEST_POSITION_PREF_KEY, '');
    expect(parseQuestPosition(prefs.stored.get(QUEST_POSITION_PREF_KEY)!)).toBeNull();
  });

  // A stale selection must not be moved on a miss — the player may simply be
  // standing on an unnarrated cell of the quest they were reading.
  it('leaves the remembered quest alone when nothing matches', async () => {
    const prefs = makePrefs({ [QUEST_SET_PREF_KEY]: 'royal', [questSelectedKey('royal')]: '35' });
    await activateDungeonPosition('Pihensz egy kicsit...', {}, makeLoader(), prefs.read, prefs.write);

    expect(prefs.write).not.toHaveBeenCalledWith(questSelectedKey('royal'), expect.anything());
  });

  it('survives the quest data being unavailable', async () => {
    const prefs = makePrefs();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loader = makeLoader({ loadQuests: async () => { throw new Error('offline'); } });

    await expect(
      activateDungeonPosition(RESTED_AT_0_6, OBSERVED_AT_0_6, loader, prefs.read, prefs.write),
    ).resolves.toBeNull();
    expect(prefs.write).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('survives a pref write throwing, and still reports the position', async () => {
    const prefs = makePrefs({ [QUEST_SET_PREF_KEY]: 'royal', [questSelectedKey('royal')]: '35' });
    prefs.write.mockImplementation(() => { throw new Error('storage full'); });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const position = await activateDungeonPosition(
      RESTED_AT_0_6, OBSERVED_AT_0_6, makeLoader(), prefs.read, prefs.write,
    );

    expect(position?.questId).toBe('35');
    warn.mockRestore();
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
