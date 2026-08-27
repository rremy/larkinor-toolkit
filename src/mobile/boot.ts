import { h, render, type ComponentChildren } from 'preact';
import { detectPage, PageType } from '@/utils/pageDetector';
import { extractFreeMove, extractBattle, extractLogin, extractDungeon, extractDungeonObservation, extractNarration, hideOriginalDOM, type FreeMoveState, type BattleState, type LoginState, type DungeonState } from '@/utils/domExtract';
import { activateQuestOffer } from '@/utils/activateQuestOffer';
import { activateActiveQuest } from '@/utils/activateActiveQuest';
import { activateDungeonPosition, advancePositionThroughBattle, clearDungeonPosition } from '@/utils/activateDungeonPosition';
import { armDungeonMoveTracking } from '@/utils/trackDungeonMove';
import { captureLoadout } from '@/utils/captureLoadout';
import { LoadoutContext } from '@/components/LoadoutContext';
import { readLoadout } from '@/utils/config';
import { getPref, setPref } from '@/utils/config';
import { extractHome, type HomeState } from '@/utils/homeExtract';
import { extractMarket, type MarketState } from '@/utils/marketExtract';
import { createDataLoader, gmSource, type MonsterDatabase } from '@/shared/data';
import { USERSCRIPT_DATA_BASE_URL } from '@/shared/publicUrl';
import { FreeMove } from '@/pages/FreeMove';
import { Battle } from '@/pages/Battle';
import { Login } from '@/pages/Login';
import { Dungeon } from '@/pages/Dungeon';
import { Home } from '@/pages/Home';
import { Market } from '@/pages/Market';
import baseStyles from '@/shared/styles/theme.css?raw';

// Mobile boot (proxy-DOM pattern): extract the game state, move the original
// DOM off-screen, and render a full replacement UI. The desktop counterpart in
// src/desktop/boot.ts augments the page instead — see
// docs/superpowers/specs/2026-08-11-desktop-support-design.md.

// Resolved once in @/shared/publicUrl and shared with the desktop boot and the
// in-game database overlay.
const DATA_BASE_URL = USERSCRIPT_DATA_BASE_URL;

// Discriminated union so the extracted state stays paired with — and
// narrowable by — the page type that produced it, instead of collapsing to
// the unhelpful `FreeMoveState | BattleState` union TypeScript would
// otherwise infer from a plain ternary.
type PageState =
  | { pageType: PageType.FreeMove; state: FreeMoveState }
  | { pageType: PageType.Battle; state: BattleState }
  | { pageType: PageType.Login; state: LoginState }
  | { pageType: PageType.Dungeon; state: DungeonState }
  | { pageType: PageType.Home; state: HomeState }
  | { pageType: PageType.Market; state: MarketState };

/**
 * The game page ships no viewport meta, so mobile browsers assume a ~980px
 * layout viewport and shrink the page — leaving our max-width UI floating with
 * empty margins. Set width=device-width so the mobile layout fills the screen.
 * Only called on pages we take over, so untouched pages keep their behaviour.
 */
