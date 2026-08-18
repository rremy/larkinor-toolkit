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
import { extractBattle, extractFreeMove, type FreeMoveState } from '@/utils/domExtract';
import { extractHome, type HomeState } from '@/utils/homeExtract';
import { extractMarket, type MarketState } from '@/utils/marketExtract';
import { createDataLoader, gmSource, type MonsterDatabase } from '@/shared/data';
import { USERSCRIPT_DATA_BASE_URL } from '@/shared/publicUrl';
import { DesktopDock } from '@/desktop/DesktopDock';
import { activateQuestOffer } from '@/utils/activateQuestOffer';
import { captureLoadout } from '@/utils/captureLoadout';
import { renderQuestOfferNote } from '@/desktop/questOfferNote';
import { extractNarration } from '@/utils/domExtract';
import { setPref } from '@/utils/config';
import baseStyles from '@/shared/styles/theme.css?raw';
import dockStyles from '@/desktop/desktop.css?raw';

// Resolved once in @/shared/publicUrl and shared with the mobile boot and the
// in-game database overlay.
const DATA_BASE_URL = USERSCRIPT_DATA_BASE_URL;

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

/**
 * Name of the monster being fought, for the dock's Adatlap button. Null off the
 * battle screen and on failure — the dock stays useful without it.
 */
function extractBattleMonsterName(pageType: PageType, doc: Document): string | null {
  if (pageType !== PageType.Battle) return null;
  try {
    return extractBattle(doc).monsterName || null;
  } catch (err) {
    console.warn('[Larkinor UI] Battle extraction failed; monster sheet unavailable:', err);
    return null;
  }
}

/**
 * Market state, for the dock's Piac panel. Null anywhere else, and on failure —
 * the dock stays useful without it.
 */
function extractMarketState(pageType: PageType, doc: Document): MarketState | null {
  if (pageType !== PageType.Market) return null;
  try {
    return extractMarket(doc);
  } catch (err) {
    console.warn('[Larkinor UI] Market extraction failed; market panel unavailable:', err);
    return null;
  }
}

/**
 * Home-page inventory state, for the dock's Készlet panel. Null anywhere else,
 * and on failure — the dock stays useful without it.
 */
function extractInventoryState(pageType: PageType, doc: Document): HomeState | null {
  if (pageType !== PageType.Home) return null;
  try {
    return extractHome(doc);
  } catch (err) {
    console.warn('[Larkinor UI] Home extraction failed; inventory panel unavailable:', err);
    return null;
  }
}

/** The game's chat panel. The dock is laid over its message log. */
const CHAT_SELECTOR = '#mydiv';

/** The game's content column, measured live: the chat's own parent. */
const FALLBACK_COLUMN_RECT = { left: 0, width: 633 };

/** Clearance left under the chat's own text input. */
const CHAT_INPUT_GAP = 4;

/** Clearance kept above the viewport's bottom edge. */
const VIEWPORT_MARGIN = 8;

/** Floor for the dock's height, so it never collapses to an unusable sliver. */
const MIN_DOCK_HEIGHT = 120;

/**
 * The game's right edge, published as `--lc-game-right` so the minimised
 * database overlay can fill the empty page beside the game.
 *
 * A constant, not a measurement. Measuring the widest thing on the page looked
 * more adaptive but was wrong: the page carries third-party ad content that
 * renders past the game and is not part of it, so the measured edge landed too
 * far right and the docked overlay came out narrower than the space it was meant
 * to fill. The game's layout is absolutely positioned in fixed pixels and does
 * not respond to the viewport, so there is nothing to adapt to — change this one
 * value if the game's width ever changes.
 */
const GAME_WIDTH = 791;

/**
 * Lays the dock over the game's chat panel by writing the custom properties
 * `desktop.css` positions it from.
 *
 * Measured rather than hardcoded because the game's layout is absolutely
 * positioned: overlaying it is the only way to sit inside the game's own column
 * without joining that layout, where an inserted block displaces nothing and
 * overlaps everything.
 *
 * Horizontal placement comes from the game's **content column** (the chat's
 * parent) rather than the chat itself: the extra ~130px is what lets the wide
 * action buttons wrap two-per-row instead of one, which nearly halves the
 * dock's height. Vertical placement comes from the chat.
 *
 * The height is **not** bounded by the chat: the dock may run taller and only
 * the viewport limits it. Scrolling inside a dock is worse than extending past
 * the panel, and the area below the chat holds nothing but chat text that has
 * already overflowed the chat box.
 *
 * Two things the naive "cover the whole chat rect" version got wrong, both
 * found by measuring the live page:
 *  - The chat's text input sits at the top of the panel, so covering the full
 *    rect stops the player typing. We start below it.
 *  - Bounding the height by the chat forced the action list to scroll even with
 *    room to spare underneath.
 *
 * Pages without a chat at all — Home is one — get `data-anchor="bottom"` and sit
 * at the foot of the game column instead. An earlier version fell back to the
 * chat's known coordinates there, which planted the bar at a spot that meant
 * nothing on that page.
 *
 * Coordinates are viewport-relative, which is correct for `position: fixed` and
 * needs no scroll offset — and the game page does not scroll, so a single
 * measurement at boot stays valid.
 */
