import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { bootMobile } from '../src/mobile/boot';
import { ENABLED_HOTKEYS_KEY } from '../src/utils/config';
import { LOADOUT_PREF_KEY, parseLoadout } from '../src/shared/loadout';

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

  it('takes over the market page', () => {
    const doc = new JSDOM(`<html><head></head><body>
      <form name="urlap"><input type="hidden" name="oldalTipus" value="otPiac"></form>
      <form name="eladasUrlap">
        <select name="hatizsak"><option value="30">19 jáspis</option></select>
        <input type="text" name="mennyiseg" value="1"><input type="text" name="ar" value="1">
        <select name="felkinalt"></select>
      </form>
      <form name="vetelUrlap"><select name="melyik"><option value="37">jáspis (170%)</option></select></form>
      <script>hatizsakTargyak[0] = "Név: jáspis\\nSúly: 0.04 kg.\\nÁr: 50 ezüst\\nMennyiség: 19\\n";</script>
    </body></html>`).window.document;

    bootMobile(doc);

    expect(doc.getElementById('lc-offscreen')).not.toBeNull();
    expect(doc.querySelector('#lc-root .lc-mkt-row')).not.toBeNull();
  });

  it('captures the loadout on the character page and renders nothing there', () => {
    const doc = new JSDOM(`<html><head></head><body>
      <form name="urlap"><input type="hidden" name="oldalTipus" value="otPlayerSettings"></form>
      <table><tr><td>Név: Remy Szint: 23</td></tr>
      <tr><td>Fej: <b><a href="#" onclick="alert('Típus: vért\\nNév: ent sisak\\nMin. szint: 20\\nVédelem: 16\\nFajta: fejre\\n');return false;">ent sisak</a></b><br>Terhelés: <b>1kg. / 2kg.</b></td></tr></table>
    </body></html>`).window.document;

    bootMobile(doc);

    // The loadout was captured...
    const stored = vi.mocked(GM_setValue).mock.calls.find(([key]) => key === LOADOUT_PREF_KEY);
    expect(stored).toBeDefined();
    expect(parseLoadout(stored![1] as string)!.slots.head!.name).toBe('ent sisak');
    // ...and the page itself was left completely alone.
    expect(doc.getElementById('lc-root')).toBeNull();
    expect(doc.getElementById('lc-offscreen')).toBeNull();
  });
});
