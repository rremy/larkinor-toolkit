import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { bootMobile } from '../src/mobile/boot';
import { ACTIVE_ROYAL_QUEST_PREF_KEY, QUEST_SET_PREF_KEY, questSelectedKey } from '../src/shared/prefKeys';

const GAME_URL = 'https://l2.larkinor.hu/cgi-bin/larkinor';

/** A free-move page whose narration names the active royal quest. */
function cityDoc(): Document {
  return new JSDOM(`<html><body>
    <form name="urlap"><input type="hidden" name="oldalTipus" value="otVilag"></form>
    <div id="mydiv"><input type="text"></div>
    <font face="Comic sans MS">Sétálsz a városban.<br>Aktuális küldetés: (39)</font>
  </body></html>`, { url: GAME_URL }).window.document;
}

describe('bootMobile and the active royal quest', () => {
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

  it('stores the active quest named in the narration', () => {
    const doc = cityDoc();
    bootMobile(doc);

    expect(GM_setValue).toHaveBeenCalledWith(ACTIVE_ROYAL_QUEST_PREF_KEY, '39');
    expect(GM_setValue).toHaveBeenCalledWith(questSelectedKey('royal'), '39');
    expect(GM_setValue).not.toHaveBeenCalledWith(QUEST_SET_PREF_KEY, expect.anything());
  });

  it('leaves a page without the line untouched', () => {
    const doc = new JSDOM(`<html><body>
      <form name="urlap"><input type="hidden" name="oldalTipus" value="otVilag"></form>
      <font face="Comic sans MS">Pihensz egy kicsit...</font>
    </body></html>`, { url: GAME_URL }).window.document;
    bootMobile(doc);

    expect(GM_setValue).not.toHaveBeenCalledWith(ACTIVE_ROYAL_QUEST_PREF_KEY, expect.anything());
  });
});
