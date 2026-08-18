export enum PageType {
  FreeMove = 'FreeMove',
  Battle = 'Battle',
  Shop = 'Shop',
  Market = 'Market',
  Church = 'Church',
  Tavern = 'Tavern',
  Login = 'Login',
  Dungeon = 'Dungeon',
  Home = 'Home',
  Character = 'Character',
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
    // The pub is where tavern quests are handed out: its narration embeds the
    // quest brief, which `questOffer` matches against the quest database.
    case 'otKocsma':
      return PageType.Tavern;
    case 'otLogin':
      return PageType.Login;
    case 'otLabirintus':
      return PageType.Dungeon;
    case 'otVegyesbolt':
    case 'otFegyverbolt':
      return PageType.Shop;
    // The market is its own type, not a shop: it trades player-to-player, and
    // the desktop dock gives it a panel of its own.
    case 'otPiac':
      return PageType.Market;
    case 'otSajathaz':
      return PageType.Home;
    // The character page ("karakterlap"): the only page that prints the worn
    // equipment set, and the only place equipment can be changed. Nothing is
    // rendered on it — the boots capture the loadout and leave the page alone.
    case 'otPlayerSettings':
      return PageType.Character;
    default:
      console.warn(`[Larkinor UI] Unrecognised oldalTipus "${oldalTipus ?? '(missing)'}" — rendering skipped`);
      return PageType.Unknown;
  }
}
