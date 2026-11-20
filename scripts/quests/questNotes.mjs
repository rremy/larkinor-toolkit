/**
 * Players' own notes on a quest, which no source page records — what to
 * prepare before walking in. Hand-written, keyed by set and `Quest.id`, and
 * merged in by every scraper, so a re-scrape keeps them instead of silently
 * dropping a note written straight into the JSON.
 *
 * Each entry is one paragraph, Hungarian like the rest of the game text.
 */
const QUEST_NOTES = {
  royal: {
    47: [
      'Parcillió kelyhét össze kell rakni: 9 rubin gemma, 2 ezüstkígyó, 2 ezüsttál (Erődben).',
      'Csak ezzel lehet a főszörnyet megsebezni.',
    ],
  },
  tavern: {},
};

/** The quest with its notes attached, or unchanged when it has none. */
export function withNotes(quest) {
  const notes = QUEST_NOTES[quest.set]?.[quest.id];
  return notes ? { ...quest, notes } : quest;
}
