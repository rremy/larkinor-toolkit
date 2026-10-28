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
  ForgeLobby = 'ForgeLobby',
  ForgeHall = 'ForgeHall',
  MageLobby = 'MageLobby',
  MageHall = 'MageHall',
  Bank = 'Bank',
  Arena = 'Arena',
  Palace = 'Palace',
  PalaceQuest = 'PalaceQuest',
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
    // equipment set, and the only place equipment can be changed. Both boots
    // capture the loadout on it; mobile also takes the page over.
    case 'otPlayerSettings':
      return PageType.Character;
    // The two crafting buildings are two pages each: a lobby of training and
    // entry buttons, and an inner hall holding the crafting form. Only the halls
    // craft; mobile takes over all four so the building reads as one UI.
    case 'otErod':
      return PageType.ForgeLobby;
    case 'otErodBelso':
      return PageType.ForgeHall;
    case 'otMagustorony':
      return PageType.MageLobby;
    case 'otMagustoronyBelso':
      return PageType.MageHall;
    // The page type says jeweller, but the building is the bank: its title,
    // its forms (Banktev/Bankkiv/Bankkir) and everything it does.
    case 'otEkszeresz':
      return PageType.Bank;
    case 'otArena':
      return PageType.Arena;
    // The palace is a lobby of entrances; of the rooms behind them only the
    // quest room has been seen (the statistics and house rooms stay Unknown).
    case 'otPalota':
      return PageType.Palace;
    case 'otPalotaKuldetes':
      return PageType.PalaceQuest;
    default:
      console.warn(`[Larkinor UI] Unrecognised oldalTipus "${oldalTipus ?? '(missing)'}" — rendering skipped`);
      return PageType.Unknown;
  }
}
