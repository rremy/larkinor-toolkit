import { h, Fragment } from 'preact';
import type { ComponentChildren } from 'preact';
import type { MonsterDatabase, Monster } from '@/shared/data/monsters';
import type { NarrationLink } from '@/utils/domExtract';
import { findMonsterMentions } from '@/utils/narration';

export interface NarrationPanelProps {
  text: string;
  db: MonsterDatabase | null;
  onMonsterClick: (monster: Monster) => void;
  /** Clickable anchors embedded in the narration (quest/action links). */
  links?: NarrationLink[];
  /**
   * The active-quest phrase to make tappable, by offset into `text`.
   *
   * Offsets rather than a search string, unlike `links`: the parser already
   * knows where it matched, and a phrase the game could print twice must land
   * where it was found rather than at the first `indexOf`.
   */
  questLink?: { index: number; length: number; onClick(): void };
}

/** A run of the narration to render as a clickable element, by text offset. */
interface Span {
  index: number;
  length: number;
  node: ComponentChildren;
}

export function NarrationPanel({ text, db, onMonsterClick, links = [], questLink }: NarrationPanelProps) {
  if (!text) {
    return <div class="lc-narration lc-section">{text}</div>;
  }

  const spans: Span[] = [];

  // The active-quest phrase, pushed first so it wins a *tie* with a monster
  // mention or narration link starting at the same index (the sort below is
  // stable — see the note there). A span starting earlier and overlapping this
  // one still wins: the splice emits in index order and skips whatever overlaps
  // a span already emitted.
  if (questLink && questLink.index >= 0 && questLink.index + questLink.length <= text.length) {
    spans.push({
      index: questLink.index,
      length: questLink.length,
      node: (
        <span class="lc-quest-link" onClick={() => questLink.onClick()}>
          {text.slice(questLink.index, questLink.index + questLink.length)}
        </span>
      ),
    });
  }

  // Monster mentions (only resolvable with a DB) become tappable monster links.
  if (db) {
    for (const mention of findMonsterMentions(text)) {
      const monster = db.getByName(mention.name);
      if (!monster) continue; // unknown name — leave as plain text
      const nameText = text.slice(mention.index, mention.index + mention.length);
      spans.push({
        index: mention.index,
        length: mention.length,
        node: (
          <span class="lc-monster-link" onClick={() => onMonsterClick(monster)}>
            {nameText}
          </span>
        ),
      });
    }
  }

  // Narration anchors become inline links that drive the original control.
  for (const link of links) {
    if (!link.text) continue;
    const index = text.indexOf(link.text);
    if (index === -1) continue;
    spans.push({
      index,
      length: link.text.length,
      node: (
        <span class="lc-narration-link" onClick={() => link.trigger()}>
          {link.text}
        </span>
      ),
    });
  }

  if (spans.length === 0) {
    return <div class="lc-narration lc-section">{text}</div>;
  }

  // Splice the plain text and the spans into ordered runs, skipping any span
  // that overlaps one already emitted. Array.prototype.sort is stable, so two
  // spans starting at the same index keep their push order — which is why the
  // quest link is pushed before the monster mentions above.
  spans.sort((a, b) => a.index - b.index);
  const nodes: ComponentChildren[] = [];
  let cursor = 0;
  spans.forEach((span, i) => {
    if (span.index < cursor) return; // overlaps a prior span
    if (span.index > cursor) {
      nodes.push(<Fragment key={`t${i}`}>{text.slice(cursor, span.index)}</Fragment>);
    }
    nodes.push(<Fragment key={`s${i}`}>{span.node}</Fragment>);
    cursor = span.index + span.length;
  });
  if (cursor < text.length) {
    nodes.push(<Fragment key="end">{text.slice(cursor)}</Fragment>);
  }

  return <div class="lc-narration lc-section">{nodes}</div>;
}
