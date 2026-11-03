// Desktop-only, in-place highlighting of the items and silver the narration
// counts out ("Kiástál 16 darab aranyat!"): an item the database names becomes
// a link to its entry, everything else is only marked. The mobile counterpart is
// in NarrationPanel; the matching itself is shared (src/shared/itemMentions.ts).
//
// Same rules as enhanceNarration, through the same splice: text nodes only, a
// mention spanning elements is left alone, the game's own anchors are never
// entered.

import { findItemMentions, type ItemIndex, type ItemRef } from '@/shared/itemMentions';
import {
  flattenNarration, isInsideAnchor, narrationBlock, segmentFor, spliceIntoTextNode, type SpliceRun,
} from './narrationSplice';

/** Marker attribute making a second call on a block a no-op. */
const ENHANCED_ATTR = 'data-lc-items';

/**
 * The blocks narration may be in: a building page prints it in the positioned
 * `width:600px` box, after Comic Sans headings of its own (see
 * `extractBuildingNarration`); every other page in its first Comic Sans block.
 */
function narrationBlocks(doc: Document): Element[] {
  const inBox = Array.from(doc.querySelectorAll('font[face="Comic sans MS"]'))
    .find((el) => /width:\s*600px/.test(el.closest('div')?.getAttribute('style') ?? ''));
  const first = narrationBlock(doc);
  return [...new Set([inBox, first])].filter((el): el is Element => el != null);
}

function buildLink(doc: Document, label: string, item: ItemRef, onItem: (item: ItemRef) => void): HTMLElement {
  const link = doc.createElement('a');
  link.className = 'lc-item-mention lc-item-link';
  link.textContent = label;
  link.title = item.name;
  // Keyboard-operable like the monster links, which have no URL either.
  link.tabIndex = 0;
  link.setAttribute('role', 'button');
  link.addEventListener('click', (event) => {
    event.preventDefault();
    onItem(item);
  });
  link.addEventListener('keydown', (event) => {
    if (event.code === 'Enter' || event.code === 'Space') {
      event.preventDefault();
      onItem(item);
    }
  });
  return link;
}

function buildMark(doc: Document, label: string): HTMLElement {
  const mark = doc.createElement('span');
  mark.className = 'lc-item-mention';
  mark.textContent = label;
  return mark;
}

/** Highlights the item and silver mentions in the live narration, linking the items it can name. */
export function enhanceItemMentions(doc: Document, index: ItemIndex, onItem: (item: ItemRef) => void): void {
  for (const block of narrationBlocks(doc)) {
    if (block.hasAttribute(ENHANCED_ATTR)) continue;
    const { segments, text } = flattenNarration(doc, block);

    const byNode = new Map<Text, SpliceRun[]>();
    for (const mention of findItemMentions(text, index)) {
      const segment = segmentFor(segments, mention.index, mention.index + mention.length);
      if (!segment || isInsideAnchor(segment.node, block)) continue;
      const { item } = mention;
      const runs = byNode.get(segment.node) ?? [];
      runs.push({
        index: mention.index - segment.start,
        length: mention.length,
        build: (label) => (item ? buildLink(doc, label, item, onItem) : buildMark(doc, label)),
      });
      byNode.set(segment.node, runs);
    }

    for (const [node, runs] of byNode) spliceIntoTextNode(doc, node, runs.sort((a, b) => a.index - b.index));
    block.setAttribute(ENHANCED_ATTR, 'true');
  }
}
