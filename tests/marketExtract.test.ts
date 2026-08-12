import { describe, it, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { extractMarket, parsePricePercents, suggestPrice } from '../src/utils/marketExtract';

/**
 * Sanitised reconstruction of the live market page (otPiac). Values are the real
 * ones: jáspis is 50 ezüst at 170%, and the standing offer on the page is 85.
 */
const MARKET_HTML = `
  <form name="urlap">
    <input type="hidden" name="oldalTipus" value="otPiac">
    <input type="hidden" name="Submit" value="semmi">
    <input type="hidden" name="par1"><input type="hidden" name="par2">
  </form>

  <form name="eladasUrlap">
    <select name="hatizsak">
      <option value="0">5725 ezüst</option>
      <option value="6">1 vámpír kard</option>
      <option value="30">19 jáspis</option>
    </select>
    <input type="text" name="mennyiseg" value="1">
    <input type="text" name="ar" value="1">
    <select name="felkinalt">
      <option value="281">1 db. 4 élű kard 1000 ezüst/db. áron</option>
      <option value="94">6 db. agyar 700 ezüst/db. áron</option>
    </select>
  </form>

  <form name="vetelUrlap">
    <select name="melyik">
      <option value="37">jáspis (170%)</option>
      <option value="41">vámpír kard (300%)</option>
      <option value="338">1 hetes kenyér (3000%)</option>
      <option value="94">agyar (565%)</option>
    </select>
    <input type="text" name="mennyit">
  </form>

  <input type="image" src="/2/ikon/felkinal.gif" title="Felkínálod">
  <input type="image" src="/2/ikon/visszavon.gif" title="Visszavonod">

  <script>
    hatizsakTargyak[0] = "Név: ezüst\\nSúly: 0.0001 kg.\\nMennyiség: 5725\\n";
    hatizsakTargyak[1] = "Típus: fegyver\\nNév: vámpír kard\\nSúly: 1.3 kg.\\nÁr: 250 ezüst\\n";
    hatizsakTargyak[2] = "Név: jáspis\\nSúly: 0.04 kg.\\nÁr: 50 ezüst\\nMennyiség: 19\\nÖsszsúly: 0.76 kg.\\n";
    felkinaltTargyak[0] = "Típus: fegyver\\nNév: 4 élű kard\\nSúly: 1.5 kg.\\nÁr: 156 ezüst\\n";
    felkinaltTargyak[1] = "Név: agyar\\nSúly: 4 kg.\\nÁr: 124 ezüst\\nMennyiség: 6\\n";
    felkinaltTargyakInfo[0] = "281";
    felkinaltTargyakInfo[1] = "94";
  </script>
`;

function marketDoc(): Document {
  return new JSDOM(`<html><body>${MARKET_HTML}</body></html>`).window.document;
}

describe('suggestPrice', () => {
  it('scales the item price by the market percentage', () => {
    // The live page's own figure: jáspis at 50 ezüst and 170% is offered at 85.
    expect(suggestPrice(50, 170)).toBe(85);
  });

  it('rounds to whole silver', () => {
    expect(suggestPrice(33, 170)).toBe(56); // 56.1
  });

  it('falls back to the plain price when the item has no percentage', () => {
    expect(suggestPrice(50, null)).toBe(50);
  });

  it('has nothing to suggest for an item with no price', () => {
    // Silver itself is listed in the backpack and the game gives it no Ár.
    expect(suggestPrice(null, 170)).toBeNull();
    expect(suggestPrice(null, null)).toBeNull();
  });
});

describe('parsePricePercents', () => {
  it('reads the percentage out of each item label', () => {
    const percents = parsePricePercents(marketDoc());
    expect(percents.get('jáspis')).toBe(170);
    expect(percents.get('vámpír kard')).toBe(300);
    // Names containing digits must not confuse the label parse.
    expect(percents.get('1 hetes kenyér')).toBe(3000);
  });

  it('returns an empty map when the buy form is absent', () => {
    const doc = new JSDOM('<html><body></body></html>').window.document;
    expect(parsePricePercents(doc).size).toBe(0);
  });
});

describe('extractMarket', () => {
  it('lists the backpack with a suggested price per item', () => {
    const { items } = extractMarket(marketDoc());

    const jaspis = items.find(i => i.name === 'jáspis')!;
    expect(jaspis.amount).toBe(19);
    expect(jaspis.price).toBe(50);
    expect(jaspis.pricePercent).toBe(170);
    expect(jaspis.suggestedPrice).toBe(85);
  });

  it('suggests nothing for an item the game prices at nothing', () => {
    const { items } = extractMarket(marketDoc());
    const silver = items.find(i => i.name === 'ezüst')!;
    expect(silver.suggestedPrice).toBeNull();
  });

  it('drives the game form to offer an item', () => {
    const doc = marketDoc();
    const { items, offer } = extractMarket(doc);
    const button = doc.querySelector<HTMLInputElement>('input[src*="felkinal"]')!;
    const clicked = vi.fn();
    button.addEventListener('click', clicked);

    offer(items.find(i => i.name === 'jáspis')!, 19, 85);

    const form = doc.forms.namedItem('eladasUrlap')!;
    // The game's handler indexes a parallel array by selectedIndex, so the index
    // is what has to be set — not merely a matching value.
    expect((form.elements.namedItem('hatizsak') as HTMLSelectElement).selectedIndex).toBe(2);
    expect((form.elements.namedItem('mennyiseg') as HTMLInputElement).value).toBe('19');
    expect((form.elements.namedItem('ar') as HTMLInputElement).value).toBe('85');
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it('clamps the offered quantity to the stack', () => {
    const doc = marketDoc();
    const { items, offer } = extractMarket(doc);
    offer(items.find(i => i.name === 'jáspis')!, 999, 85);

    const form = doc.forms.namedItem('eladasUrlap')!;
    expect((form.elements.namedItem('mennyiseg') as HTMLInputElement).value).toBe('19');
  });

  it('lists standing offers and revokes one by its index', () => {
    const doc = marketDoc();
    const { listings } = extractMarket(doc);
    const button = doc.querySelector<HTMLInputElement>('input[src*="visszavon"]')!;
    const clicked = vi.fn();
    button.addEventListener('click', clicked);

    expect(listings.map(l => l.label)).toEqual([
      '1 db. 4 élű kard 1000 ezüst/db. áron',
      '6 db. agyar 700 ezüst/db. áron',
    ]);

    listings[1].revoke();

    const select = doc.forms.namedItem('eladasUrlap')!.elements.namedItem('felkinalt') as HTMLSelectElement;
    expect(select.selectedIndex).toBe(1);
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it('carries the market percentage onto standing offers', () => {
    // Looked up from the offer's own detail block, so the offers column can show
    // the same badge the offerable rows do.
    const { listings } = extractMarket(marketDoc());

    const agyar = listings.find(l => l.detail?.name === 'agyar')!;
    expect(agyar.pricePercent).toBe(565);

    // "4 élű kard" is absent from the percentage table in this fixture.
    const kard = listings.find(l => l.detail?.name === '4 élű kard')!;
    expect(kard.pricePercent).toBeNull();
  });

  it('does not throw on a page missing the market forms', () => {
    const doc = new JSDOM('<html><body></body></html>').window.document;
    const state = extractMarket(doc);
    expect(state.items).toEqual([]);
    expect(state.listings).toEqual([]);
  });
});
