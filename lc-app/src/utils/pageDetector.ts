export enum PageType {
  FreeMove = 'FreeMove',
  Battle = 'Battle',
  Shop = 'Shop',
  Church = 'Church',
  Login = 'Login',
  Dungeon = 'Dungeon',
  Unknown = 'Unknown',
}

/**
 * Canonical page-type discriminator. Every Larkinor page carries
 * `<form name="urlap">` with a hidden `oldalTipus` field — read its value
 * rather than inferring the page type from incidental markup.
 *
 * See docs/superpowers/specs/2026-07-06-larkinor-real-dom-reference.md.
 */
export function detectPage(doc: Document): PageType {
  const oldalTipus = doc.querySelector<HTMLInputElement>('input[name="oldalTipus"]')?.value;

  switch (oldalTipus) {
    case 'otVilag':
      return PageType.FreeMove;
    case 'otHarc':
      return PageType.Battle;
    case 'otTemplom':
      return PageType.Church;
    case 'otLogin':
      return PageType.Login;
    case 'otLabirintus':
      return PageType.Dungeon;
    case 'otVegyesbolt':
    case 'otFegyverbolt':
    case 'otPiac':
      return PageType.Shop;
    default:
      console.warn(`[Larkinor UI] Unrecognised oldalTipus "${oldalTipus ?? '(missing)'}" — rendering skipped`);
      return PageType.Unknown;
  }
}
