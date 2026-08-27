import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { bootMobile } from '../src/mobile/boot';
import { QUEST_MOVE_PREF_KEY, QUEST_POSITION_PREF_KEY } from '../src/shared/prefKeys';

const GAME_URL = 'https://l2.larkinor.hu/cgi-bin/larkinor';

/** A dungeon page carrying the game's own direction control. */
function dungeonDoc(): Document {
  return new JSDOM(`<html><body><form name="urlap">
    <input type="hidden" name="oldalTipus" value="otLabirintus">
    <input type="image" src="/pic/eszak.gif" title="Észak">
  </form></body></html>`, { url: GAME_URL }).window.document;
}

/** A page mobile does render, but is not a dungeon — no maze position to hold. */
function cityDoc(): Document {
  return new JSDOM(`<html><body>
    <form name="urlap"><input type="hidden" name="oldalTipus" value="otVilag"></form>
  </body></html>`, { url: GAME_URL }).window.document;
}

describe('bootMobile and the dungeon step tracker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // GM storage is mocked in tests/setup.ts; back it with a fresh map per test.
    const store = new Map<string, string>();
    vi.mocked(GM_getValue).mockImplementation(((key: string, fallback: string) =>
      store.get(key) ?? fallback) as unknown as typeof GM_getValue);
    vi.mocked(GM_setValue).mockImplementation(((key: string, value: string) => {
      store.set(key, value);
    }) as unknown as typeof GM_setValue);
    vi.mocked(GM_xmlhttpRequest).mockImplementation(((opts: {
      onload?: (res: { status: number; responseText: string }) => void;
    }) => opts.onload?.({ status: 200, responseText: '[]' })) as unknown as typeof GM_xmlhttpRequest);
  });

  // The property the whole feature rests on: `armDungeonMoveTracking` must run
  // synchronously, before the async `activateDungeonPosition` call. Clicking a
  // direction control immediately after `bootMobile` returns — with no `await`
  // and no flushed microtask in between — is what actually proves that: if the
  // arming happened only after the quest data promise resolved, this click
  // would land before the listener existed and the pref would stay unwritten.
  it('arms the move listener before the async position detection resolves', () => {
    const doc = dungeonDoc();
    bootMobile(doc);

    doc.querySelector<HTMLInputElement>('input[src*="eszak"]')!.click();

    expect(GM_setValue).toHaveBeenCalledWith(QUEST_MOVE_PREF_KEY, 'N');
  });

  it('clears the stored position on a page that is not a dungeon', () => {
    const doc = cityDoc();
    bootMobile(doc);

    expect(GM_setValue).toHaveBeenCalledWith(QUEST_POSITION_PREF_KEY, '');
  });
});
