import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { stripComments, parseEdges, decodeEntities, stripTags, parseImage } from '../../scripts/quests/parseQuest.mjs';

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
