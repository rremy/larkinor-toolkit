import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { releaseControlWrappers } from '../src/desktop/controlWrappers';

/**
 * The labyrinth page as saved live on 2026-11-25 (Labirintus-bug.html), cut
 * down to the parts that decide the bug: the two 300px button wrappers over a
 * riddle's answers, and the boxes that must stay as they are.
 */
function labyrinthDoc(): Document {
  return new JSDOM(`<html><body>
    <div id="klap" style="position:absolute; width:300px; height:30; z-index:6; left: 20px; top: 410px">
      <input type="image" src="klap.gif" width="50" height="30" title="Beállítások">
    </div>
    <div id="pihen" style="position:absolute; width:300px; height:30; z-index:6; left: 210px; top: 410px">
      <input type="image" src="pihen.gif" width="50" height="30" title="Pihensz egy kicsit">
    </div>
    <div id="kelet" style="position:absolute; width:25px; height:25; z-index:6; left: 152px; top: 435px">
      <img src="kelet.gif" title="Erre nem lehet menni">
    </div>
    <div id="bg" style="position:absolute; width:239px; height:70; z-index:3; left: 20px; top: 340px"></div>
    <div id="stats" style="position:absolute; width:235px; height:60; z-index:4; left: 20px; top: 337px">
      <b>Remy <img src="bizt_van.gif"> Életpont: 622 / 780</b>
    </div>
    <div id="Layer3" style="position:absolute; width:345px; height:350; z-index:3; left: 275px; top: 190px;">
      <font face="Comic sans MS">Kérdés?<br>
        <input type="radio" name="valasz">A hold fényében<br>
        <input type="button" value="Válasz">
      </font>
    </div>
    <div id="lc-dock-root"><div style="position:absolute"><input type="image" src="x.gif"></div></div>
  </body></html>`).window.document;
}

describe('releaseControlWrappers', () => {
  it('lets clicks through the rest and character-sheet wrappers but not their buttons', () => {
    const doc = labyrinthDoc();
    expect(releaseControlWrappers(doc)).toBe(2);
    for (const id of ['klap', 'pihen']) {
      const div = doc.getElementById(id)!;
      expect(div.style.pointerEvents, id).toBe('none');
      expect(div.querySelector('input')!.style.pointerEvents, id).toBe('auto');
    }
  });

  it('leaves the narration, the stat box, image-only and empty boxes and the dock alone', () => {
    const doc = labyrinthDoc();
    releaseControlWrappers(doc);
    for (const id of ['kelet', 'bg', 'stats', 'Layer3']) {
      expect(doc.getElementById(id)!.style.pointerEvents, id).toBe('');
    }
    expect((doc.querySelector('#lc-dock-root div') as HTMLElement).style.pointerEvents).toBe('');
  });

  it('keeps the buttons working', () => {
    const doc = labyrinthDoc();
    releaseControlWrappers(doc);
    let clicked = false;
    doc.querySelector('#pihen input')!.addEventListener('click', () => { clicked = true; });
    (doc.querySelector('#pihen input') as HTMLElement).click();
    expect(clicked).toBe(true);
  });
});
