// Desktop-only: the game's own "Aktuális küldetés: (39)" phrase, made clickable
// in place.
//
// Splices text nodes through `narrationSplice` rather than appending a note
// beside the block (as `questOfferNote` does): the game already says the
// sentence, so the affordance belongs on the sentence. Nothing is reserialised,
// so the game's own inline handlers survive.

import { findActiveQuest } from '@/utils/activeQuest';
import {
  flattenNarration, isInsideAnchor, narrationBlock, segmentFor, spliceIntoTextNode,
} from './narrationSplice';

const LINK_CLASS = 'lc-active-quest';
/** Marker attribute making a second call within one page load a no-op. */
const LINKED_ATTR = 'data-lc-active-quest';

function buildLink(doc: Document, label: string, onOpen: () => void): HTMLAnchorElement {
  const link = doc.createElement('a');
  link.className = LINK_CLASS;
  link.textContent = label;
  // Hungarian, like every other piece of player-facing copy.
  link.title = 'Megnyitás az adatbázisban';
  // No href, so this is a mouse-only affordance by default — it must also be
  // operable from the keyboard and announced as a control, not a destination.
  link.tabIndex = 0;
  link.setAttribute('role', 'button');
  link.addEventListener('click', (event) => {
    // The page's controls submit the shared form; make sure this can never be
    // mistaken for one of them.
    event.preventDefault();
    event.stopPropagation();
    onOpen();
  });
  link.addEventListener('keydown', (event) => {
    if (event.code === 'Enter' || event.code === 'Space') {
      event.preventDefault();
      onOpen();
    }
  });
  return link;
}

/**
 * Wrap the active-quest phrase in a link that opens the quests tab.
 *
 * The phrase is located here, in `flattenNarration`'s own text, rather than
 * taken from the caller: offsets are only meaningful in the string they were
 * measured in, and the boot's `extractNarration` is a *different* string — it
 * trims and collapses whitespace, so any indentation inside the `<font>` block
 * (the ordinary shape of server-generated HTML) shifts every offset. The
 * invariant `enhanceNarration` keeps — match and splice against one and the
 * same flattened text — is the only thing that makes the run land where the
 * parser found it. The recognised quest id is handed to `onOpen` for the same
 * reason: it comes from the match that was actually spliced.
 *
 * Returns the link, or null when there is nothing to attach to: no narration
 * block, no phrase in it, the phrase already linked, it spans element
 * boundaries, or it sits inside one of the game's own anchors. Each of those is
 * a reason to leave the text exactly as the game wrote it.
 */
export function renderActiveQuestLink(
  doc: Document,
  onOpen: (questId: string) => void,
): HTMLElement | null {
  const block = narrationBlock(doc);
  if (!block || block.hasAttribute(LINKED_ATTR)) return null;

  const { segments, text } = flattenNarration(doc, block);
  const mention = findActiveQuest(text);
  if (!mention) return null;

  const segment = segmentFor(segments, mention.index, mention.index + mention.length);
  if (!segment || isInsideAnchor(segment.node, block)) return null;

  let created: HTMLElement | null = null;
  spliceIntoTextNode(doc, segment.node, [{
    index: mention.index - segment.start,
    length: mention.length,
    build: (label) => (created = buildLink(doc, label, () => onOpen(mention.questId))),
  }]);

  block.setAttribute(LINKED_ATTR, 'true');
  return created;
}
