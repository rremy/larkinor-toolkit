import { describe, it, expect, vi, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { detectPage, PageType } from '../src/utils/pageDetector';

// Sanitized reconstruction of the real page's shared form. Every Larkinor
// page carries <form name="urlap"> with a hidden oldalTipus field — that is
// the canonical page-type discriminator (see docs/superpowers/specs/
// 2026-07-06-larkinor-real-dom-reference.md). No real session token/login
// name is used here.
function makeDoc(oldalTipus?: string): Document {
  const hidden =
    oldalTipus !== undefined
      ? `<input type="hidden" name="oldalTipus" value="${oldalTipus}">`
      : '';
  return new JSDOM(
    `<html><body>
      <form name="urlap" method="post" action="https://l2.larkinor.hu/cgi-bin/larkinor">
        ${hidden}
        <input type="hidden" name="loginname" value="test">
        <input type="hidden" name="kulcs" value="TESTKEY">
      </form>
    </body></html>`
  ).window.document;
}

describe('detectPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns FreeMove for oldalTipus=otVilag', () => {
    expect(detectPage(makeDoc('otVilag'))).toBe(PageType.FreeMove);
  });

  it('returns Battle for oldalTipus=otHarc', () => {
    expect(detectPage(makeDoc('otHarc'))).toBe(PageType.Battle);
  });

  it('returns Church for oldalTipus=otTemplom', () => {
    expect(detectPage(makeDoc('otTemplom'))).toBe(PageType.Church);
  });

  it('returns Login for oldalTipus=otLogin', () => {
    expect(detectPage(makeDoc('otLogin'))).toBe(PageType.Login);
  });

  it('returns Dungeon for oldalTipus=otLabirintus', () => {
    expect(detectPage(makeDoc('otLabirintus'))).toBe(PageType.Dungeon);
  });

  it('returns Shop for oldalTipus=otVegyesbolt', () => {
    expect(detectPage(makeDoc('otVegyesbolt'))).toBe(PageType.Shop);
  });

  it('returns Shop for oldalTipus=otFegyverbolt', () => {
    expect(detectPage(makeDoc('otFegyverbolt'))).toBe(PageType.Shop);
  });

  it('returns Market for oldalTipus=otPiac, not Shop', () => {
    // The market trades player-to-player and has its own desktop panel, so it is
    // no longer lumped in with the vendor shops.
    expect(detectPage(makeDoc('otPiac'))).toBe(PageType.Market);
  });

  // The pub used to fall through to Unknown (and warn on every visit). It is
  // now a page type of its own, because its narration carries the tavern
  // quest briefs that pre-select a quest in the database.
  it('returns Tavern for oldalTipus=otKocsma', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(detectPage(makeDoc('otKocsma'))).toBe(PageType.Tavern);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('returns Unknown and warns for a genuinely unrecognised value', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(detectPage(makeDoc('otValamiUj'))).toBe(PageType.Unknown);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('returns Unknown without throwing when the oldalTipus field is missing', () => {
    const doc = makeDoc(undefined);
    expect(() => detectPage(doc)).not.toThrow();
    expect(detectPage(doc)).toBe(PageType.Unknown);
  });

  it('detects the home page from otSajathaz', () => {
    expect(detectPage(makeDoc('otSajathaz'))).toBe(PageType.Home);
  });

  it('detects the character page from otPlayerSettings', () => {
    expect(detectPage(makeDoc('otPlayerSettings'))).toBe(PageType.Character);
  });
});
