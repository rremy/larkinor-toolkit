// Detects the monster the player is facing from the game's narration text.
//
// The game announces encounters with a small set of fixed sentence templates,
// each mentioning the monster by name. Rather than brute-force the narration
// against all ~1500 monster names (slow, and prone to matching a short name as
// a substring), we match these templates and capture the name, then resolve it
// against the database for the tooltip card.
//
// Each pattern MUST have exactly one capture group: the monster name.
// Add new templates here as they are discovered in-game.

const ENCOUNTER_PATTERNS: RegExp[] = [
  // "Valami <Monster> csámborog a közelben!"
  /Valami\s+([^.!?]+?)\s+csámborog a közelben!/g,
  // "<Monster> feléd indul!"
  /(?:^|[.!?])\s*([^.!?]+?)\s+feléd indul!/g,
  // "Megpróbálsz elmenekülni <Monster> elől"
  /Megpróbálsz elmenekülni\s+([^.!?]+?)\s+elől/g,
  // "<Monster> nem hagy békén, követ!"
  /(?:^|[.!?])\s*([^.!?]+?)\s+nem hagy békén, követ!/g,
  // "Egy <Monster> van a közelben! Megtámadod vagy gyáván lapítasz?!"
  /Egy\s+([^.!?]+?)\s+van a közelben!/g,
  // "<Monster> megijed tőled! Megpróbál elmenekülni..."
  /(?:^|[.!?])\s*([^.!?]+?)\s+megijed tőled!/g,
  // "<Monster> után rohansz..."
  /(?:^|[.!?])\s*([^.!?]+?)\s+után rohansz/g,
];

export interface MonsterMention {
  /** Trimmed monster name captured from the narration. */
  name: string;
  /** Start offset of the name substring within the narration text. */
  index: number;
  /** Length of the name substring. */
  length: number;
}

/**
 * Scans narration text for monster-encounter sentence templates and returns
 * the position of each captured monster name. Overlapping matches are resolved
 * by keeping the earliest; results are sorted by position so callers can splice
 * the text into plain/linked runs in order.
 */
export function findMonsterMentions(text: string): MonsterMention[] {
  if (!text) return [];

  const spans: MonsterMention[] = [];
  for (const pattern of ENCOUNTER_PATTERNS) {
    const re = new RegExp(pattern.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const group = m[1];
      if (group) {
        // Locate the capture group inside the full match, then trim any
        // surrounding whitespace while keeping offsets accurate.
        const rawStart = m.index + m[0].indexOf(group);
        const leading = group.length - group.trimStart().length;
        const name = group.trim();
        if (name) {
          spans.push({ name, index: rawStart + leading, length: name.length });
        }
      }
      if (m.index === re.lastIndex) re.lastIndex++; // guard against zero-width loops
    }
  }

  spans.sort((a, b) => a.index - b.index);

  // Drop overlaps (keep the earliest-starting mention).
  const result: MonsterMention[] = [];
  let lastEnd = -1;
  for (const s of spans) {
    if (s.index >= lastEnd) {
      result.push(s);
      lastEnd = s.index + s.length;
    }
  }
  return result;
}
