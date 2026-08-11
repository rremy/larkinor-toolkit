// Desktop-only, in-place enhancement of the game's narration block: monster
// names the database knows become clickable links that open the monster card.
//
// The mobile UI re-renders the narration as Preact and can splice spans freely.
// Desktop must edit the live block, where the game's own <a> elements carry
// inline handlers that drive the shared form — so we mutate text nodes only and
// never reserialise via innerHTML.

import { findMonsterMentions, type MonsterMention } from '@/utils/narration';
import type { MonsterDatabase, Monster } from '@/shared/data/monsters';

/** Marker attribute making a second call a no-op. */
const ENHANCED_ATTR = 'data-lc-enhanced';

interface ResolvedMention {
  mention: MonsterMention;
  monster: Monster;
}

/** Text nodes inside an existing anchor are skipped — no nested links. */
function isInsideAnchor(node: Text, root: Element): boolean {
  let el = node.parentElement;
  while (el && el !== root) {
    if (el.tagName === 'A') return true;
    el = el.parentElement;
  }
  return false;
}

/** Collects the block's text nodes up front, so later mutation is safe. */
function collectTextNodes(doc: Document, root: Element): Text[] {
  const walker = doc.createTreeWalker(root, 0x4 /* NodeFilter.SHOW_TEXT */);
  const nodes: Text[] = [];
  let current: Node | null;
  while ((current = walker.nextNode()) !== null) {
    nodes.push(current as Text);
  }
  return nodes;
}

function buildLink(
  doc: Document,
  label: string,
  monster: Monster,
  onMonsterClick: (monster: Monster) => void
): HTMLAnchorElement {
  const link = doc.createElement('a');
  link.className = 'lc-narr-link';
  link.textContent = label;
  link.title = `${monster.name} — szint ${monster.level}`;
  link.addEventListener('click', (event) => {
    event.preventDefault();
    onMonsterClick(monster);
  });
  return link;
}

/**
 * Replaces one text node with a run of plain text and link elements, one link
 * per resolved mention. Offsets come from findMonsterMentions and index into
 * this node's own text.
 */
function spliceLinks(
  doc: Document,
  node: Text,
  text: string,
  hits: ResolvedMention[],
  onMonsterClick: (monster: Monster) => void
): void {
  const fragment = doc.createDocumentFragment();
  let cursor = 0;

  for (const { mention, monster } of hits) {
    if (mention.index < cursor) continue; // overlaps an emitted link
    if (mention.index > cursor) {
      fragment.appendChild(doc.createTextNode(text.slice(cursor, mention.index)));
    }
    const label = text.slice(mention.index, mention.index + mention.length);
    fragment.appendChild(buildLink(doc, label, monster, onMonsterClick));
    cursor = mention.index + mention.length;
  }

  if (cursor < text.length) {
    fragment.appendChild(doc.createTextNode(text.slice(cursor)));
  }

  node.parentNode?.replaceChild(fragment, node);
}

/**
 * Makes database-known monster names in the live narration clickable.
 *
 * Known limitation: matching runs per text node, so a mention split across a
 * <br> or <b> boundary is not found. The encounter templates are
 * single-sentence and normally arrive in one node; reassembling and re-splitting
 * the whole block is not worth the fragility.
 */
export function enhanceNarration(
  doc: Document,
  db: MonsterDatabase,
  onMonsterClick: (monster: Monster) => void
): void {
  const block = doc.querySelector('font[face="Comic sans MS"]');
  if (!block || block.hasAttribute(ENHANCED_ATTR)) return;

  for (const node of collectTextNodes(doc, block)) {
    if (isInsideAnchor(node, block)) continue;

    const text = node.textContent ?? '';
    if (!text.trim()) continue;

    const hits: ResolvedMention[] = [];
    for (const mention of findMonsterMentions(text)) {
      const monster = db.getByName(mention.name);
      if (monster) hits.push({ mention, monster });
    }
    if (hits.length === 0) continue;

    spliceLinks(doc, node, text, hits, onMonsterClick);
  }

  block.setAttribute(ENHANCED_ATTR, 'true');
}
