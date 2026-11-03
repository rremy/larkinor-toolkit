// Finding the items (and silver) the narration says the player gained or handled
// — "Kiástál 16 darab aranyat!" — so both platforms can highlight the phrase
// and link the item to its database entry.
//
// The game prints a count in two shapes, both seen in recorded sessions:
//   "<n> darab <name in the accusative>"  dig results, purchases, taking an item
//                                         out of the backpack
//   "<n> db <name as written>"            a corpse's loot list, one line each
// The accusative is the hard part: "aranyat" is "arany", "kaját" is "kaja",
// "imamalmot" is "imamalom", "kenyeret" is "kenyér". `nominativeCandidates`
// undoes the suffix and the stem changes a handful of rules cover; whatever it
// cannot name is still highlighted, just without a link.
//
// GM-free and DOM-free: the mobile narration panel and the desktop narration
// splice both run it, and the database data it reads comes in as rows.

import type { Armor, DataLoader, Item, Weapon } from '@/shared/data';

/** A database entry a phrase resolved to. */
export interface ItemRef {
  tab: 'weapons' | 'armors' | 'items';
  id: number;
  name: string;
}

/** Lower-cased database name → entry. */
export type ItemIndex = ReadonlyMap<string, ItemRef>;

export interface ItemMention {
  /** Where the highlighted phrase starts in the text, count included. */
  index: number;
  length: number;
  quantity: number;
  /** The entry it names; null for silver and for a name the database lacks. */
  item: ItemRef | null;
}

/**
 * Every weapon, armour and item by lower-cased name. On the 15 names shared by
 * two entries the first wins, items before weapons before armour: what the
 * narration counts out is far more often a material than a piece of gear.
 */
export function buildItemIndex(weapons: Weapon[], armors: Armor[], items: Item[]): ItemIndex {
  const index = new Map<string, ItemRef>();
  const add = (tab: ItemRef['tab'], rows: Array<{ id: number; name: string }>) => {
    for (const row of rows) {
      const key = row.name.toLowerCase();
      if (!index.has(key)) index.set(key, { tab, id: row.id, name: row.name });
    }
  };
  add('items', items);
  add('weapons', weapons);
  add('armors', armors);
  return index;
}

/** The index over the loader's weapons, armours and items (GM-cached after the first fetch). */
export async function loadItemIndex(loader: DataLoader): Promise<ItemIndex> {
  const [weapons, armors, items] = await Promise.all([loader.loadWeapons(), loader.loadArmors(), loader.loadItems()]);
  return buildItemIndex(weapons, armors, items);
}

/** A count as the game prints it: `16`, or `1 250` with a (non-breaking) space. */
const COUNT = String.raw`(\d{1,3}(?:[  ]\d{3})+|\d+)`;

/**
 * `<n> darab <name>` / `<n> db <name>`, the name running to the end of its
 * clause. The clause is read in a lookahead, so the scan resumes right after
 * `darab` and still finds a second count inside an unpunctuated clause.
 */
const ITEM_PATTERN = new RegExp(String.raw`(?<!\d)${COUNT}\s+(?:darab|db\.?)\s+(?=([^\s.!?,;:()\n][^.!?,;:()\n]*))`, 'g');

/** Silver gained: `1 250 ezüstöt`, or the dig result's `(+ 37 ezüst)`. */
const SILVER_PATTERNS = [
  new RegExp(String.raw`(?<!\d)${COUNT}\s+ezüstöt(?![a-zà-ž])`, 'g'),
  new RegExp(String.raw`\+\s*${COUNT}\s*ezüst(?![a-zà-ž])`, 'g'),
];

/** Whether `text` could hold a mention at all — cheap, to skip loading the names. */
export function mayMentionItems(text: string): boolean {
  return /\d\s+(?:darab|db\.?)\s/.test(text);
}

/** How long a name the database does not know may run before only its first word is taken. */
const UNKNOWN_NAME_WORDS = 3;

