/**
 * Pure parsing functions for the royal quests 46–63, recovered from the
 * Internet Archive's copies of lc.kew1n.hu (`/kuldik/<n>/<n>.htm`, snapshots
 * 2004–2007). larkinorcenter.hu only ever published 1–45.
 *
 * A third source with a third grammar, so a module of its own like
 * parseTavernQuest.mjs. What it shares with the other two is only the output
 * shape. Facts about the pages, each measured across all 18 of them:
 *
 * - **Walls and doors are inline borders**, not classes. Every `<td>` draws its
 *   own four sides with `border-<side>-style` / `-color` (or the `border-style`
 *   / `border-color` shorthands): `none` or no style at all is open, black is a
 *   wall, any other colour is a door. Neighbours draw a shared side on both
 *   cells in 3612 of 3700 pairs; the rest are rim walls facing blank canvas.
 * - **A dotted side faces a solid door of the same colour** on the neighbour,
 *   every time (103 pairs, never in black). It is the far side of a one-sided
 *   door — the side the game draws as a plain corridor — so it parses as open.
 * - **Every author used their own palette.** The legend on quest 49's page
 *   (red = réz, lime = platina, blue = vas, …) holds from 49 on, but in 46 red
 *   is tolvaj and green réz, and in 47 red is bronz. What does hold everywhere
 *   is the cell label: `Jobbra tolvajajtó`, `Északra és délre platinaajtó`. So
 *   each quest's palette is voted from its own labels, side by side, with the
 *   legend only filling in a colour no label names (see `buildPalette`).
 * - **Text lives in three places.** `na_alert('…')` on the cell's link is the
 *   game's own narration, with question choices as `---> text (outcome)` lines.
 *   The image's `alt` (46–58) or `title` (59–63) is the site author's label: the
 *   monster's name followed by markers — `Csőkulcs`, `Külditárgy`, `Kijárat`,
 *   `Csapda` — and door notes. Labels decide markers; only `na_alert` is
 *   narration, because the quest tab matches narration against what the game
 *   prints.
 * - **Sprites are named after the monster**, accent-free and run together
 *   (`reszegmatroz.gif`, `800evesvampir.gif`), with a key cell spelled
 *   `<monster>_<lock>.jpg`.
 * - **Quest 59 is four mazes on one page** — Földszint and three cellar floors —
 *   one table each. Each becomes its own `Quest` carrying a `floor` label; the
 *   ground floor keeps the plain id, so the game's `Aktuális küldetés: (59)`
 *   still lands on it.
 * - No page declares a charset; the bytes are Windows-1250 (0x96 is an en dash,
 *   0xF5 is ő). Several pages also spell ő/ű as `&otilde;`/`&ucirc;` — the
 *   Latin-1 mojibake CLAUDE.md warns about — which `decodeText` folds back.
 */

/** Lock names, in the order the rest of the data uses. */
export const ARCHIVE_LOCKS = ['vas', 'rez', 'bronz', 'ezust', 'arany', 'platina', 'tolvaj', 'cso', 'varazs'];

/**
 * Quest 49's printed legend ("Kulcs színkódok"), plus the shades its authors
 * reached for instead (both greys are ezüst on every page that labels them).
 * Only a fallback: a quest's own labels outvote it — see `buildPalette`.
 */
export const LEGEND_PALETTE = {
  red: 'rez',
  lime: 'platina',
  blue: 'vas',
  yellow: 'arany',
  aqua: 'tolvaj',
  fuchsia: 'cso',
  'rgb(255,153,0)': 'bronz',
  'rgb(255,102,0)': 'bronz',
  'rgb(153,153,153)': 'ezust',
  'rgb(204,204,204)': 'ezust',
  'rgb(102,153,0)': 'varazs',
};

/**
 * Border colours that draw a wall. `rgb(51,51,51)` is near-black, drawn on
 * seven sides whose labels name no door at all.
 */
const WALL_COLOURS = new Set(['black', 'rgb(51,51,51)', 'rgb(0,0,0)', '#000000']);

const NAMED_ENTITIES = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", copy: '©',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  ouml: 'ö', uuml: 'ü', Ouml: 'Ö', Uuml: 'Ü', auml: 'ä', Auml: 'Ä',
  otilde: 'ő', Otilde: 'Ő', ucirc: 'ű', Ucirc: 'Ű',
};

/** Latin-1 lookalikes the pages print in place of ő/ű. */
const MOJIBAKE = { 'õ': 'ő', 'Õ': 'Ő', 'û': 'ű', 'Û': 'Ű' };

