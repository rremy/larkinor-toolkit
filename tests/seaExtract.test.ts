import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { readSeaPage, readHarbourPicture, seaDirectionInputs } from '@/utils/seaExtract';
import { detectPage, PageType } from '@/utils/pageDetector';

/** A page captured live on 2026-11-11 (see docs/superpowers/specs/2026-11-11-sea-and-island-maps-design.md). */
function fixture(name: string): Document {
  return new DOMParser().parseFromString(readFileSync(`tests/fixtures/sea/${name}.html`, 'utf-8'), 'text/html');
}

function docWith(body: string): Document {
  return new DOMParser().parseFromString(`<html><body>${body}</body></html>`, 'text/html');
}

describe('readSeaPage', () => {
  it('reads the page that leaves harbour 13', () => {
    expect(readSeaPage(fixture('sea-departed-13'))).toEqual({
      place: 'sea',
      sides: { N: 'sea', S: 'harbour', W: 'land', E: 'land' },
      islandImage: null,
      departed: true,
      sailed: false,
    });
  });

  it('sees a sea fight as a step sailed', () => {
    const page = readSeaPage(fixture('sea-battle'));
    expect(page.sailed).toBe(true);
    expect(page.place).toBe('other');
  });

  it('reads a Thord-Artin tile by its picture', () => {
    expect(readSeaPage(fixture('island-nagysziget-szig_2-10'))).toMatchObject({
      place: 'island',
      islandImage: 'nagysziget/szig_2-10',
      sides: { N: 'walk', W: 'coast', E: 'walk', S: 'walk' },
    });
  });

  it('reads the small island by its own picture set', () => {
    expect(readSeaPage(fixture('island-szighar-1-1'))).toMatchObject({
      place: 'island',
      islandImage: 'szighar/szighar_1-1',
      sides: { N: 'coast', W: 'coast', E: 'walk', S: 'walk' },
    });
  });

  it('accepts both vowel-harmony endings: délre and keletre', () => {
    const page = readSeaPage(docWith(`
      <img src="/tajk/hajotengeren.gif" title="vízfelület">
      <input type="image" src="/2/ikon/del.gif" title="délre hajózol - tenger">
      <input type="image" src="/2/ikon/kelet.gif" title="keletre hajózol - tenger">
      <font face="Comic sans MS">Tovább hajózol...<br>Hullámok jobbra, hullámok balra.</font>`));
    expect(page).toMatchObject({ place: 'sea', sides: { S: 'sea', E: 'sea' }, sailed: true, departed: false });
  });

  it('treats a city tile as no part of the archipelago', () => {
    expect(readSeaPage(docWith('<img src="/tajk/13.gif" title="kezdő-negyed">')).place).toBe('other');
  });

  it('treats an unfamiliar picture directory as no island', () => {
    expect(readSeaPage(docWith('<img src="/tajk/leghajo/akarmi_1-1.gif">')).place).toBe('other');
  });

  it('ignores what the toolkit itself draws', () => {
    const page = readSeaPage(docWith(`
      <img src="/tajk/hajotengeren.gif">
      <div id="lc-dock-root"><input type="image" title="északra hajózol - kikötő"></div>
      <input type="image" src="/2/ikon/eszak.gif" title="északra hajózol - tenger">`));
    expect(page.sides).toEqual({ N: 'sea' });
  });
});

describe('readHarbourPicture', () => {
  it('reads the grid square a harbour building is named by', () => {
    expect(readHarbourPicture(docWith('<img src="/2/epulet/-241kikoto.gif" title="kikötő">'))).toBe('-241');
    expect(readHarbourPicture(docWith('<img src="/2/epulet/-2224kikoto.gif">'))).toBe('-2224');
    expect(readHarbourPicture(docWith('<img src="/2/epulet/13kikoto.gif">'))).toBe('13');
  });

  it('is null on a page without one', () => {
    expect(readHarbourPicture(docWith('<img src="/2/epulet/templom.gif">'))).toBeNull();
  });
});

describe('seaDirectionInputs', () => {
  it('finds every control that sails, the harbour included', () => {
    expect(seaDirectionInputs(fixture('sea-departed-13')).map((d) => d.side).sort()).toEqual(['N', 'S']);
  });

  it('finds the walking controls on an island', () => {
    expect(seaDirectionInputs(fixture('island-nagysziget-szig_2-10')).map((d) => d.side).sort()).toEqual(['E', 'N', 'S']);
  });
});

describe('detectPage', () => {
  it('names the harbour building', () => {
    expect(detectPage(docWith('<input type="hidden" name="oldalTipus" value="otKikoto">'))).toBe(PageType.Harbour);
  });
});
