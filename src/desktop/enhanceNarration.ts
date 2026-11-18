// Desktop-only, in-place enhancement of the game's narration block: monster
// names the database knows become clickable links that open the monster card.
//
// The mobile UI re-renders the narration as Preact and can splice spans freely.
// Desktop must edit the live block, where the game's own <a> elements carry
// inline handlers that drive the shared form — so we mutate text nodes only and
// never reserialise via innerHTML. The flatten/splice machinery itself lives in
// narrationSplice.ts, shared with every other desktop enhancement that turns
// part of the narration into something clickable.

import { findMonsterMentions, type MonsterMention } from '@/utils/narration';
import type { MonsterDatabase, Monster } from '@/shared/data/monsters';
import { favouriteKey } from '@/shared/favouriteMonsters';
import {
  flattenNarration, isInsideAnchor, narrationBlock, segmentFor, spliceIntoTextNode,
} from './narrationSplice';

/** Marker attribute making a second call a no-op. */
const ENHANCED_ATTR = 'data-lc-enhanced';

/** The monster a link names, in `favouriteKey` form — what `markFavouriteMonsters` reads. */
const MONSTER_ATTR = 'data-lc-monster';

/** The class that makes a favourite's name stand out. */
const FAVOURITE_CLASS = 'lc-narr-link--fav';

interface ResolvedMention {
  mention: MonsterMention;
  monster: Monster;
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
  link.setAttribute(MONSTER_ATTR, favouriteKey(monster.name));
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
  const block = narrationBlock(doc);
  if (!block || block.hasAttribute(ENHANCED_ATTR)) return;

  const { segments, text } = flattenNarration(doc, block);

  // Group by node so one node containing several mentions is spliced once,
  // with spliceIntoTextNode resolving any overlaps between them.
  const byNode = new Map<Text, ResolvedMention[]>();

  for (const mention of findMonsterMentions(text)) {
    const monster = db.getByName(mention.name);
    if (!monster) continue; // unknown name — leave as plain text

    const segment = segmentFor(segments, mention.index, mention.index + mention.length);
    if (!segment) continue; // name spans elements (see above)
    if (isInsideAnchor(segment.node, block)) continue; // no nested links

    const hits = byNode.get(segment.node) ?? [];
    // Re-base the offset from the flattened text onto this node's own text.
    hits.push({ mention: { ...mention, index: mention.index - segment.start }, monster });
    byNode.set(segment.node, hits);
  }

  for (const [node, hits] of byNode) {
    spliceIntoTextNode(doc, node, hits
      .sort((a, b) => a.mention.index - b.mention.index)
      .map(({ mention, monster }) => ({
        index: mention.index,
        length: mention.length,
        build: (label: string) => buildLink(doc, label, monster, onMonsterClick),
      })));
  }

  block.setAttribute(ENHANCED_ATTR, 'true');
}

/**
 * Marks the monster links `enhanceNarration` made whose monster is a favourite,
 * and unmarks the rest. Separate from it, and safe to repeat, because the links
 * are made once per page while the favourites can change under them — a heart
 * toggled in the monster card restyles the narration it was opened from.
 */
export function markFavouriteMonsters(doc: Document, favourites: ReadonlySet<string>): void {
  for (const link of doc.querySelectorAll<HTMLElement>(`a.lc-narr-link[${MONSTER_ATTR}]`)) {
    link.classList.toggle(FAVOURITE_CLASS, favourites.has(link.getAttribute(MONSTER_ATTR) ?? ''));
  }
}
