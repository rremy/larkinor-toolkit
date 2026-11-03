import { describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { enhanceItemMentions } from '../src/desktop/enhanceItemMentions';
import type { ItemIndex } from '../src/shared/itemMentions';

const INDEX: ItemIndex = new Map([['arany', { tab: 'items', id: 615, name: 'arany' }]]);

function makeDoc(bodyHtml: string): Document {
  return new JSDOM(`<html><body>${bodyHtml}</body></html>`).window.document;
}

const narrationDoc = (inner: string) => makeDoc(`<font face="Comic sans MS">${inner}</font>`);

describe('enhanceItemMentions', () => {
  it('links a counted item and leaves the text as it was', () => {
    const doc = narrationDoc('Méretes lyuk.<br>Kiástál 16 darab aranyat!');
    const onItem = vi.fn();
    enhanceItemMentions(doc, INDEX, onItem);

    const link = doc.querySelector<HTMLAnchorElement>('a.lc-item-link')!;
    expect(link.textContent).toBe('16 darab aranyat');
    expect(doc.querySelector('font')!.textContent).toBe('Méretes lyuk.Kiástál 16 darab aranyat!');
    link.click();
    expect(onItem).toHaveBeenCalledWith({ tab: 'items', id: 615, name: 'arany' });
  });

  it('highlights what it cannot name, and silver, without a link', () => {
    const doc = narrationDoc('Kiástál 2 darab zümmögőt!<br>Kiástál néhány ezüstpénzt! (+ 37 ezüst)');
    enhanceItemMentions(doc, INDEX, vi.fn());
    expect([...doc.querySelectorAll('.lc-item-mention')].map((el) => el.textContent))
      .toEqual(['2 darab zümmögőt', '+ 37 ezüst']);
    expect(doc.querySelector('a.lc-item-link')).toBeNull();
  });

  it('reads a building page’s narration box, not the headings above it', () => {
    const doc = makeDoc(`
      <font face="Comic sans MS">Vétel</font>
      <div style="position:absolute; width:600px"><font face="Comic sans MS">Sikerült venned 3 darab aranyat.</font></div>`);
    enhanceItemMentions(doc, INDEX, vi.fn());
    expect(doc.querySelector('div a.lc-item-link')?.textContent).toBe('3 darab aranyat');
  });

  it('never touches the game’s own links, and runs once', () => {
    const doc = narrationDoc('<a href="#" onclick="return false">Felveszed 2 darab aranyat</a> Kiástál 1 darab aranyat!');
    enhanceItemMentions(doc, INDEX, vi.fn());
    enhanceItemMentions(doc, INDEX, vi.fn());
    expect(doc.querySelectorAll('a.lc-item-link')).toHaveLength(1);
    expect(doc.querySelector('a[onclick]')!.textContent).toBe('Felveszed 2 darab aranyat');
  });
});