/** Decode a page's bytes. Windows-1250, since no page declares otherwise. */
export function decodePage(bytes) {
  return new TextDecoder('windows-1250').decode(bytes);
}

/** Resolve entities and fold the õ/û mojibake back to ő/ű. */
export function decodeText(text) {
  return String(text)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name] ?? m)
    .replace(/[õÕûÛ]/g, (ch) => MOJIBAKE[ch]);
}

/** Accent-folded, lower-case. */
function fold(text) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function textOf(html) {
  return decodeText(html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ' '))
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
}

/** Undo the JavaScript string escapes inside `na_alert('…')`. */
function unescapeJs(text) {
  return text.replace(/\\(.)/g, (_, ch) => (ch === 'n' ? '\n' : ch === 't' ? ' ' : ch));
}

// --- Tables -----------------------------------------------------------------

/**
 * The maze tables of a page, in document order: innermost tables (several
 * pages wrap the maze in a layout table) that draw cell borders. Legend tables
 * — key colours, teleport numbers — carry no border styles and drop out.
 */
export function mazeTables(html) {
  const lower = html.toLowerCase();
  const tables = [];
  let at = lower.indexOf('<table');
  while (at !== -1) {
    const end = lower.indexOf('</table>', at);
    const nested = lower.indexOf('<table', at + 6);
    if (nested !== -1 && nested < end) { at = nested; continue; }
    const chunk = html.slice(at, end);
    if (/border-(?:top|right|bottom|left)-style/i.test(chunk) && /_elemei\//i.test(chunk)) {
      tables.push({ html: chunk, start: at });
    }
    at = lower.indexOf('<table', end);
  }
  return tables;
}

// --- Edges ------------------------------------------------------------------

const CSS_SIDE = { N: 'top', E: 'right', S: 'bottom', W: 'left' };

function cssValue(style, re) {
  const m = re.exec(style);
  return m ? m[1].replace(/\s+/g, '').toLowerCase() : null;
}

