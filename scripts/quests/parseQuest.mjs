/**
 * Pure parsing functions for the larkinorcenter.hu royal quest pages.
 *
 * No I/O lives here on purpose: `scrape.mjs` does the fetching and writing, so
 * everything below is directly unit-testable against saved fixtures.
 */

/** Lock suffixes a door class or key filename can carry. */
export const LOCK_SUFFIXES = ['vas', 'rez', 'bronz', 'ezust', 'arany', 'platina', 'tolvaj', 'cso'];

/** Source side prefix → compass direction. */
export const SIDE_BY_PREFIX = { f: 'N', j: 'E', a: 'S', b: 'W' };

/**
 * Malformed class tokens present in the source that are known and harmless.
 * Anything outside this set throws, so genuine drift cannot pass silently.
 */
export const TOLERATED_TOKENS = new Set(['_cso']);

const ENTITIES = {
  '&nbsp;': ' ', '&amp;': '&', '&lt;': '<',
  '&gt;': '>', '&quot;': '"', '&#39;': "'",
};

export function decodeEntities(text) {
  return text.replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/g, (m) => ENTITIES[m]);
}

export function stripTags(html) {
  return decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/**
 * Remove HTML comments. Must run before any cell parsing: quest 45 ships a
 * commented-out template row that otherwise parses as eight phantom cells.
 */
export function stripComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, '');
}

const SIDE_TOKEN = /^([fjab])(?:_([a-z]+))?$/;

/** Parse a `<td>` class attribute into the cell's four edges. */
export function parseEdges(classAttr) {
  const edges = {
    N: { kind: 'open' }, E: { kind: 'open' },
    S: { kind: 'open' }, W: { kind: 'open' },
  };
  for (const token of String(classAttr).trim().split(/\s+/)) {
    if (!token) continue;
    if (TOLERATED_TOKENS.has(token)) continue;
    const m = SIDE_TOKEN.exec(token);
    if (!m) throw new Error(`unrecognised edge class token "${token}"`);
    const side = SIDE_BY_PREFIX[m[1]];
    const suffix = m[2];
    if (!suffix) { edges[side] = { kind: 'wall' }; continue; }
    if (suffix === 'szel') { edges[side] = { kind: 'szel' }; continue; }
    if (LOCK_SUFFIXES.includes(suffix)) { edges[side] = { kind: 'door', lock: suffix }; continue; }
    throw new Error(`unrecognised edge class token "${token}"`);
  }
  return edges;
}

const KEY_SUFFIX = new RegExp(`_(${LOCK_SUFFIXES.join('|')})kulcs$`);
const EXIT_SUFFIX = /_labikibe(?:_j)?$/;

/**
 * Decompose a cell image filename.
 *
 * Suffixes interleave in the source (`kereskedo_tolvajkulcs_kt_labikibe.jpg`),
 * so the strip order is fixed: exit, quest item, key, question. Emptiness is
 * decided only after stripping, because `nop_labikibe.jpg` is an exit standing
 * on an otherwise empty cell.
 */
export function parseImage(src) {
  const facts = {
    base: null, key: null, questItem: false, portal: null,
    trap: false, death: false, boss: false, question: false, empty: false,
  };

  let rest = String(src).replace(/^.*\//, '').replace(/\.(gif|jpe?g|png)$/i, '');
  if (!rest) { facts.empty = true; return facts; }

  if (EXIT_SUFFIX.test(rest)) { facts.portal = 'exit'; rest = rest.replace(EXIT_SUFFIX, ''); }
  if (/_kt$/.test(rest)) { facts.questItem = true; rest = rest.replace(/_kt$/, ''); }

  const keyMatch = KEY_SUFFIX.exec(rest);
  if (keyMatch) { facts.key = keyMatch[1]; rest = rest.replace(KEY_SUFFIX, ''); }

  // `tolvajkepzoboss_kerdes` is a question drawn over a boss sprite.
  if (/_kerdes$/.test(rest)) { facts.question = true; rest = rest.replace(/_kerdes$/, ''); }

  if (rest === 'kerdes') { facts.question = true; facts.empty = true; return facts; }
  if (rest === 'csapda') { facts.trap = true; facts.empty = true; return facts; }
  if (rest === 'halal') { facts.death = true; facts.empty = true; return facts; }
  if (rest === 'bejarat') { facts.portal = 'entrance'; facts.empty = true; return facts; }
  if (rest === 'nop' || rest === '') { facts.empty = true; return facts; }

  facts.base = rest;
  facts.boss = /boss$/.test(rest);
  return facts;
}
