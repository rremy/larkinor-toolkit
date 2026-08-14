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
