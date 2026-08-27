import { describe, it, expect } from 'vitest';
import { findActiveQuest } from '../src/utils/activeQuest';

describe('findActiveQuest', () => {
  it('finds the quest number and the run to make clickable', () => {
    const narration = 'Sétálsz a városban.\nAktuális küldetés: (39)\nEgy macska fut át az úton.';
    const hit = findActiveQuest(narration)!;
    expect(hit.questId).toBe('39');
    expect(narration.slice(hit.index, hit.index + hit.length)).toBe('Aktuális küldetés: (39)');
  });

  // The game page is ISO-8859-2 and decoding has misfired before (see CLAUDE.md
  // on the monsters.json mojibake), so the accents must not be load-bearing.
  it('matches an unaccented spelling too', () => {
    expect(findActiveQuest('Aktualis kuldetes: (7)')?.questId).toBe('7');
  });

  it('tolerates spacing and a missing colon', () => {
    expect(findActiveQuest('Aktuális  küldetés  (12)')?.questId).toBe('12');
  });

  it('returns null when the line is absent', () => {
    expect(findActiveQuest('Pihensz egy kicsit...')).toBeNull();
  });

  // Writing an id the royal set cannot resolve would silently send the tab to
  // its fallback quest, which reads as a bug rather than as "unknown".
  it('rejects a number outside the royal set', () => {
    expect(findActiveQuest('Aktuális küldetés: (0)')).toBeNull();
    expect(findActiveQuest('Aktuális küldetés: (46)')).toBeNull();
  });

  it('returns null for an empty narration', () => {
    expect(findActiveQuest('')).toBeNull();
  });
});