/** One side as the page drew it: `{ style, colour }`. */
export function readSide(style, side) {
  const name = CSS_SIDE[side];
  const lineStyle = cssValue(style, new RegExp(`border-${name}-style:\\s*([a-z]+)`, 'i'))
    ?? cssValue(style, /border-style:\s*([a-z]+)/i)
    ?? 'none';
  const colour = cssValue(style, new RegExp(`border-${name}-color:\\s*([^;"]+)`, 'i'))
    ?? cssValue(style, /border-color:\s*([^;"]+)/i)
    ?? 'black';
  return { style: lineStyle, colour };
}

function isDoorSide({ style, colour }) {
  return style === 'solid' && !WALL_COLOURS.has(colour);
}

function toEdge(drawn, palette, where) {
  if (drawn.style === 'none' || drawn.style === 'dotted') return { kind: 'open' };
  if (!isDoorSide(drawn)) return { kind: 'wall' };
  const lock = palette[drawn.colour];
  if (!lock) throw new Error(`${where}: no lock for door colour ${drawn.colour}`);
  return { kind: 'door', lock };
}

// --- Labels -----------------------------------------------------------------

const DIRECTION = {
  eszakra: 'N', eszak: 'N', eszaki: 'N', fel: 'N',
  delre: 'S', del: 'S', deli: 'S', le: 'S',
  jobbra: 'E', keletre: 'E', kelet: 'E', keleti: 'E',
  balra: 'W', nyugatra: 'W', nyugat: 'W', nyugati: 'W',
};

/** Lock spellings in labels, including the set's two typos (49 `brnnt`, 58 `araby`). */
const LOCK_WORD = {
  vas: 'vas', rez: 'rez', bronz: 'bronz', brnnt: 'bronz', ezust: 'ezust', arany: 'arany', araby: 'arany',
  platina: 'platina', tolvaj: 'tolvaj', cso: 'cso', varazs: 'varazs',
};

/**
 * Doors a label names, by side: `Északra és jobbra aranyajtó` → N and E arany.
 * Directions accumulate until a `<lock>ajtó` word claims them; any other word
 * but `és` drops them, so a direction in prose cannot attach to a later door.
 */
export function labelledDoors(label) {
  const doors = {};
  let pending = [];
  for (const raw of fold(label).match(/[a-z]+/g) ?? []) {
    if (raw in DIRECTION) { pending.push(DIRECTION[raw]); continue; }
    const door = /^([a-z]+?)ajto$/.exec(raw);
    if (door && door[1] in LOCK_WORD) {
      for (const side of pending) doors[side] = LOCK_WORD[door[1]];
      pending = [];
      continue;
    }
    if (raw !== 'es' && raw !== 's') pending = [];
  }
  return doors;
}

/**
 * Door colour → lock for one quest: for every door side whose own cell label
 * names the lock on that side, a vote; most votes wins. A colour no label
 * names falls back to the legend.
 */
export function buildPalette(rawCells) {
  const votes = new Map();
  for (const cell of rawCells) {
    const named = labelledDoors(cell.label);
    for (const side of Object.keys(CSS_SIDE)) {
      const drawn = cell.sides[side];
      const lock = named[side];
      if (!isDoorSide(drawn) || !lock) continue;
      const tally = votes.get(drawn.colour) ?? new Map();
      tally.set(lock, (tally.get(lock) ?? 0) + 1);
      votes.set(drawn.colour, tally);
    }
  }
  const palette = { ...LEGEND_PALETTE };
  for (const [colour, tally] of votes) {
    palette[colour] = [...tally].sort((a, b) => b[1] - a[1])[0][0];
  }
  return palette;
}

// --- Images and markers -----------------------------------------------------

/** Image bases that are scenery or markers, never a creature. */
const SCENERY = /^(ures|nop|black|bejarat|kijarat|kerdes(_small\d*)?(_halal)?|elevator|lift|tp|labi\w*|csapda)$/;

/** Items the mazes picture as a pickup: spell scrolls and books. */
const PICKUP = /magia(tekercse|konyve)$/;

/**
 * Decompose a cell image: the sprite base, plus whatever markers its name
 * carries. A key is `<monster>_<lock>`; a question tile is `kerdes_small…`,
 * possibly with a key after it (`kerdes_small1_platina`).
 */
export function parseArchiveImage(src) {
  const facts = { base: null, key: null, question: false, death: false, entrance: false, elevator: false };
  const raw = String(src ?? '').replace(/^.*\//, '').replace(/\.(gif|jpe?g|png)$/i, '').toLowerCase();
  if (!raw) return facts;

  const tokens = raw.split('_');
  const kept = [];
  for (const token of tokens) {
    if (ARCHIVE_LOCKS.includes(token) || token === 'brnnt') { facts.key = LOCK_WORD[token]; continue; }
    if (token === 'kerdes') { facts.question = true; continue; }
    if (token === 'halal') { facts.death = true; continue; }
    // `bukottangyal_ketto` ("two"), `dombmelak_kulcsok` ("keys"): a cell giving
    // several keys. Which ones only the label says.
    if (token === 'ketto' || token === 'kulcsok') continue;
    kept.push(token);
  }
  const base = kept.join('_').replace(/_k$/, '');
  if (facts.question && /^small\d*$|^$/.test(base)) return facts;
  if (base === 'bejarat') { facts.entrance = true; return facts; }
  if (base === 'elevator' || base === 'lift') { facts.elevator = true; return facts; }
  if (SCENERY.test(base) || /^tp_\d+$/.test(raw) || PICKUP.test(base)) return facts;
  facts.base = base;
  return facts;
}

/**
 * Every key a label names, in order: `vaskulcs rézkulcs` → vas, réz.
 *
 * A `<lock>kulcs` straight after a direction is a door the author misspelt —
 * quest 60's `keletre és délre csőkulcs` beside `északra aranyajtó` — and is
 * skipped rather than read as a key the cell gives.
 */
export function labelledKeys(label) {
  const keys = [];
  let afterDirection = false;
  for (const word of fold(label).match(/[a-z]+/g) ?? []) {
    const key = /^([a-z]+?)kulcs$/.exec(word);
    if (key && key[1] in LOCK_WORD && !afterDirection) {
      const lock = LOCK_WORD[key[1]];
      if (!keys.includes(lock)) keys.push(lock);
    }
    if (word in DIRECTION) afterDirection = true;
    else if (word !== 'es' && word !== 's') afterDirection = false;
  }
  return keys;
}

/** Markers the author's label states. */
export function labelMarkers(label) {
  const folded = fold(label);
  return {
    keys: labelledKeys(label),
    questItem: /\bkulditargy/.test(folded),
    exit: /\bkijarat/.test(folded),
    entrance: /\bbejarat/.test(folded),
    trap: /\bcsapda/.test(folded),
    question: /\bkerdes/.test(folded),
  };
}

// --- Narration and questions ------------------------------------------------

const CHOICE_LINE = /^-{2,3}\s*\\?>\s*/;

/**
 * Split one choice into its text and outcome. The outcome is the last
 * parenthesised group, plus anything after it (`(Ez a jó) teleport_6`).
 */
function splitChoice(line) {
  const close = line.lastIndexOf(')');
  if (close === -1) return { text: line.trim(), outcome: '' };
  let depth = 0;
  for (let i = close; i >= 0; i -= 1) {
    if (line[i] === ')') depth += 1;
    else if (line[i] === '(') depth -= 1;
    if (depth === 0) {
      const text = line.slice(0, i).trim();
      if (!text) break;
      return { text, outcome: `${line.slice(i + 1, close)}${line.slice(close + 1)}`.replace(/\s+/g, ' ').trim() };
    }
  }
  return { text: line.trim(), outcome: '' };
}

/**
 * Narration and question from a cell's `na_alert` text. Lines from the first
 * `--->` on are choices, each running on until the next one or a blank line;
 * anything after a blank line past the choices is the author's door note and
 * is dropped. The question's prompt is the narration's closing question
 * sentence, when it ends on one.
 */
export function parseAlert(alert) {
  const lines = decodeText(alert).split('\n').map((l) => l.replace(/\s+/g, ' ').trim());
  const first = lines.findIndex((l) => CHOICE_LINE.test(l));
  // One line, like the other two sources: the tab matches a cell's text against
  // single lines the game prints, so a cell kept multi-line could not even find
  // itself.
  const prose = (first === -1 ? lines : lines.slice(0, first)).filter(Boolean).join(' ');
  if (first === -1) return { narration: prose, question: null };

  const choices = [];
  for (let i = first; i < lines.length; i += 1) {
    const line = lines[i];
    if (CHOICE_LINE.test(line)) { choices.push(line.replace(CHOICE_LINE, '')); continue; }
    if (!line) break;
    choices[choices.length - 1] += ` ${line}`;
  }

  const sentences = prose.split(/(?<=[.!?…])\s+/);
  const last = sentences[sentences.length - 1] ?? '';
  const prompt = sentences.length > 1 && last.endsWith('?') ? last : '';
  const narration = prompt ? prose.slice(0, prose.length - last.length).trim() : prose;

  return {
    narration,
    question: {
      prompt,
      choices: choices.map((line, i) => ({ index: i + 1, ...splitChoice(line) })),
    },
  };
}

// --- Page -------------------------------------------------------------------

/**
 * An attribute's value, quoted or not: the MSHTML-saved pages (55–58) write
 * `alt=Vámpírlord` bare.
 */
function attr(tag, name) {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return m ? (m[1] ?? m[2] ?? m[3]) : '';
}

/** One `<td>` as raw facts: drawn sides, image, label, alert text. */
function readCell(tdAttrs, inner) {
  const style = attr(` ${tdAttrs}`, 'style');
  const sides = {};
  for (const side of Object.keys(CSS_SIDE)) sides[side] = readSide(style, side);
  const img = (/<img\b[^>]*>/i.exec(inner) ?? [''])[0];
  const src = attr(img, 'src');
  const alt = attr(img, 'alt');
  const title = attr(img, 'title');
  const alert = (/na_alert\('((?:[^'\\]|\\.)*)'\)/s.exec(inner) ?? [, ''])[1];
  return {
    sides,
    src,
    label: decodeText(`${alt} ${title}`).replace(/\s+/g, ' ').trim(),
    alert: unescapeJs(alert),
  };
}

function readGrid(tableHtml) {
  const rows = [...tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)(?=<tr\b|$)/gi)]
    .map((m) => [...m[1].matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)].map((td) => readCell(td[1], td[2])))
    .filter((row) => row.length > 0);
  return rows;
}

