import { describe, it, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { armDungeonMoveTracking, takePendingMove } from '../src/utils/trackDungeonMove';
import { QUEST_MOVE_PREF_KEY } from '@/shared/prefKeys';

function makePrefs(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    read: (key: string) => store.get(key) ?? null,
    write: vi.fn((key: string, value: string) => { store.set(key, value); }),
    stored: store,
  };
}

function dungeonDoc(): Document {
  return new JSDOM(`<html><body><form name="urlap">
    <input type="hidden" name="oldalTipus" value="otLabirintus">
    <input type="image" src="/pic/eszak.gif" title="Észak">
    <input type="image" src="/pic/del.gif" title="Dél">
    <input type="image" src="/pic/ok.gif">
  </form></body></html>`).window.document;
}

describe('trackDungeonMove', () => {
  it('records the side of the control that was clicked', () => {
    const doc = dungeonDoc();
    const prefs = makePrefs();
    armDungeonMoveTracking(doc, prefs.write);

    doc.querySelector<HTMLInputElement>('input[src*="eszak"]')!.click();
    expect(prefs.stored.get(QUEST_MOVE_PREF_KEY)).toBe('N');
  });

  // Every movement path in the toolkit ends in a .click() on the game's own
  // control — mobile's NavPad, the desktop shortcuts, and the player's own
  // click — so listening there catches all of them.
  it('records the last click when several happen', () => {
    const doc = dungeonDoc();
    const prefs = makePrefs();
    armDungeonMoveTracking(doc, prefs.write);

    doc.querySelector<HTMLInputElement>('input[src*="eszak"]')!.click();
    doc.querySelector<HTMLInputElement>('input[src*="del"]')!.click();
    expect(prefs.stored.get(QUEST_MOVE_PREF_KEY)).toBe('S');
  });

  it('ignores controls that are not directions', () => {
    const doc = dungeonDoc();
    const prefs = makePrefs();
    armDungeonMoveTracking(doc, prefs.write);

    doc.querySelector<HTMLInputElement>('input[src*="ok"]')!.click();
    expect(prefs.write).not.toHaveBeenCalled();
  });

  it('reads a pending move once and clears it', () => {
    const prefs = makePrefs({ [QUEST_MOVE_PREF_KEY]: 'W' });
    expect(takePendingMove(prefs.read, prefs.write)).toBe('W');
    expect(prefs.stored.get(QUEST_MOVE_PREF_KEY)).toBe('');
    expect(takePendingMove(prefs.read, prefs.write)).toBeNull();
  });

  it('rejects a stored value that is not a side', () => {
    const prefs = makePrefs({ [QUEST_MOVE_PREF_KEY]: 'up' });
    expect(takePendingMove(prefs.read, prefs.write)).toBeNull();
  });

  it('survives a throwing store', () => {
    const doc = dungeonDoc();
    armDungeonMoveTracking(doc, () => { throw new Error('quota'); });
    expect(() => doc.querySelector<HTMLInputElement>('input[src*="eszak"]')!.click()).not.toThrow();
  });

  // Capture phase is load-bearing: the game's own inline handler submits the
  // form and navigates away on the bubble phase, so a bubble-phase listener
  // would lose the step on every real move. None of the tests above, which
  // only assert what got stored, can tell a capture listener from a bubble
  // one — this asserts the registration itself.
  it('registers the click listener in the capture phase', () => {
    const doc = dungeonDoc();
    const input = doc.querySelector<HTMLInputElement>('input[src*="eszak"]')!;
    const addEventListener = vi.spyOn(input, 'addEventListener');

    armDungeonMoveTracking(doc, vi.fn());

    expect(addEventListener).toHaveBeenCalledWith('click', expect.any(Function), true);
  });
});
