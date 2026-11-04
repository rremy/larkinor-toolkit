import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { renderDirectionIndicators } from '../src/desktop/directionIndicators';

/** The desktop cross, each arrow placed by a stubbed bounding box. */
function crossDoc(): Document {
  const doc = new JSDOM(`<html><body>
    <input type="image" src="/ikon/eszak.gif" data-box="128,313">
    <input type="image" src="/ikon/del.gif" data-box="128,363">
    <input type="image" src="/ikon/nyugat.gif" data-box="103,338">
    <input type="image" src="/ikon/kelet.gif" data-box="153,338">
  </body></html>`).window.document;
  for (const input of doc.querySelectorAll<HTMLElement>('[data-box]')) {
    const [left, top] = input.dataset.box!.split(',').map(Number);
    input.getBoundingClientRect = () => ({ left, top, width: 25, height: 25 }) as DOMRect;
  }
  return doc;
}

describe('renderDirectionIndicators', () => {
  it('floats each hint’s icon at its place around the arrows', () => {
    const doc = crossDoc();
    renderDirectionIndicators(doc, [
      { kind: 'labyrinth', dir: 'NE', label: 'A labirintus bejárata' },
      { kind: 'airship', dir: 'N', label: 'Kutek (7 lépés)' },
    ]);
    const groups = [...doc.querySelectorAll<HTMLElement>('#lc-dir-indicators .lc-dir-hints')];
    expect(groups.map((g) => [g.style.left, g.style.top])).toEqual([['165.5px', '325.5px'], ['140.5px', '313px']]);
    // The game's own door for the entrance, an emoji where the game has no icon.
    expect(groups[0].querySelector('img')?.getAttribute('src')).toBe('https://l2.larkinor.hu/2/ikon/labirintus.gif');
    expect(groups[1].textContent).toBe('🎈');
    expect(doc.querySelector('[title="Kutek (7 lépés)"]')).toBeTruthy();
  });

  it('groups several hints pointing the same way', () => {
    const doc = crossDoc();
    renderDirectionIndicators(doc, [
      { kind: 'fled', dir: 'W', label: 'Dagonyadisznó' },
      { kind: 'hint', dir: 'W', label: 'Valami azt súgja, jobb lenne nyugatra menni!' },
    ]);
    const groups = [...doc.querySelectorAll('#lc-dir-indicators .lc-dir-hints')];
    expect(groups).toHaveLength(1);
    expect([...groups[0].children].map((icon) => icon.getAttribute('title')))
      .toEqual(['Dagonyadisznó', 'Valami azt súgja, jobb lenne nyugatra menni!']);
    expect(groups[0].querySelector('img')?.getAttribute('src')).toBe('https://l2.larkinor.hu/2/ikon/tamadas.gif');
  });

  it('draws nothing without hints, or without arrows to place them against', () => {
    const doc = crossDoc();
    renderDirectionIndicators(doc, []);
    expect(doc.getElementById('lc-dir-indicators')).toBeNull();

    const bare = new JSDOM('<html><body></body></html>').window.document;
    renderDirectionIndicators(bare, [{ kind: 'labyrinth', dir: 'S', label: 'A labirintus bejárata' }]);
    expect(bare.getElementById('lc-dir-indicators')).toBeNull();
  });
});
