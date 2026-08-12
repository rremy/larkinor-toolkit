// Desktop boot. The inverse posture of the mobile boot: the game page keeps
// rendering itself and we only add a companion dock plus in-place narration
// links.
//
// The dock is inserted into the game's own DOM as a sibling directly above the
// chat container, so it reads as part of the page rather than an overlay. That
// is the only structural change we make: we add a node and never move, remove,
// reorder or restyle an existing one.

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
 * Free-move state when we are on the free-move page, otherwise null — every
 * other page type (including one we do not recognise) still gets the minimal
 * dock, because on desktop we are adding to a page that already works.
 */
function extractDockState(doc: Document): FreeMoveState | null {
  if (detectPage(doc) !== PageType.FreeMove) return null;
  try {
    return extractFreeMove(doc);
  } catch (err) {
    console.warn('[Larkinor UI] Free-move extraction failed; dock degraded:', err);
    return null;
  }
}

/** The game's chat container. The dock is placed directly above it. */
const CHAT_SELECTOR = '#mydiv';

/**
 * Injects the dock's styles and creates its mount point. Returns null on
 * failure — a restrictive CSP rejecting GM_addStyle is the realistic case —
 * so the caller can bail out cleanly instead of rendering into nothing.
 *
 * Placement is recorded on the element as `data-placement`, which
 * `desktop.css` keys off: `inline` sits in the page flow above the chat at the
 * game container's width, `floating` is the self-contained corner panel used
 * where there is no chat to dock above.
 */
function mountDockRoot(doc: Document): HTMLDivElement | null {
  try {
    GM_addStyle(baseStyles);
    GM_addStyle(dockStyles);

    const root = doc.createElement('div');
    root.id = 'lc-dock-root';

    const chat = doc.querySelector(CHAT_SELECTOR);
    if (chat?.parentNode) {
      root.dataset.placement = 'inline';
      chat.parentNode.insertBefore(root, chat);
    } else {
      // No chat on this page — or the game's markup changed under us. Either
      // way the dock stays reachable rather than vanishing.
      root.dataset.placement = 'floating';
      doc.body.appendChild(root);
    }
    return root;
  } catch (err) {
    console.warn('[Larkinor UI] Dock mount failed:', err);
    return null;
  }
}

export function bootDesktop(doc: Document): void {
  const state = extractDockState(doc);

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
