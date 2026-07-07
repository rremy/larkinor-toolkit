import { h, render } from 'preact';
import { detectPage, PageType } from '@/utils/pageDetector';
import { extractFreeMove, extractBattle, extractLogin, hideOriginalDOM, type FreeMoveState, type BattleState, type LoginState } from '@/utils/domExtract';
import { loadMonsters, type MonsterDatabase } from '@/data/monsters';
import { FreeMove } from '@/pages/FreeMove';
import { Battle } from '@/pages/Battle';
import { Login } from '@/pages/Login';
import baseStyles from '@/styles/base.css?raw';

// Deployment constant — where monsters.json is hosted.
const MONSTERS_JSON_URL = 'https://example.invalid/larkinor/monsters.json';

// Discriminated union so the extracted state stays paired with — and
// narrowable by — the page type that produced it, instead of collapsing to
// the unhelpful `FreeMoveState | BattleState` union TypeScript would
// otherwise infer from a plain ternary.
type PageState =
  | { pageType: PageType.FreeMove; state: FreeMoveState }
  | { pageType: PageType.Battle; state: BattleState }
  | { pageType: PageType.Login; state: LoginState };

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
    default:
      return null; // v1 leaves other pages untouched
  }
}

function boot(): void {
  // Extract state from the live game DOM before it gets moved off-screen.
  // The extractors query `document` globally, so they would still find the
  // moved nodes even after hideOriginalDOM() — but extracting once up front
  // and reusing the snapshot for both renders avoids any dependency on that
  // ordering and avoids doing the extraction work twice.
  const pageState = extractPageState(detectPage(document), document);
  if (!pageState) return;

  ensureMobileViewport(document);
  GM_addStyle(baseStyles);
  hideOriginalDOM(document);

  const root = document.createElement('div');
  root.id = 'lc-root';
  document.body.appendChild(root);

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
    }
  };

  renderPage(); // immediate render (db=null; the login screen never needs it)

  // The login screen has no monster references, so skip the network fetch.
  if (pageState.pageType === PageType.Login) return;

  loadMonsters(MONSTERS_JSON_URL)
    .then((loaded) => {
      db = loaded;
      renderPage();
    })
    .catch((err) => console.warn('[Larkinor UI] Failed to load monsters:', err));
}

boot();
