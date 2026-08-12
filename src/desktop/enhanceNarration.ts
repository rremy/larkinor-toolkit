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

/** One text node's span within the block's flattened text. */
interface Segment {
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
 * `<br>` contributes a newline without a segment, mirroring the mobile path's
 * `extractNarration`. Without it two sentences either side of a line break would
 * be concatenated, and a pattern anchored on a sentence boundary could match
 * across them.
 */
function flatten(doc: Document, root: Element): { segments: Segment[]; text: string } {
  const walker = doc.createTreeWalker(root, 0x5 /* SHOW_ELEMENT | SHOW_TEXT */);
  const segments: Segment[] = [];
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
  // No href, so the link is a mouse-only affordance by default — this feature's
  // headline is keyboard control, so it must also be focusable and operable
  // from the keyboard and by a screen reader (role="button", not a navigation
  // link, since it has no destination URL).
  link.tabIndex = 0;
  link.setAttribute('role', 'button');
  link.addEventListener('click', (event) => {
    event.preventDefault();
    onMonsterClick(monster);
  });
  link.addEventListener('keydown', (event) => {
    if (event.code === 'Enter' || event.code === 'Space') {
      // Space would otherwise scroll the page, same as activating a real button.
      event.preventDefault();
      onMonsterClick(monster);
    }
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
 * Matching runs against the block's **flattened** text, not per text node,
 * because the game wraps every monster name in `<b><font color=…>`:
 *
 *   Valami <b><font color="#DF4B22">Gyakorlott vízmágus </font></b> csámborog…
 *
 * That splits the sentence into three text nodes, so a per-node match never sees
 * the template and no name was ever linked. The name itself is inside a single
 * node, though — only the surrounding template spans them — so matching flat and
 * wrapping the captured name is enough, with no cross-element DOM surgery.
 *
 * Remaining limitation: a name that is itself split across elements is left as
 * plain text, since wrapping it would mean restructuring markup whose inline
 * handlers drive the game. Not observed in practice — the game emits each name
 * as one run.
 */
export function enhanceNarration(
  doc: Document,
  db: MonsterDatabase,
  onMonsterClick: (monster: Monster) => void
): void {
  const block = doc.querySelector('font[face="Comic sans MS"]');
  if (!block || block.hasAttribute(ENHANCED_ATTR)) return;

  const { segments, text } = flatten(doc, block);

  // Group by node so one node containing several mentions is spliced once, with
  // spliceLinks resolving any overlaps between them.
  const byNode = new Map<Text, ResolvedMention[]>();

  for (const mention of findMonsterMentions(text)) {
    const monster = db.getByName(mention.name);
    if (!monster) continue; // unknown name — leave as plain text

    const end = mention.index + mention.length;
    const segment = segments.find(s => mention.index >= s.start && end <= s.end);
    if (!segment) continue; // name spans elements (see above)
    if (isInsideAnchor(segment.node, block)) continue; // no nested links

    const hits = byNode.get(segment.node) ?? [];
    // Re-base the offset from the flattened text onto this node's own text.
    hits.push({ mention: { ...mention, index: mention.index - segment.start }, monster });
    byNode.set(segment.node, hits);
  }

  for (const [node, hits] of byNode) {
    spliceLinks(doc, node, node.textContent ?? '', hits, onMonsterClick);
  }

  block.setAttribute(ENHANCED_ATTR, 'true');
}
