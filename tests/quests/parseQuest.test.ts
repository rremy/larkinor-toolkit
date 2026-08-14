import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  stripComments, parseEdges, decodeEntities, stripTags, parseImage, parseTitle, parseQuestPage,
} from '../../scripts/quests/parseQuest.mjs';
import type { Quest } from '@/shared/data';

const fixture = (n: number) => readFileSync(`tests/fixtures/quests/${n}.html`, 'utf-8');

describe('stripComments', () => {
  it('removes the commented-out template row that quest 45 ships', () => {
    const raw = fixture(45);
    // The template row is commented out; its cells have empty src attributes.
    expect(raw).toContain('<!--');
    const stripped = stripComments(raw);
    expect(stripped).not.toContain('<!--');
    // Every remaining cell image has a real filename.
    expect(stripped).not.toMatch(/<img[^>]*src=""/);
  });
});

describe('parseEdges', () => {
  it('maps bare side tokens to walls and leaves the rest open', () => {
    expect(parseEdges('f j')).toEqual({
      N: { kind: 'wall' }, E: { kind: 'wall' },
      S: { kind: 'open' }, W: { kind: 'open' },
    });
  });

  it('maps suffixed side tokens to locked doors', () => {
    const edges = parseEdges('f j_vas a b_arany');
    expect(edges.E).toEqual({ kind: 'door', lock: 'vas' });
    expect(edges.W).toEqual({ kind: 'door', lock: 'arany' });
    expect(edges.N).toEqual({ kind: 'wall' });
    expect(edges.S).toEqual({ kind: 'wall' });
  });

  it('keeps szel as its own kind rather than a wall or a door', () => {
    expect(parseEdges('f_szel').N).toEqual({ kind: 'szel' });
  });

  it('tolerates the one malformed bare _cso token in the source', () => {
    expect(() => parseEdges('_cso')).not.toThrow();
    expect(parseEdges('_cso j')).toEqual({
      N: { kind: 'open' }, E: { kind: 'wall' },
      S: { kind: 'open' }, W: { kind: 'open' },
    });
  });

  it('throws on an unrecognised token so source drift cannot pass silently', () => {
    expect(() => parseEdges('f j_titanium')).toThrow(/j_titanium/);
    expect(() => parseEdges('x')).toThrow(/x/);
  });

  it('treats an empty class attribute as fully open', () => {
    expect(parseEdges('')).toEqual({
      N: { kind: 'open' }, E: { kind: 'open' },
      S: { kind: 'open' }, W: { kind: 'open' },
    });
  });
});

describe('decodeEntities / stripTags', () => {
  it('decodes the entities the source actually uses', () => {
    expect(decodeEntities('a&nbsp;b &amp; c &quot;d&quot;')).toBe('a b & c "d"');
  });

  it('strips tags and collapses whitespace', () => {
    expect(stripTags('<b>Hello</b>  <i>world</i>')).toBe('Hello world');
  });
});

