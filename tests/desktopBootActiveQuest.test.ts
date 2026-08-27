import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { bootDesktop } from '../src/desktop/boot';
import { ACTIVE_ROYAL_QUEST_PREF_KEY, QUEST_POSITION_PREF_KEY, QUEST_SET_PREF_KEY, questSelectedKey } from '../src/shared/prefKeys';

const GAME_URL = 'https://l2.larkinor.hu/cgi-bin/larkinor';

/** A free-move page whose narration names the active royal quest. */
function cityDoc(): Document {
  return new JSDOM(`<html><body>
    <form name="urlap"><input type="hidden" name="oldalTipus" value="otVilag"></form>
    <div id="mydiv"><input type="text"></div>
    <font face="Comic sans MS">Sétálsz a városban.<br>Aktuális küldetés: (39)</font>
  </body></html>`, { url: GAME_URL }).window.document;
}

/**
 * Fresh GM storage per test. Hoisted to module scope rather than living in one
 * describe's `beforeEach`: a later describe without it inherits the previous
 * test's spy calls, which is exactly how the battle-page test below first
 * "failed" against correct code and its sibling first passed for the wrong
 * reason.
 */
function mockGmStore(): void {
  vi.clearAllMocks();
  const store = new Map<string, string>();
  vi.mocked(GM_getValue).mockImplementation(((key: string, fallback: string) =>
    store.get(key) ?? fallback) as unknown as typeof GM_getValue);
  vi.mocked(GM_setValue).mockImplementation(((key: string, value: string) => {
    store.set(key, value);
  }) as unknown as typeof GM_setValue);
  vi.mocked(GM_xmlhttpRequest).mockImplementation(((opts: {
    onload?: (res: { status: number; responseText: string }) => void;
  }) => opts.onload?.({ status: 200, responseText: '[]' })) as unknown as typeof GM_xmlhttpRequest);
}

describe('bootDesktop and the active royal quest', () => {
  beforeEach(mockGmStore);
  it('stores the active quest and links the phrase', () => {
    const doc = cityDoc();
    bootDesktop(doc);

    expect(GM_setValue).toHaveBeenCalledWith(ACTIVE_ROYAL_QUEST_PREF_KEY, '39');
    expect(GM_setValue).toHaveBeenCalledWith(questSelectedKey('royal'), '39');
    expect(GM_setValue).not.toHaveBeenCalledWith(QUEST_SET_PREF_KEY, expect.anything());
    expect(doc.querySelector('.lc-active-quest')?.textContent).toBe('Aktuális küldetés: (39)');
  });

  it('leaves a page without the line untouched', () => {
    const doc = new JSDOM(`<html><body>
      <form name="urlap"><input type="hidden" name="oldalTipus" value="otVilag"></form>
      <font face="Comic sans MS">Pihensz egy kicsit...</font>
    </body></html>`, { url: GAME_URL }).window.document;
    bootDesktop(doc);

    expect(doc.querySelector('.lc-active-quest')).toBeNull();
    expect(GM_setValue).not.toHaveBeenCalledWith(ACTIVE_ROYAL_QUEST_PREF_KEY, expect.anything());
  });
});

/**
 * A battle happens *in* the labyrinth cell the player is standing in, so the
 * battle page is the one non-dungeon page that must not forget the position —
 * clearing there broke the chain across every fight, which is exactly when a
 * monster stops being alive and its tile becomes clearable.
 */
describe('bootDesktop and the position across a fight', () => {
  beforeEach(mockGmStore);

  const battleDoc = () => new JSDOM(`<html><body>
    <form name="urlap"><input type="hidden" name="oldalTipus" value="otHarc"></form>
    <div id="mydiv"><input type="text"></div>
    <img title="életpontja: 40" src="/pic/szornyk/vampir_k.gif">
    <font face="Comic sans MS">Megtámadtad a szörnyet.</font>
  </body></html>`, { url: GAME_URL }).window.document;

  it('keeps the stored position on a battle page', () => {
    bootDesktop(battleDoc());
    expect(GM_setValue).not.toHaveBeenCalledWith(QUEST_POSITION_PREF_KEY, '');
  });

  it('still forgets it on an ordinary page', () => {
    bootDesktop(cityDoc());
    expect(GM_setValue).toHaveBeenCalledWith(QUEST_POSITION_PREF_KEY, '');
  });
});
