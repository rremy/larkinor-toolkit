import { describe, it, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { DEFAULT_PRICE_PERCENT, extractMarket, parseOfferLabel, parsePricePercents, suggestPrice } from '../src/utils/marketExtract';

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
      <option value="37" selected>jáspis (170%)</option>
      <option value="41">vámpír kard (300%)</option>
      <option value="338">1 hetes kenyér (3000%)</option>
      <option value="94">agyar (565%)</option>
    </select>
    <input type="text" name="mennyit">
    <select name="vetel">
      <option>7 db. jáspis 80 ezüst/db. áron</option>
      <option>2 db. jáspis 95 ezüst/db. áron</option>
    </select>
  </form>

  <form name="specTevUrlap">
    <select name="tevFajta">
      <option value="kilep">kilépsz a játékból</option>
    </select>
    <input type="image" src="/2/ikon/ok.gif">
  </form>

  <font face="Comic sans MS">Szétnézel a piacon...<br>Megvették a következő cuccaidat: 1 démongyapjú</font>

  <b>Remy hátizsákjában 43.5953/114.2 kg tömegű tárgy van</b>
  Pénz: 853
  <div>7810
ezüstöt kerestél az eladásokból</div>

  <input type="image" src="/2/ikon/felkinal.gif" title="Felkínálod">
  <input type="image" src="/2/ikon/visszavon.gif" title="Visszavonod">
  <input type="image" src="/2/ikon/keresel.gif" title="Keresel">
  <input type="image" src="/2/ikon/piacvesz.gif" title="Megveszed">
  <input type="image" src="/2/ikon/vissza.gif" title="Elhagyod a piacot">
  <input type="image" src="/2/ikon/penztkap.gif" title="Felveszed a pénzt">
  <input type="image" src="/2/ikon/klap.gif" title="Beállítások">

  <script>
    hatizsakTargyak[0] = "Név: ezüst\\nSúly: 0.0001 kg.\\nMennyiség: 5725\\n";
    hatizsakTargyak[1] = "Típus: fegyver\\nNév: vámpír kard\\nSúly: 1.3 kg.\\nÁr: 250 ezüst\\n";
    hatizsakTargyak[2] = "Név: jáspis\\nSúly: 0.04 kg.\\nÁr: 50 ezüst\\nMennyiség: 19\\nÖsszsúly: 0.76 kg.\\n";
    felkinaltTargyak[0] = "Típus: fegyver\\nNév: 4 élű kard\\nSúly: 1.5 kg.\\nÁr: 156 ezüst\\n";
    felkinaltTargyak[1] = "Név: agyar\\nSúly: 4 kg.\\nÁr: 124 ezüst\\nMennyiség: 6\\n";
    felkinaltTargyakInfo[0] = "281";
    felkinaltTargyakInfo[1] = "94";
    vetelTargyak[0] = "Név: jáspis\\nSúly: 0.04 kg.\\nÁr: 50 ezüst\\nMennyiség: 7\\nÖsszár: 560 ezüst\\n";
    vetelTargyak[1] = "Név: jáspis\\nSúly: 0.04 kg.\\nÁr: 50 ezüst\\nMennyiség: 2\\nÖsszár: 190 ezüst\\n";
    vetelTargyakInfo[0] = "37,80,7,4284";
    vetelTargyakInfo[1] = "37,95,2,4747";
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

  it('assumes 500% for an item the market does not quote', () => {
    // The plain Ár was a poor default: quoted rates on the live page run 50% to
    // 2500%, so an unquoted item is unlikely to be worth exactly its shop price.
    expect(DEFAULT_PRICE_PERCENT).toBe(500);
    expect(suggestPrice(50, null)).toBe(250);
  });

  it('has nothing to suggest for an item with no price', () => {
    // Silver itself is listed in the backpack and the game gives it no Ár.
    expect(suggestPrice(null, 170)).toBeNull();
    expect(suggestPrice(null, null)).toBeNull();
  });
});

