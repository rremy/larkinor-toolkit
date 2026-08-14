/**
 * Pure parsing functions for the larkinorcenter.hu tavern quest pages
 * (kocsmai küldetések).
 *
 * Deliberately separate from parseQuest.mjs rather than a dialect flag through
 * it: the two sources share a page skeleton but almost no grammar. Tavern
 * spells a key cell `<monster>_<lock>` where royal spells `<monster>_<lock>kulcs`,
 * writes markers on either side of the base, and has no structured question
 * format at all. A shared parser would mean a branch in every function.
 *
 * No I/O here on purpose: scrapeTavern.mjs fetches and writes, so everything
 * below is unit-testable against saved fixtures.
 */
import { LOCK_SUFFIXES, SIDE_BY_PREFIX, decodeEntities, stripComments, stripTags } from './parseQuest.mjs';

export { stripComments, stripTags, decodeEntities };

/**
 * Malformed edge-class tokens in the source, mapped to what they meant.
 * Case is normalised before lookup, so `Ezust` needs no entry of its own.
 */
export const TAVERN_EDGE_ALIASES = {
  azust: 'ezust',
  asrany: 'arany',
  bronnz: 'bronz',
};

const SIDE_TOKEN = /^([fjab])(?:_([a-z]+))?$/;

/**
 * Malformed edge-class tokens present in the source that don't fit the
 * side-prefix grammar at all (no leading f/j/a/b), unlike `TAVERN_EDGE_ALIASES`
 * above, which corrects typos on an otherwise well-formed token. Enumerated
 * by hand across all 37 pages — exactly these three, one occurrence each.
 * Tolerated (the token is dropped) rather than guessed at, because guessing a
 * side and lock would invent a door the source never actually drew.
 */
export const TAVERN_TOLERATED_TOKENS = new Set([
  // kastely.htm cell (2,8): `class="a _rezf"`. No leading side letter at all.
  '_rezf',
  // kiralyno_7_torpe.htm cell (6,8): `class="j b_arany l_platina"`. Prefix
  // `l` isn't in SIDE_BY_PREFIX.
  'l_platina',
  // letezik_egy_labirintus.htm cell (0,3): `class="f b_platina j bronz
  // a_bronz"`. Bare, prefixless `bronz` alongside a cell whose other four
  // tokens (f, b_platina, j, a_bronz) already declare all four sides, so
  // dropping this one loses no information.
  'bronz',
]);

/** Parse a `<td>` class attribute into the cell's four edges. */
export function parseTavernEdges(classAttr) {
  const edges = {
    N: { kind: 'open' }, E: { kind: 'open' },
    S: { kind: 'open' }, W: { kind: 'open' },
  };
  for (const raw of String(classAttr).trim().split(/\s+/)) {
    if (!raw) continue;
    const token = raw.toLowerCase();
    if (TAVERN_TOLERATED_TOKENS.has(token)) continue;
    const m = SIDE_TOKEN.exec(token);
    if (!m) throw new Error(`unrecognised edge class token "${raw}"`);
    const side = SIDE_BY_PREFIX[m[1]];
    const suffix = m[2] ? (TAVERN_EDGE_ALIASES[m[2]] ?? m[2]) : undefined;
    if (!suffix) { edges[side] = { kind: 'wall' }; continue; }
    if (suffix === 'szel') { edges[side] = { kind: 'szel' }; continue; }
    if (LOCK_SUFFIXES.includes(suffix)) { edges[side] = { kind: 'door', lock: suffix }; continue; }
    throw new Error(`unrecognised edge class token "${raw}"`);
  }
  return edges;
}

const ITEM_TOKENS = new Set(['kulditargy', 'kuldi', 'kt']);
const PORTAL_TOKENS = new Set(['labikibe', 'kibe', 'labi']);
/** Bases that are scenery or markers, never a creature. */
const SCENERY = new Set(['black', 'nop', 'kijarat', 'bejarat', 'csapda', 'halal', 'kerdes', '']);

/** Classify a single filename token as a marker, mutating `facts` if it is one. */
function consumeMarker(token, facts) {
  const t = token.toLowerCase();
  if (LOCK_SUFFIXES.includes(t)) { facts.key = t; return true; }
  if (ITEM_TOKENS.has(t)) { facts.questItem = true; return true; }
  if (PORTAL_TOKENS.has(t)) { facts.portal = facts.portal ?? 'exit'; return true; }
  if (t === 'kerdes') { facts.question = true; return true; }
  if (t === 'csapda') { facts.trap = true; return true; }
  if (t === 'halal') { facts.death = true; return true; }
  if (t === 'bejarat') { facts.portal = 'entrance'; return true; }
  return false;
}

