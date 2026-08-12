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

  it('places the dock in the page flow directly above the chat', () => {
    const doc = gameDoc('otVilag', '<div id="wrap"><div id="mydiv">chat</div></div>');
    bootDesktop(doc);

    const root = doc.getElementById('lc-dock-root')!;
    const chat = doc.getElementById('mydiv')!;

    expect(root.dataset.placement).toBe('inline');
    // Immediately before the chat, inside the chat's own parent.
    expect(chat.previousElementSibling).toBe(root);
    expect(root.parentElement).toBe(chat.parentElement);
  });

  it('adds the dock without moving, removing or reordering the chat', () => {
    const doc = gameDoc('otVilag', '<div id="wrap"><div id="before">x</div><div id="mydiv">chat</div></div>');
    const wrap = doc.getElementById('wrap')!;
    const chat = doc.getElementById('mydiv')!;

    bootDesktop(doc);

    // Same element instance, same parent, and the node that preceded the chat
    // is still ahead of it — we inserted a sibling and nothing else.
    expect(doc.getElementById('mydiv')).toBe(chat);
    expect(chat.parentElement).toBe(wrap);
    const ids = Array.from(wrap.children).map(el => el.id);
    expect(ids).toEqual(['before', 'lc-dock-root', 'mydiv']);
  });

  it('falls back to the floating corner panel when there is no chat', () => {
    const doc = gameDoc('otVilag');
    bootDesktop(doc);

    const root = doc.getElementById('lc-dock-root')!;
    expect(root.dataset.placement).toBe('floating');
    expect(root.parentElement).toBe(doc.body);
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
