// Isolated in its own file because it mocks extractFreeMove for the whole
// module — mixing that with desktopBoot.test.ts's real-extraction tests would
// make those assert against a stub instead of the real free-move parsing.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { DOCK_COLLAPSED_KEY, ENABLED_HOTKEYS_KEY } from '../src/utils/config';

vi.mock('../src/utils/domExtract', async () => {
  const actual = await vi.importActual<typeof import('../src/utils/domExtract')>('../src/utils/domExtract');
  return {
    ...actual,
    extractFreeMove: vi.fn(() => {
      throw new Error('free-move extraction blew up');
    }),
  };
});

const { bootDesktop } = await import('../src/desktop/boot');

function gameDoc(oldalTipus: string): Document {
  return new JSDOM(`<html><body>
    <form name="urlap"><input type="hidden" name="oldalTipus" value="${oldalTipus}"></form>
    <div id="game-content">original</div>
  </body></html>`).window.document;
}

describe('bootDesktop — free-move extraction failure', () => {
  beforeEach(() => {
    GM_setValue(DOCK_COLLAPSED_KEY, '');
    GM_setValue(ENABLED_HOTKEYS_KEY, '[]');
    vi.mocked(GM_xmlhttpRequest).mockReset();
  });

  it('does not throw, renders the minimal dock, and leaves the game DOM untouched', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const doc = gameDoc('otVilag');

    expect(() => bootDesktop(doc)).not.toThrow();

    expect(doc.getElementById('game-content')).not.toBeNull();
    expect(doc.getElementById('game-content')!.parentElement).toBe(doc.body);

    const root = doc.getElementById('lc-dock-root');
    expect(root).not.toBeNull();
    expect(root!.querySelector('.lc-dock-db')).not.toBeNull();
    expect(root!.querySelector('.lc-dock-hotkey')).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('[Larkinor UI]'),
      expect.anything()
    );

    warn.mockRestore();
  });
});
