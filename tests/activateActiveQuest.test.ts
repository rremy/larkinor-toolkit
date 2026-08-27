import { describe, it, expect, vi } from 'vitest';
import { activateActiveQuest } from '../src/utils/activateActiveQuest';
import { ACTIVE_ROYAL_QUEST_PREF_KEY, QUEST_SET_PREF_KEY, questSelectedKey } from '@/shared/prefKeys';

function makePrefs(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    read: (key: string) => store.get(key) ?? null,
    write: vi.fn((key: string, value: string) => { store.set(key, value); }),
    stored: store,
  };
}

const NARRATION = 'Aktuális küldetés: (39)';

describe('activateActiveQuest', () => {
  it('remembers a newly seen active quest and pre-selects it', () => {
    const prefs = makePrefs();
    const hit = activateActiveQuest(NARRATION, prefs.read, prefs.write);

    expect(hit?.questId).toBe('39');
    expect(prefs.stored.get(ACTIVE_ROYAL_QUEST_PREF_KEY)).toBe('39');
    expect(prefs.stored.get(questSelectedKey('royal'))).toBe('39');
  });

  // The player opened quest 12 to read it; every step they take afterwards
  // prints the active-quest line again and must not drag them back to 39.
  it('leaves the selection alone when the active quest has not changed', () => {
    const prefs = makePrefs({
      [ACTIVE_ROYAL_QUEST_PREF_KEY]: '39',
      [questSelectedKey('royal')]: '12',
    });
    activateActiveQuest(NARRATION, prefs.read, prefs.write);

    expect(prefs.stored.get(questSelectedKey('royal'))).toBe('12');
  });

  // The line is printed by ordinary city pages, so switching the set here would
  // drag a player mid-way through a tavern quest back to royal on every step.
  it('never writes the quest set', () => {
    const prefs = makePrefs({ [QUEST_SET_PREF_KEY]: 'tavern' });
    activateActiveQuest(NARRATION, prefs.read, prefs.write);

    expect(prefs.write).not.toHaveBeenCalledWith(QUEST_SET_PREF_KEY, expect.anything());
    expect(prefs.stored.get(QUEST_SET_PREF_KEY)).toBe('tavern');
  });

  it('writes nothing and returns null when no line is present', () => {
    const prefs = makePrefs();
    expect(activateActiveQuest('Pihensz egy kicsit...', prefs.read, prefs.write)).toBeNull();
    expect(prefs.write).not.toHaveBeenCalled();
  });

  it('survives a throwing store and still reports the mention', () => {
    const hit = activateActiveQuest(NARRATION, () => null, () => { throw new Error('quota'); });
    expect(hit?.questId).toBe('39');
  });
});