function ensureMobileViewport(doc: Document): void {
  let meta = doc.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!meta) {
    meta = doc.createElement('meta');
    meta.name = 'viewport';
    doc.head.appendChild(meta);
  }
  meta.setAttribute('content', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

/** Extracts the page state for a page type we render, or null to skip it. */
function extractPageState(pageType: PageType, doc: Document): PageState | null {
  switch (pageType) {
    case PageType.FreeMove:
      return { pageType, state: extractFreeMove(doc) };
    case PageType.Battle:
      return { pageType, state: extractBattle(doc) };
    case PageType.Login:
      return { pageType, state: extractLogin(doc) };
    case PageType.Dungeon:
      return { pageType, state: extractDungeon(doc) };
    case PageType.Home:
      return { pageType, state: extractHome(doc) };
    case PageType.Market:
      return { pageType, state: extractMarket(doc) };
    default:
      return null; // v1 leaves other pages untouched
  }
}

export function bootMobile(doc: Document): void {
  // Extract state from the live game DOM before it gets moved off-screen.
  // The extractors query the document globally, so they would still find the
  // moved nodes even after hideOriginalDOM() — but extracting once up front
  // and reusing the snapshot for both renders avoids any dependency on that
  // ordering and avoids doing the extraction work twice.
  const pageType = detectPage(doc);

  // The pub is not a page mobile takes over, but its narration carries the
  // tavern quest briefs — so recognise one and pre-select it, and the quests
  // tab will open on it. This must run before the early return below, because
  // Tavern has no page state of its own.
  //
  // Silent here, unlike desktop: with no UI mounted on this page there is no
  // overlay for a "recognised" note to open, so mobile gets the activation
  // without the affordance.
  if (pageType === PageType.Tavern) {
    activateQuestOffer(extractNarration(doc), createDataLoader(gmSource(), DATA_BASE_URL), setPref)
      .catch((err) => console.warn('[Larkinor UI] Quest offer failed:', err));
  }

  // The character page is the only page that prints the worn equipment set, and
  // the only place it can be changed — so capturing on every visit keeps the
  // stored loadout current by construction. Like the quest offer above, this
  // runs before the early return: the page has no state of its own and mobile
  // deliberately renders nothing on it.
  if (pageType === PageType.Character) captureLoadout(doc, setPref);

  // Runs on every page, like the pub and dungeon activations above: the
  // active-quest line is not tied to a page type we render, and the link the
  // pages draw is a separate concern from remembering the id.
  activateActiveQuest(extractNarration(doc), getPref, setPref);

  // Inside a labyrinth, work out which maze cell the player is standing in and
  // store it, so the quests tab can mark it. Anywhere else, forget it — a
  // position that outlives the visit reads exactly like a live one.
  //
  // Like the quest offer above, this runs before the page-state early return so
  // it fires on every page, not only the ones mobile takes over.
  if (pageType === PageType.Dungeon) {
    // Armed first, and synchronously: a step taken before the async detection
    // resolves must still be recorded.
    armDungeonMoveTracking(doc, setPref);
    activateDungeonPosition(
      extractNarration(doc),
      extractDungeonObservation(doc),
      createDataLoader(gmSource(), DATA_BASE_URL),
      getPref,
      setPref,
    ).catch((err) => console.warn('[Larkinor UI] Dungeon position failed:', err));
  } else if (pageType === PageType.Battle) {
    // A fight is the game's answer to stepping onto a live monster, so the step
    // already happened and the fight is in the destination cell. Carrying the
    // position here — rather than leaving the step pending — is what lets the
    // page after the kill mark the tile: that page carries no narration at all,
    // so it could never confirm a movement.
    advancePositionThroughBattle(getPref, setPref);
  } else {
    // Every other page forgets the position — a marker that outlives the visit
    // reads exactly like a live one. A **battle** is the exception: it happens
    // *in* the labyrinth cell the player is standing in, and clearing there
    // broke the chain across every fight, which is precisely when a monster
    // stops being alive and the tile becomes clearable.
    clearDungeonPosition(setPref);
  }

  const pageState = extractPageState(pageType, doc);
  if (!pageState) return;

  ensureMobileViewport(doc);
  GM_addStyle(baseStyles);
  hideOriginalDOM(doc);

  const root = doc.createElement('div');
  root.id = 'lc-root';
  doc.body.appendChild(root);

  let db: MonsterDatabase | null = null;

  // The worn set, for the compare card on the inventory rows and in the
  // database overlay. Provided around every page we render, so an overlay
  // opened from any of them inherits it.
  const loadout = readLoadout();

  const renderPage = () => {
    const provide = (page: ComponentChildren) => h(LoadoutContext.Provider, { value: loadout }, page);
    switch (pageState.pageType) {
      case PageType.FreeMove:
        render(provide(h(FreeMove, { state: pageState.state, db })), root);
        break;
      case PageType.Battle:
        render(provide(h(Battle, { state: pageState.state, db })), root);
        break;
      case PageType.Login:
        render(provide(h(Login, { state: pageState.state })), root);
        break;
      case PageType.Dungeon:
        render(provide(h(Dungeon, { state: pageState.state })), root);
        break;
      case PageType.Home:
        render(provide(h(Home, { state: pageState.state })), root);
        break;
      case PageType.Market:
        render(provide(h(Market, { state: pageState.state })), root);
        break;
    }
  };

  renderPage(); // immediate render (db=null; login/dungeon never need it)

  // The login and dungeon screens have no monster references, and Home and the
  // market use the DB overlay's own on-demand loader, so skip the shared monster
  // fetch.
  if (
    pageState.pageType === PageType.Login
    || pageState.pageType === PageType.Dungeon
    || pageState.pageType === PageType.Home
    || pageState.pageType === PageType.Market
  ) return;

  createDataLoader(gmSource(), DATA_BASE_URL).loadMonsters()
    .then((loaded) => {
      db = loaded;
      renderPage();
    })
    .catch((err) => console.warn('[Larkinor UI] Failed to load monsters:', err));
}
