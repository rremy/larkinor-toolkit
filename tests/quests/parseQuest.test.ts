import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { stripComments, parseEdges, decodeEntities, stripTags } from '../../scripts/quests/parseQuest.mjs';

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