describe('parseImage', () => {
  it('reads a plain monster sprite', () => {
    expect(parseImage('moszkitoraj_k.gif')).toMatchObject({
      base: 'moszkitoraj_k', key: null, questItem: false, portal: null,
      trap: false, death: false, boss: false, question: false, empty: false,
    });
  });

  it('reads the key a cell yields', () => {
    expect(parseImage('csontvaz_vaskulcs.jpg')).toMatchObject({ base: 'csontvaz', key: 'vas' });
    expect(parseImage('csontlovag_platinakulcs.jpg')).toMatchObject({ base: 'csontlovag', key: 'platina' });
  });

  it('strips interleaved suffixes in a fixed order', () => {
    expect(parseImage('kereskedo_tolvajkulcs_kt_labikibe.jpg'))
      .toMatchObject({ base: 'kereskedo', key: 'tolvaj', questItem: true, portal: 'exit' });
    expect(parseImage('dzsinkaboss_aranykulcs_kt.jpg'))
      .toMatchObject({ base: 'dzsinkaboss', key: 'arany', questItem: true, boss: true });
    expect(parseImage('polip_platinakulcs_labikibe.jpg'))
      .toMatchObject({ base: 'polip', key: 'platina', portal: 'exit' });
    expect(parseImage('goblinharcmuvesz_kt_labikibe.jpg'))
      .toMatchObject({ base: 'goblinharcmuvesz', questItem: true, portal: 'exit' });
  });

  it('treats bejarat as the entrance and other _labikibe files as exits', () => {
    expect(parseImage('bejarat_labikibe.jpg')).toMatchObject({ portal: 'entrance', empty: true });
    expect(parseImage('moszkitoraj_labikibe.jpg')).toMatchObject({ portal: 'exit', base: 'moszkitoraj' });
  });

  it('handles the trailing _j variant of the exit suffix', () => {
    expect(parseImage('csapda_labikibe_j.jpg')).toMatchObject({ portal: 'exit', trap: true });
    expect(parseImage('nop_labikibe_j.jpg')).toMatchObject({ portal: 'exit', empty: true });
  });

  it('decides emptiness after stripping, so an exit on an empty cell survives', () => {
    expect(parseImage('nop.jpg')).toMatchObject({ empty: true, portal: null });
    expect(parseImage('nop')).toMatchObject({ empty: true });
    expect(parseImage('')).toMatchObject({ empty: true });
    expect(parseImage('nop_labikibe.jpg')).toMatchObject({ empty: true, portal: 'exit' });
  });

  it('flags question, trap and death cells', () => {
    expect(parseImage('kerdes.jpg')).toMatchObject({ question: true, empty: true });
    expect(parseImage('kerdes_aranykulcs.jpg')).toMatchObject({ question: true, key: 'arany' });
    // Real file: quest 27, cell (1,1) — simultaneously the question, the
    // quest objective (the centrata tőr) and the exit; the largest quest's
    // objective cell.
    expect(parseImage('kerdes_kt_labikibe.jpg')).toMatchObject({ question: true, questItem: true, portal: 'exit' });
    expect(parseImage('csapda.jpg')).toMatchObject({ trap: true, empty: true });
    expect(parseImage('halal.jpg')).toMatchObject({ death: true, empty: true });
  });

  it('strips the _kerdes suffix so the boss base stays resolvable', () => {
    expect(parseImage('tolvajkepzoboss_kerdes.jpg'))
      .toMatchObject({ base: 'tolvajkepzoboss', question: true, boss: true, empty: false });
  });

  it('detects boss bases', () => {
    expect(parseImage('csontlovagboss_kt.jpg')).toMatchObject({ base: 'csontlovagboss', boss: true, questItem: true });
    expect(parseImage('nyonyoraboss_kt.gif')).toMatchObject({ base: 'nyonyoraboss', boss: true });
  });
});

