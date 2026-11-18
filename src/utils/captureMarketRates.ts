// Capturing the market's current rates when a market page is visited.
//
// Shared by both boots and injected with its reader and writer (like
// captureLoadout), so the capture is testable without GM_* and the two boots
// cannot drift.

import { extractCatalogue, marketIdOf } from '@/utils/marketExtract';
import { MARKET_RATES_PREF_KEY } from '@/shared/prefKeys';
import { parseMarketRates, recordMarketRates, serializeMarketRates } from '@/shared/marketRates';

/**
 * Reads every quoted rate from the buy form's catalogue and stores them as this
 * market's, replacing its previous capture and keeping every other market's:
 * the catalogue lists the whole market, so the page is that market's complete
 * current answer. Returns whether anything was written — a page that does not
 * say which market it is, or quotes no rate, leaves the stored rates untouched.
 */
export function captureMarketRates(
  doc: Document,
  read: (key: string) => string | null,
  write: (key: string, value: string) => void,
  now: number = Date.now(),
): boolean {
  const marketId = marketIdOf(doc);
  if (marketId === null) {
    console.warn('[Larkinor UI] Market page names no market — market prices not updated');
    return false;
  }
  const rates: Record<string, number> = {};
  for (const entry of extractCatalogue(doc)) {
    if (entry.pricePercent !== null && /^\d+$/.test(entry.id)) rates[entry.id] = entry.pricePercent;
  }
  if (Object.keys(rates).length === 0) {
    console.warn('[Larkinor UI] Market page carried no quoted rates — market prices not updated');
    return false;
  }
  const stored = parseMarketRates(read(MARKET_RATES_PREF_KEY));
  write(MARKET_RATES_PREF_KEY, serializeMarketRates(recordMarketRates(stored, marketId, { capturedAt: now, rates })));
  return true;
}
