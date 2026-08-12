import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { bootDesktop } from '../src/desktop/boot';
import { DOCK_COLLAPSED_KEY, ENABLED_HOTKEYS_KEY } from '../src/utils/config';

function gameDoc(oldalTipus: string, extraHtml = ''): Document {
  return new JSDOM(`<html><body>
    <form name="urlap"><input type="hidden" name="oldalTipus" value="${oldalTipus}"></form>
    <div id="game-content">original</div>
    ${extraHtml}
  </body></html>`).window.document;
}

describe('bootDesktop', () => {
  beforeEach(() => {
    GM_setValue(DOCK_COLLAPSED_KEY, '');
    GM_setValue(ENABLED_HOTKEYS_KEY, '[]');
    vi.mocked(GM_xmlhttpRequest).mockReset();
  });

  it('leaves the original game DOM in place', () => {
    const doc = gameDoc('otVilag');
    bootDesktop(doc);

    expect(doc.getElementById('lc-offscreen')).toBeNull();
    expect(doc.getElementById('game-content')).not.toBeNull();
    expect(doc.getElementById('game-content')!.parentElement).toBe(doc.body);
  });

  it('does not inject a viewport meta on desktop', () => {
    const doc = gameDoc('otVilag');
    bootDesktop(doc);
    expect(doc.querySelector('meta[name="viewport"]')).toBeNull();
  });

  it('never inserts the dock into the game layout, only appends to body', () => {
    // The game's layout is absolutely positioned: a block spliced into it
    // displaces nothing and overlaps everything, dragging the visible column
    // off-screen. The dock must stay a sibling of the layout, not part of it.
    const doc = gameDoc('otVilag', '<div id="wrap"><div id="before">x</div><div id="mydiv">chat</div></div>');
    const wrap = doc.getElementById('wrap')!;
    const chat = doc.getElementById('mydiv')!;

    bootDesktop(doc);

    expect(doc.getElementById('lc-dock-root')!.parentElement).toBe(doc.body);
    // The chat is the same element instance, in the same place, with the same
    // siblings in the same order.
    expect(doc.getElementById('mydiv')).toBe(chat);
    expect(chat.parentElement).toBe(wrap);
    expect(Array.from(wrap.children).map(el => el.id)).toEqual(['before', 'mydiv']);
  });

  it('aligns the dock to the game column via custom properties', () => {
    const doc = gameDoc('otVilag', '<div id="mydiv">chat</div>');
    bootDesktop(doc);

    // jsdom reports zero-size rects, so this exercises the fallback: a centred
    // column of the expected width, which is always on-screen.
    const root = doc.getElementById('lc-dock-root')!;
    expect(root.style.getPropertyValue('--lc-dock-width')).toBe('633px');
    expect(root.style.getPropertyValue('--lc-dock-left')).toMatch(/^\d+px$/);
  });

  it('aligns to the measured chat column when rects are available', () => {
    const doc = gameDoc('otVilag', '<div id="mydiv">chat</div>');
    const chat = doc.getElementById('mydiv')!;
    // Stand in for a real layout engine: a 633px column starting at x=120.
    chat.getBoundingClientRect = () => ({ width: 633, left: 120 }) as DOMRect;

    bootDesktop(doc);

    const root = doc.getElementById('lc-dock-root')!;
    expect(root.style.getPropertyValue('--lc-dock-width')).toBe('633px');
    expect(root.style.getPropertyValue('--lc-dock-left')).toBe('120px');
  });

  it('still mounts the dock when there is no chat to align to', () => {
    const doc = gameDoc('otVilag');
    bootDesktop(doc);

    const root = doc.getElementById('lc-dock-root')!;
    expect(root.parentElement).toBe(doc.body);
    expect(root.querySelector('.lc-dock')).not.toBeNull();
    expect(root.style.getPropertyValue('--lc-dock-width')).toBe('633px');
  });

  it('mounts the dock into a fixed dock root', () => {
    const doc = gameDoc('otVilag');
    bootDesktop(doc);

    const root = doc.getElementById('lc-dock-root');
    expect(root).not.toBeNull();
    expect(root!.querySelector('.lc-dock')).not.toBeNull();
  });

  it('injects the shared theme and the dock styles', () => {
    const doc = gameDoc('otVilag');
    bootDesktop(doc);
    expect(GM_addStyle).toHaveBeenCalled();
  });

  it('renders the full dock on the free-move page', () => {
    const doc = gameDoc('otVilag', `
      <form name="specTevUrlap">
        <select name="tevFajta"><option value="kajal">kajálsz</option></select>
        <input type="image" src="/ikon/ok.gif">
      </form>
    `);
    bootDesktop(doc);

    const labels = Array.from(doc.querySelectorAll('#lc-dock-root .lc-dock-btn')).map(b => b.textContent);
    expect(labels).toContain('kajálsz');
  });

  it('renders the minimal dock on a page type we do not extract', () => {
    const doc = gameDoc('otVegyesbolt');
    bootDesktop(doc);

    expect(doc.querySelector('#lc-dock-root .lc-dock-db')).not.toBeNull();
    expect(doc.querySelector('#lc-dock-root .lc-hotkey')).toBeNull();
  });

  it('renders the minimal dock on an unrecognised page instead of skipping', () => {
    const doc = gameDoc('otValamiUj');
    bootDesktop(doc);

    expect(doc.querySelector('#lc-dock-root .lc-dock-db')).not.toBeNull();
  });

  it('survives a monster-db fetch failure with a working dock', async () => {
    // gmSource rejects when GM_xmlhttpRequest reports an error; it ignores the
    // error argument, so the mock's exact payload shape does not matter here.
    vi.mocked(GM_xmlhttpRequest).mockImplementation(((opts: { onerror?: (e: unknown) => void }) => {
      opts.onerror?.(new Error('network down'));
    }) as unknown as typeof GM_xmlhttpRequest);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const doc = gameDoc('otVilag');
    bootDesktop(doc);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(doc.querySelector('#lc-dock-root .lc-dock')).not.toBeNull();
    warn.mockRestore();
  });

  it('survives a style-injection failure, leaving the game DOM untouched', () => {
    const addStyle = vi.mocked(GM_addStyle).mockImplementation(() => {
      throw new Error('CSP blocked GM_addStyle');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const doc = gameDoc('otVilag');
    expect(() => bootDesktop(doc)).not.toThrow();

    expect(doc.getElementById('game-content')!.parentElement).toBe(doc.body);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[Larkinor UI]'), expect.anything());

    addStyle.mockReset();
    warn.mockRestore();
  });
});
