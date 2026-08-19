import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { extractDungeonSides } from '../src/utils/domExtract';

function makeDoc(bodyHtml: string): Document {
  return new JSDOM(`<html><body>${bodyHtml}</body></html>`).window.document;
}

/**
 * The composed cell picture exactly as the live game shipped it on 2026-08-19,
 * standing in royal quest 35's cell (0,6): walls north and east, corridors west
 * and south.
 *
 * The side letter is the last-but-one token of the basename and is Hungarian
 * shorthand for a direction, not a compass letter: `f` = fel (up/north),
 * `j` = jobb (right/east), `l` = le (down/south), `b` = bal (left/west).
 *
 * `talaj` (floor), `ellenfel` (the generic enemy silhouette) and `figura`
 * (the player) are in the picture too and say nothing about the sides — the
 * enemy sprite in particular is a plain silhouette that never names the
 * monster, which is why the matcher cannot use the creature as a signal.
 */
const CELL_0_6 = `
  <div style="position:absolute; z-index:3; left: 65; top: 190px"><img src="/labirintus/1/talaj/talaj5.gif"></div>
  <div style="position:absolute; z-index:4; left: 65px; top: 240px"><img src="/labirintus/ellenfel/ellenfel_b.gif"></div>
  <div style="position:absolute; z-index:5; left: 65; top: 190px"><img src="/labirintus/1/folyoso/foly_b_3.gif" title="Folyosó"></div>
  <div style="position:absolute; z-index:5; left: 65; top: 190px"><img src="/labirintus/1/fal/fal_f_8.gif" title="Fal"></div>
  <div style="position:absolute; z-index:5; left: 165; top: 190px"><img src="/labirintus/1/fal/fal_j_8.gif" title="Fal"></div>
  <div style="position:absolute; z-index:5; left: 65; top: 290px"><img src="/labirintus/1/folyoso/foly_l_3.gif" title="Folyosó"></div>
  <div style="position:absolute; z-index:6; left: 125; top: 245px"><img src="/labirintus/figura_fel.gif" title="Félve körbenézel"></div>
`;

/** The same page's nav buttons: only the two open sides are offered. */
const NAV_0_6 = `
  <input type="image" src="/2/ikon/nyugat.gif" title="Nyugati folyosón mész tovább">
  <input type="image" src="/2/ikon/del.gif" title="Déli folyosón mész tovább">
`;

describe('extractDungeonSides', () => {
  it('reads all four sides off the composed cell picture', () => {
    expect(extractDungeonSides(makeDoc(CELL_0_6))).toEqual({
      N: 'wall', E: 'wall', S: 'open', W: 'open',
    });
  });

  it('agrees with the page own nav buttons about which sides are open', () => {
    const sides = extractDungeonSides(makeDoc(CELL_0_6 + NAV_0_6));
    expect(sides).toEqual({ N: 'wall', E: 'wall', S: 'open', W: 'open' });
  });

  // The nav buttons alone are enough to learn the open sides, so a cell whose
  // wall tiles we failed to recognise still narrows the search.
  it('falls back to the nav buttons for sides the tiles did not describe', () => {
    expect(extractDungeonSides(makeDoc(NAV_0_6))).toEqual({ S: 'open', W: 'open' });
  });

  it('reads a door tile as a door', () => {
    const doc = makeDoc('<div><img src="/labirintus/1/ajto/ajto_f_2.gif" title="Ajtó"></div>');
    expect(extractDungeonSides(doc)).toEqual({ N: 'door' });
  });

  // A tile is the game drawing that side; a nav button is the game offering to
  // walk through it. A locked door offers no button, and letting the absent
  // button overwrite the drawn door would turn it into a wall.
  it('keeps a drawn side when the nav buttons disagree', () => {
    const doc = makeDoc('<div><img src="/labirintus/1/ajto/ajto_f_2.gif"></div>' + NAV_0_6);
    expect(extractDungeonSides(doc)).toEqual({ N: 'door', S: 'open', W: 'open' });
  });

  it('describes no side on a page with no maze picture', () => {
    expect(extractDungeonSides(makeDoc('<p>Semmi</p>'))).toEqual({});
  });

  // Anything the grammar does not cover must be dropped, not guessed: an
  // unknown side is a wildcard in the matcher, a wrong one is a false negative.
  it('ignores tiles it cannot parse', () => {
    const doc = makeDoc(`
      <div><img src="/labirintus/1/fal/fal_x_8.gif"></div>
      <div><img src="/labirintus/1/talaj/talaj5.gif"></div>
      <div><img src="/labirintus/figura_fel.gif"></div>
      <div><img src="/labirintus/ellenfel/ellenfel_b.gif"></div>
    `);
    expect(extractDungeonSides(doc)).toEqual({});
  });
});
