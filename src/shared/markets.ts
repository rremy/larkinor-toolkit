// The game's markets, told apart by the building picture each market page draws.
//
// Every market page is `oldalTipus=otPiac` titled `Piac`; the only thing naming
// which market it is, is the building picture, `<grid id>piac.gif` — the grid
// naming the harbours use (`54piac.gif` on Larkinor's tile 54,
// `-1627piac.gif` on Thord-Artin's square (−16, 27); measured 2026-11-18). Each
// market quotes its own rates and holds its own offers, so both are stored per
// market id.
//
// Deliberately free of DOM and GM_*: the read side runs in the hosted database.

/** Larkinor's market — the one the database's scraped `marketPrice` describes. */
export const LARKINOR_MARKET_ID = '54';

const KNOWN_MARKETS: Readonly<Record<string, string>> = {
  [LARKINOR_MARKET_ID]: 'Larkinor',
  '-1627': 'Thord-Artin',
};

/**
 * The market's name as the UI prints it. An unknown market is labelled by its
 * picture id: the id cannot be split into row and column unambiguously (see
 * `harbourById`), so it is shown as written.
 */
export function marketLabel(id: string): string {
  return KNOWN_MARKETS[id] ?? `Piac (${id})`;
}
