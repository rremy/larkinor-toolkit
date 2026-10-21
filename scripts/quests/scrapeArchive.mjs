#!/usr/bin/env node
/**
 * Parse the archived royal quest pages 46–63 into static/db/quests.json,
 * after the 45 quests scrape.mjs writes.
 *
 * Run with `npm run scrape:archive`. Reads the snapshots committed under
 * scripts/quests/archive/ rather than the Internet Archive itself: the
 * archive is slow and drops connections, and the pages will never change.
 * `--fetch` downloads them again first, from the snapshot URLs below.
 *
 * Replaces only the quests it parses, so it can run after scrape.mjs (which
 * rewrites the whole file with 1–45) or on its own. Fails loudly, like the
 * other two scrapers: an unresolved sprite, an unknown door colour or a page
 * that no longer parses aborts before anything is written.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { decodePage, parseArchiveQuestPage } from './parseArchiveQuest.mjs';

const OUT = 'static/db/quests.json';
const DIR = 'scripts/quests/archive';

/** The snapshot each page was taken from. */
const SNAPSHOTS = {
  46: '20071214141948', 47: '20071121002919', 48: '20071121002933', 49: '20041217015350',
  50: '20071009231607', 51: '20071120072857', 52: '20071201115141', 53: '20071123083938',
  54: '20071214141958', 55: '20070918115913', 56: '20071123083943', 57: '20041220115528',
  58: '20071214142005', 59: '20071214142012', 60: '20071006003530', 61: '20071123083948',
  62: '20071123083954', 63: '20071123083958',
};

const snapshotUrl = (n) =>
  `http://web.archive.org/web/${SNAPSHOTS[n]}id_/http://lc.kew1n.hu:80/kuldik/${n}/${n}.htm`;

/**
 * Sprite bases the pages misspell beyond what name folding recovers, mapped to
 * monster ids by hand from the cell's own label. An explicit list, never fuzzy
 * matching, for the reason scrapeTavern.mjs gives.
 */
const SPRITE_ALIASES = {
  // Vámpírlord, missing its first p. Every labelled cell using this sprite —
  // across quests 47 and 55–59 — names it; one cell in 56 carries no label.
  vamirlord: 308,
};

const monsters = JSON.parse(readFileSync('static/db/monsters.json', 'utf-8'));

/** Accent-folded, punctuation-free key for name matching. */
function fold(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

const byId = new Map(monsters.map((m) => [m.id, m]));
const byBase = new Map();
const byName = new Map();
for (const m of monsters) {
  const base = m.image.replace(/^.*\//, '').replace(/\.[a-z]+$/i, '').toLowerCase();
  if (base && !byBase.has(base)) byBase.set(base, m);
  // First wins: the `*` elite duplicates fold onto their base entry's key and
  // come later in the file — see scrape.mjs.
  const name = fold(m.name);
  if (name && !byName.has(name)) byName.set(name, m);
}

/**
 * The longest run of the label's leading words that names a monster. The
 * label opens with the creature's display name (`Óriásharcos Csőkulcs Jobbra
 * rézajtó`), which survives a sprite filename the author misspelled.
 */
function nameFromLabel(label) {
  const words = label.split(/\s+/).filter(Boolean);
  for (let n = Math.min(words.length, 6); n >= 1; n -= 1) {
    const hit = byName.get(fold(words.slice(0, n).join(' ')));
    if (hit) return hit;
  }
  return null;
}

function resolveMonster(base, label) {
  const hit = byBase.get(base)
    ?? byBase.get(`${base}_k`)
    ?? byName.get(fold(base))
    ?? byId.get(SPRITE_ALIASES[base])
    ?? nameFromLabel(label);
  return hit ? { id: hit.id, name: hit.name } : null;
}

if (process.argv.includes('--fetch')) {
  for (const n of Object.keys(SNAPSHOTS)) {
    const res = await fetch(snapshotUrl(n));
    if (!res.ok) throw new Error(`quest ${n}: HTTP ${res.status}`);
    writeFileSync(`${DIR}/${n}.htm`, Buffer.from(await res.arrayBuffer()));
    process.stdout.write(`fetched ${n}\n`);
  }
}

const parsed = [];
for (const n of Object.keys(SNAPSHOTS)) {
  const html = decodePage(readFileSync(`${DIR}/${n}.htm`));
  for (const quest of parseArchiveQuestPage(html, Number(n), resolveMonster)) {
    parsed.push(quest);
    const floor = quest.floor ? ` (${quest.floor})` : '';
    process.stdout.write(`quest ${quest.id}${floor}: ${quest.rows}x${quest.cols}, ${quest.cells.length} cells\n`);
  }
}

const cells = parsed.flatMap((q) => q.cells);
const unresolved = new Set(
  cells.filter((c) => c.monsterName && c.monsterId == null).map((c) => c.monsterName),
);
if (unresolved.size > 0) {
  throw new Error(`unresolved sprite bases: ${[...unresolved].sort().join(', ')}`);
}

const ids = new Set(parsed.map((q) => q.id));
const kept = JSON.parse(readFileSync(OUT, 'utf-8')).filter((q) => !ids.has(q.id));
const quests = [...kept, ...parsed];

process.stdout.write(
  `\n${parsed.length} mazes from ${Object.keys(SNAPSHOTS).length} pages, ${cells.length} cells, ` +
  `${cells.filter((c) => c.question).length} questions parsed; ${quests.length} royal quests in all\n`,
);

writeFileSync(OUT, `${JSON.stringify(quests, null, 0)}\n`, 'utf-8');
process.stdout.write(`wrote ${OUT}\n`);
