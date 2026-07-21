import { describe, it, expect } from 'vitest';
import { parseCuccDetail } from '../src/utils/homeExtract';
import { JSDOM } from 'jsdom';
import { vi } from 'vitest';
import { parseCuccArray, extractHome } from '../src/utils/homeExtract';

describe('parseCuccDetail', () => {
  it('parses a stacked plain item', () => {
    const d = parseCuccDetail(
      'Név: opál\nSúly: 0.05 kg.\nÁr: 20 ezüst\nMennyiség: 20\nÖsszár: 400 ezüst\nÖsszsúly: 1 kg.\n'
    );
    expect(d.name).toBe('opál');
    expect(d.type).toBe('tárgy');
    expect(d.weight).toBe(0.05);
    expect(d.amount).toBe(20);
    expect(d.totalWeight).toBe(1);
    expect(d.price).toBe(20);
    expect(d.magical).toBe(false);
  });

  it('parses a magical weapon with no Mennyiség (defaults amount to 1)', () => {
    const d = parseCuccDetail(
      'Típus: fegyver\nNév: mágikus fejsze\nSúly: 1.8 kg.\nÁr: 1000 ezüst\nMin. szint: 15\nMaximum sebzés: 64\nMágikus!!!\n'
    );
    expect(d.type).toBe('fegyver');
    expect(d.amount).toBe(1);
    expect(d.totalWeight).toBeCloseTo(1.8);
    expect(d.magical).toBe(true);
    expect(d.attrs).toContainEqual(['Maximum sebzés', '64']);
  });

  it('parses armor and leaves price null when absent', () => {
    const d = parseCuccDetail('Név: bronzkulcs\nSúly: 0.3 kg.\nExtra: kulcs\n');
    expect(d.type).toBe('tárgy');
    expect(d.price).toBeNull();
  });
});

const HOME_HTML = `
  <form name="urlap" action="/../cgi-bin/larkinor">
    <input type="hidden" name="oldalTipus" value="otSajathaz">
    <input type="hidden" name="Submit" value="semmi">
    <input type="hidden" name="par1" value="">
    <input type="hidden" name="par2" value="">
  </form>
  <b><a title="karakterlap"><font color="blue">Remy</font></a></b>
  <div>Ház telítettsége: 130.3601/140</div>
  <div>Remy hátizsákjában és testén 105.7586/107 kg tömegű tárgy van.</div>
  <input type="image" src="/2/ikon/hatizsakba.gif" title="Hátizsákba mindent">
  <input type="image" src="/2/ikon/varazsszek.gif" title="Beülsz a varázsszékedbe.">
  <input type="image" src="/2/ikon/ab.gif" title="Ha elveszett az antiballasztod...">
  <input type="image" src="/2/ikon/klap.gif" title="Beállítások">
  <input type="image" src="/2/ikon/vissza.gif" title="Kilépés az epületből">
  <input type="image" src="/2/ikon/leszerel.gif" title="Leszereled a csapdát.">
  <form name="hazUrlap">
    <select name="hazTargy">
      <option value="0">51031 ezüst</option>
      <option value="7">1 mágikus fejsze</option>
    </select>
    <input type="image" src="/2/ikon/hazbolvesz.gif" title="Magadhoz teszed.">
    <input type="text" name="htMennyiseg" value="1">
    <select name="hatizsakTargy">
      <option value="0">2686 ezüst</option>
    </select>
    <input type="image" src="/2/ikon/hazbatesz.gif" title="Kirakod">
    <input type="text" name="hzsMennyiseg" value="1">
  </form>
  <div>Házban lévő csapdák
    <input type="radio" name="radiobutton" value="on" checked> zuhanórács, erőssége: 7<br>
  </div>
  <script>
    var hazbanCucc = new Array();
    hazbanCucc[0]="Név: ezüst\\nSúly: 0.0001 kg.\\nMennyiség: 51031\\nÖsszsúly: 5.1031 kg.\\n";
    hazbanCucc[1]="Típus: fegyver\\nNév: mágikus fejsze\\nSúly: 1.8 kg.\\nMágikus!!!\\n";
    var hatizsakCucc = new Array();
    hatizsakCucc[0]="Név: ezüst\\nSúly: 0.0001 kg.\\nMennyiség: 2686\\nÖsszsúly: 0.2686 kg.\\n";
  </script>
`;

