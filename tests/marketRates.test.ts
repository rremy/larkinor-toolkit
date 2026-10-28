import { describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  applyMarketRates,
  parseMarketRates,
  serializeMarketRates,
  withMarketRates,
  type MarketRates,
} from '../src/shared/marketRates';
import { captureMarketRates } from '../src/utils/captureMarketRates';
import { MARKET_RATES_PREF_KEY } from '../src/shared/prefKeys';
import type { DataLoader, Item, Weapon } from '../src/shared/data';

const rates = (r: Record<string, number>): MarketRates => ({ version: 1, capturedAt: 1, rates: r });

// The two kenyér rows carry the live page's real figures: 26 and 2700 ezüst at 3000%.
const row = (id: number, price: number | null, marketPrice: number | null) =>
  ({ id, name: `#${id}`, price, marketPrice }) as unknown as Weapon;

const marketPage = (options: string) => new JSDOM(`<html><body>
  <form name="vetelUrlap"><select name="melyik">${options}</select></form>
</body></html>`).window.document;

describe('applyMarketRates', () => {
  it('prices a quoted item at its shop price times the live rate', () => {
    const [week, decade] = applyMarketRates([row(338, 26, 1), row(344, 2700, 1)], rates({ 338: 3000, 344: 3000 }));
    expect(week.marketPrice).toBe(780);
    expect(decade.marketPrice).toBe(81000);
  });

  it('rounds to whole silver', () => {
    expect(applyMarketRates([row(1, 3, null)], rates({ 1: 50 }))[0].marketPrice).toBe(2);
  });

  it('keeps the static price for an unquoted item, or one with no shop price', () => {
    const [unquoted, unpriced] = applyMarketRates([row(1, 10, 99), row(2, null, 77)], rates({ 2: 300 }));
    expect(unquoted.marketPrice).toBe(99);
    expect(unpriced.marketPrice).toBe(77);
  });

  it('returns the rows untouched without rates, and never mutates them', () => {
    const rows = [row(338, 26, 1)];
    expect(applyMarketRates(rows, null)).toBe(rows);
    applyMarketRates(rows, rates({ 338: 3000 }));
    expect(rows[0].marketPrice).toBe(1);
  });
});

describe('parseMarketRates', () => {
  it('round-trips', () => {
    const r = rates({ 338: 3000 });
    expect(parseMarketRates(serializeMarketRates(r))).toEqual(r);
  });

  it('is null for anything unusable', () => {
    expect(parseMarketRates(null)).toBeNull();
    expect(parseMarketRates('not json')).toBeNull();
    expect(parseMarketRates('{"version":2,"rates":{}}')).toBeNull();
    expect(parseMarketRates('{"version":1}')).toBeNull();
  });
});

describe('withMarketRates', () => {
  it('overlays weapons, armours and items, reading the rates on every load', async () => {
    const base = {
      loadWeapons: async () => [row(338, 26, 1)],
      loadArmors: async () => [],
      loadItems: async () => [row(5, 10, 1) as unknown as Item],
      loadMonsters: vi.fn(),
    } as unknown as DataLoader;
    let current: MarketRates | null = null;
    const loader = withMarketRates(base, () => current);

    expect((await loader.loadWeapons())[0].marketPrice).toBe(1);
    current = rates({ 338: 3000, 5: 200 });
    expect((await loader.loadWeapons())[0].marketPrice).toBe(780);
    expect((await loader.loadItems())[0].marketPrice).toBe(20);
    expect(loader.loadMonsters).toBe(base.loadMonsters);
  });
});

describe('captureMarketRates', () => {
  it('stores every quoted rate keyed by the game item id', () => {
    const write = vi.fn();
    const doc = marketPage(
      '<option value="338" selected>1 hetes kenyér (3000%)</option><option value="344">10 éves kenyér (3000%)</option>'
      + '<option value="37">jáspis (170%)</option><option value="9">rejtély</option>',
    );

    expect(captureMarketRates(doc, write, 42)).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    const [key, value] = write.mock.calls[0];
    expect(key).toBe(MARKET_RATES_PREF_KEY);
    expect(parseMarketRates(value)).toEqual({ version: 1, capturedAt: 42, rates: { 338: 3000, 344: 3000, 37: 170 } });
  });

  it('writes nothing when the page quotes no rate', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const write = vi.fn();

    expect(captureMarketRates(marketPage('<option value="9">rejtély</option>'), write)).toBe(false);
    expect(write).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
