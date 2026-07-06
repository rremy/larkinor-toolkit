import { describe, it, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  extractFreeMove,
  extractBattle,
  hideOriginalDOM,
} from '../src/utils/domExtract';

function makeDoc(bodyHtml: string): Document {
  return new JSDOM(`<html><body>${bodyHtml}</body></html>`).window.document;
}

// Sanitized reconstructions of the real saved-page structure (see
// docs/superpowers/specs/2026-07-06-larkinor-real-dom-reference.md).
// kulcs/loginname below are fake placeholders, never real session values.

const FREEMOVE_HTML = `
  <form name="urlap" method="post" action="https://l2.larkinor.hu/cgi-bin/larkinor">
    <input type="hidden" name="oldalTipus" value="otVilag">
    <input type="hidden" name="loginname" value="test">
    <input type="hidden" name="kulcs" value="TESTKEY">
  </form>
  <b>
    <a title="karakterlap"><font color="blue">Remy </font></a>&nbsp;&nbsp;<font color="darkblue" align="left">[994/800]</font><br>
    Pénz: 1&nbsp;979&nbsp;&nbsp;&nbsp;&nbsp;<img src="./Larkinor_files/bizt_van.gif" border="0" width="12" height="12" title=" Van biztositasod :-)">&nbsp;<br>
    Életpont: 303 / 214 <br>
    Varázspont: 286 / 182
  </b>
  <div>
    <img src="https://l2.larkinor.hu/tajk/53.gif" width="145" height="125" title="harcos-negyed">
  </div>
  <input type="image" src="./Larkinor_files/eszak.gif" width="25" height="25" border="0" title="északra nyomulsz - harcos-negyed">
  <input type="image" src="./Larkinor_files/nyugat.gif" width="25" height="25" border="0" title="nyugatra nyomulsz - harcos-negyed">
  <input type="image" src="/ikon/fegyverbolt.gif" width="30" height="30" border="0" title="fegyverbolt">
  <input type="image" src="/ikon/templom.gif" width="30" height="30" border="0" title="templom">
  <input type="image" src="/ikon/ikon.gif" width="30" height="30" border="0">
  <form name="specTevUrlap">
    <div align="center">
      <select name="tevFajta">
        <option value="kajal">kajálsz</option>
        <option value="imadkozas">imádkozol</option>
      </select>
      <input type="image" src="./Larkinor_files/ok.gif">
    </div>
  </form>
  <div>
    <font face="Comic sans MS" size="2.5">Egy macska fut át az úton.</font>
  </div>
`;

const BATTLE_HTML = `
  <form name="urlap" method="post" action="https://l2.larkinor.hu/cgi-bin/larkinor">
    <input type="hidden" name="oldalTipus" value="otHarc">
    <input type="hidden" name="loginname" value="test">
    <input type="hidden" name="kulcs" value="TESTKEY">
  </form>
  <b>
    <a title="karakterlap"><font color="blue">Remy </font></a>&nbsp;&nbsp;<font color="darkblue" align="left">[988/800]</font><br>
    Pénz: 1&nbsp;979<br>
    Életpont: 303 / 260 <br>
    Varázspont: 286 / 228
  </b>
  <div>
    <img src="/pic/szornyk/unikorn_k.gif" width="125" height="145" border="0" title="Unikorn, életpontja: 148">
  </div>
  <input type="image" src="./Csata!_files/balk.gif" width="45" height="45" border="0" title="Támadsz a bal kezedben lévő mágikus fűvágcsóval">
  <input type="image" src="./Csata!_files/jobbk.gif" width="45" height="45" border="0" title="Támadsz a jobb kezedben lévő mérgezett tőrrel">
  <input type="image" src="./Csata!_files/menekul.gif" width="30" height="25" border="0" title="próbálsz menekülni">
  <input type="image" src="./Csata!_files/fold.gif" width="35" height="35" border="0">
  <form name="specTevUrlap">
    <select name="tevFajta">
      <option value="ongyilok">öngyilkos leszel</option>
    </select>
    <input type="image" src="./Csata!_files/ok.gif">
  </form>
  <div>
    <font face="Comic sans MS" size="2.5">A lezúzandó szörnyeteg egy Unikorn...</font>
  </div>
`;

