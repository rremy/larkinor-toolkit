// Desktop-only: the "quest recognised" note appended under the pub narration.
//
// Built with DOM calls rather than innerHTML, for the same reason
// enhanceNarration splices text nodes: assigning innerHTML anywhere near the
// game's own markup destroys the inline handlers on its <a> elements. Here we
// only ever append a new element after the narration block, never rewrite it.

const NOTE_CLASS = 'lc-quest-offer';

export interface QuestOfferNoteOptions {
  /** Quest title, shown to the player. */
  title: string;
  /** Invoked when the note is activated (click, Enter or Space). */
  onOpen: () => void;
}

/**
 * Append the note after the narration block, replacing any note already
 * there.
 *
 * Idempotent: the game reloads the page on every action, but a re-render
 * within one page load (the dock re-rendering, say) must not stack notes.
 * Returns the element, or null when there is no narration block to attach to.
 */
export function renderQuestOfferNote(
  doc: Document,
  { title, onOpen }: QuestOfferNoteOptions,
): HTMLElement | null {
  const block = doc.querySelector('font[face="Comic sans MS"]');
  if (!block) return null;

  doc.querySelectorAll(`.${NOTE_CLASS}`).forEach((old) => old.remove());

  const note = doc.createElement('div');
  note.className = NOTE_CLASS;

  const button = doc.createElement('button');
  button.type = 'button';
  button.className = `${NOTE_CLASS}-btn`;
  // Hungarian, like every other piece of player-facing copy.
  button.textContent = `Küldetés felismerve: ${title} →`;
  button.title = 'Megnyitás az adatbázisban';
  button.addEventListener('click', (event) => {
    // The pub page's controls submit the shared form; make sure this button
    // can never be mistaken for one of them.
    event.preventDefault();
    event.stopPropagation();
    onOpen();
  });

  note.appendChild(button);
  block.parentNode?.insertBefore(note, block.nextSibling);
  return note;
}
