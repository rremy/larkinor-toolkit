import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { QuestionPanel } from '../src/components/QuestionPanel';
import type { DungeonQuestion } from '../src/utils/domExtract';

function buildQuestion(overrides: Partial<DungeonQuestion> = {}): DungeonQuestion {
  return {
    prompt: 'Kortyolj a megfelelőből és továbbjutsz!',
    answers: [
      { label: 'Megiszod a büdös zöld folyadékot', select: vi.fn() },
      { label: 'Megiszod az édes szagú fekete folyadékot', select: vi.fn() },
    ],
    submit: vi.fn(),
    ...overrides,
  };
}

describe('QuestionPanel', () => {
  it('renders the prompt and one button per answer', () => {
    const q = buildQuestion();
    render(<QuestionPanel question={q} />);
    expect(screen.getByText(/Kortyolj a megfelelőből/)).toBeTruthy();
    expect(screen.getByText('Megiszod a büdös zöld folyadékot')).toBeTruthy();
    expect(screen.getByText('Megiszod az édes szagú fekete folyadékot')).toBeTruthy();
  });

  it('disables the Válasz button until an answer is selected', () => {
    const q = buildQuestion();
    render(<QuestionPanel question={q} />);
    const valasz = screen.getByRole('button', { name: /válasz/i }) as HTMLButtonElement;
    expect(valasz.disabled).toBe(true);
  });

  it('selecting an answer calls its select() and enables Válasz', () => {
    const q = buildQuestion();
    render(<QuestionPanel question={q} />);
    fireEvent.click(screen.getByText('Megiszod a büdös zöld folyadékot'));
    expect(q.answers[0].select).toHaveBeenCalledTimes(1);
    const valasz = screen.getByRole('button', { name: /válasz/i }) as HTMLButtonElement;
    expect(valasz.disabled).toBe(false);
  });

  it('confirming with Válasz calls submit()', () => {
    const q = buildQuestion();
    render(<QuestionPanel question={q} />);
    fireEvent.click(screen.getByText('Megiszod az édes szagú fekete folyadékot'));
    fireEvent.click(screen.getByRole('button', { name: /válasz/i }));
    expect(q.answers[1].select).toHaveBeenCalledTimes(1);
    expect(q.submit).toHaveBeenCalledTimes(1);
  });

  it('does not submit when no answer is selected', () => {
    const q = buildQuestion();
    render(<QuestionPanel question={q} />);
    fireEvent.click(screen.getByRole('button', { name: /válasz/i }));
    expect(q.submit).not.toHaveBeenCalled();
  });
});
