import { describe, it, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { renderQuestOfferNote } from '../src/desktop/questOfferNote';

/**
 * A stripped-down pub page. The narration lives in the game's
 * `font[face="Comic sans MS"]` block, and the anchor inside it stands in for
 * the game's own inline-handler links — the ones an innerHTML rewrite would
 * destroy (see the module's own comment, and enhanceNarration).
 */
function makeDoc(): Document {
  return new JSDOM(`<html><body>
    <div id="Layer3">
      <font face="Comic sans MS">Iszol egy sört.<br>Kapsz egy papírfecnit.
        <a href="javascript:void(0)" id="gamelink">Itallap</a>
      </font>
    </div>
  </body></html>`).window.document;
}

describe('renderQuestOfferNote', () => {
  it('appends the note directly after the narration block', () => {
    const doc = makeDoc();
    const note = renderQuestOfferNote(doc, { title: 'Zurkhas', onOpen: vi.fn() });

    expect(note).not.toBeNull();
    const block = doc.querySelector('font[face="Comic sans MS"]')!;
    expect(block.nextElementSibling).toBe(note);
  });

  it('names the quest in Hungarian copy', () => {
    const doc = makeDoc();
    renderQuestOfferNote(doc, { title: 'Zurkhas', onOpen: vi.fn() });
    expect(doc.querySelector('.lc-quest-offer-btn')!.textContent).toContain('Küldetés felismerve');
    expect(doc.querySelector('.lc-quest-offer-btn')!.textContent).toContain('Zurkhas');
  });

  it('calls onOpen when activated', () => {
    const doc = makeDoc();
    const onOpen = vi.fn();
    renderQuestOfferNote(doc, { title: 'Zurkhas', onOpen });

    doc.querySelector<HTMLButtonElement>('.lc-quest-offer-btn')!.click();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  // The pub page's own controls submit the shared game form. A stray submit
  // from our button would navigate the player off the page.
  it('does not submit the game form', () => {
    const doc = makeDoc();
    renderQuestOfferNote(doc, { title: 'Zurkhas', onOpen: vi.fn() });
    const button = doc.querySelector<HTMLButtonElement>('.lc-quest-offer-btn')!;

    expect(button.type).toBe('button');
    const event = new doc.defaultView!.MouseEvent('click', { bubbles: true, cancelable: true });
    button.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  // The game reloads on every action, but a re-render inside one page load
  // must not stack notes.
  it('replaces an existing note rather than adding a second', () => {
    const doc = makeDoc();
    renderQuestOfferNote(doc, { title: 'Zurkhas', onOpen: vi.fn() });
    renderQuestOfferNote(doc, { title: 'Thordus', onOpen: vi.fn() });

    const notes = doc.querySelectorAll('.lc-quest-offer');
    expect(notes).toHaveLength(1);
    expect(notes[0].textContent).toContain('Thordus');
  });

  // Never rewrite the game's markup: an innerHTML assignment on or around the
  // narration would drop the inline handlers the game relies on.
  it('leaves the game\'s own narration DOM untouched', () => {
    const doc = makeDoc();
    const link = doc.querySelector('#gamelink')!;
    renderQuestOfferNote(doc, { title: 'Zurkhas', onOpen: vi.fn() });

    // Same node object, not a re-parsed copy.
    expect(doc.querySelector('#gamelink')).toBe(link);
  });

  it('returns null when the page has no narration block', () => {
    const doc = new JSDOM('<html><body><p>nothing</p></body></html>').window.document;
    expect(renderQuestOfferNote(doc, { title: 'Zurkhas', onOpen: vi.fn() })).toBeNull();
  });
});
