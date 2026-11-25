/**
 * Lets clicks through the game's oversized control wrappers.
 *
 * The game wraps each of its image controls in an absolutely positioned div
 * far wider than the control: the labyrinth's *Beállítások* (`klap.gif`) and
 * *Pihensz* (`pihen.gif`) buttons are 50px wide in 300px divs at x 20 and 210,
 * y 410, and the shortcut slot below them likewise. The divs are transparent and
 * sit at z-index 6, above the narration box (z-index 3, from x 275), so a
 * riddle long enough to push its answers down to that height (tavern quest
 * Miniatűr hanghordozó's 1,6, saved live on 2026-11-25) has radios and a
 * *Válasz* button that cannot be clicked, though nothing visibly covers them.
 * The game's own layout, not ours: the overlap is there with the toolkit off.
 *
 * A wrapper holding only controls is made click-through and its controls stay
 * clickable, so every control behaves exactly as before and the empty part of
 * the box stops swallowing clicks meant for what lies beneath it. Desktop only:
 * mobile moves the game's page off-screen.
 */

/** The tags a pure control wrapper may hold; anything else leaves it alone. */
const CONTROL_TAGS = new Set(['INPUT', 'IMG']);

function isControlWrapper(div: HTMLElement): boolean {
  if (div.style.position !== 'absolute') return false;
  if ((div.textContent ?? '').trim() !== '') return false;
  const children = Array.from(div.querySelectorAll('*'));
  // Tag and attribute checks, never `instanceof`: the game's elements belong to
  // the page's window, not the userscript sandbox's.
  const hasControl = children.some(
    (el) => el.tagName === 'INPUT' && (el.getAttribute('type') ?? '').toLowerCase() === 'image',
  );
  return hasControl && children.every((el) => CONTROL_TAGS.has(el.tagName));
}

/** Makes every pure control wrapper click-through; returns how many it changed. */
export function releaseControlWrappers(doc: Document): number {
  let released = 0;
  for (const div of Array.from(doc.body.querySelectorAll<HTMLElement>('div'))) {
    if (div.closest('#lc-dock-root') || !isControlWrapper(div)) continue;
    div.style.pointerEvents = 'none';
    // Every child, images included: a disabled direction's `<img>` carries the
    // game's "Erre nem lehet menni" tooltip, which needs the pointer to show.
    for (const el of Array.from(div.querySelectorAll<HTMLElement>('*'))) el.style.pointerEvents = 'auto';
    released += 1;
  }
  return released;
}
