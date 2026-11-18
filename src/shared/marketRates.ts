// Live market rates, captured on every market visit and laid over the static
// database's `marketPrice`.
//
// The market pays a percentage of an item's shop price, and the game prints
// that percentage beside every item in the buy form's catalogue
// ("1 hetes kenyér (3000%)"), keyed by the same item id the database uses.
// Each market quotes its own: Larkinor 1425 items, Thord-Artin 44, at wildly
// different rates (gyémánt 236% vs 2900%), so the rates are kept per market
// (src/shared/markets.ts) and a row's `marketPrice` is the cheapest of them.
// The rates drift over time, so the scraped `marketPrice` in static/db goes
// stale; it stays only as Larkinor's fallback for an item the player has never
// seen quoted there (or for a player who has never visited it).
//
// Rates are stored, not prices: the shop price is already in the database, and
// storing the rate keeps one figure per item rather than a second copy of a
// value we can derive.
//
// Deliberately free of DOM, GM_* and `src/utils/**` imports, like loadout.ts:
// the read side runs inside the hosted database.

import type { DataLoader } from '@/shared/data/loader';
import type { MarketPrice } from '@/shared/data/types';
import { LARKINOR_MARKET_ID, marketLabel } from '@/shared/markets';

/** One market's quotes, as read off its catalogue on the last visit. */
export interface MarketQuote {
  /** Epoch ms of the market visit the rates were read on. */
  capturedAt: number;
  /** Game item id (as the catalogue's option value) → percentage of shop price. */
  rates: Record<string, number>;
}

/**
 * Every market's quotes, keyed by the market's picture id (src/shared/markets.ts).
 * Version 1 held a single table and could not say which market wrote it, so it
 * is dropped on read rather than guessed into Larkinor.
 */
export interface MarketRates {
  version: 2;
  markets: Record<string, MarketQuote>;
}

export function serializeMarketRates(rates: MarketRates): string {
  return JSON.stringify(rates);
}

function parseQuote(raw: unknown): MarketQuote | null {
  if (raw === null || typeof raw !== 'object') return null;
  const { capturedAt, rates } = raw as Partial<MarketQuote>;
  if (typeof rates !== 'object' || rates === null) return null;
  return { capturedAt: typeof capturedAt === 'number' ? capturedAt : 0, rates };
}

/**
 * Parses stored rates, or null for anything unusable — absent, unparseable, or
 * written by a different version of this shape. Null means "use the static
 * prices", which is always safe. One unusable market is dropped on its own.
 */
export function parseMarketRates(raw: string | null): MarketRates | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { version?: unknown; markets?: unknown };
    if (parsed?.version !== 2 || typeof parsed.markets !== 'object' || parsed.markets === null) return null;
    const markets: Record<string, MarketQuote> = {};
    for (const [id, value] of Object.entries(parsed.markets)) {
      const quote = parseQuote(value);
      if (quote) markets[id] = quote;
    }
    return { version: 2, markets };
  } catch {
    return null;
  }
}

/** The stored rates with one market's quotes replaced by a fresh visit's. */
export function recordMarketRates(previous: MarketRates | null, marketId: string, quote: MarketQuote): MarketRates {
  return { version: 2, markets: { ...(previous?.markets ?? {}), [marketId]: quote } };
}

/** The fields a database row needs for its market price to be recomputed. */
interface PricedRow {
  id: number;
  /** Typed as a number on the models, but 274 rows in static/db carry null. */
  price: number | null;
  marketPrice: number | null;
  marketPrices?: MarketPrice[];
}

/** One market's price for an item: shop price × rate, in whole silver; null when unquoted. */
function quotedPrice(quote: MarketQuote | undefined, id: string, price: number | null): number | null {
  const percent = quote?.rates[id];
  if (typeof percent !== 'number' || !Number.isFinite(percent) || typeof price !== 'number') return null;
  return Math.round((price * percent) / 100);
}

/** Larkinor first — the market the static figure describes — then the rest by id. */
function marketOrder(rates: MarketRates): string[] {
  const others = Object.keys(rates.markets).filter((id) => id !== LARKINOR_MARKET_ID).sort();
  return [LARKINOR_MARKET_ID, ...others];
}

/**
 * Prices every row at each market: `marketPrices` lists each market quoting the
 * item, and `marketPrice` becomes the cheapest of them. Larkinor's line is its
 * live rate, else the scraped static figure, which describes Larkinor's market;
 * every other market contributes only where it quotes the item. A row no market
 * prices keeps its static `marketPrice` (null). Returns new rows; the loader's
 * cached arrays are never mutated.
 */
export function applyMarketRates<T extends PricedRow>(rows: T[], rates: MarketRates | null): T[] {
  if (!rates) return rows;
  const order = marketOrder(rates);
  return rows.map((row) => {
    const id = String(row.id);
    const marketPrices: MarketPrice[] = [];
    for (const marketId of order) {
      const live = quotedPrice(rates.markets[marketId], id, row.price);
      const price = marketId === LARKINOR_MARKET_ID ? live ?? row.marketPrice : live;
      if (price !== null) marketPrices.push({ market: marketLabel(marketId), price });
    }
    const cheapest = marketPrices.length > 0 ? Math.min(...marketPrices.map((m) => m.price)) : row.marketPrice;
    return { ...row, marketPrice: cheapest, marketPrices };
  });
}

/**
 * One item's market price: the cheapest market quoting its game id, at its shop
 * price times that market's rate. Null without rates, an id, a price, or any
 * market quoting it — for the page rows that carry the id but no database row.
 */
export function marketPriceFor(id: string | null, price: number | null, rates: MarketRates | null): number | null {
  if (!rates || id === null) return null;
  const prices = Object.values(rates.markets)
    .map((quote) => quotedPrice(quote, id, price))
    .filter((p): p is number => p !== null);
  return prices.length > 0 ? Math.min(...prices) : null;
}

/**
 * Wraps a loader so weapons, armours and items carry live market prices. The
 * rates are read through `readRates` on every load, so a caller holding the
 * loader across pages still sees the latest capture.
 */
export function withMarketRates(loader: DataLoader, readRates: () => MarketRates | null): DataLoader {
  return {
    ...loader,
    loadWeapons: async () => applyMarketRates(await loader.loadWeapons(), readRates()),
    loadArmors: async () => applyMarketRates(await loader.loadArmors(), readRates()),
    loadItems: async () => applyMarketRates(await loader.loadItems(), readRates()),
  };
}