/**
 * Decompose a cell image filename.
 *
 * Token-based rather than an ordered suffix peel, because the source writes
 * markers on either side of the sprite name (`kerdes_platina` and
 * `labikibe_kerdes` both occur).
 *
 * `isMonster` (optional, defaults to always-false so callers that don't need
 * it — including task 2's own tests — see no change in behaviour) resolves an
 * ambiguity a lexical rule alone cannot: `tolvaj` (thief) is both a lock
 * suffix and the second word of some monster names, e.g. `berbunko_tolvaj`
 * (a monster with no key) versus `klonolo_tolvaj` (a different monster plus a
 * thief-locked key) — identical token shape, opposite meanings. When
 * `isMonster` recognises a leading run of tokens as a monster name, that run
 * is taken whole as the sprite name and every token after it is classified as
 * a marker. Otherwise every recognised token anywhere in the name is treated
 * as a marker and whatever remains rejoins to form the base — the pre-existing
 * behaviour, preserved exactly for names `isMonster` has no opinion on.
 *
 * @param {string} src
 * @param {(name: string) => boolean} [isMonster]
 */
export function parseTavernImage(src, isMonster = () => false) {
  const facts = {
    base: null, key: null, questItem: false, portal: null,
    trap: false, death: false, boss: false, question: false, empty: false,
  };

  const raw = String(src).replace(/^.*\//, '').replace(/\.(gif|jpe?g|png)$/i, '');
  if (!raw) { facts.empty = true; return facts; }

  const tokens = raw.split('_');

  // Longest leading prefix of tokens that names a known monster; 0 means none.
  let monsterLen = 0;
  for (let n = tokens.length; n >= 1; n -= 1) {
    if (isMonster(tokens.slice(0, n).join('_'))) { monsterLen = n; break; }
  }

  const rest = [];
  let base;
  if (monsterLen > 0) {
    base = tokens.slice(0, monsterLen).join('_');
    for (const token of tokens.slice(monsterLen)) {
      if (!consumeMarker(token, facts)) rest.push(token);
    }
    // Shouldn't happen against the confirmed data set: every token after a
    // recognised monster name is a known marker. Kept for safety rather than
    // silently dropping an unrecognised trailing token.
    if (rest.length > 0) base = [base, ...rest].join('_');
  } else {
    for (const token of tokens) {
      if (!consumeMarker(token, facts)) rest.push(token);
    }
    base = rest.join('_');
  }

  if (SCENERY.has(base.toLowerCase())) { facts.empty = true; return facts; }

  facts.base = base;
  facts.boss = /boss$/.test(base);
  return facts;
}

/**
 * Decompose a cell `title` into narration and an optional question.
 *
 * The tavern source has no question grammar: no `KÉRDÉS:`/`VÁLASZ:` tokens,
 * no `(n)` markers, no `->` or ` -- ` outcome separators anywhere in the set.
 * What it does have is newline-delimited text on question tiles, where line 0
 * is the setup and the remaining lines are the options. Measured across all
 * 132 multi-line question cells; see the spec's "Risks and accepted limits"
 * for why this is a heuristic rather than a grammar.
 *
 * `isQuestionImage` (from parseTavernImage) gates the split entirely: 200
 * titles in the set are multi-line, but some are dialogue transcripts, so a
 * line count can never decide this on its own.
 *
 * Tavern choices carry no outcome — the source simply does not record one.
 */
export function parseTavernTitle(title, isQuestionImage = false) {
  const lines = decodeEntities(String(title))
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  if (lines.length === 0) return { narration: '', question: null };
  if (!isQuestionImage || lines.length < 2) {
    return { narration: lines.join(' '), question: null };
  }
  return {
    narration: '',
    question: {
      prompt: lines[0],
      choices: lines.slice(1).map((text, i) => ({ index: i + 1, text, outcome: '' })),
    },
  };
}

const DESC_RE = /<span class="tulajdonsagnev">\s*Le[íi]r[áa]s\s*:?\s*<\/span>\s*([\s\S]*?)(?:<br|<span class="tulajdonsagnev">|<\/p>)/i;
const REWARD_RE = /<span class="tulajdonsagnev">\s*Jutalom\s*:?\s*<\/span>\s*([\s\S]*?)<\/p>/i;

function field(html, re, label, questId) {
  const m = re.exec(html);
  if (!m) throw new Error(`quest ${questId}: missing ${label}`);
  const value = stripTags(m[1]).replace(/[;,\s]+$/, '');
  if (!value) throw new Error(`quest ${questId}: empty ${label}`);
  return value;
}

/**
 * Parse one tavern quest page into a `Quest`.
 *
 * `resolveMonster` maps a sprite base to a monster, injected so this stays
 * pure and the tests need no monsters.json. The same function also backs the
 * `isMonster` predicate `parseTavernImage` uses to find a monster-name prefix
 * in an ambiguous sprite filename — a name it resolves is, definitionally, a
 * monster. `resolveMonster` must be side-effect-free for this to be sound:
 * `parseTavernImage` may call it speculatively on prefixes it ultimately
 * rejects, so any caller collecting "unresolved" bases must do so from the
 * final per-cell result, not from inside `resolveMonster` itself.
 */
export function parseTavernQuestPage(html, { id, title }, resolveMonster) {
  const isMonster = (name) => resolveMonster(name) !== null;
  const clean = stripComments(html);

  const description = field(clean, DESC_RE, 'description', id);
  const reward = field(clean, REWARD_RE, 'reward', id);

  const labStart = clean.indexOf('<div class="lab">');
  if (labStart < 0) throw new Error(`quest ${id}: no maze container`);
  const tableMatch = /<table[^>]*>([\s\S]*?)<\/table>/i.exec(clean.slice(labStart));
  if (!tableMatch) throw new Error(`quest ${id}: no maze table`);

  const rowHtml = [...tableMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1]);
  if (rowHtml.length === 0) throw new Error(`quest ${id}: maze has no rows`);

  const cells = [];
  let cols = 0;
  rowHtml.forEach((row, r) => {
    // Content runs until the next `<td`/`</td` rather than requiring a
    // closing tag, mirroring browser error recovery: the tavern source's
    // `komponens` page (row 0, cell 5) ships an unclosed `<img>` followed by
    // a bare `<td="">`, which a `<\/td>`-anchored lazy match would run past,
    // merging two cells into one and shifting the row's tail one column left.
    // Well-formed rows (every other row in the corpus) already end their
    // content at `</td>`, so this extracts a byte-identical list there.
    const tds = [...row.matchAll(/<td([^>]*)>((?:(?!<\/?td)[\s\S])*)/gi)];
    cols = Math.max(cols, tds.length);
    tds.forEach((td, c) => {
      const classAttr = (/class="([^"]*)"/i.exec(td[1]) ?? [, ''])[1];
      const inner = td[2];
      const src = (/src="([^"]*)"/i.exec(inner) ?? [, ''])[1];
      const rawTitle = (/title="([^"]*)"/i.exec(inner) ?? [, ''])[1];

      let edges;
      try {
        edges = parseTavernEdges(classAttr);
      } catch (err) {
        throw new Error(`quest ${id} cell ${r},${c}: ${err.message}`);
      }

      const facts = parseTavernImage(src, isMonster);
      const parsed = parseTavernTitle(rawTitle, facts.question);

      let monsterId = null;
      let monsterName = null;
      if (facts.base) {
        const hit = resolveMonster(facts.base);
        if (hit) { monsterId = hit.id; monsterName = hit.name; }
        else { monsterName = facts.base; }
      }

      cells.push({
        row: r,
        col: c,
        edges,
        monsterId,
        monsterName,
        boss: facts.boss,
        key: facts.key,
        questItem: facts.questItem,
        portal: facts.portal,
        trap: facts.trap,
        death: facts.death,
        narration: parsed.narration,
        // Tavern titles carry no drops line — the field stays null so the
        // shared QuestCellDetail simply omits that row.
        drops: null,
        hasQuestion: facts.question,
        question: parsed.question,
        rawImage: src,
      });
    });
  });

  if (cells.length === 0) throw new Error(`quest ${id}: maze has no cells`);

  return { id, set: 'tavern', title, description, reward, rows: rowHtml.length, cols, cells };
}
