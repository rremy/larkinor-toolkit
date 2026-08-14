import { describe, it, expect } from 'vitest';
import { parseTavernEdges, parseTavernImage, parseTavernTitle, parseTavernQuestPage } from '../../scripts/quests/parseTavernQuest.mjs';

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

describe('parseTavernTitle', () => {
  it('keeps a non-question title as narration, newlines and all', () => {
    const r = parseTavernTitle('A keleti ajtó mögül:\n- Ne mozdulj!\n- Mmmhmhm!', false);
    expect(r.question).toBeNull();
    expect(r.narration).toBe('A keleti ajtó mögül: - Ne mozdulj! - Mmmhmhm!');
  });

  // Line 0 is the setup, the rest are the options. The tavern source has no
  // (n) markers, no arrows and no ` -- `, so this line split is the only
  // structure available.
  it('splits a question image title into a prompt and its options', () => {
    const r = parseTavernTitle('Felveszed?\nNaná!\nHaggyámá!', true);
    expect(r.narration).toBe('');
    expect(r.question).toEqual({
      prompt: 'Felveszed?',
      choices: [
        { index: 1, text: 'Naná!', outcome: '' },
        { index: 2, text: 'Haggyámá!', outcome: '' },
      ],
    });
  });

  // The royal set's hasQuestion/question split: the marker comes from the
  // artwork, so a title that cannot yield options must not fabricate any.
  it('yields no question when a question image has fewer than two lines', () => {
    const r = parseTavernTitle('A WC zárva van.', true);
    expect(r.question).toBeNull();
    expect(r.narration).toBe('A WC zárva van.');
  });

  it('yields no question for an empty title', () => {
    expect(parseTavernTitle('', true)).toEqual({ narration: '', question: null });
  });

  it('never treats a non-question multi-line title as options', () => {
    expect(parseTavernTitle('Egy sor\nMásik sor', false).question).toBeNull();
  });
});

const PAGE = `
<p><span class="tulajdonsagnev">Leírás:</span> Szerezd meg a gömböt.<br></p>
<p><span class="tulajdonsagnev">Jutalom:</span> 3000 arany</p>
<div class="lab"><table>
<tr>
  <td class="f b"><img class="szorny" title="" src="q_elemei/agyszivo_bronz.jpg"></td>
  <td class="f j_vas"><img class="szorny" title="Felveszed?
Naná!" src="q_elemei/kerdes.jpg"></td>
</tr>
<tr>
  <td class="a b"><img class="szorny" title="" src="q_elemei/black.jpg"></td>
  <td class="a j"><img class="szorny" title="" src="q_elemei/nop_labikibe.jpg"></td>
</tr>
</table></div>`;

describe('parseTavernQuestPage', () => {
  const resolve = (base: string) => (base === 'agyszivo' ? { id: 7, name: 'Agyszívó' } : null);

  it('reads the identity, description, reward and grid', () => {
    const q = parseTavernQuestPage(PAGE, { id: 'GOMB', title: 'GÖMB' }, resolve);
    expect(q).toMatchObject({
      id: 'GOMB', set: 'tavern', title: 'GÖMB',
      description: 'Szerezd meg a gömböt.', reward: '3000 arany',
      rows: 2, cols: 2,
    });
    expect(q.cells).toHaveLength(4);
  });

  it('resolves monsters and records the key each cell yields', () => {
    const q = parseTavernQuestPage(PAGE, { id: 'GOMB', title: 'GÖMB' }, resolve);
    expect(q.cells[0]).toMatchObject({ row: 0, col: 0, monsterId: 7, monsterName: 'Agyszívó', key: 'bronz' });
  });

  it('marks a question tile from its image and parses its options', () => {
    const q = parseTavernQuestPage(PAGE, { id: 'GOMB', title: 'GÖMB' }, resolve);
    expect(q.cells[1]).toMatchObject({ hasQuestion: true, monsterId: null });
    expect(q.cells[1].question.choices).toEqual([{ index: 1, text: 'Naná!', outcome: '' }]);
    expect(q.cells[1].edges.E).toEqual({ kind: 'door', lock: 'vas' });
  });

  it('reads an exit standing on an otherwise empty cell', () => {
    const q = parseTavernQuestPage(PAGE, { id: 'GOMB', title: 'GÖMB' }, resolve);
    expect(q.cells[3]).toMatchObject({ portal: 'exit', monsterId: null, monsterName: null });
  });

  it('throws when the maze is missing', () => {
    expect(() => parseTavernQuestPage('<p>nothing</p>', { id: 'X', title: 'X' }, resolve))
      .toThrow(/X/);
  });
});
