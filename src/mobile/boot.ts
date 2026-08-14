import { h, render } from 'preact';
import { detectPage, PageType } from '@/utils/pageDetector';
import { extractFreeMove, extractBattle, extractLogin, extractDungeon, extractNarration, hideOriginalDOM, type FreeMoveState, type BattleState, type LoginState, type DungeonState } from '@/utils/domExtract';
import { activateQuestOffer } from '@/utils/activateQuestOffer';
import { setPref } from '@/utils/config';
import { extractHome, type HomeState } from '@/utils/homeExtract';
import { createDataLoader, gmSource, type MonsterDatabase } from '@/shared/data';
import { USERSCRIPT_DATA_BASE_URL } from '@/shared/publicUrl';
import { FreeMove } from '@/pages/FreeMove';
import { Battle } from '@/pages/Battle';
import { Login } from '@/pages/Login';
import { Dungeon } from '@/pages/Dungeon';
import { Home } from '@/pages/Home';
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
  | { pageType: PageType.Home; state: HomeState };

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

  const pageState = extractPageState(pageType, doc);
  if (!pageState) return;

  ensureMobileViewport(doc);
  GM_addStyle(baseStyles);
  hideOriginalDOM(doc);

  const root = doc.createElement('div');
  root.id = 'lc-root';
  doc.body.appendChild(root);

  let db: MonsterDatabase | null = null;

  const renderPage = () => {
    switch (pageState.pageType) {
      case PageType.FreeMove:
        render(h(FreeMove, { state: pageState.state, db }), root);
        break;
      case PageType.Battle:
        render(h(Battle, { state: pageState.state, db }), root);
        break;
      case PageType.Login:
        render(h(Login, { state: pageState.state }), root);
        break;
      case PageType.Dungeon:
        render(h(Dungeon, { state: pageState.state }), root);
        break;
      case PageType.Home:
        render(h(Home, { state: pageState.state }), root);
        break;
    }
  };

  renderPage(); // immediate render (db=null; login/dungeon never need it)

  // The login and dungeon screens have no monster references, and Home uses
  // the DB overlay's own on-demand loader, so skip the shared monster fetch.
  if (pageState.pageType === PageType.Login || pageState.pageType === PageType.Dungeon || pageState.pageType === PageType.Home) return;

  createDataLoader(gmSource(), DATA_BASE_URL).loadMonsters()
    .then((loaded) => {
      db = loaded;
      renderPage();
    })
    .catch((err) => console.warn('[Larkinor UI] Failed to load monsters:', err));
}