describe('parseTitle', () => {
  it('splits drops off a plain narration', () => {
    const r = parseTitle('Továbbhaladva látod, hogy dél felé szűkül a folyosó... -- 1 db szúnyogszárny');
    expect(r.narration).toBe('Továbbhaladva látod, hogy dél felé szűkül a folyosó...');
    expect(r.drops).toBe('1 db szúnyogszárny');
    expect(r.question).toBeNull();
  });

  it('returns null drops when the title has no separator', () => {
    const r = parseTitle('Itt léptél be Gründen pincéjébe.');
    expect(r.drops).toBeNull();
    expect(r.narration).toBe('Itt léptél be Gründen pincéjébe.');
  });

  it('parses a colon-separated question, keeping narration before it', () => {
    const r = parseTitle(
      'Találsz egy borosüveget. KÉRDÉS: Mit teszel? VÁLASZOK: ' +
      '(1) Megkóstolod: max ÉP (2) Kiiszod az egészet: 3 méreg (3) Otthagyod a földön az üveget: semmi',
    );
    expect(r.narration).toBe('Találsz egy borosüveget.');
    expect(r.question?.prompt).toBe('Mit teszel?');
    expect(r.question?.choices).toEqual([
      { index: 1, text: 'Megkóstolod', outcome: 'max ÉP' },
      { index: 2, text: 'Kiiszod az egészet', outcome: '3 méreg' },
      { index: 3, text: 'Otthagyod a földön az üveget', outcome: 'semmi' },
    ]);
  });

  it('parses a dash-separated question with semicolons', () => {
    const r = parseTitle(
      'Látsz egy gyökeret. KÉRDÉS: Mit teszel? VÁLASZ: (1) Megpróbálod meghúzni -- Kaméleon; (2) Otthagyod -- semmi',
    );
    expect(r.question?.choices).toEqual([
      { index: 1, text: 'Megpróbálod meghúzni', outcome: 'Kaméleon' },
      { index: 2, text: 'Otthagyod', outcome: 'semmi' },
    ]);
  });

  it('parses parenthesised outcomes and a lowercase Válasz label', () => {
    const r = parseTitle(
      'Észreveszel egy gombát. KÉRDÉS: Mit teszel? Válasz: ' +
      '(1) Otthagyod. (Gyógyulsz); (2) Bedörzsölöd vele a homlokod (3 méreg); (3) Otthagyod (4 átok)',
    );
    expect(r.question?.choices.map((c) => c.outcome)).toEqual(['Gyógyulsz', '3 méreg', '4 átok']);
    expect(r.question?.choices[1].text).toBe('Bedörzsölöd vele a homlokod');
  });

  it('does not let the drops separator corrupt the question', () => {
    const r = parseTitle(
      'KÉRDÉS: Mit teszel? VÁLASZ: (1) Felállsz -- 15 méreg; (2) Lehajolsz -- 4 méreg',
    );
    expect(r.question?.choices).toHaveLength(2);
    expect(r.question?.choices[0].outcome).toBe('15 méreg');
    expect(r.drops).toBeNull();
  });

  it('lifts a trailing quest drop out of the final answer', () => {
    const r = parseTitle(
      'KÉRDÉS: Mit teszel? VÁLASZ: (1) Hallgatsz -- semmi; ' +
      '(2) Megmondod a neved -- Halál; (3) Továbbmész -- Hullámelementál -- 6 db elementál eszencia',
    );
    expect(r.drops).toBe('6 db elementál eszencia');
    expect(r.question?.choices[2].outcome).toBe('Hullámelementál');
  });

  it('leaves a non-drop-shaped trailing segment inside the final outcome', () => {
    const r = parseTitle(
      'KÉRDÉS: Mit teszel? VÁLASZ: (1) Hallgatsz -- semmi; ' +
      '(2) Megmondod a neved -- Halál; (3) Továbbmész -- Hullámelementál -- ez nem zsákmány',
    );
    expect(r.drops).toBeNull();
    expect(r.question?.choices[2].outcome).toBe('Hullámelementál -- ez nem zsákmány');
  });

  it('splits an arrow-separated outcome', () => {
    const r = parseTitle(
      'KÉRDÉS: Mit teszel? VÁLASZ: (1) Megvárod mi történik -> Halál!; (2) Továbbrohansz -> Halál!',
    );
    expect(r.question?.choices).toEqual([
      { index: 1, text: 'Megvárod mi történik', outcome: 'Halál!' },
      { index: 2, text: 'Továbbrohansz', outcome: 'Halál!' },
    ]);
  });

  it('prefers the arrow split over a trailing parenthesis, so the paren note stays with the outcome', () => {
    // Real case (quest 23, cell 5,9): without the arrow rule running first,
    // the trailing-parenthesis rule would instead grab just "EZ A JÓ" and
    // strand "Semmi" in `text`.
    const r = parseTitle(
      'KÉRDÉS: Mit teszel? VÁLASZ: (1) Lehasalsz a lépcső alá -> Semmi (EZ A JÓ)',
      true,
    );
    expect(r.question?.choices).toEqual([
      { index: 1, text: 'Lehasalsz a lépcső alá', outcome: 'Semmi (EZ A JÓ)' },
    ]);
  });

  it('tolerates the doubled parenthesis typo in the source', () => {
    const r = parseTitle('KÉRDÉS: Mi? VÁLASZ: (1) NYED. -- -20000 ÉP; (2) NYEB. -- semmi; (3)) NYANYED. -- -20000 ÉP');
    expect(r.question?.choices.map((c) => c.index)).toEqual([1, 2, 3]);
  });

  it('falls back to raw narration when the answers cannot be split', () => {
    const raw = 'KÉRDÉS: Mit teszel? VÁLASZ: mindegy';
    const r = parseTitle(raw);
    expect(r.question).toBeNull();
    expect(r.narration).toBe(raw);
  });

  it('returns empty narration for an empty title', () => {
    expect(parseTitle('')).toEqual({ narration: '', drops: null, question: null });
  });

  it('parses a VÁLASZ-only title with no KÉRDÉS token, leaving the prompt empty, on a question-image cell', () => {
    // The source frequently poses the question in narration prose and jumps
    // straight to the answers — the prose stays as narration, and there is
    // no separate prompt to extract. This relaxation is gated on the cell
    // actually being a question-image tile (2nd arg), so it never fires on
    // narration that just happens to contain the word "válasz".
    const r = parseTitle('MI A JELSZÓ??!!!! VÁLASZ: (1) Sárkánytojás -- semmi; (2) Nem tudod -- Halál', true);
    expect(r.narration).toBe('MI A JELSZÓ??!!!!');
    expect(r.question?.prompt).toBe('');
    expect(r.question?.choices).toEqual([
      { index: 1, text: 'Sárkánytojás', outcome: 'semmi' },
      { index: 2, text: 'Nem tudod', outcome: 'Halál' },
    ]);
  });

  it('parses a VÁLASZOK-only title the same way as VÁLASZ-only', () => {
    const r = parseTitle('Egy zárt ládát találsz. VÁLASZOK: (1) Kinyitod -- kincs', true);
    expect(r.narration).toBe('Egy zárt ládát találsz.');
    expect(r.question?.prompt).toBe('');
  });

  it('accepts a single-choice answer instead of requiring at least two, on a question-image cell', () => {
    const r = parseTitle('KÉRDÉS: Mit teszel? VÁLASZ: (1) Elveszed a kulcsot -- vaskulcs', true);
    expect(r.question?.choices).toEqual([
      { index: 1, text: 'Elveszed a kulcsot', outcome: 'vaskulcs' },
    ]);
  });

  it('does not treat narration containing (1) as a question when no VÁLASZ token is present', () => {
    // A bare parenthesised number in ordinary prose (not an answer marker)
    // must never be mistaken for the answer block.
    const raw = 'A falon egy tábla áll: (1) számú terem.';
    const r = parseTitle(raw, true);
    expect(r.question).toBeNull();
    expect(r.narration).toBe(raw);
  });

  it('rejects both relaxations on a non-question-image cell, even with a real KÉRDÉS/VÁLASZ shape', () => {
    // Real case, quest 38 cells (4,4)/(4,5)/(9,4): a `halal.jpg` (death) tile
    // whose title reads exactly like a one-choice question, purely as
    // narrative flourish for a forced outcome. Cross-validation against the
    // live source caught this as the one false positive the single-choice
    // relaxation would otherwise have introduced — it must stay narration.
    const raw = 'Beleléptél a mély szakadékba! KÉRDÉS: Mit teszel? VÁLASZ: (1) Lezuhansz -- -25000 ÉP';
    const r = parseTitle(raw, false);
    expect(r.question).toBeNull();
    expect(r.narration).toBe(raw);
  });
});

