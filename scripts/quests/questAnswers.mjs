/**
 * Players' answers to a quest's questions, which no source page records — the
 * tavern source never prints an outcome, so which choice is right lives only
 * in players' heads. Hand-written, keyed by set, `Quest.id` and `"row,col"`,
 * and merged in by every scraper (like `questNotes.mjs`), so a re-scrape keeps
 * them instead of silently dropping an answer written straight into the JSON.
 *
 * Each entry names the right choice by its 1-based `index`. An entry may also
 * carry the whole `question`, for a tile whose source lost it: then the
 * source must still mark the tile a question and must still have failed to
 * yield one, or the scrape aborts — a repaired source page is new information
 * and the hand-written copy has to go.
 */
const QUEST_ANSWERS = {
  royal: {},
  tavern: {
    miniatur_hanghordozo: {
      '1,1': { answer: 2 },
      '1,6': { answer: 3 },
      // The page as served carries this title mangled by a browser re-save:
      // an unescaped `"` closes the attribute after the prompt, and the three
      // options survive only as lower-cased attribute names. The beginning of
      // the question is lost on the source page too.
      '3,1': {
        question: { prompt: '„…hívták?"', choices: ['Rombovan', 'Nilrem', 'Rianon'] },
        answer: 2,
      },
      '3,5': { answer: 1 },
    },
  },
};

/** One cell with its hand-written question and answer applied. */
function answerCell(cell, entry, where) {
  if (!cell.hasQuestion) throw new Error(`${where}: answer given for a tile that holds no question`);
  let question = cell.question;
  if (entry.question) {
    if (question) throw new Error(`${where}: the source now yields this question; drop the hand-written copy`);
    question = {
      prompt: entry.question.prompt,
      choices: entry.question.choices.map((text, i) => ({ index: i + 1, text, outcome: '' })),
    };
  }
  if (!question) throw new Error(`${where}: no question to answer`);
  if (!question.choices.some((c) => c.index === entry.answer)) {
    throw new Error(`${where}: no choice ${entry.answer}`);
  }
  return {
    ...cell,
    question: {
      ...question,
      choices: question.choices.map((c) => (c.index === entry.answer ? { ...c, correct: true } : c)),
    },
  };
}

/** The quest with its answers marked, or unchanged when it has none. */
export function withAnswers(quest) {
  const answers = QUEST_ANSWERS[quest.set]?.[quest.id];
  if (!answers) return quest;
  const cells = new Map(quest.cells.map((c) => [`${c.row},${c.col}`, c]));
  for (const key of Object.keys(answers)) {
    if (!cells.has(key)) throw new Error(`${quest.set} ${quest.id} ${key}: no such cell`);
  }
  return {
    ...quest,
    cells: quest.cells.map((c) => {
      const key = `${c.row},${c.col}`;
      return answers[key] ? answerCell(c, answers[key], `${quest.set} ${quest.id} ${key}`) : c;
    }),
  };
}