const LENGTHENED: Record<string, string> = { a: 'á', e: 'é', o: 'ó', ö: 'ő' };

/** `kenyer` → `kenyér`: the last a/e/o/ö lengthened, which the accusative shortens. */
function lengthenLastVowel(stem: string): string | null {
  for (let i = stem.length - 1; i >= 0; i--) {
    const long = LENGTHENED[stem[i]];
    if (long) return stem.slice(0, i) + long + stem.slice(i + 1);
  }
  return null;
}

/**
 * The nominatives a phrase may be, most likely first. Only a phrase ending in
 * the accusative `-t` gets more than itself (the loot list's `db` form is
 * already nominative):
 *   rubint → rubin             a bare -t
 *   aranyat → arany            a linking vowel before it
 *   kaját → kaja               a final a/e lengthened by the suffix
 *   imamalmot → imamalom       a vowel the stem drops
 *   kenyeret → kenyér          a long vowel the stem shortens
 *   követ → kő                 a -v- stem
 */
export function nominativeCandidates(phrase: string): string[] {
  const candidates = [phrase];
  if (!phrase.endsWith('t')) return candidates;
  const bare = phrase.slice(0, -1);
  candidates.push(bare);
  if (bare.endsWith('á')) candidates.push(`${bare.slice(0, -1)}a`);
  if (bare.endsWith('é')) candidates.push(`${bare.slice(0, -1)}e`);
  if (/[aeoö]$/.test(bare)) {
    const stem = bare.slice(0, -1);
    candidates.push(stem);
    const lengthened = lengthenLastVowel(stem);
    if (lengthened) candidates.push(lengthened);
    for (const vowel of ['o', 'e', 'ö', 'a']) candidates.push(stem.slice(0, -1) + vowel + stem.slice(-1));
    if (stem.endsWith('v')) {
      const vStem = lengthenLastVowel(stem.slice(0, -1));
      if (vStem) candidates.push(vStem);
    }
  }
  return candidates;
}

/**
 * The entry the clause after a count names, and how many of its words it took.
 * The clause may run on past the name ("3 darab rubint adsz neki"), so the
 * longest leading run of words that names an entry wins.
 */
function resolveName(clause: string, index: ItemIndex): { item: ItemRef; words: number } | null {
  const words = clause.trim().split(/\s+/);
  for (let count = Math.min(words.length, 6); count >= 1; count--) {
    const phrase = words.slice(0, count).join(' ').toLowerCase();
    for (const candidate of nominativeCandidates(phrase)) {
      const item = index.get(candidate);
      if (item) return { item, words: count };
    }
  }
  return null;
}

function parseCount(raw: string): number {
  return parseInt(raw.replace(/\D/g, ''), 10);
}

/** Every item and silver mention in `text`, in order, never overlapping. */
export function findItemMentions(text: string, index: ItemIndex | null): ItemMention[] {
  const mentions: ItemMention[] = [];

  for (const match of text.matchAll(ITEM_PATTERN)) {
    const [lead, count, clause] = match;
    const clauseStart = match.index + lead.length;
    const words = clause.trimEnd().split(/\s+/);
    const resolved = index ? resolveName(clause, index) : null;
    const taken = resolved?.words ?? (words.length <= UNKNOWN_NAME_WORDS ? words.length : 1);
    const name = words.slice(0, taken).join(' ');
    // The clause's own spacing is kept, so the length is measured on the text.
    const nameEnd = clauseStart + clause.indexOf(name) + name.length;
    mentions.push({
      index: match.index,
      length: nameEnd - match.index,
      quantity: parseCount(count),
      item: resolved?.item ?? null,
    });
  }

  for (const pattern of SILVER_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      mentions.push({ index: match.index, length: match[0].length, quantity: parseCount(match[1]), item: null });
    }
  }

  mentions.sort((a, b) => a.index - b.index);
  return mentions.filter((m, i) => i === 0 || m.index >= mentions[i - 1].index + mentions[i - 1].length);
}
