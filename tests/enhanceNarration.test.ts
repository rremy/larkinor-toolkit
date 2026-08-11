import { describe, it, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { enhanceNarration } from '../src/desktop/enhanceNarration';
import { buildMonsterDatabase, type Monster } from '../src/shared/data/monsters';

function makeDoc(bodyHtml: string): Document {
  return new JSDOM(`<html><body>${bodyHtml}</body></html>`).window.document;
}

function monster(name: string, id = 1): Monster {
  return {
    id,
    name,
    image: `/pic/szornyk/${id}_k.gif`,
    level: 3,
    hp: 40,
    mp: 0,
    attackType: 'Szúró/Vágó',
    debuff: '',
    magicWeapon: false,
    location: 'temető',
    drops: [],
  };
}

const DB = buildMonsterDatabase([monster('Sírrabló', 7)]);

/** Wraps the narration text the way the live page does. */
function narrationDoc(inner: string): Document {
  return makeDoc(`<font face="Comic sans MS">${inner}</font>`);
}

describe('enhanceNarration', () => {
  it('wraps a resolved monster mention in a narration link', () => {
    const doc = narrationDoc('Valami Sírrabló csámborog a közelben!');
    enhanceNarration(doc, DB, vi.fn());

    const link = doc.querySelector('a.lc-narr-link');
    expect(link).not.toBeNull();
    expect(link!.textContent).toBe('Sírrabló');
    // Surrounding text survives intact.
    expect(doc.querySelector('font')!.textContent).toBe('Valami Sírrabló csámborog a közelben!');
  });

  it('calls the handler with the resolved monster when the link is clicked', () => {
    const doc = narrationDoc('Valami Sírrabló csámborog a közelben!');
    const onClick = vi.fn();
    enhanceNarration(doc, DB, onClick);

    const link = doc.querySelector<HTMLAnchorElement>('a.lc-narr-link')!;
    link.dispatchEvent(new doc.defaultView!.MouseEvent('click', { bubbles: true }));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0][0].name).toBe('Sírrabló');
  });

  it('leaves an unknown monster name as plain text', () => {
    const doc = narrationDoc('Valami Rettenetes Ismeretlen csámborog a közelben!');
    enhanceNarration(doc, DB, vi.fn());
    expect(doc.querySelector('a.lc-narr-link')).toBeNull();
  });

  it('is a no-op when the narration block is missing', () => {
    const doc = makeDoc('<div>no narration here</div>');
    expect(() => enhanceNarration(doc, DB, vi.fn())).not.toThrow();
    expect(doc.querySelector('a.lc-narr-link')).toBeNull();
  });

  it('is idempotent — a second call adds no further links', () => {
    const doc = narrationDoc('Valami Sírrabló csámborog a közelben!');
    enhanceNarration(doc, DB, vi.fn());
    enhanceNarration(doc, DB, vi.fn());
    expect(doc.querySelectorAll('a.lc-narr-link').length).toBe(1);
  });

  it('marks the block as enhanced', () => {
    const doc = narrationDoc('Valami Sírrabló csámborog a közelben!');
    enhanceNarration(doc, DB, vi.fn());
    expect(doc.querySelector('font')!.getAttribute('data-lc-enhanced')).toBe('true');
  });

  it('preserves the game\'s own anchors and their listeners', () => {
    const doc = narrationDoc('Valami Sírrabló csámborog a közelben! <a href="#" id="game">tovább</a>');
    const gameLink = doc.getElementById('game')!;
    const nativeHandler = vi.fn();
    gameLink.addEventListener('click', nativeHandler);

    enhanceNarration(doc, DB, vi.fn());

    // Same element instance, listener still attached.
    expect(doc.getElementById('game')).toBe(gameLink);
    gameLink.dispatchEvent(new doc.defaultView!.MouseEvent('click', { bubbles: true }));
    expect(nativeHandler).toHaveBeenCalledTimes(1);
  });

  it('is focusable and exposed as a button for keyboard/screen-reader users', () => {
    const doc = narrationDoc('Valami Sírrabló csámborog a közelben!');
    enhanceNarration(doc, DB, vi.fn());

    const link = doc.querySelector<HTMLAnchorElement>('a.lc-narr-link')!;
    expect(link.tabIndex).toBe(0);
    expect(link.getAttribute('role')).toBe('button');
  });

  it('opens the monster card on Enter when the link is focused', () => {
    const doc = narrationDoc('Valami Sírrabló csámborog a közelben!');
    const onClick = vi.fn();
    enhanceNarration(doc, DB, onClick);

    const link = doc.querySelector<HTMLAnchorElement>('a.lc-narr-link')!;
    const event = new doc.defaultView!.KeyboardEvent('keydown', { code: 'Enter', bubbles: true, cancelable: true });
    link.dispatchEvent(event);

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0][0].name).toBe('Sírrabló');
  });

  it('prevents Space from scrolling the page when the link is focused', () => {
    const doc = narrationDoc('Valami Sírrabló csámborog a közelben!');
    const onClick = vi.fn();
    enhanceNarration(doc, DB, onClick);

    const link = doc.querySelector<HTMLAnchorElement>('a.lc-narr-link')!;
    const event = new doc.defaultView!.KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true });
    link.dispatchEvent(event);

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('does not nest a link inside one of the game\'s own anchors', () => {
    const doc = narrationDoc('<a href="#">Valami Sírrabló csámborog a közelben!</a>');
    enhanceNarration(doc, DB, vi.fn());
    expect(doc.querySelector('a.lc-narr-link')).toBeNull();
  });

  it('enhances a mention inside a nested inline element', () => {
    const doc = narrationDoc('<b>Valami Sírrabló csámborog a közelben!</b>');
    enhanceNarration(doc, DB, vi.fn());
    expect(doc.querySelector('b a.lc-narr-link')?.textContent).toBe('Sírrabló');
  });
});
