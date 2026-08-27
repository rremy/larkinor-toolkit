import { describe, it, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { renderActiveQuestLink } from '../src/desktop/activeQuestLink';
import { findActiveQuest } from '../src/utils/activeQuest';
import { narrationBlock } from '../src/desktop/narrationSplice';
import { extractNarration } from '../src/utils/domExtract';

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
    const link = renderActiveQuestLink(doc, findActiveQuest(extractNarration(doc))!, onOpen)!;

    expect(link.textContent).toBe('Aktuális küldetés: (39)');
    link.dispatchEvent(new doc.defaultView!.MouseEvent('click', { bubbles: true }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('leaves the surrounding text and the game anchors intact', () => {
    const doc = gameDoc('Menj <a href="#" onclick="return false">tovább</a>.<br>Aktuális küldetés: (39)');
    const anchor = doc.querySelector('a')!;
    renderActiveQuestLink(doc, findActiveQuest(extractNarration(doc))!, vi.fn());

    expect(doc.querySelector('a[onclick]')).toBe(anchor); // never reserialised
    expect(narrationBlock(doc)!.textContent).toContain('Menj tovább.');
    expect(narrationBlock(doc)!.textContent).toContain('Aktuális küldetés: (39)');
  });

  it('is idempotent within one page load', () => {
    const doc = gameDoc('Aktuális küldetés: (39)');
    const mention = findActiveQuest(extractNarration(doc))!;
    renderActiveQuestLink(doc, mention, vi.fn());
    renderActiveQuestLink(doc, mention, vi.fn());

    expect(doc.querySelectorAll('.lc-active-quest').length).toBe(1);
  });

  it('opens on Enter as well as click', () => {
    const doc = gameDoc('Aktuális küldetés: (39)');
    const onOpen = vi.fn();
    const link = renderActiveQuestLink(doc, findActiveQuest(extractNarration(doc))!, onOpen)!;

    link.dispatchEvent(new doc.defaultView!.KeyboardEvent('keydown', { code: 'Enter', bubbles: true }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('returns null when there is no narration block', () => {
    const doc = new JSDOM('<html><body></body></html>').window.document;
    expect(renderActiveQuestLink(doc, { questId: '39', index: 0, length: 5 }, vi.fn())).toBeNull();
  });
});
