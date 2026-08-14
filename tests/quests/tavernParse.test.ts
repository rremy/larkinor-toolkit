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

  // The three tokens below don't fit the side-prefix grammar at all (no
  // leading f/j/a/b), unlike the typo aliases above, which correct a
  // suffix on an otherwise well-formed token. Each is tolerated — dropped
  // rather than guessed at — because a guess would invent a door the source
  // never drew. One test per token, from the live pages that carry them.
  it.each([
    ['kastely.htm cell (2,8)', 'a _rezf'],
    ['kiralyno_7_torpe.htm cell (6,8)', 'j b_arany l_platina'],
    ['letezik_egy_labirintus.htm cell (0,3)', 'f b_platina j bronz a_bronz'],
  ])('tolerates the malformed token from %s', (_label, classAttr) => {
    expect(() => parseTavernEdges(classAttr)).not.toThrow();
  });

  it('ignoring the tolerated token loses no side on the fully-declared cell', () => {
    // f, b_platina, j, a_bronz already declare all four sides; the bare,
    // prefixless `bronz` token that rides along must not overwrite any of them.
    expect(parseTavernEdges('f b_platina j bronz a_bronz')).toEqual({
      N: { kind: 'wall' },
      E: { kind: 'wall' },
      S: { kind: 'door', lock: 'bronz' },
      W: { kind: 'door', lock: 'platina' },
    });
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

  // `bejarat` is authoritative for the entrance portal, unlike the deferential
  // PORTAL_TOKENS (`labikibe`/`kibe`/`labi`), which only set `exit` when no
  // other marker already claimed `portal`. The bare marker alone must read as
  // an entrance, not fall through as a plain scenery tile with no portal.
  it('reads the bare bejarat marker as an entrance', () => {
    expect(parseTavernImage('x_elemei/bejarat.jpg')).toMatchObject({ base: null, empty: true, portal: 'entrance' });
  });

  // The corpus's single most common marker tile (36 occurrences, one per
  // quest): tokens are consumed left to right, so without `bejarat` being
  // authoritative, the immediately-following `labikibe` would overwrite the
  // entrance with `exit` and no maze would have a start.
  it('reads bejarat_labikibe as the maze entrance, not an exit', () => {
    expect(parseTavernImage('x_elemei/bejarat_labikibe.jpg')).toMatchObject({ base: null, empty: true, portal: 'entrance' });
  });

  // `kijarat` (exit) is scenery, not a marker token — pinned here alongside
  // the two tests above so the entrance/exit fix can never silently swap them.
  it('keeps kijarat_labikibe as an exit', () => {
    expect(parseTavernImage('x_elemei/kijarat_labikibe.jpg')).toMatchObject({ base: null, empty: true, portal: 'exit' });
  });

  it('flags a boss sprite', () => {
    expect(parseTavernImage('x_elemei/tolvajkepzoboss.jpg'))
      .toMatchObject({ base: 'tolvajkepzoboss', boss: true });
  });

  // `tolvaj` (thief) is both a lock suffix and the second word of some
  // monster names — `berbunko_tolvaj` (a monster, no key) versus
  // `klonolo_tolvaj` (a different monster plus a thief-locked key). No
  // lexical rule can tell these apart; only knowledge of which strings are
  // monster names can. `isMonster` here mirrors resolveMonster's real
  // matches for these three names.
  describe('with an isMonster predicate', () => {
    const isMonster = (name: string) => ['berbunko_tolvaj', 'klonolo', 'csontsarkany'].includes(name);

    it('takes the longest monster-name prefix, leaving the rest as markers', () => {
      expect(parseTavernImage('x_elemei/berbunko_tolvaj_arany.jpg', isMonster))
        .toMatchObject({ base: 'berbunko_tolvaj', key: 'arany' });
    });

    it('falls back to a shorter monster-name prefix when the longer one is not a monster', () => {
      expect(parseTavernImage('x_elemei/klonolo_tolvaj.jpg', isMonster))
        .toMatchObject({ base: 'klonolo', key: 'tolvaj' });
    });

    it('resolves a single-token monster name plus its key', () => {
      expect(parseTavernImage('x_elemei/csontsarkany_bronz.jpg', isMonster))
        .toMatchObject({ base: 'csontsarkany', key: 'bronz' });
    });

    it('falls back to marker-only classification when no prefix is a monster', () => {
      expect(parseTavernImage('x_elemei/kerdes_platina.jpg', isMonster))
        .toMatchObject({ question: true, key: 'platina', base: null, empty: true });
    });

    it('reads the plain monster name with no key when nothing follows it', () => {
      expect(parseTavernImage('x_elemei/berbunko_tolvaj.jpg', isMonster))
        .toMatchObject({ base: 'berbunko_tolvaj', key: null });
    });
  });

  // Proves the default predicate (always false) is a true no-op: same
  // filename as the last case above, but with isMonster omitted. Without a
  // predicate opinion, `tolvaj` falls back to its lock-suffix meaning
  // wherever it sits — exactly task 2's original, predicate-free behaviour.
  it('without isMonster supplied, keeps the pre-existing marker-anywhere behaviour', () => {
    expect(parseTavernImage('x_elemei/berbunko_tolvaj.jpg'))
      .toMatchObject({ base: 'berbunko', key: 'tolvaj' });
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

// Mirrors komponens.htm row 0, cell 5 exactly: an unclosed <img> directly
// followed by a bare `<td="">`. A `<\/td>`-anchored lazy match runs past this
// cell to the next real `</td>`, merging two cells into one and shifting
// every later cell in the row one column left. The cell regex instead runs
// content until the next `<td`/`</td`, mirroring browser error recovery. A
// second, fully well-formed row is included to prove ordinary rows still
// parse exactly as before.
const RAGGED_PAGE = `
<p><span class="tulajdonsagnev">Leírás:</span> Teszt.<br></p>
<p><span class="tulajdonsagnev">Jutalom:</span> 1 arany</p>
<div class="lab"><table>
<tr>
  <td class="a"><img class="szorny" title="" src="x_elemei/first.jpg"></td>
  <td class="b_vas"><img class="szorny" title="" src="x_elemei/nop.jpg" <td=""><img class="szorny" title="" src="x_elemei/nop.jpg"> </td>
  <td class="j"><img class="szorny" title="" src="x_elemei/last.jpg"></td>
</tr>
<tr>
  <td class="f"><img class="szorny" title="" src="x_elemei/row2_a.jpg"></td>
  <td class="a"><img class="szorny" title="" src="x_elemei/row2_b.jpg"></td>
  <td class="b"><img class="szorny" title="" src="x_elemei/row2_c.jpg"></td>
  <td class="j"><img class="szorny" title="" src="x_elemei/row2_d.jpg"></td>
</tr>
</table></div>`;

describe('parseTavernQuestPage recovers an unclosed <td>', () => {
  const resolve = () => null;

  it('recovers both cells from the unclosed <td>, keeping later columns aligned', () => {
    const q = parseTavernQuestPage(RAGGED_PAGE, { id: 'RAGGED', title: 'RAGGED' }, resolve);
    expect(q.rows).toBe(2);
    expect(q.cols).toBe(4);
    expect(q.cells).toHaveLength(8);
    expect(q.cells.filter((c) => c.row === 0).map((c) => [c.col, c.rawImage])).toEqual([
      [0, 'x_elemei/first.jpg'],
      [1, 'x_elemei/nop.jpg'],
      [2, 'x_elemei/nop.jpg'],
      [3, 'x_elemei/last.jpg'],
    ]);
    // The recovered cell (col 1) keeps its own edge class; the following,
    // previously-shifted cell (col 3) keeps its correct column and edge too.
    expect(q.cells[1].edges.W).toEqual({ kind: 'door', lock: 'vas' });
    expect(q.cells[3].edges.E).toEqual({ kind: 'wall' });
  });

  it('parses a well-formed row identically alongside the recovered one', () => {
    const q = parseTavernQuestPage(RAGGED_PAGE, { id: 'RAGGED', title: 'RAGGED' }, resolve);
    expect(q.cells.filter((c) => c.row === 1).map((c) => [c.col, c.rawImage])).toEqual([
      [0, 'x_elemei/row2_a.jpg'],
      [1, 'x_elemei/row2_b.jpg'],
      [2, 'x_elemei/row2_c.jpg'],
      [3, 'x_elemei/row2_d.jpg'],
    ]);
  });
});
