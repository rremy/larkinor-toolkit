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

const QUESTION_RE = /K[ÉE]RD[ÉE]S\s*:?\s*([\s\S]*?)\s*V[ÁA]LASZ(?:OK)?\s*:?\s*([\s\S]*)$/i;
/**
 * Fallback for titles that jump straight to the answers with no `KÉRDÉS:`
 * token. The source frequently poses the question in narration prose (e.g.
 * `MI A JELSZÓ??!!!!`) and never repeats it after a label — that prose stays
 * in `narration`, already displayed, so there is no prompt to extract here.
 * Anchored on the literal `VÁLASZ`/`VÁLASZOK` token, same as `QUESTION_RE`,
 * so narration that merely contains `(1)` never matches either regex. Only
 * tried on a genuine question-image cell (see `matchQuestion`) — narration
 * elsewhere in the source can legitimately contain the word "válasz".
 */
const ANSWER_ONLY_RE = /V[ÁA]LASZ(?:OK)?\s*:?\s*([\s\S]*)$/i;
const CHOICE_MARKER = /\((\d)\)+\s*/g;
const DROPS_SEPARATOR = ' -- ';
/** A quest drop always reads `<n> db <thing>`. */
const DROP_SHAPE = /^\d+\s*db\s/i;

/** Split one raw answer into its text and its outcome. */
function splitOutcome(index, raw) {
  let text = raw.trim().replace(/[;,.\s]+$/, '');
  let outcome = '';
  let m;
  if ((m = /^([\s\S]*?)\s+--\s+([\s\S]*)$/.exec(text))) {
    text = m[1]; outcome = m[2];
  } else if ((m = /^([\s\S]*?)\s*\(([^()]*)\)\s*$/.exec(text))) {
    text = m[1]; outcome = m[2];
  } else if ((m = /^([\s\S]*?):\s*([\s\S]*)$/.exec(text))) {
    text = m[1]; outcome = m[2];
  }
  return {
    index,
    text: text.trim().replace(/[;,.\s]+$/, ''),
    outcome: outcome.trim().replace(/[;,\s]+$/, ''),
  };
}

/** Split the answer block on its `(n)` markers. */
function parseChoices(raw) {
  const marks = [];
  CHOICE_MARKER.lastIndex = 0;
  let m;
  while ((m = CHOICE_MARKER.exec(raw))) {
    marks.push({ index: Number(m[1]), start: m.index, end: CHOICE_MARKER.lastIndex });
  }
  return marks.map((mark, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].start : raw.length;
    return splitOutcome(mark.index, raw.slice(mark.end, end));
  });
}

/**
 * Locate the question portion of a title, if any.
 *
 * Prefers the `KÉRDÉS: ... VÁLASZ(OK): ...` shape, which yields a prompt —
 * tried unconditionally, since that combination never occurs by accident.
 * Falls back to a bare `VÁLASZ(OK):` token with no prompt when the question
 * itself was only ever posed as narration prose, but only when `isQuestionImage`
 * is true: without a `KÉRDÉS` token to anchor on, "válasz" alone is common
 * enough in ordinary Hungarian prose that it must not be trusted on a cell
 * the source itself doesn't mark as a question. Returns null when neither
 * token applies, so plain narration is never mistaken for a question.
 */
function matchQuestion(text, isQuestionImage) {
  const withPrompt = QUESTION_RE.exec(text);
  if (withPrompt) {
    return { narrationEnd: withPrompt.index, prompt: withPrompt[1].trim(), answersRaw: withPrompt[2] };
  }
  if (isQuestionImage) {
    const answersOnly = ANSWER_ONLY_RE.exec(text);
    if (answersOnly) {
      return { narrationEnd: answersOnly.index, prompt: '', answersRaw: answersOnly[1] };
    }
  }
  return null;
}

