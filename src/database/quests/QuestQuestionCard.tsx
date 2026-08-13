import { h, type VNode } from 'preact';
import type { QuestQuestion } from '@/shared/data';
import { outcomeValence } from './questMeta';

interface QuestQuestionCardProps {
  question: QuestQuestion;
}

/** A choice point, one row per answer with its outcome colour-coded. */
export function QuestQuestionCard(props: QuestQuestionCardProps): VNode {
  const { question } = props;
  return (
    <div class="quest-question">
      <div class="quest-question-prompt">{question.prompt}</div>
      <ul class="quest-choices">
        {question.choices.map((choice) => (
          <li key={choice.index} class="quest-choice">
            <span class="quest-choice-index">{choice.index}</span>
            <span class="quest-choice-text">{choice.text}</span>
            {choice.outcome && (
              <span class={`quest-outcome ${outcomeValence(choice.outcome)}`}>{choice.outcome}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