const HEADER_RE = /A\s+munka,\s+amit\s+v[aá]llalhatsz,\s+a\s+k[oö]vetkez[oőõ]:?\s*\(\d+\)/i;
const NOTE_RE = /\b(FIGYELEM|FONTOS|Köszönet|Földszint)\b/;

/** Description and reward, from the text above the first maze. */
function readBrief(html, firstTable, id) {
  const head = html.slice(0, firstTable)
    .replace(/<head[\s\S]*?<\/head>/i, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '');
  // `&nbsp;` runs separate reward items; keep them distinguishable from spaces.
  const text = textOf(head.replace(/(?:&nbsp;\s*){2,}/gi, ' ¦ '));
  const body = text.replace(HEADER_RE, '').trim();

  // The reward is the run of `<n> <item>` entries after the description.
  const rewardMatch = /(?:Jutalmad\s+)?(\d[\d\s]*\s+[^\d¦\n]+?(?:\s*¦\s*\d[\d\s]*\s+[^\d¦\n]+?)*)\s*(?:¦|$|\n|FIGYELEM|FONTOS|Köszönet|Földszint)/g;
  let reward = '';
  let rewardAt = body.length;
  for (const m of body.matchAll(rewardMatch)) {
    if (!m[1].includes('¦') && !/\b(ezüst|kincs|manógomba)\b/.test(m[1])) continue;
    reward = m[1].split('¦').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean).join(', ');
    rewardAt = m.index;
    break;
  }
  const description = body.slice(0, rewardAt).split(NOTE_RE)[0].replace(/\s+/g, ' ').replace(/\s*(Jutalmad|Jutalmul)?\s*$/, '').trim();
  if (!description) throw new Error(`quest ${id}: empty description`);
  if (!reward) throw new Error(`quest ${id}: no reward found`);
  return { description, reward };
}

