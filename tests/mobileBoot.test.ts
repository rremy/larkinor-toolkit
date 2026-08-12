import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { bootMobile } from '../src/mobile/boot';
import { ENABLED_HOTKEYS_KEY } from '../src/utils/config';

function gameDoc(oldalTipus: string): Document {
  return new JSDOM(`<html><head></head><body>
    <form name="urlap"><input type="hidden" name="oldalTipus" value="${oldalTipus}"></form>
    <div id="game-content">original</div>
  </body></html>`).window.document;
}

describe('bootMobile', () => {
  beforeEach(() => {
    GM_setValue(ENABLED_HOTKEYS_KEY, '[]');
    vi.mocked(GM_xmlhttpRequest).mockReset();
  });

  it('moves the original DOM off-screen and mounts the app root', () => {
    const doc = gameDoc('otVilag');
    bootMobile(doc);

    const offscreen = doc.getElementById('lc-offscreen');
    expect(offscreen).not.toBeNull();
    expect(offscreen!.querySelector('#game-content')).not.toBeNull();
    expect(doc.getElementById('lc-root')).not.toBeNull();
  });

  it('injects the mobile viewport meta', () => {
    const doc = gameDoc('otVilag');
    bootMobile(doc);

    const meta = doc.querySelector('meta[name="viewport"]');
    expect(meta?.getAttribute('content')).toContain('width=device-width');
  });

  it('leaves an unrecognised page completely untouched', () => {
    const doc = gameDoc('otValamiUj');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    bootMobile(doc);

    expect(doc.getElementById('lc-offscreen')).toBeNull();
    expect(doc.getElementById('lc-root')).toBeNull();
    expect(doc.getElementById('game-content')!.parentElement).toBe(doc.body);
    warn.mockRestore();
  });

  it('does not create a desktop dock root', () => {
    const doc = gameDoc('otVilag');
    bootMobile(doc);
    expect(doc.getElementById('lc-dock-root')).toBeNull();
  });
});
