import { h, Fragment } from 'preact';
import type { MonsterDatabase, Monster } from '@/data/monsters';

export interface NarrationPanelProps {
  text: string;
  db: MonsterDatabase | null;
  onMonsterClick: (monster: Monster) => void;
}

export function NarrationPanel({ text, db, onMonsterClick }: NarrationPanelProps) {
  if (!db || !text) {
    return <div class="lc-narration lc-section">{text}</div>;
  }

  // Reset regex state before splitting (stateful global regex)
  db.pattern.lastIndex = 0;
  const parts = text.split(db.pattern);

  const nodes = parts.map((part, i) => {
    const monster = db.getByName(part);
    if (monster) {
      return (
        <span
          key={i}
          class="lc-monster-link"
          onClick={() => onMonsterClick(monster)}
        >
          {part}
        </span>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });

  return <div class="lc-narration lc-section">{nodes}</div>;
}
