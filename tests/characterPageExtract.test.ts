import { describe, it, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { extractCharacterPage } from '../src/utils/characterPageExtract';

/**
 * Cleaned-up reconstruction of the live character page (2026-10-28), cut down.
 * Two image names appear twice on the live page — `eldob` (single and mass drop)
 * and `mentes` (the three saves) — and are kept identical here, since telling
 * them apart by where they sit is the point.
 */
const PAGE_HTML = `
  <form name="urlap"><input type="hidden" name="oldalTipus" value="otPlayerSettings"></form>
  <script>
    function tulajdonsagFeltolt() { document.tulajdonsagokUrlap.kapottpont.value = 3 ; document.tulajdonsagokUrlap.ero.value = 45 ;
      document.tulajdonsagokUrlap.gyorsasag.value = 28 ; document.tulajdonsagokUrlap.iq.value = 7 ; document.tulajdonsagokUrlap.szerencse.value = 2 ;
      document.tulajdonsagokUrlap.ugyesseg.value = 40 ; document.tulajdonsagokUrlap.kitartas.value = 42 ; }
    targyTomb[0]="Név: ezüst\\nSúly: 0.0001 kg.\\nMennyiség: 21851\\n";
    targyTomb[1]="Típus: fegyver\\nNév: bot\\nSúly: 2 kg.\\nÁr: 6 ezüst\\nFajta: ütő/zúzó\\n";
    targyTomb[2]="Típus: vért\\nNév: bőrsisak\\nSúly: 1 kg.\\nÁr: 8 ezüst\\nVédelem: 2\\nFajta: fejre\\n";
    targyTomb[3]="Típus: vért\\nNév: bőrpajzs\\nSúly: 2 kg.\\nÁr: 8 ezüst\\nVédelem: 3\\nFajta: kézbe\\n";
  </script>
  <div id="cuccLayer">
    <input type="checkbox"> 21851 db. ezüst<br>
    <input type="checkbox"> 1 db. bot<br>
    <input type="checkbox"> 1 db. bőrsisak<br>
    <input type="checkbox"> 1 db. bőrpajzs<br>
    <input type="image" src="/ikon/eldob.gif" title="Eldobod a kijelölt cuccot!">
  </div>
  <div><font face="Comic sans MS"> Név: <b>Remy</b> <input type="image" src="/ikon/envelope.gif" title="E-mail címed titkos :-(">
    <br>Szint: <b>34</b><br>Tapasztalati pont: <b>77718605</b><br>Életpont: <b>500/573</b><br>Varázspont: <b>416/416</b><br>Védettség: <b>124</b><br></font></div>
  <input type="image" src="/ikon/vissza.gif" title="Kilépés a karakterlapból">
  <input type="image" src="/ikon/test_be.gif" title="Kiválasztott tárgy testre helyezése.">
  <input type="image" src="/ikon/fej_be.gif" title="Kiválasztott tárgy fejre helyezése.">
  <input type="image" src="/ikon/jobbkez_fegyver.gif" title="Kiválasztott tárgy jobb kézbe helyezése.">
  <input type="image" src="/ikon/balkez_fegyver.gif" title="Kiválasztott tárgy bal kézbe helyezése.">
  <input type="image" src="/ikon/lab_be.gif" title="Kiválasztott tárgy lábra húzása.">
  <input type="image" src="/ikon/eldob.gif" title="Kiválasztott tárgy eldobása.">
  <input type="image" src="/ikon/hatizsakba2.gif" title="Viselt targyak a hatizsakba">
  <form name="targyurlap">
    <select name="targy"><option value="0">21851 ezüst</option><option value="4">1 bot</option><option value="144">1 bőrsisak</option><option value="162">1 bőrpajzs</option></select>
    <input type="text" name="darab">
    <table><tr><td>Bal kéz: <b><a href="#" onclick="alert('Típus: fegyver\\nNév: hiper bűzíj\\nMin. szint: 34\\nMaximum sebzés: 305\\nSebzés szórás: 25\\nFajta: távolsági\\n');return false;">hiper bűzíj</a></b><br>
      Terhelés: <b>62.4061kg. / 146kg.</b></td></tr></table>
  </form>
  <div><center><b>Rontások</b><br><div>Semmi ilyesmi nincs rajtad!!!</div></center></div>
  <div><form name="tulajdonsagokUrlap"><table>
    <tr><td>Erő:</td><td><input type="text" name="ero" readonly></td></tr>
    <tr><td>Intelligencia:</td><td><input type="text" name="iq" readonly></td></tr>
    <tr><td>Szerencse:</td><td><input type="text" name="szerencse" readonly></td></tr>
    <tr><td>Gyorsaság:</td><td><input type="text" name="gyorsasag" readonly></td></tr>
    <tr><td>Ügyesség:</td><td><input type="text" name="ugyesseg" readonly></td></tr>
    <tr><td>Kitartás:</td><td><input type="text" name="kitartas" readonly></td></tr>
    <tr><td>Elosztható:</td><td><input type="text" name="kapottpont" readonly></td>
      <td><input type="image" src="/ikon/mentes.gif" title="Hozzáadott pontok mentése"></td></tr>
  </table>
  Fokozatod:<select name="valasztas"><option value="0">félénk</option><option value="2" selected>átlagos</option></select><input type="image" src="/ikon/mentes.gif" title="Igen! Keményen!"><br>
  Gyorsgombod:<select name="shortcut"><option value="0">semmi</option><option value="19" selected>gyógyvarázs</option></select><input type="image" src="/ikon/mentes.gif" title="Átállítod a gyorsgombod.">
  </form></div>
  <div><center><b>Támadó varázslatok:</b><br></center><div><b> Föld varázslat:</b></div><div> Szint-10 Maxsebzés-32</div></div>
  <div><center><b>Képzettségek:</b><br></center><div> Szúró/vágó fegyver: 38</div>Monsztalogia: 0<br></div>
  <div><center><b>Egyéb varázslatok:</b><br></center>gyógyvarázs - 20 varázspontért 50 életpontot ad<br></div>
`;

const page = () => new JSDOM(`<html><body>${PAGE_HTML}</body></html>`).window.document;
const imageTitled = (doc: Document, title: string) =>
  [...doc.querySelectorAll<HTMLInputElement>('input[type="image"]')].find((i) => i.title === title)!;

describe('extractCharacterPage — reading', () => {
  it('reads the character\'s figures', () => {
    const s = extractCharacterPage(page());
    expect([s.name, s.level, s.xp, s.defense]).toEqual(['Remy', 34, 77718605, 124]);
    expect(s.hp).toEqual([500, 573]);
    expect(s.load).toEqual({ used: 62.4061, max: 146 });
    expect(s.loadout!.slots.leftHand!.name).toBe('hiper bűzíj');
  });

  it('lists the backpack with the slots each item fits', () => {
    const slots = Object.fromEntries(extractCharacterPage(page()).backpack.map((i) => [i.name, i.slots]));
    expect(slots).toEqual({
      ezüst: [],
      bot: ['rightHand', 'leftHand'],
      bőrsisak: ['head'],
      // A shield goes in a hand, like a weapon.
      bőrpajzs: ['rightHand', 'leftHand'],
    });
  });

  it('prices backpack items at the market from the captured rates, by item id', () => {
    const s = extractCharacterPage(page(), { version: 1, capturedAt: 0, rates: { 4: 2500 } });
    const prices = Object.fromEntries(s.backpack.map((i) => [i.name, i.marketPrice]));
    // bot: 6 ezüst × 2500%; the rest are unquoted, and silver has no Ár at all.
    expect(prices).toEqual({ ezüst: null, bot: 150, bőrsisak: null, bőrpajzs: null });
    expect(extractCharacterPage(page()).backpack[1].marketPrice).toBeNull();
  });

  it('reads the attributes from the page\'s own filler, not the still-empty fields', () => {
    const s = extractCharacterPage(page());
    expect(s.attributes.map((a) => [a.key, a.value])).toEqual([
      ['ero', 45], ['iq', 7], ['szerencse', 2], ['gyorsasag', 28], ['ugyesseg', 40], ['kitartas', 42],
    ]);
    expect(s.freePoints).toBe(3);
  });

  it('reads the stance and quick-key settings with their current choice', () => {
    const s = extractCharacterPage(page());
    expect(s.stance!.selected).toBe('2');
    expect(s.quickKey!.options.map((o) => o.label)).toEqual(['semmi', 'gyógyvarázs']);
  });

  it('reads curses, skills and spells', () => {
    const s = extractCharacterPage(page());
    expect(s.curses).toEqual(['Semmi ilyesmi nincs rajtad!!!']);
    expect(s.skills).toEqual([{ name: 'Szúró/vágó fegyver', value: '38' }, { name: 'Monsztalogia', value: '0' }]);
    expect(s.attackSpells).toEqual([{ name: 'Föld varázslat', stats: 'Szint-10 Maxsebzés-32' }]);
    expect(s.otherSpells).toEqual(['gyógyvarázs - 20 varázspontért 50 életpontot ad']);
  });
});

describe('extractCharacterPage — actions', () => {
  it('equips through the slot\'s own control, with the item selected', () => {
    const doc = page();
    const s = extractCharacterPage(doc);
    const click = vi.spyOn(imageTitled(doc, 'Kiválasztott tárgy fejre helyezése.'), 'click').mockImplementation(() => {});

    s.equip(s.backpack[2], 'head');

    expect((doc.forms.namedItem('targyurlap')!.elements.namedItem('targy') as HTMLSelectElement).value).toBe('144');
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('refuses a slot the item does not fit', () => {
    const doc = page();
    const s = extractCharacterPage(doc);
    const click = vi.spyOn(imageTitled(doc, 'Kiválasztott tárgy lábra húzása.'), 'click');

    s.equip(s.backpack[2], 'legs');

    expect(click).not.toHaveBeenCalled();
  });

  it('drops through the single drop, not the mass drop of the same name', () => {
    const doc = page();
    const s = extractCharacterPage(doc);
    const single = vi.spyOn(imageTitled(doc, 'Kiválasztott tárgy eldobása.'), 'click').mockImplementation(() => {});
    const mass = vi.spyOn(imageTitled(doc, 'Eldobod a kijelölt cuccot!'), 'click');

    s.drop(s.backpack[0], 500);

    expect((doc.forms.namedItem('targyurlap')!.elements.namedItem('darab') as HTMLInputElement).value).toBe('500');
    expect(single).toHaveBeenCalledTimes(1);
    expect(mass).not.toHaveBeenCalled();
  });

  it('drops many by clicking the chosen checkboxes, then the layer\'s button', () => {
    const doc = page();
    const s = extractCharacterPage(doc);
    const mass = vi.spyOn(imageTitled(doc, 'Eldobod a kijelölt cuccot!'), 'click').mockImplementation(() => {});

    s.dropMany([s.backpack[1], s.backpack[3]]);

    expect([...doc.querySelectorAll<HTMLInputElement>('#cuccLayer input[type="checkbox"]')].map((c) => c.checked)).toEqual([false, true, false, true]);
    expect(mass).toHaveBeenCalledTimes(1);
  });

  it('saves attributes by writing every field its handler reads, then its own save', () => {
    const doc = page();
    const s = extractCharacterPage(doc);
    const form = doc.forms.namedItem('tulajdonsagokUrlap')!;
    const save = vi.spyOn(imageTitled(doc, 'Hozzáadott pontok mentése'), 'click').mockImplementation(() => {});
    const value = (name: string) => (form.elements.namedItem(name) as HTMLInputElement).value;

    s.saveAttributes({ ero: 2, kitartas: 1 });

    expect([value('ero'), value('kitartas'), value('iq'), value('kapottpont')]).toEqual(['47', '43', '7', '0']);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('refuses to spend more points than there are', () => {
    const doc = page();
    const s = extractCharacterPage(doc);
    const save = vi.spyOn(imageTitled(doc, 'Hozzáadott pontok mentése'), 'click');

    s.saveAttributes({ ero: 4 });

    expect(save).not.toHaveBeenCalled();
  });

  it('saves the stance through the save beside its own select', () => {
    const doc = page();
    const s = extractCharacterPage(doc);
    const stance = vi.spyOn(imageTitled(doc, 'Igen! Keményen!'), 'click').mockImplementation(() => {});
    const quick = vi.spyOn(imageTitled(doc, 'Átállítod a gyorsgombod.'), 'click');

    s.stance!.save('0');

    expect((doc.forms.namedItem('tulajdonsagokUrlap')!.elements.namedItem('valasztas') as HTMLSelectElement).value).toBe('0');
    expect(stance).toHaveBeenCalledTimes(1);
    expect(quick).not.toHaveBeenCalled();
  });
});