/** Resolver stub: every base resolves, so unresolved cases are explicit in tests. */
const resolveAll = (base: string) => ({ id: 1, name: `M:${base}` });
const resolveNone = () => null;

const parse = (
  n: number,
  resolve: (base: string) => { id: number; name: string } | null = resolveAll,
): Quest => parseQuestPage(readFileSync(`tests/fixtures/quests/${n}.html`, 'utf-8'), n, resolve);

describe('parseQuestPage', () => {
  it('reads the description and reward', () => {
    const q = parse(1);
    expect(q.id).toBe(1);
    expect(q.description).toContain('Gründen borospincéjét ellepték a szúnyogok');
    expect(q.reward).toContain('20 db ezüst');
    // Trailing separators from the source are trimmed.
    expect(q.reward.endsWith(',')).toBe(false);
  });

  it('derives coordinates from row and column position', () => {
    const q = parse(1);
    expect(q.rows).toBe(2);
    expect(q.cols).toBe(4);
    expect(q.cells).toHaveLength(8);
    expect(q.cells[0]).toMatchObject({ row: 0, col: 0 });
    expect(q.cells.at(-1)).toMatchObject({ row: 1, col: 3 });
  });

  it('carries edges, keys and portals onto cells', () => {
    const q = parse(1);
    const entrance = q.cells.find((c) => c.portal === 'entrance');
    expect(entrance).toMatchObject({ row: 0, col: 0 });
    // The iron-key door and the cell that yields the iron key both exist.
    const doorCell = q.cells.find((c) => Object.values(c.edges).some(
      (e) => e.kind === 'door' && e.lock === 'vas'));
    expect(doorCell).toBeTruthy();
    expect(q.cells.some((c) => c.key === 'vas')).toBe(true);
  });

  it('attaches parsed narration, drops and questions to the right cells', () => {
    const q = parse(1);
    expect(q.cells.some((c) => c.question?.choices.length === 3)).toBe(true);
    expect(q.cells.some((c) => c.drops === '1 db szúnyogszárny')).toBe(true);
  });

  it('resolves monsters through the injected resolver', () => {
    const q = parse(1);
    const withMonster = q.cells.filter((c) => c.monsterId !== null);
    expect(withMonster.length).toBeGreaterThan(0);
    expect(withMonster[0].monsterName).toMatch(/^M:/);
  });

  it('keeps the raw base as monsterName when resolution fails', () => {
    const q = parse(1, resolveNone);
    const unresolved = q.cells.find((c) => c.rawImage.includes('moszkitoraj'));
    expect(unresolved?.monsterId).toBeNull();
    expect(unresolved?.monsterName).toBe('moszkitoraj_k');
  });

  it('takes only the first table of quest 27, which is one maze in seven views', () => {
    const q = parse(27);
    expect(q.cells).toHaveLength(q.rows * q.cols);
    // The full-maze view is 8 rows; the six key views follow it.
    expect(q.rows).toBeLessThan(20);
  });

  it('sets hasQuestion from the image even when the title fails to parse', () => {
    // Mirrors quest 44's real case: a question-image tile whose title is
    // pure narration prose with neither a KÉRDÉS nor a VÁLASZ token, so there
    // is no Q&A structure to extract — this is the exact shape that used to
    // lose its marker entirely (task 18). `hasQuestion` must still be true
    // because it comes from the image, independent of the parse outcome.
    const html = `<p><span class="tulajdonsagnev">Leírás:</span> d<br>
      <span class="tulajdonsagnev">Jutalom:</span> r</p>
      <div class="lab"><table><tr>
        <td class=""><img class="szorny" title="Csak nézed a falat, választ nem kapsz." src="kerdes.jpg"></td>
      </tr></table></div>`;
    const q = parseQuestPage(html, 999, resolveAll);
    expect(q.cells[0].hasQuestion).toBe(true);
    expect(q.cells[0].question).toBeNull();
  });

  it('tolerates quest 11 having no entrance marker', () => {
    const q = parse(11);
    expect(q.cells.some((c) => c.portal === 'entrance')).toBe(false);
    expect(q.cells.length).toBeGreaterThan(0);
  });

  it('preserves szel edges in quest 39', () => {
    const q = parse(39);
    expect(q.cells.some((c) => Object.values(c.edges).some((e) => e.kind === 'szel'))).toBe(true);
  });

  it('ignores the commented-out template row in quest 45', () => {
    const q = parse(45);
    expect(q.cells).toHaveLength(q.rows * q.cols);
    expect(q.cells.every((c) => c.rawImage !== '')).toBe(true);
  });

  it('records every lock type present in quest 20', () => {
    const q = parse(20);
    const locks = new Set(
      q.cells.flatMap((c) => Object.values(c.edges))
        .filter((e) => e.kind === 'door').map((e: any) => e.lock),
    );
    expect(locks.size).toBeGreaterThanOrEqual(7);
  });

  // Pins cells.length === rows * cols across the whole fixture set, not just the
  // three quests already covered incidentally above. Dimensions are hard-coded
  // from a direct measurement so a shape change in the parser, or a re-fetched
  // fixture with different content, fails loudly instead of silently.
  it.each([
    { id: 1, rows: 2, cols: 4 },
    { id: 11, rows: 7, cols: 9 },
    { id: 20, rows: 8, cols: 11 },
    { id: 27, rows: 8, cols: 11 },
    { id: 39, rows: 12, cols: 12 },
    { id: 45, rows: 12, cols: 8 },
  ])('produces a full $rows x $cols grid for quest $id', ({ id, rows, cols }) => {
    const q = parse(id);
    expect(q.rows).toBe(rows);
    expect(q.cols).toBe(cols);
    expect(q.cells).toHaveLength(rows * cols);
  });
});