/** Floor label printed just above a maze table on a multi-floor page. */
function floorLabel(html, tableStart) {
  const before = textOf(html.slice(Math.max(0, tableStart - 400), tableStart));
  const m = /(Földszint|-\s*\d+\.\s*szint)\s*$/i.exec(before);
  if (!m) return null;
  return /Földszint/i.test(m[1]) ? 'F' : `−${/\d+/.exec(m[1])[0]}`;
}

/**
 * `key`, plus `extraKeys` for a cell that gives more than one (six do, e.g.
 * quest 57's Csontváz). The image's own key leads when it has one.
 */
function keyFields(imageKey, labelKeys) {
  const keys = imageKey ? [imageKey, ...labelKeys.filter((k) => k !== imageKey)] : labelKeys;
  if (keys.length === 0) return { key: null };
  return keys.length === 1 ? { key: keys[0] } : { key: keys[0], extraKeys: keys.slice(1) };
}

/**
 * Parse one archived quest page into one `Quest` per maze on it (one, except
 * quest 59's four floors). `resolveMonster` maps a sprite base to a monster or
 * null, injected so this stays pure.
 */
export function parseArchiveQuestPage(html, id, resolveMonster) {
  const tables = mazeTables(html);
  if (tables.length === 0) throw new Error(`quest ${id}: no maze table`);
  const { description, reward } = readBrief(html, tables[0].start, id);
  const multiFloor = tables.length > 1;

  return tables.map((table, index) => {
    const floor = multiFloor ? floorLabel(html, table.start) : null;
    if (multiFloor && !floor) throw new Error(`quest ${id}: maze ${index} has no floor label`);
    const questId = floor && floor !== 'F' ? `${id}${floor.replace('−', '-')}` : String(id);

    const grid = readGrid(table.html);
    if (grid.length === 0) throw new Error(`quest ${questId}: maze has no rows`);
    const palette = buildPalette(grid.flat());
    const cols = Math.max(...grid.map((row) => row.length));

    const cells = grid.flatMap((row, r) => row.map((raw, c) => {
      const where = `quest ${questId} cell ${r},${c}`;
      const edges = {};
      for (const side of Object.keys(CSS_SIDE)) edges[side] = toEdge(raw.sides[side], palette, where);

      const image = parseArchiveImage(raw.src);
      const marks = labelMarkers(raw.label);
      const { narration, question } = parseAlert(raw.alert);

      let monsterId = null;
      let monsterName = null;
      if (image.base) {
        const hit = resolveMonster(image.base, raw.label);
        if (hit) { monsterId = hit.id; monsterName = hit.name; } else { monsterName = image.base; }
      }

      const entrance = image.entrance || marks.entrance;
      return {
        row: r,
        col: c,
        edges,
        monsterId,
        monsterName,
        boss: false,
        ...keyFields(image.key, marks.keys),
        questItem: marks.questItem,
        portal: entrance ? 'entrance' : marks.exit ? 'exit' : null,
        trap: marks.trap,
        death: image.death,
        narration,
        drops: null,
        hasQuestion: image.question || marks.question || question !== null,
        question,
        rawImage: raw.src.replace(/^.*\//, ''),
      };
    }));

    const quest = { id: questId, set: 'royal', title: String(id), description, reward, rows: grid.length, cols, cells };
    return floor ? { ...quest, floor } : quest;
  });
}
