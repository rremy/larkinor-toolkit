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

  it('returns Shop for oldalTipus=otVegyesbolt', () => {
    expect(detectPage(makeDoc('otVegyesbolt'))).toBe(PageType.Shop);
  });

  it('returns Shop for oldalTipus=otFegyverbolt', () => {
    expect(detectPage(makeDoc('otFegyverbolt'))).toBe(PageType.Shop);
  });

  it('returns Shop for oldalTipus=otPiac', () => {
    expect(detectPage(makeDoc('otPiac'))).toBe(PageType.Shop);
  });

  it('returns Unknown and warns for an unrecognised value (e.g. otKocsma)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(detectPage(makeDoc('otKocsma'))).toBe(PageType.Unknown);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('returns Unknown without throwing when the oldalTipus field is missing', () => {
    const doc = makeDoc(undefined);
    expect(() => detectPage(doc)).not.toThrow();
    expect(detectPage(doc)).toBe(PageType.Unknown);
  });
});
