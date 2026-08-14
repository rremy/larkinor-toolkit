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

/** Parse a `<td>` class attribute into the cell's four edges. */
export function parseTavernEdges(classAttr) {
  const edges = {
    N: { kind: 'open' }, E: { kind: 'open' },
    S: { kind: 'open' }, W: { kind: 'open' },
  };
  for (const raw of String(classAttr).trim().split(/\s+/)) {
    if (!raw) continue;
    const token = raw.toLowerCase();
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

/**
 * Decompose a cell image filename.
 *
 * Token-based rather than an ordered suffix peel, because the source writes
 * markers on either side of the sprite name (`kerdes_platina` and
 * `labikibe_kerdes` both occur). Every recognised token is consumed wherever
 * it sits; whatever is left rejoins to form the sprite base.
 */
export function parseTavernImage(src) {
  const facts = {
    base: null, key: null, questItem: false, portal: null,
    trap: false, death: false, boss: false, question: false, empty: false,
  };

  const raw = String(src).replace(/^.*\//, '').replace(/\.(gif|jpe?g|png)$/i, '');
  if (!raw) { facts.empty = true; return facts; }

  const rest = [];
  for (const token of raw.split('_')) {
    const t = token.toLowerCase();
    if (LOCK_SUFFIXES.includes(t)) { facts.key = t; continue; }
    if (ITEM_TOKENS.has(t)) { facts.questItem = true; continue; }
    if (PORTAL_TOKENS.has(t)) { facts.portal = 'exit'; continue; }
    if (t === 'kerdes') { facts.question = true; continue; }
    if (t === 'csapda') { facts.trap = true; continue; }
    if (t === 'halal') { facts.death = true; continue; }
    if (t === 'bejarat') { facts.portal = facts.portal ?? 'entrance'; continue; }
    rest.push(token);
  }

  const base = rest.join('_');
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
 * pure and the tests need no monsters.json.
 */
export function parseTavernQuestPage(html, { id, title }, resolveMonster) {
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
    const tds = [...row.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/gi)];
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

      const facts = parseTavernImage(src);
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
