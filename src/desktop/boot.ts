// Desktop boot. The inverse posture of the mobile boot: the game page keeps
// rendering itself and we only add a companion dock plus in-place narration
// links. Nothing here may move, hide or restyle the game's own DOM.
//
// The dock is a fixed panel appended to <body>, never inserted into the game's
// layout. That layout is absolutely positioned, so a block element spliced into
// it does not push siblings aside — it lands on top of them and drags the
// visible column off-screen. Instead we measure the game's content column and
// align the fixed panel to it, which looks like it belongs to the page without
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

/** The game's chat container — the widest reliable marker of its content column. */
const CHAT_SELECTOR = '#mydiv';

/** Width of the game's content column, used when it cannot be measured. */
const FALLBACK_DOCK_WIDTH = 633;

/**
 * Aligns the fixed dock with the game's content column by writing the two
 * custom properties `desktop.css` positions it from.
 *
 * The width is measured rather than hardcoded so the dock keeps lining up if
 * the game's column differs from the expected 633px. When measurement is
 * unavailable — no chat element, or a layout engine that reports zero rects —
 * it falls back to a centred column of the expected width, which is always
 * on-screen even if it does not line up perfectly.
 */
function alignDock(root: HTMLElement, doc: Document): void {
  const rect = doc.querySelector(CHAT_SELECTOR)?.getBoundingClientRect();
  const viewportWidth = doc.defaultView?.innerWidth ?? 0;

  const measured = rect && rect.width > 0;
  const width = measured ? rect.width : FALLBACK_DOCK_WIDTH;
  // `left` is in viewport coordinates because the panel is position: fixed, so
  // the rect needs no scroll offset applied.
  const left = measured ? rect.left : Math.max(0, (viewportWidth - width) / 2);

  root.style.setProperty('--lc-dock-width', `${Math.round(width)}px`);
  root.style.setProperty('--lc-dock-left', `${Math.round(left)}px`);
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