function alignDock(root: HTMLElement, doc: Document): void {
  const chat = doc.querySelector(CHAT_SELECTOR);
  const measured = chat?.getBoundingClientRect();

  // No chat to lay the dock over — the Home page is one such. Anchor to the
  // bottom of the game column instead of pretending the fallback chat
  // coordinates mean something, which put the bar at an arbitrary spot.
  if (!measured || measured.width === 0) {
    root.dataset.anchor = 'bottom';
    root.style.setProperty('--lc-dock-left', `${FALLBACK_COLUMN_RECT.left}px`);
    root.style.setProperty('--lc-dock-width', `${FALLBACK_COLUMN_RECT.width}px`);
    root.style.setProperty('--lc-dock-max-height', `${Math.round((doc.defaultView?.innerHeight ?? 0) * 0.5) || MIN_DOCK_HEIGHT}px`);
    root.style.setProperty('--lc-game-right', `${GAME_WIDTH}px`);
    return;
  }

  const rect = measured;

  // Horizontal: the game's content column, which the chat is inset within.
  const columnMeasured = chat?.parentElement?.getBoundingClientRect();
  const column = columnMeasured && columnMeasured.width > 0 ? columnMeasured : FALLBACK_COLUMN_RECT;

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

  root.style.setProperty('--lc-dock-left', `${Math.round(column.left)}px`);
  root.style.setProperty('--lc-dock-top', `${Math.round(top)}px`);
  root.style.setProperty('--lc-dock-width', `${Math.round(column.width)}px`);
  root.style.setProperty('--lc-dock-max-height', `${Math.round(height)}px`);
  root.style.setProperty('--lc-game-right', `${GAME_WIDTH}px`);
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
  const homeState = extractInventoryState(pageType, doc);
  const marketState = extractMarketState(pageType, doc);
  const battleMonsterName = extractBattleMonsterName(pageType, doc);

  const root = mountDockRoot(doc);
  if (!root) return;

  let db: MonsterDatabase | null = null;
  let openQuestsSignal = 0;
  let openQuestTarget: { set: 'tavern'; id: string } | null = null;

  const renderDock = () => {
    try {
      render(h(DesktopDock, { doc, state, db, homeState, marketState, battleMonsterName, dbButtonOnly: state === null, inDungeon: pageType === PageType.Dungeon, openQuestsSignal, openQuestTarget }), root);
    } catch (err) {
      console.warn('[Larkinor UI] Dock render failed:', err);
    }
  };

  renderDock();

  // The character page is the only page that prints the worn equipment set, and
  // the only place it can be changed, so capturing on every visit keeps the
  // stored loadout current by construction.
  if (pageType === PageType.Character) captureLoadout(doc, setPref);

  // The pub hands out tavern quests by printing the brief in its narration.
  // Recognising it pre-selects that quest in the database, so opening the
  // quests tab lands on the one just accepted, and offers a link straight to
  // it. Fire-and-forget: nothing else on the page waits for this.
  if (pageType === PageType.Tavern) {
    activateQuestOffer(extractNarration(doc), createDataLoader(gmSource(), DATA_BASE_URL), setPref)
      .then((match) => {
        if (!match) return;
        // Route to the quest explicitly rather than leaning on the
        // preferences just written: QuestView reads the stored set once at
        // mount, so an overlay already open when this resolves would never
        // see them.
        openQuestTarget = { set: 'tavern', id: match.quest.id };
        renderQuestOfferNote(doc, {
          title: match.quest.title,
          onOpen: () => { openQuestsSignal += 1; renderDock(); },
        });
      })
      .catch((err) => console.warn('[Larkinor UI] Quest offer failed:', err));
  }

  // The free-move narration and the battle screen's monster sheet are the two
  // things needing monster data up front; every other panel loads its own on
  // demand.
  if (!state && !battleMonsterName) return;

  createDataLoader(gmSource(), DATA_BASE_URL).loadMonsters()
    .then((loaded) => {
      db = loaded;
      renderDock(); // re-render so the narration effect can run with a db
    })
    .catch((err) => console.warn('[Larkinor UI] Failed to load monsters:', err));
}
