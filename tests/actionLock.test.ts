import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { installActionLock } from '../src/utils/actionLock';

// A page shaped like the game's: the shared form, a submitting direction
// control, a control that stays on the page, and the toolkit's own UI.
function makePage() {
  const { window } = new JSDOM(`<html><body>
    <form name="urlap"><input type="text" name="par1"></form>
    <input type="image" name="eszak" src="/2/ikon/eszak.gif" onclick="window.presses.push('eszak')">
    <input type="image" name="plusz" src="/2/ikon/plusz.gif" onclick="window.presses.push('plusz')">
    <div id="lc-dock-root"><button type="button" id="db">Adatbázis</button></div>
    <font face="Comic sans MS"><a class="lc-item-link" id="item">16 darab aranyat</a></font>
  </body></html>`, { runScripts: 'dangerously' });
  const presses: string[] = [];
  (window as unknown as { presses: string[] }).presses = presses;
  const lock = installActionLock(window as unknown as Window);
  const doc = window.document;
  const control = (name: string) => doc.querySelector<HTMLElement>(`[name="${name}"]`)!;
  const leave = () => window.dispatchEvent(new window.Event('beforeunload'));
  return { window, doc, presses, lock, control, leave };
}

describe('installActionLock', () => {
  it('lets the game’s controls through until the page starts leaving', () => {
    const { presses, lock, control } = makePage();
    control('plusz').click();
    control('plusz').click();
    control('eszak').click();
    expect(presses).toEqual(['plusz', 'plusz', 'eszak']);
    expect(lock.isLocked()).toBe(false);
  });

  it('stops every later game action once an action reloads the page', () => {
    const { presses, lock, control, leave } = makePage();
    control('eszak').click();
    leave();
    expect(lock.isLocked()).toBe(true);

    control('eszak').click();
    control('plusz').click();
    expect(presses).toEqual(['eszak']);
  });

  it('stops the click before the control’s own listeners, and cancels its default', () => {
    const { window, control, leave } = makePage();
    const seen: string[] = [];
    // The dungeon step tracker listens on the control in the capture phase.
    control('eszak').addEventListener('click', () => seen.push('tracker'), true);
    leave();

    const click = new window.MouseEvent('click', { bubbles: true, cancelable: true });
    control('eszak').dispatchEvent(click);
    expect(seen).toEqual([]);
    expect(click.defaultPrevented).toBe(true);
  });

  it('stops a form submitted without a click', () => {
    const { window, doc, leave } = makePage();
    leave();
    const submit = new window.Event('submit', { bubbles: true, cancelable: true });
    doc.forms.namedItem('urlap')!.dispatchEvent(submit);
    expect(submit.defaultPrevented).toBe(true);
  });

  it('leaves the toolkit’s own UI working while the next page loads', () => {
    const { doc, leave } = makePage();
    const opened: string[] = [];
    doc.getElementById('db')!.addEventListener('click', () => opened.push('database'));
    doc.getElementById('item')!.addEventListener('click', () => opened.push('item'));
    leave();

    doc.getElementById('db')!.click();
    doc.getElementById('item')!.click();
    expect(opened).toEqual(['database', 'item']);
  });

  it('still stops a game control a toolkit button presses', () => {
    const { doc, presses, control, leave } = makePage();
    doc.getElementById('db')!.addEventListener('click', () => control('eszak').click());
    leave();

    doc.getElementById('db')!.click();
    expect(presses).toEqual([]);
  });

  it('unlocks when the browser shows the page again from its back-forward cache', () => {
    const { window, presses, lock, control, leave } = makePage();
    leave();
    window.dispatchEvent(new window.PageTransitionEvent('pageshow', { persisted: false }));
    expect(lock.isLocked()).toBe(true);

    window.dispatchEvent(new window.PageTransitionEvent('pageshow', { persisted: true }));
    control('eszak').click();
    expect(presses).toEqual(['eszak']);
  });
});
