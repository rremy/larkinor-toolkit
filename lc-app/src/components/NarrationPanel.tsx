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
}

/** A run of the narration to render as a clickable element, by text offset. */
interface Span {
  index: number;
  length: number;
  node: ComponentChildren;
}

export function NarrationPanel({ text, db, onMonsterClick, links = [] }: NarrationPanelProps) {
  if (!text) {
    return <div class="lc-narration lc-section">{text}</div>;
  }

  const spans: Span[] = [];

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
  // that overlaps one already emitted.
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