describe('parseOfferLabel', () => {
  it('reads the quantity and asking price out of the game\'s wording', () => {
    expect(parseOfferLabel('6 db. agyar 700 ezüst/db. áron')).toEqual({ quantity: 6, unitPrice: 700 });
  });

  it('handles a multi-word name and a large price', () => {
    expect(parseOfferLabel('1 db. antianyag bunkó 100000 ezüst/db. áron'))
      .toEqual({ quantity: 1, unitPrice: 100000 });
  });

  it('handles a grouped price', () => {
    expect(parseOfferLabel('14 db. aranyzsanér 1 545 ezüst/db. áron'))
      .toEqual({ quantity: 14, unitPrice: 1545 });
  });

  it('gives up rather than guessing on wording it does not recognise', () => {
    expect(parseOfferLabel('valami furcsa sor')).toEqual({ quantity: null, unitPrice: null });
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
    // Silver has no Ár, so there is no figure to scale — the 500% default cannot
    // rescue it.
    const { items } = extractMarket(marketDoc());
    const silver = items.find(i => i.name === 'ezüst')!;
    expect(silver.suggestedPrice).toBeNull();
    expect(silver.pricePercent).toBeNull();
  });

  it('prices an unquoted item at the assumed rate, leaving the percent unknown', () => {
    const doc = marketDoc();
    // Drop jáspis from the quote list so it becomes an unquoted, priced item.
    const melyik = doc.querySelector<HTMLSelectElement>('select[name="melyik"]')!;
    melyik.querySelector('option[value="37"]')!.remove();

    const jaspis = extractMarket(doc).items.find(i => i.name === 'jáspis')!;
    expect(jaspis.pricePercent).toBeNull();       // genuinely unknown
    expect(jaspis.suggestedPrice).toBe(250);      // 50 x 500%
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

  it('carries the offer\'s own quantity, asking price and comparisons', () => {
    const { listings } = extractMarket(marketDoc());
    const agyar = listings.find(l => l.detail?.name === 'agyar')!;

    expect(agyar.quantity).toBe(6);
    expect(agyar.unitPrice).toBe(700);
    expect(agyar.shopPrice).toBe(124);          // the item's Ár
    expect(agyar.suggestedPrice).toBe(701);     // 124 x 565%
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

describe('extractMarket — vétel', () => {
  it('lists the searchable catalogue with each item id and rate', () => {
    const { catalogue } = extractMarket(marketDoc());

    expect(catalogue).toHaveLength(4);
    // The id is the option's value — what the game's search submits, and the
    // only stable handle on an item across the reload the search causes.
    expect(catalogue[0]).toEqual({ id: '37', name: 'jáspis', pricePercent: 170 });
    expect(catalogue[3]).toEqual({ id: '94', name: 'agyar', pricePercent: 565 });
  });

  it('searches for an item by driving the game\'s own search button', () => {
    const doc = marketDoc();
    const { catalogue, search } = extractMarket(doc);
    const button = doc.querySelector<HTMLInputElement>('input[src*="keresel"]')!;
    const clicked = vi.fn();
    button.addEventListener('click', clicked);

    search(catalogue[3]);

    // The search handler reads melyik.value (not its index), so the value is
    // what has to be set.
    const select = doc.forms.namedItem('vetelUrlap')!.elements.namedItem('melyik') as HTMLSelectElement;
    expect(select.value).toBe('94');
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it('names the item the visible offers belong to', () => {
    // After a search the game re-selects the searched item, so the selection is
    // what the offers below it are for.
    expect(extractMarket(marketDoc()).searchedName).toBe('jáspis');
  });

  it('lists the offers on sale with their quantity and unit price', () => {
    const { purchases } = extractMarket(marketDoc());

    expect(purchases).toHaveLength(2);
    // Read from vetelTargyakInfo ("itemId,unitPrice,quantity,offerId"), which is
    // machine-formatted, rather than from the game's prose label.
    expect(purchases[0].quantity).toBe(7);
    expect(purchases[0].unitPrice).toBe(80);
    expect(purchases[0].detail?.name).toBe('jáspis');
    expect(purchases[0].shopPrice).toBe(50);
    expect(purchases[0].pricePercent).toBe(170);
  });

  it('falls back to the label when the info array is missing an entry', () => {
    const doc = marketDoc();
    const script = Array.from(doc.querySelectorAll('script'))
      .find(s => /vetelTargyakInfo/.test(s.textContent ?? ''))!;
    script.textContent = (script.textContent ?? '').replace(/vetelTargyakInfo\[1\][^\n]*\n/, '');

    const { purchases } = extractMarket(doc);
    expect(purchases[1].quantity).toBe(2);
    expect(purchases[1].unitPrice).toBe(95);
  });

  it('buys an offer by its index, with the quantity the caller asked for', () => {
    const doc = marketDoc();
    const { purchases } = extractMarket(doc);
    const button = doc.querySelector<HTMLInputElement>('input[src*="piacvesz"]')!;
    const clicked = vi.fn();
    button.addEventListener('click', clicked);

    purchases[1].buy(2);

    // The buy handler indexes vetelTargyakInfo by selectedIndex, exactly as the
    // revoke handler does — so the index is what identifies the offer.
    const form = doc.forms.namedItem('vetelUrlap')!;
    expect((form.elements.namedItem('vetel') as HTMLSelectElement).selectedIndex).toBe(1);
    expect((form.elements.namedItem('mennyit') as HTMLInputElement).value).toBe('2');
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it('clamps the bought quantity to what is on offer', () => {
    const doc = marketDoc();
    extractMarket(doc).purchases[0].buy(999);

    const form = doc.forms.namedItem('vetelUrlap')!;
    expect((form.elements.namedItem('mennyit') as HTMLInputElement).value).toBe('7');
  });

  it('has no offers to show before anything has been searched for', () => {
    const doc = marketDoc();
    doc.querySelector('select[name="vetel"]')!.remove();
    expect(extractMarket(doc).purchases).toEqual([]);
  });
});

describe('extractMarket — actions and stats', () => {
  it('offers the page\'s own market actions', () => {
    const { actions } = extractMarket(marketDoc());

    expect(actions.exit?.label).toBe('Elhagyod a piacot');
    expect(actions.collectMoney?.label).toBe('Felveszed a pénzt');
    expect(actions.settings?.label).toBe('Beállítások');
    expect(actions.special.map(a => a.label)).toEqual(['kilépsz a játékból']);
  });

  it('triggers a special action through the page\'s select and OK button', () => {
    const doc = marketDoc();
    const { actions } = extractMarket(doc);
    const ok = doc.querySelector<HTMLInputElement>('form[name="specTevUrlap"] input[src*="ok.gif"]')!;
    const clicked = vi.fn();
    // Replacing click, not listening for it: the OK button sits inside a form,
    // and a real click would have jsdom attempt a submit it cannot perform.
    ok.click = clicked;

    actions.special[0].trigger();

    const select = doc.forms.namedItem('specTevUrlap')!.elements.namedItem('tevFajta') as HTMLSelectElement;
    expect(select.value).toBe('kilep');
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it('reads the money and the backpack load the page prints', () => {
    const state = extractMarket(marketDoc());
    expect(state.gold).toBe(853);
    expect(state.weight).toEqual({ used: 43.5953, max: 114.2 });
  });

  it('carries the narration, which is where a completed sale is reported', () => {
    // The mobile page replaces the whole market page, so this text has nowhere
    // else to come from — and it is how the player learns a sale went through.
    expect(extractMarket(marketDoc()).narration)
      .toBe('Szétnézel a piacon...\nMegvették a következő cuccaidat: 1 démongyapjú');
  });

  it('reads what the sales have earned but not yet been collected', () => {
    // Its own positioned div beside the collect button, not part of the
    // narration: "7810\nezüstöt kerestél az eladásokból".
    expect(extractMarket(marketDoc()).earnings).toBe(7810);
  });

  it('reads a collected balance as nothing left to take', () => {
    // Measured on the live page: collecting leaves the line in place printing 0,
    // rather than removing it — so zero is a state the page states outright.
    const doc = marketDoc();
    const div = [...doc.querySelectorAll('div')].find(d => /kerestél/.test(d.textContent ?? ''))!;
    div.textContent = '0\nezüstöt kerestél az eladásokból';
    expect(extractMarket(doc).earnings).toBe(0);
  });

  it('reads a grouped amount', () => {
    const doc = marketDoc();
    const div = [...doc.querySelectorAll('div')].find(d => /kerestél/.test(d.textContent ?? ''))!;
    div.textContent = '1 234 567\nezüstöt kerestél az eladásokból';
    expect(extractMarket(doc).earnings).toBe(1234567);
  });

  it('says it does not know rather than guessing zero when the line is missing', () => {
    // Null and zero must stay distinguishable: zero disables the collect button,
    // and a page whose wording we failed to match must not disable a button that
    // works.
    const doc = marketDoc();
    [...doc.querySelectorAll('div')].find(d => /kerestél/.test(d.textContent ?? ''))!.remove();
    expect(extractMarket(doc).earnings).toBeNull();
  });

  it('leaves an absent action null rather than inventing one', () => {
    const doc = marketDoc();
    doc.querySelector('input[src*="penztkap"]')!.remove();
    expect(extractMarket(doc).actions.collectMoney).toBeNull();
  });
});
