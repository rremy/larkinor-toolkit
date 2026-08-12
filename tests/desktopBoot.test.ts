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
    // Cleared, not reset: the style injection is asserted on, and mockReset
    // would also drop the implementation other cases rely on.
    vi.mocked(GM_addStyle).mockClear();
  });

  it('leaves the original game DOM in place', () => {
    const doc = gameDoc('otVilag');
    bootDesktop(doc);

    expect(doc.getElementById('lc-offscreen')).toBeNull();
    expect(doc.getElementById('game-content')).not.toBeNull();
    expect(doc.getElementById('game-content')!.parentElement).toBe(doc.body);
  });

  it('renders nothing on the login screen', () => {
    // Pre-authentication there is no chat to anchor to, no character to act on
    // and no use for the database, so any dock would just float over the login
    // form at guessed coordinates.
    const doc = gameDoc('otLogin');
    bootDesktop(doc);

    expect(doc.getElementById('lc-dock-root')).toBeNull();
    expect(GM_addStyle).not.toHaveBeenCalled();
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

  /**
   * The live game's chat geometry, verified in a real browser: the panel is at
   * 60,473 sized 500x300, with its text input occupying the top 22px. The
   * layout is absolutely positioned in fixed pixels and does not move with the
   * window, so these values hold at every viewport size.
   */
  function withChat(doc: Document, opts: { input?: boolean; viewportHeight?: number } = {}): void {
    const chat = doc.getElementById('mydiv')!;
    chat.getBoundingClientRect = () => ({ left: 60, top: 473, width: 500, height: 300, bottom: 773 }) as DOMRect;
    // The chat is inset within the game's 633px content column, which is what
    // the dock takes its horizontal placement from.
    chat.parentElement!.getBoundingClientRect = () => ({ left: 0, width: 633 }) as DOMRect;
    if (opts.input) {
      const input = doc.createElement('input');
      input.getBoundingClientRect = () => ({ top: 473, height: 22, bottom: 495 }) as DOMRect;
      chat.appendChild(input);
    }
    if (opts.viewportHeight !== undefined) {
      Object.defineProperty(doc.defaultView!, 'innerHeight', { value: opts.viewportHeight, configurable: true });
    }
  }

  it('spans the game content column horizontally, not just the chat', () => {
    // The column is ~130px wider than the chat it contains, which is what lets
    // the wide action buttons wrap two-per-row instead of one.
    const doc = gameDoc('otVilag', '<div id="wrap"><div id="mydiv">chat</div></div>');
    withChat(doc, { viewportHeight: 900 });

    bootDesktop(doc);

    const root = doc.getElementById('lc-dock-root')!;
    expect(root.style.getPropertyValue('--lc-dock-left')).toBe('0px');   // column, not the chat's 60
    expect(root.style.getPropertyValue('--lc-dock-width')).toBe('633px'); // column, not the chat's 500
    expect(root.style.getPropertyValue('--lc-dock-top')).toBe('473px');   // vertical still from the chat
  });

  it('may grow taller than the chat rather than scrolling inside itself', () => {
    // The chat ends at 773, but the dock is allowed the full viewport: capping
    // at the chat forced the action list to scroll with room to spare below.
    const doc = gameDoc('otVilag', '<div id="mydiv">chat</div>');
    withChat(doc, { viewportHeight: 900 });

    bootDesktop(doc);

    const root = doc.getElementById('lc-dock-root')!;
    // 900 - 8 margin - 473 top = 419, well past the chat's own 300.
    expect(root.style.getPropertyValue('--lc-dock-max-height')).toBe('419px');
  });

  it('starts below the chat input so it stays usable', () => {
    // Covering the whole chat rect would sit on top of the text field and stop
    // the player typing.
    const doc = gameDoc('otVilag', '<div id="mydiv">chat</div>');
    withChat(doc, { input: true, viewportHeight: 900 });

    bootDesktop(doc);

    const root = doc.getElementById('lc-dock-root')!;
    expect(root.style.getPropertyValue('--lc-dock-top')).toBe('499px'); // 495 + 4 gap
    expect(root.style.getPropertyValue('--lc-dock-max-height')).toBe('393px'); // 892 - 499
  });

  it('publishes the game\'s right edge for the minimised database overlay', () => {
    // A constant, not a measurement: the page's third-party ad content renders
    // past the game, so measuring the widest element put the docked overlay's
    // left edge too far right and it no longer filled the space beside the game.
    const doc = gameDoc('otVilag', '<div id="mydiv">chat</div>');
    withChat(doc, { viewportHeight: 900 });

    bootDesktop(doc);

    expect(doc.getElementById('lc-dock-root')!.style.getPropertyValue('--lc-game-right')).toBe('791px');
  });

  it('is not swayed by page content extending past the game', () => {
    const doc = gameDoc('otVilag', '<div id="mydiv">chat</div><div id="ad">advert</div>');
    withChat(doc, { viewportHeight: 900 });
    // An ad banner rendering well to the right of the game must not move the
    // docked overlay's left edge.
    doc.getElementById('ad')!.getBoundingClientRect = () =>
      ({ left: 900, right: 1300, width: 400, height: 600 }) as DOMRect;

    bootDesktop(doc);

    expect(doc.getElementById('lc-dock-root')!.style.getPropertyValue('--lc-game-right')).toBe('791px');
  });

  it('clamps to the viewport so it never runs off the bottom edge', () => {
    const doc = gameDoc('otVilag', '<div id="mydiv">chat</div>');
    withChat(doc, { input: true, viewportHeight: 720 });

    bootDesktop(doc);

    const root = doc.getElementById('lc-dock-root')!;
    expect(root.style.getPropertyValue('--lc-dock-top')).toBe('499px');
    expect(root.style.getPropertyValue('--lc-dock-max-height')).toBe('213px'); // 712 - 499
  });

  it('never collapses below a usable height on a very short window', () => {
    const doc = gameDoc('otVilag', '<div id="mydiv">chat</div>');
    withChat(doc, { input: true, viewportHeight: 520 });

    bootDesktop(doc);

    expect(doc.getElementById('lc-dock-root')!.style.getPropertyValue('--lc-dock-max-height')).toBe('120px');
  });

  it('anchors to the foot of the game column when there is no chat to measure', () => {
    // Home has no chat at all; jsdom's zero-size rects are the same signal. An
    // earlier version fell back to the chat's known offsets, which planted the
    // bar at a position that means nothing on such a page.
    const doc = gameDoc('otVilag', '<div id="mydiv">chat</div>');
    bootDesktop(doc);

    const root = doc.getElementById('lc-dock-root')!;
    expect(root.dataset.anchor).toBe('bottom');
    expect(root.style.getPropertyValue('--lc-dock-left')).toBe('0px');
    expect(root.style.getPropertyValue('--lc-dock-width')).toBe('633px');
    // Bottom-anchored, so no top offset is published at all.
    expect(root.style.getPropertyValue('--lc-dock-top')).toBe('');
  });

  it('still mounts the dock when there is no chat at all', () => {
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

  it('picks up the monster being fought on the battle screen', () => {
    // Its name comes from the image title the game puts the HP in:
    // "Goblin harcművészek, életpontja: 112".
    const doc = gameDoc('otHarc', '<img title="Goblin harcművészek, életpontja: 112" src="/szornyk/x_k.gif">');
    bootDesktop(doc);

    // The dock is mounted and the monster fetch was kicked off for it, which the
    // free-move-only path used to skip.
    expect(doc.getElementById('lc-dock-root')).not.toBeNull();
    expect(GM_xmlhttpRequest).toHaveBeenCalled();
  });

  it('does not fetch monster data on a page with neither free-move nor a fight', () => {
    const doc = gameDoc('otVegyesbolt');
    bootDesktop(doc);

    expect(doc.getElementById('lc-dock-root')).not.toBeNull();
    expect(GM_xmlhttpRequest).not.toHaveBeenCalled();
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
