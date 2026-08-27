import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  flattenNarration, isInsideAnchor, narrationBlock, segmentFor, spliceIntoTextNode,
} from '../src/desktop/narrationSplice';

function docWith(html: string): Document {
  return new JSDOM(`<html><body>${html}</body></html>`).window.document;
}

describe('narrationSplice', () => {
  it('finds the game narration block', () => {
    const doc = docWith('<font face="Comic sans MS">Szia</font>');
    expect(narrationBlock(doc)?.textContent).toBe('Szia');
  });

  // The game splits every monster name into its own <b><font> run, so a match
  // has to be made against the flattened text and mapped back afterwards.
  it('flattens element boundaries and turns <br> into a newline', () => {
    const doc = docWith('<font face="Comic sans MS">Valami <b>Vízmágus </b>áll ott.<br>Hideg van.</font>');
    const { text, segments } = flattenNarration(doc, narrationBlock(doc)!);

    expect(text).toBe('Valami Vízmágus áll ott.\nHideg van.');
    expect(segments).toHaveLength(4);
    const segment = segmentFor(segments, text.indexOf('Vízmágus'), text.indexOf('Vízmágus') + 8);
    expect(segment?.node.textContent).toBe('Vízmágus ');
  });

  it('reports no segment for a run spanning two nodes', () => {
    const doc = docWith('<font face="Comic sans MS">Valami <b>Vízmágus </b>áll ott.</font>');
    const { text, segments } = flattenNarration(doc, narrationBlock(doc)!);
    expect(segmentFor(segments, text.indexOf('Valami'), text.indexOf('áll') + 3)).toBeUndefined();
  });

  it('detects a text node already inside an anchor', () => {
    const doc = docWith('<font face="Comic sans MS">Menj <a href="#">tovább</a></font>');
    const block = narrationBlock(doc)!;
    const { segments } = flattenNarration(doc, block);
    expect(isInsideAnchor(segments[0].node, block)).toBe(false);
    expect(isInsideAnchor(segments[1].node, block)).toBe(true);
  });

  it('splices runs into one text node, skipping overlaps', () => {
    const doc = docWith('<font face="Comic sans MS">Aktuális küldetés: (39) most</font>');
    const block = narrationBlock(doc)!;
    const { segments } = flattenNarration(doc, block);
    const build = (label: string) => {
      const el = doc.createElement('span');
      el.className = 'marked';
      el.textContent = label;
      return el;
    };

    spliceIntoTextNode(doc, segments[0].node, [
      { index: 0, length: 23, build },
      { index: 5, length: 3, build }, // overlaps the first — dropped
    ]);

    expect(block.querySelectorAll('.marked')).toHaveLength(1);
    expect(block.querySelector('.marked')!.textContent).toBe('Aktuális küldetés: (39)');
    expect(block.textContent).toBe('Aktuális küldetés: (39) most');
  });
});
