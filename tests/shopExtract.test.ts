import { describe, it, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { extractShop } from '../src/utils/shopExtract';
import type { MarketRates } from '../src/shared/marketRates';

/**
 * Cleaned-up reconstruction of the live Vegyesbolt (2026-10-28), cut down to a
 * few rows. The figures are the real ones: sárkánykarom is 810 ezüst, the shop
 * pays half; the bulk list carries the whole backpack and disables what this
 * shop will not take in bulk (silver, church goods, weapons).
 */
const SHOP_HTML = `
  <form name="urlap"><input type="hidden" name="oldalTipus" value="otVegyesbolt"></form>
  <script>
    vetelTargyak[0]="Név: kaja\\nSúly: 0.4 kg.\\nÁr: 2 ezüst\\n";
    vetelArak[0]="2";
    vetelTargyak[1]="Név: ásó\\nSúly: 2.5 kg.\\nÁr: 12 ezüst\\n";
    vetelArak[1]="12";
    eladasTargyak[0]="Típus: fegyver\\nNév: bot\\nSúly: 2 kg.\\nÁr: 6 ezüst\\n\\n Elad.ár: 3 ezüst\\n";
    eladasArak[0]="3";
    eladasTargyak[1]="Név: arany\\nSúly: 0.001 kg.\\nÁr: 20 ezüst\\nMennyiség: 88\\nÖsszár: 1760 ezüst\\n\\n Elad.ár: 10 ezüst\\n";
    eladasArak[1]="10";
    eladasTargyak[2]="Név: sárkánykarom\\nSúly: 1 kg.\\nÁr: 810 ezüst\\nMennyiség: 11\\n\\n Elad.ár: 405 ezüst\\n";
    eladasArak[2]="405";
  </script>
  <div style="position:absolute; width:180px; left: 75px; top: 185px"><font face="Comic sans MS">Vétel</font></div>
  <div style="position:absolute; width:170px; left: 495px; top: 185px"><font face="Comic sans MS">Eladás</font></div>
  <div> Pénz: 3116 </div>
  <input type="image" src="/ikon/vissza.gif" title="Kilepes az epuletbol">
  <input type="image" src="/ikon/hatizsakba.gif" title="Viselt targyak a hatizsakba">
  <form name="vetelUrlap">
    <select name="targy"><option value="1">1 kaja</option><option value="13">1 ásó</option></select>
    <input type="text" name="mennyiseg" value="1">
    <input type="image" src="/ikon/vesz.gif" title="Megveszed a tárgyat.">
  </form>
  <form name="eladasUrlap">
    <select name="targy"><option value="4">1 bot</option><option value="15">88 arany</option><option value="252">11 sárkánykarom</option></select>
    <input type="text" name="mennyiseg" value="1">
    <input type="image" src="/ikon/elad.gif" title="Eladod a tárgyat.">
  </form>
  <div id="cuccLayer">
    <font color="777777"><input type="checkbox" disabled> 3116 ezüst<br></font>
    <font color="777777"><input type="checkbox" disabled> 1 bot<br></font>
    <input type="checkbox"> 88 arany<br>
    <input type="checkbox"> 11 sárkánykarom<br>
    <input type="checkbox"> 4 madártoll<br>
    <input type="image" src="/ikon/elad.gif" title="Eladod a kijelölt cuccokat!">
    <input type="image" src="/ikon/duel.gif" title="Elrejted a listát, nem adsz el semmit.">
  </div>
  <div style="position:absolute; width:600px; height:80px; left: 10px; top: 460px">
    <font face="Comic sans MS">Belépsz Szaiva vegyesboltjába...<br>Persze, skívei italport...</font>
  </div>
`;

const CHURCH_HTML = `
  <form name="urlap"><input type="hidden" name="oldalTipus" value="otTemplom"></form>
  <script>
    vetelTargyak[0]="Név: manaital\\nSúly: 0.2 kg.\\nÁr: 180 ezüst\\nExtra: templomi árú\\n";
    vetelArak[0]="180";
  </script>
  <div style="position:absolute; width:600px; left: 12px; top: 460px"><font face="Comic sans MS">Belépsz Zimenor pap templomába...</font></div>
  <div style="position:absolute; width:180px"><font face="Comic sans MS">Mágikus tárgy</font></div>
  <input type="image" src="/ikon/vissza.gif" title="Kilepes az epuletbol">
  <input type="image" src="/ikon/gyogymereg.gif" title="Elmondasz egy imát mérgezés ellen">
  <input type="image" src="/ikon/biztositas.gif" title="Biztosítást kötsz!">
  <form name="vetelUrlap">
    <select name="targy"><option value="20">1 manaital</option></select>
    <input type="text" name="mennyiseg" value="1">
    <input type="image" src="/ikon/vesz.gif" title="Megveszed a tárgyat.">
  </form>
  <div style="position:absolute; width:231px"><font face="Comic sans MS"><center>Negatív hatások:<br> Mérgezett vagy<br></center></font></div>
`;

const page = (html: string) => new JSDOM(`<html><head><title>Vegyesbolt</title></head><body>${html}</body></html>`).window.document;

const rates: MarketRates = { version: 1, capturedAt: 0, rates: { 252: 3000, 1: 50 } };

describe('extractShop — reading', () => {
  it('reads the buy list with its prices and ids', () => {
    const shop = extractShop(page(SHOP_HTML));
    expect(shop.kind).toBe('general');
    expect(shop.buy.map((b) => [b.id, b.name, b.unitPrice, b.weight])).toEqual([
      ['1', 'kaja', 2, 0.4],
      ['13', 'ásó', 12, 2.5],
    ]);
  });

  it('reads the sell list with what the shop pays and the stack size', () => {
    const shop = extractShop(page(SHOP_HTML));
    const karom = shop.sell.find((s) => s.name === 'sárkánykarom')!;
    expect([karom.id, karom.amount, karom.price, karom.sellPrice]).toEqual(['252', 11, 810, 405]);
  });

  it('marks the rows the page lets this shop take in bulk', () => {
    const shop = extractShop(page(SHOP_HTML));
    const bulk = Object.fromEntries(shop.sell.map((s) => [s.name, s.bulkIndex]));
    // The bot is sold singly here but the bulk list disables it.
    expect(bulk).toMatchObject({ bot: null, arany: 2, sárkánykarom: 3 });
  });

  it('marks what this shop will not buy — what its bulk list disables', () => {
    const shop = extractShop(page(SHOP_HTML));
    const sellable = Object.fromEntries(shop.sell.map((s) => [s.name, s.sellable]));
    // The general store's bulk list disables the bot: a weapon is for the weapon shop.
    expect(sellable).toMatchObject({ bot: false, arany: true, sárkánykarom: true, madártoll: true });
  });

  it('leaves every row sellable when the page carries no bulk list to judge by', () => {
    const doc = page(SHOP_HTML);
    doc.getElementById('cuccLayer')!.remove();
    expect(extractShop(doc).sell.every((s) => s.sellable)).toBe(true);
  });

  it('keeps a bulk-sellable entry the single-sale list does not carry', () => {
    const shop = extractShop(page(SHOP_HTML));
    const toll = shop.sell.find((s) => s.name === 'madártoll')!;
    expect([toll.index, toll.amount, toll.bulkIndex, toll.sellPrice]).toEqual([null, 4, 4, null]);
  });

  it('prices rows at the market from the captured rates, by item id', () => {
    const shop = extractShop(page(SHOP_HTML), rates);
    expect(shop.sell.find((s) => s.name === 'sárkánykarom')!.marketPrice).toBe(24300);
    expect(shop.buy.find((b) => b.name === 'kaja')!.marketPrice).toBe(1);
    expect(shop.buy.find((b) => b.name === 'ásó')!.marketPrice).toBeNull();
    expect(extractShop(page(SHOP_HTML)).sell[2].marketPrice).toBeNull();
  });

  it('reads the narration from the narration box, not the first heading in its font', () => {
    expect(extractShop(page(SHOP_HTML)).narration).toBe('Belépsz Szaiva vegyesboltjába...\nPersze, skívei italport...');
  });

  it('reads gold, title and the page\'s own buttons', () => {
    const shop = extractShop(page(SHOP_HTML));
    expect(shop.gold).toBe(3116);
    expect(shop.title).toBe('Vegyesbolt');
    expect(shop.actions.exit!.label).toBe('Kilepes az epuletbol');
    expect(shop.actions.stowWorn!.label).toBe('Viselt targyak a hatizsakba');
    // The form buttons and the bulk layer's own controls are not "other" actions.
    expect(shop.actions.other).toEqual([]);
  });
});

describe('extractShop — the Templom', () => {
  it('is a shop that only sells, with its prayers as other actions', () => {
    const shop = extractShop(page(CHURCH_HTML));
    expect(shop.kind).toBe('church');
    expect(shop.buy.map((b) => b.name)).toEqual(['manaital']);
    expect(shop.sell).toEqual([]);
    expect(shop.actions.other.map((o) => o.label)).toEqual(['Elmondasz egy imát mérgezés ellen', 'Biztosítást kötsz!']);
    expect(shop.narration).toBe('Belépsz Zimenor pap templomába...');
  });

  it('reads the ailments box without its heading', () => {
    expect(extractShop(page(CHURCH_HTML)).ailments).toBe('Mérgezett vagy');
    expect(extractShop(page(SHOP_HTML)).ailments).toBeNull();
  });
});

describe('extractShop — actions', () => {
  it('buys through the buy form: index, quantity, then its button', () => {
    const doc = page(SHOP_HTML);
    const shop = extractShop(doc);
    const form = doc.forms.namedItem('vetelUrlap')!;
    const button = form.querySelector<HTMLInputElement>('input[type="image"]')!;
    const click = vi.spyOn(button, 'click').mockImplementation(() => {});

    shop.purchase(shop.buy[1], 3);

    expect((form.elements.namedItem('targy') as HTMLSelectElement).value).toBe('13');
    expect((form.elements.namedItem('mennyiseg') as HTMLInputElement).value).toBe('3');
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('sells one item through the sell form, never more than the stack', () => {
    const doc = page(SHOP_HTML);
    const shop = extractShop(doc);
    const form = doc.forms.namedItem('eladasUrlap')!;
    const click = vi.spyOn(form.querySelector<HTMLInputElement>('input[type="image"]')!, 'click').mockImplementation(() => {});

    shop.sellOne(shop.sell.find((s) => s.name === 'sárkánykarom')!, 99);

    expect((form.elements.namedItem('targy') as HTMLSelectElement).value).toBe('252');
    expect((form.elements.namedItem('mennyiseg') as HTMLInputElement).value).toBe('11');
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('refuses a single sale of an item this shop will not buy', () => {
    const doc = page(SHOP_HTML);
    const shop = extractShop(doc);
    const click = vi.spyOn(doc.forms.namedItem('eladasUrlap')!.querySelector<HTMLInputElement>('input[type="image"]')!, 'click');

    shop.sellOne(shop.sell.find((s) => s.name === 'bot')!, 1);

    expect(click).not.toHaveBeenCalled();
  });

  it('sells many by clicking the chosen checkboxes, then the bulk button', () => {
    const doc = page(SHOP_HTML);
    const shop = extractShop(doc);
    const layer = doc.getElementById('cuccLayer')!;
    const boxes = layer.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    const boxClicks = Array.from(boxes).map((b) => vi.spyOn(b, 'click'));
    const sell = vi.spyOn(layer.querySelector<HTMLInputElement>('input[src*="elad"]')!, 'click').mockImplementation(() => {});

    shop.sellMany(shop.sell.filter((s) => s.name === 'arany' || s.name === 'madártoll'));

    // Clicked rather than set, so each box's own onclick toggles cuccArray.
    expect(boxClicks.map((c) => c.mock.calls.length)).toEqual([0, 0, 1, 0, 1]);
    expect(Array.from(boxes).map((b) => b.checked)).toEqual([false, false, true, false, true]);
    expect(sell).toHaveBeenCalledTimes(1);
  });

  it('sells nothing in bulk when no chosen row can be sold in bulk', () => {
    const doc = page(SHOP_HTML);
    const shop = extractShop(doc);
    const sell = vi.spyOn(doc.getElementById('cuccLayer')!.querySelector<HTMLInputElement>('input[src*="elad"]')!, 'click');

    shop.sellMany(shop.sell.filter((s) => s.name === 'bot'));

    expect(sell).not.toHaveBeenCalled();
  });
});
