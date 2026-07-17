import { h, type JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { DungeonQuestion } from '@/utils/domExtract';

export interface QuestionPanelProps {
  question: DungeonQuestion;
}

/**
 * Movement-blocking dungeon question. Answers are tap-to-select (not one-tap
 * submit) so a mistap can't commit a harmful choice; confirming with "Válasz"
 * fires the game's native submit. Selecting an answer also drives the original
 * radio (which sets urlap.par1), matching the game's own flow.
 */
export function QuestionPanel({ question }: QuestionPanelProps): JSX.Element {
  const [selected, setSelected] = useState<number | null>(null);

  const choose = (i: number) => {
    setSelected(i);
    question.answers[i].select();
  };

  return (
    <div class="lc-section lc-question">
      <p class="lc-question-prompt">{question.prompt}</p>
      <div class="lc-question-answers">
        {question.answers.map((a, i) => (
          <button
            key={i}
            class={`lc-btn lc-question-answer${selected === i ? ' lc-question-answer--selected' : ''}`}
            aria-pressed={selected === i}
            onClick={() => choose(i)}
          >
            {a.label}
          </button>
        ))}
      </div>
      <button
        class="lc-btn lc-question-submit"
        type="button"
        disabled={selected === null}
        onClick={() => {
          if (selected !== null) question.submit();
        }}
      >
        Válasz
      </button>
    </div>
  );
}
