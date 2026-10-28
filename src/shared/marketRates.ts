// Live market rates, captured on every market visit and laid over the static
// database's `marketPrice`.
//
// The market pays a percentage of an item's shop price, and the game prints
// that percentage beside every item in the buy form's catalogue
// ("1 hetes kenyér (3000%)") — 1424 items, keyed by the same item id the
// database uses. The rates drift over time, so the scraped `marketPrice` in
// static/db goes stale; it stays only as the fallback for an item the player
// has never seen quoted (or for a player who has never visited the market).
//
// Rates are stored, not prices: the shop price is already in the database, and
// storing the rate keeps one figure per item rather than a second copy of a
// value we can derive.
//
// Deliberately free of DOM, GM_* and `src/utils/**` imports, like loadout.ts:
// the read side runs inside the hosted database.

import type { DataLoader } from '@/shared/data/loader';

export interface MarketRates {
  version: 1;
  /** Epoch ms of the market visit the rates were read on. */
  capturedAt: number;
  /** Game item id (as the catalogue's option value) → percentage of shop price. */
  rates: Record<string, number>;
}

export function serializeMarketRates(rates: MarketRates): string {
  return JSON.stringify(rates);
}

/**
 * Parses stored rates, or null for anything unusable — absent, unparseable, or
 * written by a different version of this shape. Null means "use the static
 * prices", which is always safe.
 */
export function parseMarketRates(raw: string | null): MarketRates | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<MarketRates>;
    if (parsed?.version !== 1 || typeof parsed.rates !== 'object' || parsed.rates === null) return null;
    return {
      version: 1,
      capturedAt: typeof parsed.capturedAt === 'number' ? parsed.capturedAt : 0,
      rates: parsed.rates,
    };
  } catch {
    return null;
  }
}

/** The fields a database row needs for its market price to be recomputed. */
interface PricedRow {
  id: number;
  /** Typed as a number on the models, but 274 rows in static/db carry null. */
  price: number | null;
  marketPrice: number | null;
}

/**
 * Recomputes `marketPrice` as the shop price scaled by the live rate, rounded to
 * whole silver like the market panel's own suggestion. A row with no captured
 * rate, or no shop price to scale, keeps its static figure. Returns new rows;
 * the loader's cached arrays are never mutated.
 */
export function applyMarketRates<T extends PricedRow>(rows: T[], rates: MarketRates | null): T[] {
  if (!rates) return rows;
  return rows.map((row) => {
    const percent = rates.rates[String(row.id)];
    if (typeof percent !== 'number' || !Number.isFinite(percent) || typeof row.price !== 'number') return row;
    return { ...row, marketPrice: Math.round((row.price * percent) / 100) };
  });
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
