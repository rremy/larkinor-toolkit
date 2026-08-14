import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { activateQuestOffer } from '../src/utils/activateQuestOffer';
import { QUEST_SET_PREF_KEY, questSelectedKey } from '@/shared/prefKeys';
import type { DataLoader, Quest } from '@/shared/data';

const quests: Quest[] = JSON.parse(readFileSync('static/db/tavern-quests.json', 'utf-8'));

const ZURKHAS_NOTE = `A papíron egy térkép van és a következő szöveget olvasod:
${quests.find((q) => q.id === 'Zurkhas')!.description}
Miután elolvastad a szöveget az idegen felé fordulsz, de már nem találod a kocsmában.`;

const PLAIN_DRINK = 'Csókos Zotan kitölt neked egy korsó import sört. Fizetsz, majd felhajtod...';

function makeLoader(overrides: Partial<DataLoader> = {}): DataLoader {
  return {
    loadTavernQuests: async () => quests,
    loadQuests: async () => [],
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

describe('activateQuestOffer', () => {
  it('stores the set and the quest when a pub note is recognised', async () => {
    const writePref = vi.fn();
    const match = await activateQuestOffer(ZURKHAS_NOTE, makeLoader(), writePref);

    expect(match?.quest.id).toBe('Zurkhas');
    expect(writePref).toHaveBeenCalledWith(QUEST_SET_PREF_KEY, 'tavern');
    expect(writePref).toHaveBeenCalledWith(questSelectedKey('tavern'), 'Zurkhas');
  });

  // The important negative: wandering into the pub for a drink must not
  // clobber whichever quest the player was last reading.
  it('writes nothing when the narration offers no quest', async () => {
    const writePref = vi.fn();
    const match = await activateQuestOffer(PLAIN_DRINK, makeLoader(), writePref);

    expect(match).toBeNull();
    expect(writePref).not.toHaveBeenCalled();
  });

  it('writes nothing for empty narration, and does not fetch', async () => {
    const writePref = vi.fn();
    const loadTavernQuests = vi.fn(async () => quests);
    const match = await activateQuestOffer('   ', makeLoader({ loadTavernQuests }), writePref);

    expect(match).toBeNull();
    expect(writePref).not.toHaveBeenCalled();
    expect(loadTavernQuests).not.toHaveBeenCalled();
  });

  // A missing or broken data file is a missed convenience, not a broken page.
  it('degrades quietly when the tavern data cannot be loaded', async () => {
    const writePref = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loader = makeLoader({ loadTavernQuests: async () => { throw new Error('offline'); } });

    await expect(activateQuestOffer(ZURKHAS_NOTE, loader, writePref)).resolves.toBeNull();
    expect(writePref).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  // The note is still worth showing even if persistence failed, so a throwing
  // writer must not lose the match.
  it('still reports the match when storing the selection throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const writePref = vi.fn(() => { throw new Error('storage full'); });

    const match = await activateQuestOffer(ZURKHAS_NOTE, makeLoader(), writePref);

    expect(match?.quest.id).toBe('Zurkhas');
    warn.mockRestore();
  });

  it('fetches only the tavern set, never the royal one', async () => {
    const loadQuests = vi.fn(async () => []);
    await activateQuestOffer(ZURKHAS_NOTE, makeLoader({ loadQuests }), vi.fn());
    expect(loadQuests).not.toHaveBeenCalled();
  });
});
