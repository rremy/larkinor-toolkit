import { describe, it, expect } from 'vitest';
import { parseTavernEdges, parseTavernImage } from '../../scripts/quests/parseTavernQuest.mjs';

describe('parseTavernEdges', () => {
  it('reads the four sides as walls', () => {
    expect(parseTavernEdges('f j a b')).toEqual({
      N: { kind: 'wall' }, E: { kind: 'wall' },
      S: { kind: 'wall' }, W: { kind: 'wall' },
    });
  });

  it('reads a lock suffix as a door', () => {
    expect(parseTavernEdges('j_arany').E).toEqual({ kind: 'door', lock: 'arany' });
  });

  // The source ships these four malformed tokens; a strict parser throws on
  // them, which would abort the whole scrape over a typo.
  it.each([
    ['b_Ezust', 'W', 'ezust'],
    ['f_azust', 'N', 'ezust'],
    ['j_asrany', 'E', 'arany'],
    ['j_bronnz', 'E', 'bronz'],
  ])('normalises the source typo %s', (token, side, lock) => {
    expect(parseTavernEdges(token)[side as 'N' | 'E' | 'S' | 'W']).toEqual({ kind: 'door', lock });
  });

  it('keeps _szel distinct from a wall', () => {
    expect(parseTavernEdges('a_szel').S).toEqual({ kind: 'szel' });
  });

  it('throws on a genuinely unknown token', () => {
    expect(() => parseTavernEdges('f_quartz')).toThrow(/unrecognised/);
  });
});

describe('parseTavernImage', () => {
  it('reads a bare monster sprite', () => {
    expect(parseTavernImage('GOMB_elemei/agyszivo.jpg'))
      .toMatchObject({ base: 'agyszivo', key: null, questItem: false, portal: null, question: false });
  });

  // Tavern spells a key cell `<monster>_<lock>`, not the royal `_<lock>kulcs`.
  it('reads a bare lock suffix as the key this cell yields', () => {
    expect(parseTavernImage('x_elemei/csontsarkany_bronz.jpg'))
      .toMatchObject({ base: 'csontsarkany', key: 'bronz' });
  });

  it('reads the quest item marker', () => {
    expect(parseTavernImage('x_elemei/berrablo_kulditargy.jpg'))
      .toMatchObject({ base: 'berrablo', questItem: true });
  });

  it('reads the exit marker in either spelling', () => {
    expect(parseTavernImage('x_elemei/a_labikibe.jpg')).toMatchObject({ portal: 'exit' });
    expect(parseTavernImage('x_elemei/a_kibe.jpg')).toMatchObject({ portal: 'exit' });
  });

  // Markers appear on either side of the base, so stripping must be
  // token-based rather than an ordered suffix peel.
  it('reads a question marker written as a prefix', () => {
    expect(parseTavernImage('x_elemei/kerdes_platina.jpg'))
      .toMatchObject({ question: true, key: 'platina', base: null, empty: true });
  });

  it('reads several markers combined on one tile', () => {
    expect(parseTavernImage('x_elemei/ven_villamvarazslo_labikibe_kulditargy.jpg'))
      .toMatchObject({ base: 'ven_villamvarazslo', portal: 'exit', questItem: true });
  });

  it('treats labikibe_kerdes as a markers-only tile with no creature', () => {
    expect(parseTavernImage('x_elemei/labikibe_kerdes.jpg'))
      .toMatchObject({ base: null, empty: true, portal: 'exit', question: true });
  });

  it.each(['black', 'nop', 'kijarat', 'bejarat'])('treats %s as scenery', (name) => {
    expect(parseTavernImage(`x_elemei/${name}.jpg`)).toMatchObject({ base: null, empty: true });
  });

  it('flags a boss sprite', () => {
    expect(parseTavernImage('x_elemei/tolvajkepzoboss.jpg'))
      .toMatchObject({ base: 'tolvajkepzoboss', boss: true });
  });
});
