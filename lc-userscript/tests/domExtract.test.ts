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

const FREEMOVE_HTML = `
  <div>
    <div>Remy [3/5/300]</div>
    <div>Pénz: 587</div>
    <div>Életpont: 225 / 260</div>
    <div>Varázspont: 232 / 232</div>
    <img src="https://l2.larkinor.hu/tajk/12.gif" alt="táj">
    <table class="irany">
      <tr><td><a href="?dir=north">É</a></td></tr>
      <tr>
        <td><a href="?dir=west">Ny</a></td>
        <td></td>
        <td><a href="?dir=east">K</a></td>
      </tr>
      <tr><td><a href="?dir=south">D</a></td></tr>
    </table>
    <form>
      <select name="action">
        <option value="eat">kajálsz</option>
        <option value="look">körülnézel</option>
      </select>
    </form>
    <input type="submit" name="go" value="OK">
    <div class="stext">Egy macska fut át az úton.</div>
  </div>
`;

const BATTLE_HTML = `
  <div>
    <img src="/pic/szornyk/moszkitoraj_k.gif" alt="szörny">
    <div>Vérszomjas moszkitóraj</div>
    <div>Életpont: 200 / 225</div>
    <div>Varázspont: 100 / 232</div>
    <div class="stext">Ellenfeled közelébb jön!</div>
    <a href="?action=attack">megtámadod</a>
    <a href="?action=flee">elmenekülsz</a>
  </div>
`;

describe('extractFreeMove', () => {
  it('parses player stats correctly', () => {
    const state = extractFreeMove(makeDoc(FREEMOVE_HTML));
    expect(state.playerName).toBe('Remy');
    expect(state.gold).toBe(587);
    expect(state.hp).toBe(225);
    expect(state.hpMax).toBe(260);
    expect(state.mp).toBe(232);
    expect(state.mpMax).toBe(232);
  });

  it('parses location image URL', () => {
    const state = extractFreeMove(makeDoc(FREEMOVE_HTML));
    expect(state.locationImageUrl).toBe('https://l2.larkinor.hu/tajk/12.gif');
  });

  it('parses available directions', () => {
    const state = extractFreeMove(makeDoc(FREEMOVE_HTML));
    expect(state.availableDirections).toContain('north');
    expect(state.availableDirections).toContain('south');
    expect(state.availableDirections).toContain('east');
    expect(state.availableDirections).toContain('west');
  });

  it('parses actions from select options', () => {
    const state = extractFreeMove(makeDoc(FREEMOVE_HTML));
    expect(state.actions.map(a => a.label)).toContain('kajálsz');
    expect(state.actions.map(a => a.label)).toContain('körülnézel');
  });

  it('parses narration text', () => {
    const state = extractFreeMove(makeDoc(FREEMOVE_HTML));
    expect(state.narration).toContain('macska');
  });

  it('triggering a select-driven action sets the value and submits its form', () => {
    const doc = makeDoc(FREEMOVE_HTML);
    const state = extractFreeMove(doc);
    const select = doc.querySelector<HTMLSelectElement>('select[name="action"]')!;
    const form = select.closest('form')!;
    const submitSpy = vi.fn();
    form.submit = submitSpy;

    const action = state.actions.find(a => a.label === 'kajálsz');
    action?.trigger();

    expect(select.value).toBe('eat');
    expect(submitSpy).toHaveBeenCalledTimes(1);
  });
});

describe('extractBattle', () => {
  it('parses monster name and image', () => {
    const state = extractBattle(makeDoc(BATTLE_HTML));
    expect(state.monsterName).toBe('Vérszomjas moszkitóraj');
    expect(state.monsterImageUrl).toContain('moszkitoraj_k.gif');
  });

  it('parses player HP and MP in battle', () => {
    const state = extractBattle(makeDoc(BATTLE_HTML));
    expect(state.hp).toBe(200);
    expect(state.hpMax).toBe(225);
    expect(state.mp).toBe(100);
    expect(state.mpMax).toBe(232);
  });

  it('parses battle actions from links', () => {
    const state = extractBattle(makeDoc(BATTLE_HTML));
    expect(state.actions.map(a => a.label)).toContain('megtámadod');
    expect(state.actions.map(a => a.label)).toContain('elmenekülsz');
  });

  it('triggering a link-driven action clicks the original anchor', () => {
    const doc = makeDoc(BATTLE_HTML);
    const state = extractBattle(doc);
    const anchor = Array.from(doc.querySelectorAll('a'))
      .find(a => a.textContent?.trim() === 'megtámadod')!;
    const clickSpy = vi.fn();
    anchor.click = clickSpy;

    const action = state.actions.find(a => a.label === 'megtámadod');
    action?.trigger();

    expect(clickSpy).toHaveBeenCalledTimes(1);
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
