// One game action per page.
//
// Every game action reloads the page, and each page's form carries a time id
// (`idopont`) the server checks: a second submit from the same page — a double
// click, a double tap, a key pressed twice — sends the same id again, and the
// game may log the player out for it. So once the page has started leaving,
// nothing else may reach the game's controls until the next page is loaded.
//
// **The page leaving is the signal, not the click.** Most of the game's
// controls submit (`document.urlap.submit()` from an inline onclick), but not
// all: an attribute's `+`, an item's details (`alert`), the mass-sale tick
// boxes and the price check stay on the page and may be pressed many times.
// `beforeunload` fires for exactly the clicks that navigate, whatever path
// they came by — the player's own click, a mobile button or a desktop
// shortcut `.click()`ing the hidden control, Enter in a field — and it fires
// on the task right after `form.submit()` (8ms, measured in Chromium), long
// before a second click can arrive.
//
// **What is blocked is the game, not the toolkit.** A click is stopped at the
// window in the capture phase, before any listener of the page's own or ours
// on the control (the dungeon step tracker included, so a refused second step
// records nothing), unless it lands in the toolkit's own UI: opening the
// database while the next page loads is harmless, and a toolkit button that
// does press a game control still gets stopped, since that press is a click
// of its own on the game's element.

/** Where the toolkit draws its own UI: clicks there are never game actions. */
const TOOLKIT_UI = '#lc-root, #lc-dock-root, [class^="lc-"], [class*=" lc-"]';

function isToolkitTarget(target: EventTarget | null): boolean {
  // Never `instanceof Element`: the page's nodes belong to the page's window,
  // not the userscript's.
  const element = target as Element | null;
  return typeof element?.closest === 'function' && element.closest(TOOLKIT_UI) !== null;
}

export interface ActionLock {
  isLocked(): boolean;
  /** Remove every listener (tests). */
  dispose(): void;
}

/**
 * Lock the page's game controls from the moment it starts leaving.
 *
 * Released only when the browser shows this page again from its back-forward
 * cache (`pageshow` with `persisted`), since nothing else brings a page that
 * has left back to life.
 */
export function installActionLock(win: Window): ActionLock {
  let locked = false;

  const lock = () => { locked = true; };
  const unlock = (event: PageTransitionEvent) => {
    if (event.persisted) locked = false;
  };
  const stopClick = (event: Event) => {
    if (!locked || isToolkitTarget(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  // Enter in a form with no submit button submits without a click.
  const stopSubmit = (event: Event) => {
    if (!locked) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  win.addEventListener('beforeunload', lock);
  win.addEventListener('pageshow', unlock);
  win.addEventListener('click', stopClick, true);
  win.addEventListener('submit', stopSubmit, true);

  return {
    isLocked: () => locked,
    dispose() {
      win.removeEventListener('beforeunload', lock);
      win.removeEventListener('pageshow', unlock);
      win.removeEventListener('click', stopClick, true);
      win.removeEventListener('submit', stopSubmit, true);
    },
  };
}
