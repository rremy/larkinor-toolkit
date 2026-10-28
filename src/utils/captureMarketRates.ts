// Capturing the market's current rates when the market page is visited.
//
// Shared by both boots and injected with its writer (like captureLoadout), so
// the capture is testable without GM_* and the two boots cannot drift.

import { extractCatalogue } from '@/utils/marketExtract';
import { MARKET_RATES_PREF_KEY } from '@/shared/prefKeys';
import { serializeMarketRates } from '@/shared/marketRates';

/**
 * Reads every quoted rate from the buy form's catalogue and stores them,
 * replacing the previous capture: the catalogue lists the whole market, so the
 * page is the complete current answer. Returns whether anything was written — a
 * page with no quoted rates leaves the stored ones untouched rather than
 * wiping them.
 */
export function captureMarketRates(
  doc: Document,
  write: (key: string, value: string) => void,
  now: number = Date.now(),
): boolean {
  const rates: Record<string, number> = {};
  for (const entry of extractCatalogue(doc)) {
    if (entry.pricePercent !== null && /^\d+$/.test(entry.id)) rates[entry.id] = entry.pricePercent;
  }
  if (Object.keys(rates).length === 0) {
    console.warn('[Larkinor UI] Market page carried no quoted rates — market prices not updated');
    return false;
  }
  write(MARKET_RATES_PREF_KEY, serializeMarketRates({ version: 1, capturedAt: now, rates }));
  return true;
}