function homeDoc(): Document {
  return new JSDOM(`<html><body>${HOME_HTML}</body></html>`).window.document;
}

describe('parseCuccArray', () => {
  it('reads indexed entries and unescapes newlines', () => {
    const doc = homeDoc();
    const scriptText = doc.querySelector('script')!.textContent!;
    const arr = parseCuccArray(scriptText, 'hazbanCucc');
    expect(arr).toHaveLength(2);
    expect(arr[0]).toContain('Név: ezüst');
    expect(arr[0]).toContain('\n');
  });
});

describe('extractHome', () => {
  it('extracts capacities and both containers', () => {
    const s = extractHome(homeDoc());
    expect(s.playerName).toBe('Remy');
    expect(s.house.used).toBeCloseTo(130.3601);
    expect(s.house.max).toBe(140);
    expect(s.backpack.used).toBeCloseTo(105.7586);
    expect(s.house.items).toHaveLength(2);
    expect(s.house.items[1].name).toBe('mágikus fejsze');
    expect(s.house.items[1].index).toBe(1);
    expect(s.backpack.items[0].name).toBe('ezüst');
  });

  it('extracts the trap and its actions', () => {
    const s = extractHome(homeDoc());
    expect(s.traps).toHaveLength(1);
    expect(s.traps[0].label).toBe('zuhanórács');
    expect(s.traps[0].strength).toBe(7);
    expect(s.actions.everythingToBackpack).not.toBeNull();
    expect(s.actions.exit).not.toBeNull();
  });

  it('move() sets the select index + quantity and clicks the move button', () => {
    const doc = homeDoc();
    const s = extractHome(doc);
    const btn = doc.querySelector<HTMLInputElement>('input[src*="hazbolvesz.gif"]')!;
    const clickSpy = vi.spyOn(btn, 'click').mockImplementation(() => {});
    const sel = doc.querySelector<HTMLSelectElement>('select[name="hazTargy"]')!;
    const qty = doc.querySelector<HTMLInputElement>('input[name="htMennyiseg"]')!;

    s.house.move(s.house.items[1], 1);

    expect(sel.selectedIndex).toBe(1);
    expect(qty.value).toBe('1');
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('with multiple traps, leszerel() on a later trap selects its own radio before clicking the shared disarm button', () => {
    const TWO_TRAPS_HTML = `
      <form name="urlap" action="/../cgi-bin/larkinor">
        <input type="hidden" name="oldalTipus" value="otSajathaz">
      </form>
      <b><a title="karakterlap"><font color="blue">Remy</font></a></b>
      <div>Ház telítettsége: 130.3601/140</div>
      <div>Remy hátizsákjában és testén 105.7586/107 kg tömegű tárgy van.</div>
      <input type="image" src="/2/ikon/leszerel.gif" title="Leszereled a csapdát.">
      <div>Házban lévő csapdák
        <input type="radio" name="radiobutton" value="on" checked> zuhanórács, erőssége: 7<br>
        <input type="radio" name="radiobutton" value="on"> farkasverem, erőssége: 4<br>
      </div>
      <script>
        var hazbanCucc = new Array();
        var hatizsakCucc = new Array();
      </script>
    `;
    const doc = new JSDOM(`<html><body>${TWO_TRAPS_HTML}</body></html>`).window.document;
    const s = extractHome(doc);
    expect(s.traps).toHaveLength(2);

    const radios = Array.from(doc.querySelectorAll<HTMLInputElement>('input[type="radio"][name="radiobutton"]'));
    expect(radios[0].checked).toBe(true);
    expect(radios[1].checked).toBe(false);

    const disarmBtn = doc.querySelector<HTMLInputElement>('input[src*="leszerel.gif"]')!;
    const clickSpy = vi.spyOn(disarmBtn, 'click').mockImplementation(() => {});

    s.traps[1].leszerel();

    expect(radios[1].checked).toBe(true);
    expect(radios[0].checked).toBe(false);
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });
});
