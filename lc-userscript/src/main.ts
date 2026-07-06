import { h, render } from 'preact';
import { detectPage, PageType } from '@/utils/pageDetector';
import { extractFreeMove, extractBattle, hideOriginalDOM, type FreeMoveState, type BattleState } from '@/utils/domExtract';
import { loadMonsters, type MonsterDatabase } from '@/data/monsters';
import { FreeMove } from '@/pages/FreeMove';
import { Battle } from '@/pages/Battle';
import baseStyles from '@/styles/base.css?raw';

// Deployment constant — where monsters.json is hosted.
const MONSTERS_JSON_URL = 'https://example.invalid/larkinor/monsters.json';

// Discriminated union so the extracted state stays paired with — and
// narrowable by — the page type that produced it, instead of collapsing to
// the unhelpful `FreeMoveState | BattleState` union TypeScript would
// otherwise infer from a plain ternary.
type PageState =
  | { pageType: PageType.FreeMove; state: FreeMoveState }
  | { pageType: PageType.Battle; state: BattleState };

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

function boot(): void {
  const pageType = detectPage(document);
  if (pageType !== PageType.FreeMove && pageType !== PageType.Battle) {
    return; // v1 renders only FreeMove + Battle; leave other pages untouched
  }

  ensureMobileViewport(document);

  // Extract state from the live game DOM before it gets moved off-screen.
  // The extractors query `document` globally, so they would still find the
  // moved nodes even after hideOriginalDOM() — but extracting once up front
  // and reusing the snapshot for both renders avoids any dependency on that
  // ordering and avoids doing the extraction work twice.
  const pageState: PageState =
    pageType === PageType.FreeMove
      ? { pageType, state: extractFreeMove(document) }
      : { pageType, state: extractBattle(document) };

  GM_addStyle(baseStyles);
  hideOriginalDOM(document);

  const root = document.createElement('div');
  root.id = 'lc-root';
  document.body.appendChild(root);

  let db: MonsterDatabase | null = null;

  const renderPage = () => {
    if (pageState.pageType === PageType.FreeMove) {
      render(h(FreeMove, { state: pageState.state, db }), root);
    } else {
      render(h(Battle, { state: pageState.state, db }), root);
    }
  };

  renderPage(); // immediate render with db=null
  loadMonsters(MONSTERS_JSON_URL)
    .then((loaded) => {
      db = loaded;
      renderPage();
    })
    .catch((err) => console.warn('[Larkinor UI] Failed to load monsters:', err));
}

boot();
