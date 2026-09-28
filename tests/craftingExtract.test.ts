import { describe, it, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { extractBuildingLobby, extractCraftingHall, parseOwnedOption } from '../src/utils/craftingExtract';

const OPTIONS = `
  <option value="0">1168 ezüst</option><option value="61">1 varázsburok</option>
  <option value="250">6 sárkánypikkely</option><option value="251">20 sárkányfog</option>
  <option value="252">10 sárkánykarom</option><option value="545">112 csodaflaska</option>`;

function craftForm(name: string): string {
  return `<form name="${name}">
    <font face="Comic sans MS">Alapanyagok - db</font>
    <select name="targy1">${OPTIONS}</select><input type="text" name="darab1">
    <select name="targy2">${OPTIONS}</select><input type="text" name="darab2">
    <select name="targy3">${OPTIONS}</select><input type="text" name="darab3">
    Darabszám: <input type="text" name="darabszam">
  </form>`;
}

const URLAP = (oldalTipus: string) => `<form name="urlap" method="post">
  <input type="hidden" name="oldalTipus" value="${oldalTipus}">
  <input type="hidden" name="Submit" value="semmi">
  <input type="hidden" name="par1"><input type="hidden" name="par2"><input type="hidden" name="par3">
</form>`;

const FORGE_HALL = `<html><body>
  <div>Pénz:

1168
</div>
  <input type="image" src="http://common.larkinor.hu/ikon/vissza.gif" title="Kilepes az epuletbol">
  <div><font face="Comic sans MS" size="2.5">Belépve a kovácsok termébe nagy nyüzsgésbe csöppensz... Wulfthor  eléd siet.</font></div>
  <input type="image" src="http://common.larkinor.hu/ikon/keszitfegyver.gif" title="Fegyvert keszitesz">
  <input type="image" src="http://common.larkinor.hu/ikon/csapdarendel.gif" title="Megrendeled a csapdát.">
  <input type="image" src="http://common.larkinor.hu/ikon/kerdojel.gif" title="Mennyi a csapda?">
  ${craftForm('fegyvercsinalUrlap')}
  <form name="csapdaRendelUrlap"><font face="Comic sans MS">Csapda</font>
    <select name="targy"><option value="1">Hurokzár</option><option value="2">Pengegép</option><option value="6">Manadémon</option></select>
    <input type="text" name="mennyiseg" value="1"><input type="text" name="osszeg" readonly>
  </form>
  ${URLAP('otErodBelso')}
</body></html>`;

const MAGE_HALL = `<html><body>
  <div>Pénz: 1168</div>
  <input type="image" src="http://common.larkinor.hu/ikon/vissza.gif" title="Kilépsz az előtérbe">
  <div><font face="Comic sans MS">A mágusok termében Oglub fogad.</font></div>
  <input type="image" src="http://common.larkinor.hu/ikon/keszitvarazstargy.gif" title="Varázstárgyat készítesz">
  <input type="image" src="http://common.larkinor.hu/ikon/tanulvarazslat.gif" title="Megtanulsz egy uj varázslatot">
  ${craftForm('varfegyvercsinalUrlap')}
  <form name="extravarazslatok"><select name="evarazslatok"><option value="1">gyógyvarázs</option><option value="6">manapajzs</option></select></form>
  ${URLAP('otMagustoronyBelso')}
</body></html>`;

const FORGE_LOBBY = `<html><head><title>Erőd</title></head><body>
  <div>Pénz: 1168</div>
  <input type="image" src="http://common.larkinor.hu/ikon/vissza.gif" title="Kilepes az epuletbol">
  <div><font face="Comic sans MS">Belépsz Szendrin erődjébe...</font></div>
  <input type="image" src="http://common.larkinor.hu/ikon/belephatso.gif" title="belépsz a kovácsok termébe.">
  <input type="image" src="http://common.larkinor.hu/ikon/kovacsplusz.gif" title="Fejleszted az igazi kovácsmesterséged!">
  <input type="image" src="http://common.larkinor.hu/ikon/1szurovago.gif" title="Fejleszted szúró/vágó fegyver szakértelmed">
  ${URLAP('otErod')}
</body></html>`;

const docOf = (html: string) => new JSDOM(html).window.document;

describe('parseOwnedOption', () => {
  it('reads the count, the id and the name', () => {
    expect(parseOwnedOption('251', '20 sárkányfog')).toEqual({ id: '251', count: 20, name: 'sárkányfog' });
    expect(parseOwnedOption('0', '1168 ezüst')).toEqual({ id: '0', count: 1168, name: 'ezüst' });
  });

  it('takes only the first number when the name itself starts with one', () => {
    expect(parseOwnedOption('338', '3 1 hetes kenyér')).toEqual({ id: '338', count: 3, name: '1 hetes kenyér' });
  });

  it('rejects text with no leading count', () => {
    expect(parseOwnedOption('5', 'sárkányfog')).toBeNull();
  });
});

describe('extractCraftingHall', () => {
  it('reads the Erőd hall: owned map, gold, narration, trap form', () => {
    const state = extractCraftingHall(docOf(FORGE_HALL))!;
    expect(state.hall).toBe('forge');
    expect(state.gold).toBe(1168);
    expect(state.narration).toContain('kovácsok termébe');
    expect(state.owned.get('251')).toBe(20);
    expect(state.owned.get('0')).toBe(1168);
    expect(state.exit?.label).toBe('Kilepes az epuletbol');
    expect(state.side?.kind).toBe('trap');
    if (state.side?.kind === 'trap') {
      expect(state.side.traps).toEqual([
        { index: 0, label: 'Hurokzár' }, { index: 1, label: 'Pengegép' }, { index: 2, label: 'Manadémon' },
      ]);
    }
  });

  it('keeps the carried stacks in page order, for filling the slots by hand', () => {
    const state = extractCraftingHall(docOf(FORGE_HALL))!;
    expect(state.options.map((o) => o.name)).toEqual([
      'ezüst', 'varázsburok', 'sárkánypikkely', 'sárkányfog', 'sárkánykarom', 'csodaflaska',
    ]);
    expect(state.options[3]).toEqual({ id: '251', count: 20, name: 'sárkányfog' });
  });

  it('reads the Mágustorony hall and its spell form', () => {
    const state = extractCraftingHall(docOf(MAGE_HALL))!;
    expect(state.hall).toBe('mage');
    expect(state.owned.get('545')).toBe(112);
    expect(state.side?.kind).toBe('spell');
    if (state.side?.kind === 'spell') {
      expect(state.side.spells).toEqual([{ value: '1', label: 'gyógyvarázs' }, { value: '6', label: 'manapajzs' }]);
      expect(state.side.learnLabel).toBe('Megtanulsz egy uj varázslatot');
    }
  });

  it('returns null on a page without a crafting form', () => {
    expect(extractCraftingHall(docOf(FORGE_LOBBY))).toBeNull();
  });

  it('fills the slots by index with per-piece amounts, then clicks the submit control', () => {
    const doc = docOf(FORGE_HALL);
    const state = extractCraftingHall(doc)!;
    const submit = doc.querySelector<HTMLInputElement>('input[src*="keszitfegyver"]')!;
    const clicked = vi.fn(() => {
      // Read at click time: the game's handler reads the form at that moment.
      const f = doc.forms.namedItem('fegyvercsinalUrlap') as HTMLFormElement;
      const v = (n: string) => (f.elements.namedItem(n) as HTMLInputElement | HTMLSelectElement);
      return [
        (v('targy1') as HTMLSelectElement).selectedIndex, v('darab1').value,
        (v('targy2') as HTMLSelectElement).selectedIndex, v('darab2').value,
        (v('targy3') as HTMLSelectElement).selectedIndex, v('darab3').value,
        v('darabszam').value,
      ];
    });
    submit.addEventListener('click', () => { clicked(); });

    state.craft([
      { name: 'sárkányfog', qty: 10, id: '251' },
      { name: 'sárkánykarom', qty: 5, id: '252' },
      { name: 'sárkánypikkely', qty: 3, id: '250' },
    ], 2);

    expect(clicked).toHaveBeenCalledTimes(1);
    expect(clicked.mock.results[0].value).toEqual([3, '10', 4, '5', 2, '3', '2']);
  });

  it('resets an unused third slot to the first option with no amount', () => {
    const doc = docOf(MAGE_HALL);
    const state = extractCraftingHall(doc)!;
    const f = doc.forms.namedItem('varfegyvercsinalUrlap') as HTMLFormElement;
    (f.elements.namedItem('targy3') as HTMLSelectElement).selectedIndex = 5;
    (f.elements.namedItem('darab3') as HTMLInputElement).value = '9';

    state.craft([{ name: 'csodaflaska', qty: 2, id: '545' }, { name: 'ezüst', qty: 100, id: '0' }], 1);

    expect((f.elements.namedItem('targy1') as HTMLSelectElement).selectedIndex).toBe(5);
    expect((f.elements.namedItem('targy2') as HTMLSelectElement).selectedIndex).toBe(0);
    expect((f.elements.namedItem('targy3') as HTMLSelectElement).selectedIndex).toBe(0);
    expect((f.elements.namedItem('darab3') as HTMLInputElement).value).toBe('');
  });

  it('refuses to submit an ingredient the page does not list', () => {
    const doc = docOf(FORGE_HALL);
    const state = extractCraftingHall(doc)!;
    const submit = doc.querySelector<HTMLInputElement>('input[src*="keszitfegyver"]')!;
    const clicked = vi.fn();
    submit.addEventListener('click', clicked);
    expect(() => state.craft([{ name: 'vasérc', qty: 4, id: '199' }], 1)).toThrow(/vasérc/);
    expect(clicked).not.toHaveBeenCalled();
  });

  it('refuses a count below one', () => {
    const state = extractCraftingHall(docOf(FORGE_HALL))!;
    expect(() => state.craft([{ name: 'sárkányfog', qty: 10, id: '251' }], 0)).toThrow();
  });

  it('asks the page itself for the trap price, then orders by index', () => {
    const doc = docOf(FORGE_HALL);
    const state = extractCraftingHall(doc)!;
    const form = doc.forms.namedItem('csapdaRendelUrlap') as HTMLFormElement;
    const select = form.elements.namedItem('targy') as HTMLSelectElement;
    const strength = form.elements.namedItem('mennyiseg') as HTMLInputElement;
    const total = form.elements.namedItem('osszeg') as HTMLInputElement;
    // Stands in for the page's own jelezAr(), which jsdom does not run.
    doc.querySelector('input[src*="kerdojel"]')!.addEventListener('click', () => {
      total.value = `${select.value}:${strength.value}`;
    });
    const ordered = vi.fn(() => `${select.value}:${strength.value}`);
    doc.querySelector('input[src*="csapdarendel"]')!.addEventListener('click', () => { ordered(); });

    if (state.side?.kind !== 'trap') throw new Error('expected the trap form');
    expect(state.side.price(1, 3)).toBe('2:3');
    state.side.order(2, 4);
    expect(ordered.mock.results[0].value).toBe('6:4');
  });
});

describe('extractBuildingLobby', () => {
  it('lists the lobby controls with the exit separated out', () => {
    const lobby = extractBuildingLobby(docOf(FORGE_LOBBY));
    expect(lobby.title).toBe('Erőd');
    expect(lobby.gold).toBe(1168);
    expect(lobby.narration).toContain('erődjébe');
    expect(lobby.exit?.label).toBe('Kilepes az epuletbol');
    expect(lobby.controls.map((c) => c.label)).toEqual([
      'belépsz a kovácsok termébe.',
      'Fejleszted az igazi kovácsmesterséged!',
      'Fejleszted szúró/vágó fegyver szakértelmed',
    ]);
  });
});
