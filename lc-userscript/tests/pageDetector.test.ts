import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { detectPage, PageType } from '../src/utils/pageDetector';

function makeDoc(bodyHtml: string): Document {
  return new JSDOM(`<html><body>${bodyHtml}</body></html>`).window.document;
}

describe('detectPage', () => {
  it('returns FreeMove when compass navigation is present', () => {
    // Game compass: a table with directional links (N/S/E/W)
    const doc = makeDoc(`
      <table class="irany">
        <tr><td><a href="?dir=north">É</a></td></tr>
        <tr><td><a href="?dir=west">Ny</a></td><td><a href="?dir=east">K</a></td></tr>
        <tr><td><a href="?dir=south">D</a></td></tr>
      </table>
      <select name="action"><option value="eat">kajálsz</option></select>
    `);
    expect(detectPage(doc)).toBe(PageType.FreeMove);
  });

  it('returns Battle when a monster image is present in the main panel', () => {
    const doc = makeDoc(`
      <img src="/pic/szornyk/moszkitoraj_k.gif" alt="szörny">
      <a href="?action=attack">megtámadod</a>
    `);
    expect(detectPage(doc)).toBe(PageType.Battle);
  });

  it('returns Shop when buy/sell headers are present', () => {
    const doc = makeDoc(`
      <td>Vétel</td>
      <td>Eladás</td>
      <select name="item_buy"></select>
    `);
    expect(detectPage(doc)).toBe(PageType.Shop);
  });

  it('returns Church when a healing/mana shop form is present', () => {
    const doc = makeDoc(`
      <td>Mágikus tárgy</td>
      <td>Negatív hatások:</td>
      <select name="magic_item"></select>
    `);
    expect(detectPage(doc)).toBe(PageType.Church);
  });

  it('returns Unknown and does not throw for unrecognised pages', () => {
    const doc = makeDoc(`<p>Valami ismeretlen oldal</p>`);
    expect(() => detectPage(doc)).not.toThrow();
    expect(detectPage(doc)).toBe(PageType.Unknown);
  });
});