describe('parseQuestPage error paths', () => {
  // Every mutation below starts from quest 1's real fixture and cuts out one
  // structural marker, rather than hand-writing HTML, so the mutated input stays
  // representative of what the live scrape in Task 6 will actually see.
  const raw = readFileSync('tests/fixtures/quests/1.html', 'utf-8');

  // The description precedes the fixture's only <br>; the reward follows it, in
  // the same <p>. Locating spans by index avoids embedding the Hungarian label
  // text (which the parser matches structurally, not by exact wording) here.
  const brIdx = raw.indexOf('<br');
  const descSpanIdx = raw.lastIndexOf('<span class="tulajdonsagnev">', brIdx);
  const descSpanCloseIdx = raw.indexOf('</span>', descSpanIdx) + '</span>'.length;
  const pCloseIdx = raw.indexOf('</p>', brIdx);
  const rewardSpanIdx = raw.indexOf('<span class="tulajdonsagnev">', brIdx);
  const rewardSpanCloseIdx = raw.indexOf('</span>', rewardSpanIdx) + '</span>'.length;

  it('throws naming the quest id when the description block is missing', () => {
    const html = raw.slice(0, descSpanIdx) + raw.slice(brIdx);
    expect(() => parseQuestPage(html, 1, resolveAll)).toThrow('quest 1: missing description');
  });

  it('throws naming the quest id when the description block is present but empty', () => {
    const html = raw.slice(0, descSpanCloseIdx) + raw.slice(brIdx);
    expect(() => parseQuestPage(html, 1, resolveAll)).toThrow('quest 1: empty description');
  });

  it('throws naming the quest id when the reward block is missing', () => {
    const html = raw.slice(0, rewardSpanIdx) + raw.slice(pCloseIdx);
    expect(() => parseQuestPage(html, 1, resolveAll)).toThrow('quest 1: missing reward');
  });

  it('throws naming the quest id when the reward block is present but empty', () => {
    const html = raw.slice(0, rewardSpanCloseIdx) + raw.slice(pCloseIdx);
    expect(() => parseQuestPage(html, 1, resolveAll)).toThrow('quest 1: empty reward');
  });

  it('throws naming the quest id when the maze container is missing', () => {
    const html = raw.replace('<div class="lab">', '');
    expect(() => parseQuestPage(html, 1, resolveAll)).toThrow('quest 1: no maze container');
  });

  it('throws naming the quest id when the maze table is missing', () => {
    const html = raw.replace('<table>', '').replace('</table>', '');
    expect(() => parseQuestPage(html, 1, resolveAll)).toThrow('quest 1: no maze table');
  });

  it('throws naming the quest id when the maze table has no rows', () => {
    const html = raw.replace(/<table>[\s\S]*?<\/table>/, '<table></table>');
    expect(() => parseQuestPage(html, 1, resolveAll)).toThrow('quest 1: maze has no rows');
  });

  it('throws naming the quest id when the maze table has rows but no cells', () => {
    const html = raw.replace(/<table>[\s\S]*?<\/table>/, '<table><tr></tr></table>');
    expect(() => parseQuestPage(html, 1, resolveAll)).toThrow('quest 1: maze has no cells');
  });
});

describe('parseTitle multi-digit choice markers', () => {
  it('keeps answers past nine as their own choices', () => {
    // Quest 25's potion row runs to eleven options; a single-digit marker
    // pattern swallowed 10 and 11 into the ninth answer's outcome.
    const r = parseTitle(
      'KÉRDÉS: Mit iszol? VÁLASZ: (8) Kesernyés zöld -> Semmi (EZ A JÓ); ' +
      '(9) Édes átlátszó -> Halál!; (10) Büdös sárga -> Halál!; (11) Szagtalan fekete -> Halál!',
    );
    expect(r.question?.choices.map((c) => c.index)).toEqual([8, 9, 10, 11]);
    expect(r.question?.choices[1].outcome).toBe('Halál!');
    expect(r.question?.choices[3].text).toBe('Szagtalan fekete');
  });
});
