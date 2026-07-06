import { h, Fragment } from 'preact';
import type { ComponentChildren } from 'preact';
import type { MonsterDatabase, Monster } from '@/data/monsters';
import { findMonsterMentions } from '@/utils/narration';

export interface NarrationPanelProps {
  text: string;
  db: MonsterDatabase | null;
  onMonsterClick: (monster: Monster) => void;
}

export function NarrationPanel({ text, db, onMonsterClick }: NarrationPanelProps) {
  if (!db || !text) {
    return <div class="lc-narration lc-section">{text}</div>;
  }

  // Identify the encountered monster(s) via the narration sentence templates,
  // then splice the text into plain runs and clickable monster links.
  const mentions = findMonsterMentions(text);
  if (mentions.length === 0) {
    return <div class="lc-narration lc-section">{text}</div>;
  }

  const nodes: ComponentChildren[] = [];
  let cursor = 0;
  mentions.forEach((mention, i) => {
    if (mention.index < cursor) return; // already consumed by a prior span
    if (mention.index > cursor) {
      nodes.push(<Fragment key={`t${i}`}>{text.slice(cursor, mention.index)}</Fragment>);
    }
    const nameText = text.slice(mention.index, mention.index + mention.length);
    const monster = db.getByName(mention.name);
    if (monster) {
      nodes.push(
        <span key={`m${i}`} class="lc-monster-link" onClick={() => onMonsterClick(monster)}>
          {nameText}
        </span>
      );
    } else {
      // Captured a name we don't have data for — leave it as plain text.
      nodes.push(<Fragment key={`m${i}`}>{nameText}</Fragment>);
    }
    cursor = mention.index + mention.length;
  });
  if (cursor < text.length) {
    nodes.push(<Fragment key="end">{text.slice(cursor)}</Fragment>);
  }

  return <div class="lc-narration lc-section">{nodes}</div>;
}
