import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { bootDesktop } from '../src/desktop/boot';
import { DOCK_COLLAPSED_KEY, ENABLED_HOTKEYS_KEY } from '../src/utils/config';
import { QUEST_SET_PREF_KEY, questSelectedKey } from '../src/shared/prefKeys';
import { USERSCRIPT_DATA_BASE_URL } from '../src/shared/publicUrl';
import type { Quest } from '@/shared/data';

/**
 * `gmSource` caches responses in GM storage under `lc_cache:<url-without-query>`.
 * Derived from the same constant the boot uses rather than hardcoded: a guessed
 * key silently fails to clear, and a stale entry then satisfies a fetch the test
 * meant to fail.
 */
const TAVERN_CACHE_KEY = `lc_cache:${USERSCRIPT_DATA_BASE_URL}/tavern-quests.json`;

const quests: Quest[] = JSON.parse(readFileSync('static/db/tavern-quests.json', 'utf-8'));
const zurkhas = quests.find((q) => q.id === 'Zurkhas')!;

/**
 * JSDOM needs a real origin: without one the document is opaque and any
 * localStorage touch throws, which the live page never does.
 */
const GAME_URL = 'https://l2.larkinor.hu/cgi-bin/larkinor';

/**
 * A pub page carrying a quest note. `otKocsma` is the Kocsma's page type and
 * the narration lives in the game's `font[face="Comic sans MS"]` block, with
 * `<br>` line breaks — the shape `extractNarration` flattens.
 */
function pubDoc(narration: string): Document {
  return new JSDOM(`<html><body>
    <form name="urlap"><input type="hidden" name="oldalTipus" value="otKocsma"></form>
    <div id="game-content">
      <font face="Comic sans MS">Csókos Zotan kitölt neked egy korsó sört.<br>${narration}</font>
    </div>
  </body></html>`, { url: GAME_URL }).window.document;
}

/** Answer the userscript's data fetch with the committed tavern quests. */
function serveTavernQuests(): void {
  vi.mocked(GM_xmlhttpRequest).mockImplementation(((opts: {
    url: string;
    onload?: (res: { status: number; responseText: string }) => void;
  }) => {
    if (opts.url.includes('tavern-quests.json')) {
      opts.onload?.({ status: 200, responseText: JSON.stringify(quests) });
    } else {
      opts.onload?.({ status: 200, responseText: '[]' });
    }
  }) as unknown as typeof GM_xmlhttpRequest);
}

