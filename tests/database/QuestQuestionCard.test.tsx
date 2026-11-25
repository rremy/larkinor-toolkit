import { h } from 'preact';
import { render, screen } from '@testing-library/preact';
import { describe, it, expect } from 'vitest';
import { QuestQuestionCard } from '@/database/quests/QuestQuestionCard';

const question = {
  prompt: 'Mit teszel?',
  choices: [
    { index: 1, text: 'Megkóstolod', outcome: 'max ÉP' },
    { index: 2, text: 'Kiiszod az egészet', outcome: '3 méreg' },
    { index: 3, text: 'Otthagyod', outcome: 'semmi' },
    { index: 4, text: 'Megmondod a neved', outcome: 'HALÁL' },
  ],
};

describe('QuestQuestionCard', () => {
  it('renders the prompt and every choice', () => {
    const { container } = render(<QuestQuestionCard question={question} />);
    expect(screen.getByText('Mit teszel?')).toBeTruthy();
    expect(container.querySelectorAll('.quest-choice')).toHaveLength(4);
    expect(screen.getByText('Kiiszod az egészet')).toBeTruthy();
  });

  it('numbers choices as the source does', () => {
    render(<QuestQuestionCard question={question} />);
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
  });

  it('colour-codes outcomes by valence', () => {
    const { container } = render(<QuestQuestionCard question={question} />);
    expect(container.querySelector('.quest-outcome.good')).toBeTruthy();
    expect(container.querySelector('.quest-outcome.bad')).toBeTruthy();
    expect(container.querySelector('.quest-outcome.neutral')).toBeTruthy();
    expect(container.querySelector('.quest-outcome.fatal')).toBeTruthy();
  });

  it('renders a choice with no outcome without an empty badge', () => {
    const { container } = render(
      <QuestQuestionCard question={{ prompt: 'Na?', choices: [{ index: 1, text: 'Mész', outcome: '' }] }} />,
    );
    expect(container.querySelector('.quest-outcome')).toBeNull();
  });

  it('marks the right answer and only that one', () => {
    const { container } = render(
      <QuestQuestionCard
        question={{
          prompt: 'Milyen színű?',
          choices: [
            { index: 1, text: 'Piros', outcome: '' },
            { index: 2, text: 'Kék', outcome: '', correct: true },
          ],
        }}
      />,
    );
    const marked = container.querySelectorAll('.quest-choice.correct');
    expect(marked).toHaveLength(1);
    expect(marked[0].textContent).toContain('Kék');
    expect(container.querySelectorAll('.quest-choice-correct')).toHaveLength(1);
  });

  it('omits the prompt line when the question has no prompt', () => {
    // The source sometimes asks the question only in narration prose and
    // jumps straight to VÁLASZ/VÁLASZOK — there is no separate prompt text.
    const { container } = render(
      <QuestQuestionCard question={{ prompt: '', choices: [{ index: 1, text: 'Mész', outcome: '' }] }} />,
    );
    expect(container.querySelector('.quest-question-prompt')).toBeNull();
  });
});