/**
 * Decompose a cell `title` into narration, drops and an optional question.
 *
 * The question is extracted first: answers use ` -- ` as their own separator,
 * so splitting on the drops separator first would corrupt every question.
 *
 * `isQuestionImage` (the image-derived fact, see `parseImage`) gates the two
 * relaxations added for task 18 — the `KÉRDÉS`-less fallback above, and
 * accepting a single `(1)` choice below. Both are common on real question
 * tiles but also occur by pure coincidence on non-question cells (e.g. a
 * death tile whose title reads "KÉRDÉS: Mit teszel? VÁLASZ: (1) Lezuhansz --
 * -25000 ÉP" as narrative flourish, not an actual choice point) — measured
 * directly against the live corpus, so the gate is not speculative.
 */
export function parseTitle(title, isQuestionImage = false) {
  const text = decodeEntities(String(title)).replace(/\s+/g, ' ').trim();
  if (!text) return { narration: '', drops: null, question: null };

  const qm = matchQuestion(text, isQuestionImage);
  if (qm) {
    const choices = parseChoices(qm.answersRaw);
    // A single legitimate one-option outcome (e.g. "take the key") is
    // common enough on real question tiles to accept, but — like the
    // KÉRDÉS-less fallback above — only on a cell the image already marks
    // as a question. Zero choices means the answer block itself didn't
    // parse, so fall through to the raw-text case below regardless.
    const minChoices = isQuestionImage ? 1 : 2;
    if (choices.length >= minChoices) {
      const narration = text.slice(0, qm.narrationEnd).trim();
      let drops = null;
      // A quest drop can trail the final answer's outcome.
      const last = choices[choices.length - 1];
      const cut = last.outcome.lastIndexOf(DROPS_SEPARATOR);
      if (cut >= 0) {
        const tail = last.outcome.slice(cut + DROPS_SEPARATOR.length).trim();
        if (DROP_SHAPE.test(tail)) {
          drops = tail;
          last.outcome = last.outcome.slice(0, cut).trim();
        }
      }
      return { narration, drops, question: { prompt: qm.prompt, choices } };
    }
    // Unsplittable answers: keep the raw text rather than invent structure.
    return { narration: text, drops: null, question: null };
  }

  const cut = text.indexOf(DROPS_SEPARATOR);
  if (cut < 0) return { narration: text, drops: null, question: null };
  return {
    narration: text.slice(0, cut).trim(),
    drops: text.slice(cut + DROPS_SEPARATOR.length).trim(),
    question: null,
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
 * Parse one quest page into a `Quest`.
 *
 * `resolveMonster` maps a sprite base to a monster, injected so this stays pure
 * and the tests need no monsters.json.
 */
export function parseQuestPage(html, id, resolveMonster) {
  const clean = stripComments(html);

  const description = field(clean, DESC_RE, 'description', id);
  const reward = field(clean, REWARD_RE, 'reward', id);

  const labStart = clean.indexOf('<div class="lab">');
  if (labStart < 0) throw new Error(`quest ${id}: no maze container`);
  const lab = clean.slice(labStart);

  // Quest 27 ships seven tables: the full maze followed by six per-key views.
  const tableMatch = /<table[^>]*>([\s\S]*?)<\/table>/i.exec(lab);
  if (!tableMatch) throw new Error(`quest ${id}: no maze table`);
  const table = tableMatch[1];

  const rowHtml = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1]);
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
      const title = (/title="([^"]*)"/i.exec(inner) ?? [, ''])[1];

      let edges;
      try {
        edges = parseEdges(classAttr);
      } catch (err) {
        throw new Error(`quest ${id} cell ${r},${c}: ${err.message}`);
      }

      const facts = parseImage(src);
      const parsed = parseTitle(title, facts.question);

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
        drops: parsed.drops,
        // From the image, independent of whether the title parsed — this is
        // the tile's ground truth for "is this a question", so a parse miss
        // can never make the marker disappear (see QuestCell.hasQuestion).
        hasQuestion: facts.question,
        // Null when the title could not be split, even if the image says
        // "question" — the card is never rendered from invented structure.
        question: parsed.question,
        rawImage: src,
      });
    });
  });

  if (cells.length === 0) throw new Error(`quest ${id}: maze has no cells`);

  return { id, description, reward, rows: rowHtml.length, cols, cells };
}
