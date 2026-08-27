// Text-node surgery on the game's live narration block, shared by every desktop
// enhancement that turns part of the narration into something clickable.
//
// The rule this module exists to keep: never assign innerHTML anywhere near the
// game's own markup. Its <a> elements carry inline handlers that drive the
// shared form, and reserialising the block destroys them. So we flatten to read
// and splice text nodes to write, and nothing else.

/** The game's narration block. */
export function narrationBlock(doc: Document): Element | null {
  return doc.querySelector('font[face="Comic sans MS"]');
}

/** One text node's span within the block's flattened text. */
export interface NarrationSegment {
  node: Text;
  start: number;
  /** Exclusive. */
  end: number;
}

/**
 * Flattens the block to a single string and records where each text node landed
 * in it, so a match found in the flat text can be mapped back to the DOM.
 *
 * Collected up front, before any mutation, so the offsets stay valid.
 *
 * `<br>` contributes a newline without a segment, mirroring `extractNarration`.
 * Without it two sentences either side of a line break would be concatenated,
 * and a pattern anchored on a sentence boundary could match across them.
 */
export function flattenNarration(
  doc: Document,
  root: Element,
): { segments: NarrationSegment[]; text: string } {
  const walker = doc.createTreeWalker(root, 0x5 /* SHOW_ELEMENT | SHOW_TEXT */);
  const segments: NarrationSegment[] = [];
  let text = '';
  let current: Node | null;

  while ((current = walker.nextNode()) !== null) {
    if (current.nodeType === 1 /* ELEMENT_NODE */) {
      if ((current as Element).tagName === 'BR') text += '\n';
      continue;
    }
    const node = current as Text;
    const content = node.textContent ?? '';
    segments.push({ node, start: text.length, end: text.length + content.length });
    text += content;
  }

  return { segments, text };
}

/**
 * The single text node containing `[index, end)`, or undefined when the run
 * spans element boundaries — which the callers treat as "leave it as plain
 * text", since wrapping it would mean restructuring markup whose inline
 * handlers drive the game.
 */
export function segmentFor(
  segments: NarrationSegment[],
  index: number,
  end: number,
): NarrationSegment | undefined {
  return segments.find((s) => index >= s.start && end <= s.end);
}

/** Text nodes already inside an anchor are skipped — no nested links. */
export function isInsideAnchor(node: Text, root: Element): boolean {
  let el = node.parentElement;
  while (el && el !== root) {
    if (el.tagName === 'A') return true;
    el = el.parentElement;
  }
  return false;
}

/** One run of a text node to replace with an element. */
export interface SpliceRun {
  /** Offset within this node's own text. */
  index: number;
  length: number;
  /** Builds the replacement element from the run's own text. */
  build(label: string): Node;
}

/**
 * Replaces one text node with a run of plain text and built elements.
 *
 * Runs must be sorted ascending; one overlapping an already-emitted run is
 * skipped rather than nested.
 */
export function spliceIntoTextNode(doc: Document, node: Text, runs: SpliceRun[]): void {
  const text = node.textContent ?? '';
  const fragment = doc.createDocumentFragment();
  let cursor = 0;

  for (const run of runs) {
    if (run.index < cursor) continue; // overlaps an emitted element
    if (run.index > cursor) fragment.appendChild(doc.createTextNode(text.slice(cursor, run.index)));
    fragment.appendChild(run.build(text.slice(run.index, run.index + run.length)));
    cursor = run.index + run.length;
  }

  if (cursor < text.length) fragment.appendChild(doc.createTextNode(text.slice(cursor)));

  node.parentNode?.replaceChild(fragment, node);
}
