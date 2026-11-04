// Things the narration says are somewhere in a direction — the labyrinth
// entrance, a player flying the airship, a monster that fled, the game's own
// hint — shown as icons around the direction buttons, so the way to go is read
// off the pad instead of out of a sentence.
//
// Each template was printed by the game in a recorded session. They are read
// per sentence, from the page's narration only, and nothing is remembered:
// the entrance and the airship lines are reprinted on every step, and a fled
// monster matters only on the page that says so.

/** The eight compass directions, as the indicators are placed. */
export type Compass = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

export type DirectionHintKind = 'labyrinth' | 'airship' | 'fled' | 'hint';

export interface DirectionHint {
  kind: DirectionHintKind;
  dir: Compass;
  /** What is there, for the indicator's tooltip. */
  label: string;
}

/** An indicator's icon: one of the game's own images, or an emoji where it has none. */
export type HintIcon = { image: string } | { emoji: string };

/** Where the game serves its control icons. */
const GAME_ICONS = 'https://l2.larkinor.hu/2/ikon';

/**
 * The icon each kind is drawn as. The game's own where it has one — the door
 * of its labyrinth-entrance button, the encounter icon it shows when a monster
 * is near (a monster's portrait is a whole scene, unreadable at this size) —
 * and an emoji for the airship and the hint, which it draws no icon for.
 */
export const HINT_ICON: Record<DirectionHintKind, HintIcon> = {
  labyrinth: { image: `${GAME_ICONS}/labirintus.gif` },
  airship: { emoji: '🎈' },
  fled: { image: `${GAME_ICONS}/tamadas.gif` },
  hint: { emoji: '❗' },
};

/** Direction stems, compounds first so `északkelet` is not read as `észak`. */
const DIRECTION_STEM: Record<string, Compass> = {
  északkelet: 'NE',
  északnyugat: 'NW',
  délkelet: 'SE',
  délnyugat: 'SW',
  észak: 'N',
  dél: 'S',
  kelet: 'E',
  nyugat: 'W',
};

/** A direction in the sublative, `délnyugatra` / `keletre`, capturing the stem. */
const DIR = String.raw`(${Object.keys(DIRECTION_STEM).join('|')})(?:ra|re)`;

interface Template {
  kind: DirectionHintKind;
  pattern: RegExp;
  /** The tooltip, from the match. */
  label(match: RegExpMatchArray): string;
}

const TEMPLATES: Template[] = [
  {
    kind: 'labyrinth',
    pattern: new RegExp(String.raw`^A labirintus bejárata ${DIR} van`),
    label: () => 'A labirintus bejárata',
  },
  {
    // `<name> tőled <dir> már <n> lépést tett meg a Parszi léghajó segítségével.`
    // A name can hold spaces and symbols (`D@rk Wizzard`), so it runs from the
    // sentence start.
    kind: 'airship',
    pattern: new RegExp(String.raw`^(.+?) tőled ${DIR} már (\d+) lépést tett meg a Parszi léghajó`),
    label: (m) => `${m[1]} (${m[3]} lépés)`,
  },
  {
    kind: 'fled',
    pattern: new RegExp(String.raw`^(.+?) ${DIR} menekült előled`),
    label: (m) => m[1],
  },
  {
    kind: 'hint',
    pattern: new RegExp(String.raw`^Valami azt súgja, jobb lenne ${DIR} menni`),
    label: (m) => m[0].endsWith('!') ? m[0] : `${m[0]}!`,
  },
];

/** The direction stem a template captured: the first group that is one. */
function directionOf(match: RegExpMatchArray): Compass | null {
  for (const group of match.slice(1)) {
    if (group && group in DIRECTION_STEM) return DIRECTION_STEM[group];
  }
  return null;
}

/** Every direction hint in the narration, in reading order. */
export function findDirectionHints(narration: string): DirectionHint[] {
  const hints: DirectionHint[] = [];
  // Sentence by sentence: every template is anchored at a sentence start. Runs
  // of whitespace are collapsed first: the game bolds the direction and prints
  // two spaces after it (`bejárata <b>délnyugatra</b>  van.`), and writes
  // &nbsp; in places, so the templates' single spaces would otherwise miss.
  for (const sentence of narration.split(/(?<=[.!?])\s+|\n+/)) {
    const text = sentence.replace(/\s+/g, ' ').trim();
    for (const template of TEMPLATES) {
      const match = text.match(template.pattern);
      const dir = match && directionOf(match);
      if (match && dir) {
        hints.push({ kind: template.kind, dir, label: template.label(match) });
        break;
      }
    }
  }
  return hints;
}

/** Where a direction button sits, in page pixels. */
export interface ButtonRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type ArrowRects = Partial<Record<'north' | 'south' | 'east' | 'west', ButtonRect>>;

/**
 * The centre of each indicator around the desktop page's arrow cross: a
 * diagonal in the corner between its two arrows (north-east right of the north
 * arrow, above the east one), a cardinal straddling its arrow's outer edge —
 * not a full step beyond it, where the stat lines sit above the cross and the
 * action select below it.
 *
 * The page draws an arrow only for an open side, so the cross is worked out
 * from whichever arrows it has, assuming it is symmetric; without an arrow on
 * each axis, or both on one, there is nothing to place against and the result
 * is null.
 */
export function indicatorPositions(rects: ArrowRects): Record<Compass, { x: number; y: number }> | null {
  const centre = (r: ButtonRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  const n = rects.north && centre(rects.north);
  const s = rects.south && centre(rects.south);
  const e = rects.east && centre(rects.east);
  const w = rects.west && centre(rects.west);

  const cx = (n ?? s)?.x ?? (e && w ? (e.x + w.x) / 2 : null);
  const cy = (e ?? w)?.y ?? (n && s ? (n.y + s.y) / 2 : null);
  if (cx === null || cy === null) return null;

  let dy = n ? cy - n.y : s ? s.y - cy : null;
  let dx = e ? e.x - cx : w ? cx - w.x : null;
  dx ??= dy;
  dy ??= dx;
  if (dx === null || dy === null) return null;

  return {
    N: { x: cx, y: cy - 1.5 * dy },
    S: { x: cx, y: cy + 1.5 * dy },
    E: { x: cx + 1.5 * dx, y: cy },
    W: { x: cx - 1.5 * dx, y: cy },
    NE: { x: cx + dx, y: cy - dy },
    NW: { x: cx - dx, y: cy - dy },
    SE: { x: cx + dx, y: cy + dy },
    SW: { x: cx - dx, y: cy + dy },
  };
}