describe('extractFreeMove', () => {
  it('parses player stats, stripping nbsp/space thousands separators from gold', () => {
    const state = extractFreeMove(makeDoc(FREEMOVE_HTML));
    expect(state.playerName).toBe('Remy');
    expect(state.gold).toBe(1979);
    // Game prints "max / current" (303 / 214) — extractor must normalise to {current, max}
    expect(state.hp).toBe(214);
    expect(state.hpMax).toBe(303);
    expect(state.mp).toBe(182);
    expect(state.mpMax).toBe(286);
  });

  it('parses the location image URL and district name', () => {
    const state = extractFreeMove(makeDoc(FREEMOVE_HTML));
    expect(state.locationImageUrl).toBe('https://l2.larkinor.hu/tajk/53.gif');
    expect(state.locationName).toBe('harcos-negyed');
  });

  it('falls back to img[width="145"][title] when no /tajk/ src is present', () => {
    const html = FREEMOVE_HTML.replace(
      '<img src="https://l2.larkinor.hu/tajk/53.gif" width="145" height="125" title="harcos-negyed">',
      '<img src="./Larkinor_files/53.gif" width="145" height="125" title="harcos-negyed">'
    );
    const state = extractFreeMove(makeDoc(html));
    expect(state.locationName).toBe('harcos-negyed');
    expect(state.locationImageUrl).toContain('53.gif');
  });

  it('extracts only the present direction buttons, mapped from image basename', () => {
    const state = extractFreeMove(makeDoc(FREEMOVE_HTML));
    const dirs = state.directions.map(d => d.dir);
    expect(dirs).toContain('north');
    expect(dirs).toContain('west');
    expect(dirs).not.toContain('south');
    expect(dirs).not.toContain('east');
    const north = state.directions.find(d => d.dir === 'north');
    expect(north?.label).toBe('északra nyomulsz - harcos-negyed');
  });

  it('a direction trigger clicks the original image input', () => {
    const doc = makeDoc(FREEMOVE_HTML);
    const state = extractFreeMove(doc);
    const northInput = doc.querySelector<HTMLInputElement>('input[src*="eszak.gif"]')!;
    const clickSpy = vi.fn();
    northInput.click = clickSpy;

    state.directions.find(d => d.dir === 'north')?.trigger();

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('parses tevFajta actions from the select', () => {
    const state = extractFreeMove(makeDoc(FREEMOVE_HTML));
    expect(state.actions.map(a => a.label)).toEqual(['kajálsz', 'imádkozol']);
  });

  it('triggering an action sets the select value and clicks the ok button', () => {
    const doc = makeDoc(FREEMOVE_HTML);
    const state = extractFreeMove(doc);
    const select = doc.querySelector<HTMLSelectElement>('select[name="tevFajta"]')!;
    const okButton = doc.querySelector<HTMLInputElement>('input[src*="ok.gif"]')!;
    const clickSpy = vi.fn();
    okButton.click = clickSpy;

    const action = state.actions.find(a => a.label === 'kajálsz');
    action?.trigger();

    expect(select.value).toBe('kajal');
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('returns no actions when there is no ok button/select', () => {
    const html = FREEMOVE_HTML.replace(
      /<form name="specTevUrlap">[\s\S]*?<\/form>/,
      ''
    );
    const state = extractFreeMove(makeDoc(html));
    expect(state.actions).toEqual([]);
  });

  it('extracts building/utility icons, excluding nav and the ok submit', () => {
    const state = extractFreeMove(makeDoc(FREEMOVE_HTML));
    // fegyverbolt + templom are buildings; eszak/nyugat (nav), ok (submit),
    // and the title-less ikon.gif must be excluded.
    expect(state.buildings.map(b => b.label)).toEqual(['fegyverbolt', 'templom']);
  });

  it('absolutizes building icon URLs to the game origin', () => {
    const state = extractFreeMove(makeDoc(FREEMOVE_HTML));
    const fegyver = state.buildings.find(b => b.label === 'fegyverbolt');
    expect(fegyver?.iconUrl).toBe('https://l2.larkinor.hu/ikon/fegyverbolt.gif');
  });

  it('a building trigger clicks the original image input', () => {
    const doc = makeDoc(FREEMOVE_HTML);
    const state = extractFreeMove(doc);
    const templomInput = doc.querySelector<HTMLInputElement>('input[src*="templom.gif"]')!;
    const clickSpy = vi.fn();
    templomInput.click = clickSpy;

    state.buildings.find(b => b.label === 'templom')?.trigger();

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('extracts narration from the Comic Sans MS font block', () => {
    const state = extractFreeMove(makeDoc(FREEMOVE_HTML));
    expect(state.narration).toBe('Egy macska fut át az úton.');
  });

  it('preserves <br> line breaks in the narration as newlines', () => {
    const html = FREEMOVE_HTML.replace(
      /<font face="Comic sans MS"[\s\S]*?<\/font>/,
      '<font face="Comic sans MS" size="2.5">\n\nKoncentrálsz, majd elmondod a gyógyvarázst...<br>Regenerálódott némi életpontod!\n</font>'
    );
    const state = extractFreeMove(makeDoc(html));
    expect(state.narration).toBe(
      'Koncentrálsz, majd elmondod a gyógyvarázst...\nRegenerálódott némi életpontod!'
    );
  });

  it('returns empty narration when no Comic Sans MS block is present', () => {
    const html = FREEMOVE_HTML.replace(
      /<font face="Comic sans MS"[\s\S]*?<\/font>/,
      ''
    );
    const state = extractFreeMove(makeDoc(html));
    expect(state.narration).toBe('');
  });
});

describe('extractBattle', () => {
  it('parses monster name, hp and image URL from the életpontja title', () => {
    const state = extractBattle(makeDoc(BATTLE_HTML));
    expect(state.monsterName).toBe('Unikorn');
    expect(state.monsterHp).toBe(148);
    expect(state.monsterImageUrl).toBe('https://l2.larkinor.hu/pic/szornyk/unikorn_k.gif');
  });

  it('returns a null monsterHp when the monster image/title is absent', () => {
    const html = BATTLE_HTML.replace(
      '<img src="/pic/szornyk/unikorn_k.gif" width="125" height="145" border="0" title="Unikorn, életpontja: 148">',
      ''
    );
    const state = extractBattle(makeDoc(html));
    expect(state.monsterHp).toBeNull();
    expect(state.monsterName).toBe('');
  });

  it('parses player HP and MP in battle, reversing the "max / current" order', () => {
    // The battle screen renders "Életpont: max / current" (303 / 260) — the
    // reverse of the free-move screen — so the extractor must swap them.
    const state = extractBattle(makeDoc(BATTLE_HTML));
    expect(state.hp).toBe(260);
    expect(state.hpMax).toBe(303);
    expect(state.mp).toBe(228);
    expect(state.mpMax).toBe(286);
  });

  it('collects the known combat action buttons with their titles', () => {
    const state = extractBattle(makeDoc(BATTLE_HTML));
    const labels = state.actions.map(a => a.label);
    expect(labels).toContain('Támadsz a bal kezedben lévő mágikus fűvágcsóval');
    expect(labels).toContain('Támadsz a jobb kezedben lévő mérgezett tőrrel');
    expect(labels).toContain('próbálsz menekülni');
  });

  it('falls back to a readable label when a spell button has no title', () => {
    const state = extractBattle(makeDoc(BATTLE_HTML));
    const fold = state.actions.find(a => a.label.toLowerCase().includes('föld'));
    expect(fold).toBeDefined();
  });

  it('excludes the ok.gif / tevFajta suicide control from battle actions', () => {
    const state = extractBattle(makeDoc(BATTLE_HTML));
    expect(state.actions.some(a => a.label.includes('öngyilkos'))).toBe(false);
    expect(state.actions.length).toBe(4);
  });

  it('a battle action trigger clicks its original image input', () => {
    const doc = makeDoc(BATTLE_HTML);
    const state = extractBattle(doc);
    const balkInput = doc.querySelector<HTMLInputElement>('input[src*="balk.gif"]')!;
    const clickSpy = vi.fn();
    balkInput.click = clickSpy;

    const action = state.actions.find(a => a.label.includes('bal kezedben'));
    action?.trigger();

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('extracts narration from the Comic Sans MS font block', () => {
    const state = extractBattle(makeDoc(BATTLE_HTML));
    expect(state.narration).toBe('A lezúzandó szörnyeteg egy Unikorn...');
  });
});

describe('hideOriginalDOM', () => {
  it('creates #lc-offscreen and moves content into it', () => {
    const dom = new JSDOM(`<html><body><div id="game">content</div></body></html>`);
    const doc = dom.window.document;
    hideOriginalDOM(doc);
    const offscreen = doc.getElementById('lc-offscreen');
    expect(offscreen).not.toBeNull();
    expect(doc.getElementById('game')).not.toBeNull(); // still in DOM
    expect(offscreen?.contains(doc.getElementById('game'))).toBe(true);
  });
});
