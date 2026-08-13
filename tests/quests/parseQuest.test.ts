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
});
