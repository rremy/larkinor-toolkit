import { describe, it, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  extractFreeMove,
  extractBattle,
  extractLogin,
  extractDungeon,
  LOGIN_USERNAME_KEY,
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
    Pénz: 1&nbsp;979&nbsp;&nbsp;&nbsp;&nbsp;<img src="/2/ikon/bizt_van.gif" border="0" width="12" height="12" title=" Van biztosításod :-)"><img src="/2/ikon/durex2.gif" border="0" width="32" height="12" title="Varázsburok! ;-)">&nbsp;<br>
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
  <input type="image" src="/2/ikon/tamadas.gif" width="25" height="25" border="0" title="Támadás!!!">
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

  it('extracts the attack (engage-monster) button separately from buildings', () => {
    const state = extractFreeMove(makeDoc(FREEMOVE_HTML));
    expect(state.attack).not.toBeNull();
    expect(state.attack?.label).toBe('Támadás!!!');
    expect(state.attack?.iconUrl).toBe('https://l2.larkinor.hu/2/ikon/tamadas.gif');
    // must NOT also appear among the building icons
    expect(state.buildings.map(b => b.label)).not.toContain('Támadás!!!');
  });

  it('attack trigger clicks the original tamadas input', () => {
    const doc = makeDoc(FREEMOVE_HTML);
    const state = extractFreeMove(doc);
    const atk = doc.querySelector<HTMLInputElement>('input[src*="tamadas.gif"]')!;
    const clickSpy = vi.fn();
    atk.click = clickSpy;
    state.attack?.trigger();
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('attack is null when there is no encounter (no tamadas button)', () => {
    const html = FREEMOVE_HTML.replace(/<input[^>]*tamadas\.gif[^>]*>/, '');
    const state = extractFreeMove(makeDoc(html));
    expect(state.attack).toBeNull();
  });

  it('extracts player status icons from the stat block', () => {
    const state = extractFreeMove(makeDoc(FREEMOVE_HTML));
    expect(state.statusIcons).toEqual([
      { iconUrl: 'https://l2.larkinor.hu/2/ikon/bizt_van.gif', label: 'Van biztosításod :-)' },
      { iconUrl: 'https://l2.larkinor.hu/2/ikon/durex2.gif', label: 'Varázsburok! ;-)' },
    ]);
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

// The login page uses an UNNAMED form (not name="urlap") with plain text /
// password inputs and an image Submit button. Placeholder credentials only.
const LOGIN_HTML = `
  <form method="post" action="/../cgi-bin/larkinor">
    <input type="hidden" name="oldalTipus" value="otLogin">
    <td align="center">
      <font face="Comic sans MS" size="1" color="000000">
        Login: <input type="text" style="width: 120px;" name="loginname" maxlength="18">
        Jelszó: <input type="password" style="width: 120px;" name="loginpassw" maxlength="18">
      </font>
    </td>
    <input type="image" name="Submit" value="Belépés" src="http://common.larkinor.hu/img/belepek.gif" title="Belépés">
  </form>
`;

// The failed-login page re-serves otLogin with a status message in a
// `font[face="Comic sans MS"][color="#003366"]` (the label row uses color
// "000000"). Real message text observed live.
const LOGIN_ERROR_HTML = `
  <form method="post" action="/../cgi-bin/larkinor">
    <input type="hidden" name="oldalTipus" value="otLogin">
    <td align="center">
      <font face="Comic sans MS" size="1" color="000000">
        Login: <input type="text" name="loginname" maxlength="18">
        Jelszó: <input type="password" name="loginpassw" maxlength="18">
      </font>
    </td>
    <td align="center">
      <font face="Comic sans MS" size="2" color="#003366">
        Hiányzik a karakter, vagy rossz adatokat adtál meg!
      </font>
    </td>
    <input type="image" name="Submit" value="Belépés" src="belepek.gif" title="Belépés">
  </form>
`;

describe('extractLogin', () => {
  it('extracts the login error/status message when present', () => {
    const state = extractLogin(makeDoc(LOGIN_ERROR_HTML));
    expect(state.error).toBe('Hiányzik a karakter, vagy rossz adatokat adtál meg!');
  });

  it('returns an empty error on a clean login page (no status font)', () => {
    const state = extractLogin(makeDoc(LOGIN_HTML));
    expect(state.error).toBe('');
  });

  it('returns the previously-saved username from GM storage', () => {
    GM_setValue(LOGIN_USERNAME_KEY, 'Remy');
    const state = extractLogin(makeDoc(LOGIN_HTML));
    expect(state.savedUsername).toBe('Remy');
  });

  it('returns an empty savedUsername when nothing was stored', () => {
    // A distinct key-less read: clear by storing empty, then extract.
    GM_setValue(LOGIN_USERNAME_KEY, '');
    const state = extractLogin(makeDoc(LOGIN_HTML));
    expect(state.savedUsername).toBe('');
  });

  it('submit() writes both values onto the original inputs and clicks Submit', () => {
    const doc = makeDoc(LOGIN_HTML);
    const state = extractLogin(doc);
    const submitBtn = doc.querySelector<HTMLInputElement>('input[name="Submit"]')!;
    const clickSpy = vi.fn();
    submitBtn.click = clickSpy;

    state.submit('Hero', 'secret');

    expect(doc.querySelector<HTMLInputElement>('input[name="loginname"]')!.value).toBe('Hero');
    expect(doc.querySelector<HTMLInputElement>('input[name="loginpassw"]')!.value).toBe('secret');
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('submit() persists the username (only) via GM_setValue', () => {
    const doc = makeDoc(LOGIN_HTML);
    const state = extractLogin(doc);
    doc.querySelector<HTMLInputElement>('input[name="Submit"]')!.click = vi.fn();

    state.submit('Hero', 'secret');

    expect(GM_setValue).toHaveBeenCalledWith(LOGIN_USERNAME_KEY, 'Hero');
    // extracting again reflects the newly-saved username
    expect(extractLogin(makeDoc(LOGIN_HTML)).savedUsername).toBe('Hero');
  });
});

// Dungeon (Labirintus): shared urlap form + a composed cell of layered tiles
// (each img wrapped in an absolutely-positioned div), standard direction image
// inputs (walls are plain imgs, not inputs), utility inputs, tevFajta actions,
// and the Comic Sans narration. Style strings reproduce the real page's mixed
// px/unit-less formatting. An enemy (ellenfel_j) sits on the east edge.
const DUNGEON_HTML = `
  <form name="urlap" method="post" action="/../cgi-bin/larkinor">
    <input type="hidden" name="oldalTipus" value="otLabirintus">
    <input type="hidden" name="loginname" value="remy">
    <input type="hidden" name="kulcs" value="TESTKEY">
    <input type="hidden" name="par1" value="">
    <input type="hidden" name="Submit" value="semmi">
  </form>
  <b>
    <a title="karakterlap"><font color="blue">Remy </font></a>&nbsp;&nbsp;<font color="darkblue">[1569/800]</font><br>
    Pénz: 42&nbsp;&nbsp;<img src="/2/ikon/bizt_van.gif" width="12" height="12" title=" Van biztosításod :-)">&nbsp;<br>
    Életpont: 303 / 303 <br>
    Varázspont: 286 / 286
  </b>
  <div style="position:absolute; width:150; height:150; z-index:3; left: 65; top: 190px; border: 0px none">
    <img src="/labirintus/1/talaj/talaj3.gif" width="150" height="150">
  </div>
  <div style="position:absolute; width:50px; height:50; z-index:4; left: 165px; top: 240px; border: 0px none">
    <img src="/labirintus/ellenfel/ellenfel_j.gif" width="50" height="50">
  </div>
  <div style="position:absolute; width:50; height:150; z-index:5; left: 65; top: 190px; border: 0px none">
    <img src="/labirintus/1/folyoso/foly_b_2.gif" width="50" height="150" title="Folyosó">
  </div>
  <div style="position:absolute; width:150; height:50; z-index:5; left: 65; top: 190px; border: 0px none">
    <img src="/labirintus/1/ajto/ajto_f_1.gif" width="150" height="50" title="Ajtó, bronzkulcs nyitja">
  </div>
  <div style="position:absolute; width:50; height:150; z-index:5; left: 165; top: 190px; border: 0px none">
    <img src="/labirintus/1/folyoso/foly_j_4.gif" width="50" height="150" title="Folyosó">
  </div>
  <div style="position:absolute; width:150; height:50; z-index:5; left: 65; top: 290px; border: 0px none">
    <img src="/labirintus/1/ajto/ajto_l_4.gif" width="150" height="50" title="Ajtó, csőkulcs nyitja">
  </div>
  <div style="position:absolute; width:35; height:35; z-index:6; left: 125; top: 245px; border: 0px none">
    <img src="/labirintus/figura_jobb.gif" width="35" height="35" title="Félve körbenézel">
  </div>
  <input type="image" src="/2/ikon/klap.gif" title="Beállítások">
  <input type="image" src="/2/ikon/pihen.gif" title="Pihensz egy kicsit">
  <input type="image" src="/2/ikon/sc_gyogyvarazs.gif" title="elmondasz egy gyógyvarázst">
  <input type="image" src="./Lab_files/eszak.gif" title="Északi folyosón mész tovább">
  <img src="/ikon/nyugat.gif" width="25" height="25" title="Erre nem lehet menni">
  <input type="image" src="./Lab_files/kelet.gif" title="Keleti folyosón mész tovább">
  <input type="image" src="./Lab_files/del.gif" title="Kinyitod az ajtót és belépsz">
  <input type="image" src="/2/ikon/labikibe.gif" title="Kimész a labirintusból">
  <form name="specTevUrlap">
    <select name="tevFajta">
      <option value="kajal">kajálsz</option>
      <option value="imadkozas">imádkozol</option>
    </select>
    <input type="image" src="./Lab_files/ok.gif">
  </form>
  <div>
    <font face="Comic sans MS" size="2.5">Továbbjöttél keletre.</font>
  </div>
`;

describe('extractDungeon', () => {
  it('reuses the FreeMove stat parsing (name, gold, hp/mp normalised)', () => {
    const s = extractDungeon(makeDoc(DUNGEON_HTML));
    expect(s.playerName).toBe('Remy');
    expect(s.gold).toBe(42);
    expect(s.hp).toBe(303);
    expect(s.hpMax).toBe(303);
    expect(s.mp).toBe(286);
  });

  it('collects the composed cell tiles with offsets normalised to the cell origin', () => {
    const s = extractDungeon(makeDoc(DUNGEON_HTML));
    const floor = s.tiles.find(t => t.imageUrl.includes('talaj3.gif'));
    expect(floor).toBeDefined();
    expect(floor).toMatchObject({ left: 0, top: 0, width: 150, height: 150, z: 3 });
    // south door was at top:290 -> normalised to 100 (origin top 190)
    const southDoor = s.tiles.find(t => t.imageUrl.includes('ajto_l_4.gif'));
    expect(southDoor).toMatchObject({ left: 0, top: 100, width: 150, height: 50, z: 5 });
    // enemy tile on the east edge (left:165 -> 100, top:240 -> 50)
    const enemy = s.tiles.find(t => t.imageUrl.includes('ellenfel_j.gif'));
    expect(enemy).toMatchObject({ left: 100, top: 50, width: 50, height: 50, z: 4 });
  });

  it('absolutizes tile image URLs to the game origin', () => {
    const s = extractDungeon(makeDoc(DUNGEON_HTML));
    const floor = s.tiles.find(t => t.imageUrl.includes('talaj3.gif'));
    expect(floor?.imageUrl).toBe('https://l2.larkinor.hu/labirintus/1/talaj/talaj3.gif');
  });

  it('extracts only the open directions (walls have no input)', () => {
    const s = extractDungeon(makeDoc(DUNGEON_HTML));
    const dirs = s.directions.map(d => d.dir).sort();
    expect(dirs).toEqual(['east', 'north', 'south']);
    expect(dirs).not.toContain('west'); // west is a plain img (blocked)
  });

  it('extracts utility controls as buildings (rest, heal, settings, exit)', () => {
    const s = extractDungeon(makeDoc(DUNGEON_HTML));
    const labels = s.buildings.map(b => b.label);
    expect(labels).toContain('Kimész a labirintusból');
    expect(labels).toContain('Pihensz egy kicsit');
  });

  it('extracts tevFajta actions', () => {
    const s = extractDungeon(makeDoc(DUNGEON_HTML));
    expect(s.actions.map(a => a.label)).toEqual(['kajálsz', 'imádkozol']);
  });

  it('extracts narration and has no question on a plain cell', () => {
    const s = extractDungeon(makeDoc(DUNGEON_HTML));
    expect(s.narration).toBe('Továbbjöttél keletre.');
    expect(s.question).toBeNull();
  });
});

// A question cell: prompt + answer labels live inside the Comic Sans block,
// interleaved with radios (name="valasz", onclick sets par1=index). A separate
// "Válasz" button submits.
const DUNGEON_QUESTION_HTML = `
  <form name="urlap" method="post" action="/../cgi-bin/larkinor">
    <input type="hidden" name="oldalTipus" value="otLabirintus">
    <input type="hidden" name="par1" value="">
    <input type="hidden" name="Submit" value="semmi">
  </form>
  <b>
    <a title="karakterlap"><font color="blue">Remy </font></a><br>
    Pénz: 42<br>
    Életpont: 303 / 303 <br>
    Varázspont: 286 / 286
  </b>
  <div>
    <font face="Comic sans MS" size="2">Továbbjöttél délre.<br>Előtted rácsos kapu áll, felette felirat:"Kortyolj a megfelelőből és továbbjutsz!".<br>
      <input type="radio" name="valasz" onclick="document.urlap.par1.value=0;">Megiszod a büdös zöld folyadékot<br>
      <input type="radio" name="valasz" onclick="document.urlap.par1.value=1;">Megiszod az édes szagú fekete folyadékot<br>
      <input type="radio" name="valasz" onclick="document.urlap.par1.value=2;">Megiszod a szagtalan sárga folyadékot<br>
    </font>
  </div>
  <font><input type="button" value="Válasz" onclick="if (document.urlap.par1.value) document.urlap.Submit.value='svValasz'; document.urlap.submit();"></font>
`;

describe('extractDungeon — question', () => {
  it('returns a question with a prompt that excludes the answer labels', () => {
    const s = extractDungeon(makeDoc(DUNGEON_QUESTION_HTML));
    expect(s.question).not.toBeNull();
    expect(s.question!.prompt).toContain('Kortyolj a megfelelőből');
    expect(s.question!.prompt).not.toContain('büdös zöld');
  });

  it('extracts each answer label', () => {
    const s = extractDungeon(makeDoc(DUNGEON_QUESTION_HTML));
    expect(s.question!.answers.map(a => a.label)).toEqual([
      'Megiszod a büdös zöld folyadékot',
      'Megiszod az édes szagú fekete folyadékot',
      'Megiszod a szagtalan sárga folyadékot',
    ]);
  });

  it('answer.select() clicks the matching original radio', () => {
    const doc = makeDoc(DUNGEON_QUESTION_HTML);
    const s = extractDungeon(doc);
    const radio = doc.querySelectorAll<HTMLInputElement>('input[name="valasz"]')[1];
    const clickSpy = vi.fn();
    radio.click = clickSpy;

    s.question!.answers[1].select();

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('question.submit() clicks the original Válasz button', () => {
    const doc = makeDoc(DUNGEON_QUESTION_HTML);
    const s = extractDungeon(doc);
    const btn = Array.from(doc.querySelectorAll<HTMLInputElement>('input[type="button"]')).find(b => b.value === 'Válasz')!;
    const clickSpy = vi.fn();
    btn.click = clickSpy;

    s.question!.submit();

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('clears narration while a question is active (prompt carries the text)', () => {
    const s = extractDungeon(makeDoc(DUNGEON_QUESTION_HTML));
    expect(s.narration).toBe('');
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