/** Let the boot's fire-and-forget promise chain settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('bootDesktop on the pub page', () => {
  beforeEach(() => {
    GM_setValue(DOCK_COLLAPSED_KEY, '');
    GM_setValue(ENABLED_HOTKEYS_KEY, '[]');
    GM_setValue(QUEST_SET_PREF_KEY, '');
    GM_setValue(questSelectedKey('tavern'), '');
    // Clear the GM response cache so each case really performs its fetch.
    GM_setValue(TAVERN_CACHE_KEY, '');
    GM_setValue(`${TAVERN_CACHE_KEY}:v`, '');
    vi.mocked(GM_xmlhttpRequest).mockReset();
    vi.mocked(GM_addStyle).mockClear();
  });

  it('recognises the quest, stores it, and offers a link to it', async () => {
    serveTavernQuests();
    const doc = pubDoc(zurkhas.description);

    bootDesktop(doc);
    await settle();

    expect(GM_getValue(QUEST_SET_PREF_KEY, '')).toBe('tavern');
    expect(GM_getValue(questSelectedKey('tavern'), '')).toBe('Zurkhas');

    const note = doc.querySelector('.lc-quest-offer-btn');
    expect(note).not.toBeNull();
    expect(note!.textContent).toContain('Zurkhas');
  });

  // The negative that protects the player's current selection: an ordinary
  // drink must change nothing.
  it('leaves the stored selection alone when no quest is offered', async () => {
    serveTavernQuests();
    GM_setValue(QUEST_SET_PREF_KEY, 'royal');
    GM_setValue(questSelectedKey('tavern'), 'GOMB');

    const doc = pubDoc('Ez jól esett, de semmilyen előnyre nem tettél szert.');
    bootDesktop(doc);
    await settle();

    expect(GM_getValue(QUEST_SET_PREF_KEY, '')).toBe('royal');
    expect(GM_getValue(questSelectedKey('tavern'), '')).toBe('GOMB');
    expect(doc.querySelector('.lc-quest-offer')).toBeNull();
  });

  // Every other page type must not pay the cost of loading the tavern data.
  it('does not touch the tavern data on a non-pub page', async () => {
    serveTavernQuests();
    const doc = new JSDOM(`<html><body>
      <form name="urlap"><input type="hidden" name="oldalTipus" value="otVilag"></form>
      <font face="Comic sans MS">${zurkhas.description}</font>
    </body></html>`, { url: GAME_URL }).window.document;

    bootDesktop(doc);
    await settle();

    const urls = vi.mocked(GM_xmlhttpRequest).mock.calls.map((c) => (c[0] as { url: string }).url);
    expect(urls.some((u) => u.includes('tavern-quests.json'))).toBe(false);
    expect(doc.querySelector('.lc-quest-offer')).toBeNull();
  });

  it('still renders the dock when the tavern data cannot be fetched', async () => {
    // gmSource rejects when GM_xmlhttpRequest reports an error; it ignores the
    // error argument, so the mock's exact payload shape does not matter here.
    vi.mocked(GM_xmlhttpRequest).mockImplementation(((opts: { onerror?: (e: unknown) => void }) => {
      opts.onerror?.(new Error('offline'));
    }) as unknown as typeof GM_xmlhttpRequest);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const doc = pubDoc(zurkhas.description);
    bootDesktop(doc);
    await settle();

    expect(doc.getElementById('lc-dock-root')).not.toBeNull();
    expect(doc.querySelector('.lc-quest-offer')).toBeNull();
    warn.mockRestore();
  });
});

describe('the quest-offer note opens the quest it names', () => {
  beforeEach(() => {
    GM_setValue(DOCK_COLLAPSED_KEY, '');
    GM_setValue(ENABLED_HOTKEYS_KEY, '[]');
    GM_setValue(TAVERN_CACHE_KEY, '');
    GM_setValue(`${TAVERN_CACHE_KEY}:v`, '');
    vi.mocked(GM_xmlhttpRequest).mockReset();
    vi.mocked(GM_addStyle).mockClear();
  });

  /**
   * The bug this pins: the note used to open the quests tab and rely on the
   * preferences it had just written. `QuestView` reads the stored set once at
   * mount and restores at most once per mount, so an overlay already open when
   * the match landed never saw them — the panel opened on the previously
   * selected set and quest instead. Here the stored preferences deliberately
   * point somewhere else, so anything that leans on them lands on the wrong
   * quest and fails.
   */
  it('routes to the named quest even when the stored preferences disagree', async () => {
    serveTavernQuests();
    GM_setValue(QUEST_SET_PREF_KEY, 'royal');
    GM_setValue(questSelectedKey('tavern'), 'GOMB');
    // Overlay already open, as it would be after a reload — this is the state
    // in which the old, preference-dependent path failed.
    GM_setValue('lc-db-open', 'true');
    GM_setValue('lc-db-route', '');

    const doc = pubDoc(zurkhas.description);
    bootDesktop(doc);
    await settle();

    const button = doc.querySelector<HTMLButtonElement>('.lc-quest-offer-btn');
    expect(button).not.toBeNull();
    button!.click();
    await settle();

    // The overlay's own route is the observable: it must name the tavern set
    // and this quest, not the stored royal/GOMB pair.
    const route = GM_getValue('lc-db-route', '');
    expect(route).toBe('quests/tavern/Zurkhas');
  });
});
