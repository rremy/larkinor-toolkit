import { describe, it, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { renderActiveQuestLink } from '../src/desktop/activeQuestLink';
import { narrationBlock } from '../src/desktop/narrationSplice';

function gameDoc(inner: string): Document {
  return new JSDOM(
    `<html><body><font face="Comic sans MS">${inner}</font></body></html>`,
    { url: 'https://l2.larkinor.hu/cgi-bin/larkinor' },
  ).window.document;
}

describe('renderActiveQuestLink', () => {
  it('turns the phrase into a link and fires onOpen', () => {
    const doc = gameDoc('Sétálsz.<br>Aktuális küldetés: (39)<br>Vége.');
    const onOpen = vi.fn();
    const link = renderActiveQuestLink(doc, onOpen)!;

    expect(link.textContent).toBe('Aktuális küldetés: (39)');
    link.dispatchEvent(new doc.defaultView!.MouseEvent('click', { bubbles: true }));
    expect(onOpen).toHaveBeenCalledWith('39');
  });

  it('leaves the surrounding text and the game anchors intact', () => {
    const doc = gameDoc('Menj <a href="#" onclick="return false">tovább</a>.<br>Aktuális küldetés: (39)');
    const anchor = doc.querySelector('a')!;
    renderActiveQuestLink(doc, vi.fn());

    expect(doc.querySelector('a[onclick]')).toBe(anchor); // never reserialised
    expect(narrationBlock(doc)!.textContent).toContain('Menj tovább.');
    expect(narrationBlock(doc)!.textContent).toContain('Aktuális küldetés: (39)');
  });

  it('is idempotent within one page load', () => {
    const doc = gameDoc('Aktuális küldetés: (39)');
    renderActiveQuestLink(doc, vi.fn());
    renderActiveQuestLink(doc, vi.fn());

    expect(doc.querySelectorAll('.lc-active-quest').length).toBe(1);
  });

  it('opens on Enter as well as click', () => {
    const doc = gameDoc('Aktuális küldetés: (39)');
    const onOpen = vi.fn();
    const link = renderActiveQuestLink(doc, onOpen)!;

    link.dispatchEvent(new doc.defaultView!.KeyboardEvent('keydown', { code: 'Enter', bubbles: true }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('returns null when there is no narration block', () => {
    const doc = new JSDOM('<html><body></body></html>').window.document;
    expect(renderActiveQuestLink(doc, vi.fn())).toBeNull();
  });

  it('returns null when the block never names a quest', () => {
    expect(renderActiveQuestLink(gameDoc('Pihensz egy kicsit...'), vi.fn())).toBeNull();
  });

  // The bug this pins: the phrase used to be located in `extractNarration`'s
  // trimmed, whitespace-collapsed copy while the splice indexed the *raw*
  // flattened block, so the ordinary indentation of server-generated HTML
  // shifted every offset — wrapping "\n  Aktuális küldetés: (" instead of the
  // phrase, or (where the shift crossed a text-node boundary) rendering no link
  // at all.
  it('wraps exactly the phrase in a block indented like the server writes it', () => {
    const doc = gameDoc(
      '\n  Valami csámborog a közelben!<br>\n  Aktuális küldetés: (39)<br>\n',
    );
    const onOpen = vi.fn();
    const link = renderActiveQuestLink(doc, onOpen)!;

    expect(link).not.toBeNull();
    expect(link.textContent).toBe('Aktuális küldetés: (39)');
    link.dispatchEvent(new doc.defaultView!.MouseEvent('click', { bubbles: true }));
    expect(onOpen).toHaveBeenCalledWith('39');
  });

  // The same shift, but wide enough to cross a text-node boundary: with the old
  // offsets the run started inside an earlier node, `segmentFor` found nothing,
  // and no link was rendered at all — the whole affordance silently absent
  // rather than merely misplaced. (Verified against the old code: the segment
  // lookup returned undefined for exactly this fixture.)
  it('links the phrase even when the shift would cross a node boundary', () => {
    const doc = gameDoc(
      '\n          Valami <b><font color="#DF4B22">Vízmágus </font></b> áll ott.<br>'
      + '\n  Aktuális küldetés: (7)<br>\n',
    );
    const link = renderActiveQuestLink(doc, vi.fn());

    expect(link).not.toBeNull();
    expect(link?.textContent).toBe('Aktuális küldetés: (7)');
  });
});
