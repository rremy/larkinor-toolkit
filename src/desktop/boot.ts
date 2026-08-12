// Desktop boot. The inverse posture of the mobile boot: the game page keeps
// rendering itself and we only add a companion dock plus in-place narration
// links. Nothing here may move, hide or restyle the game's own DOM.
//
// The dock is a fixed panel appended to <body>, never inserted into the game's
// layout. That layout is absolutely positioned, so a block element spliced into
// it does not push siblings aside — it lands on top of them and drags the
// visible column off-screen. Instead we measure the chat panel and lay the dock
// over it, which puts the dock inside the game's own column without
// participating in its layout.

import { h, render } from 'preact';
import { detectPage, PageType } from '@/utils/pageDetector';
import { extractFreeMove, type FreeMoveState } from '@/utils/domExtract';
import { createDataLoader, gmSource, type MonsterDatabase } from '@/shared/data';
import { DesktopDock } from '@/desktop/DesktopDock';
import baseStyles from '@/shared/styles/theme.css?raw';
import dockStyles from '@/desktop/desktop.css?raw';

// Mirrors src/mobile/boot.ts and src/components/DatabaseOverlay.tsx: the dev
// server hosts static/db, production serves it from the deployment host.
const DATA_BASE_URL = import.meta.env.DEV
  ? new URL('/static/db', import.meta.url).href
  : 'https://example.invalid/larkinor/static/db';

/**
 * Page types that get no dock at all.
 *
 * The login screen is pre-authentication: there is no chat to anchor the dock
 * to, no character to act on, and the database is of no use before you are in
 * the game. Anything we drew there would be a panel floating over the login
 * form at guessed coordinates.
 */
const UNDOCKED_PAGES: ReadonlySet<PageType> = new Set([PageType.Login]);

/**
 * Free-move state when we are on the free-move page, otherwise null — every
 * other docked page type (including one we do not recognise) still gets the
 * minimal dock, because on desktop we are adding to a page that already works.
 */
function extractDockState(pageType: PageType, doc: Document): FreeMoveState | null {
  if (pageType !== PageType.FreeMove) return null;
  try {
    return extractFreeMove(doc);
  } catch (err) {
    console.warn('[Larkinor UI] Free-move extraction failed; dock degraded:', err);
    return null;
  }
}

/** The game's chat panel. The dock is laid over its message log. */
const CHAT_SELECTOR = '#mydiv';

/**
 * Chat geometry used when it cannot be found or measured. These are the live
 * game's actual values — the layout is absolutely positioned in fixed pixels and
 * does not move with the window, so they are a good guess rather than a shot in
 * the dark.
 */
const FALLBACK_CHAT_RECT = { left: 60, top: 473, width: 500, height: 300 };

/** Clearance left under the chat's own text input. */
const CHAT_INPUT_GAP = 4;

/** Clearance kept above the viewport's bottom edge. */
const VIEWPORT_MARGIN = 8;

/** Floor for the dock's height, so it never collapses to an unusable sliver. */
const MIN_DOCK_HEIGHT = 120;

/**
 * Lays the dock over the game's chat panel by writing the custom properties
 * `desktop.css` positions it from.
 *
 * Measured rather than hardcoded because the game's layout is absolutely
 * positioned: overlaying it is the only way to sit inside the game's own column
 * without joining that layout, where an inserted block displaces nothing and
 * overlaps everything.
 *
 * The dock takes the chat's left edge and width, but **not** its height: it is
 * free to run taller than the chat and only the viewport bounds it. Scrolling
 * inside a dock is worse than extending past the panel, and the area below the
 * chat holds nothing but chat text that has already overflowed the chat box.
 *
 * Two things the naive "cover the whole chat rect" version got wrong, both
 * found by measuring the live page:
 *  - The chat's text input sits at the top of the panel, so covering the full
 *    rect stops the player typing. We start below it.
 *  - Bounding the height by the chat forced the action list to scroll even with
 *    room to spare underneath.
 *
 * Coordinates are viewport-relative, which is correct for `position: fixed` and
 * needs no scroll offset — and the game page does not scroll, so a single
 * measurement at boot stays valid.
 */
function alignDock(root: HTMLElement, doc: Document): void {
  const chat = doc.querySelector(CHAT_SELECTOR);
  const measured = chat?.getBoundingClientRect();
  const rect = measured && measured.width > 0 ? measured : FALLBACK_CHAT_RECT;

  const chatBottom = rect.top + rect.height;
  let top = rect.top;

  // Keep the chat's own input usable: start below it rather than over it.
  const input = chat?.querySelector('input')?.getBoundingClientRect();
  if (input && input.height > 0 && input.bottom > top && input.bottom < chatBottom) {
    top = input.bottom + CHAT_INPUT_GAP;
  }

  // Only the viewport caps the height, so the dock scrolls internally solely
  // when it genuinely cannot fit on screen.
  const viewportLimit = (doc.defaultView?.innerHeight ?? chatBottom) - VIEWPORT_MARGIN;
  const height = Math.max(MIN_DOCK_HEIGHT, viewportLimit - top);

  root.style.setProperty('--lc-dock-left', `${Math.round(rect.left)}px`);
  root.style.setProperty('--lc-dock-top', `${Math.round(top)}px`);
  root.style.setProperty('--lc-dock-width', `${Math.round(rect.width)}px`);
  root.style.setProperty('--lc-dock-max-height', `${Math.round(height)}px`);
}

/**
 * Injects the dock's styles and creates its mount point. Returns null on
 * failure — a restrictive CSP rejecting GM_addStyle is the realistic case —
 * so the caller can bail out cleanly instead of rendering into nothing.
 */
function mountDockRoot(doc: Document): HTMLDivElement | null {
  try {
    GM_addStyle(baseStyles);
    GM_addStyle(dockStyles);

    const root = doc.createElement('div');
    root.id = 'lc-dock-root';
    doc.body.appendChild(root);
    alignDock(root, doc);
    return root;
  } catch (err) {
    console.warn('[Larkinor UI] Dock mount failed:', err);
    return null;
  }
}

export function bootDesktop(doc: Document): void {
  const pageType = detectPage(doc);
  if (UNDOCKED_PAGES.has(pageType)) return;

  const state = extractDockState(pageType, doc);

  const root = mountDockRoot(doc);
  if (!root) return;

  let db: MonsterDatabase | null = null;

  const renderDock = () => {
    try {
      render(h(DesktopDock, { doc, state, db, dbButtonOnly: state === null }), root);
    } catch (err) {
      console.warn('[Larkinor UI] Dock render failed:', err);
    }
  };

  renderDock();

  // Only the free-move narration references monsters, so nothing else needs the
  // database up front — the overlay loads its own data on demand.
  if (!state) return;

  createDataLoader(gmSource(), DATA_BASE_URL).loadMonsters()
    .then((loaded) => {
      db = loaded;
      renderDock(); // re-render so the narration effect can run with a db
    })
    .catch((err) => console.warn('[Larkinor UI] Failed to load monsters:', err));
}
