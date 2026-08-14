#!/usr/bin/env node
/**
 * Crawl the larkinorcenter.hu tavern quest pages into
 * static/db/tavern-quests.json.
 *
 * Run with `npm run scrape:tavern`. Fails loudly rather than degrading: an
 * unknown class token, a missing field, an empty maze or an unresolved sprite
 * aborts before anything is written, so source drift surfaces here rather than
 * as a broken page.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseTavernQuestPage, decodeEntities } from './parseTavernQuest.mjs';

const BASE = 'https://www.larkinorcenter.hu/kocskuld';
const OUT = 'static/db/tavern-quests.json';

/**
 * Sprite basenames the source misspells or mis-encodes, mapped to monster ids.
 * Confirmed against the live pages and reviewed by hand — deliberately an
 * explicit list rather than fuzzy matching, which at edit-distance 1 would
 * also silently pair unrelated monsters.
 */
const SPRITE_ALIASES = {
  'fureszfogu_%2520posvanyalligator': 65,
  orult_banyasztorp: 26,
  skivei_orvgyilkos: 151,
  nyamvadt_varazlotanonc: 12,
  unikornis: 83,
  donna_brutalisa: 56,
  minus: 132,
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
  const base = m.image.replace(/^.*\//, '').replace(/\.[a-z]+$/i, '');
  if (base && !byBase.has(base)) byBase.set(base, m);
  const name = fold(m.name);
  // First wins: monsters.json carries `*`-prefixed elite duplicates that fold
  // onto the same key as their base entry, and the base entry has the lower id.
  if (name && !byName.has(name)) byName.set(name, m);
}

/**
 * Resolve a sprite base: exact image basename, then accent-folded monster
 * name, then the alias list. Name matching is unambiguous here — the 1575
 * monsters fold to 1127 distinct keys and none maps to two different sprites.
 *
 * Deliberately side-effect-free: `parseTavernQuestPage` also uses this (via
 * an `isMonster` predicate built from it) to test candidate name prefixes it
 * ultimately rejects, so tracking "unresolved" bases from inside here would
 * wrongly record every rejected prefix, not just the sprite actually chosen.
 * "Unresolved" is instead read back off the finished cells below.
 */
function resolveMonster(base) {
  const hit = byBase.get(base)
    ?? byBase.get(`${base}_k`)
    ?? byName.get(fold(base))
    ?? byId.get(SPRITE_ALIASES[base]);
  return hit ? { id: hit.id, name: hit.name } : null;
}

const index = await fetch(`${BASE}/index.html`);
if (!index.ok) throw new Error(`index: HTTP ${index.status}`);
const links = [...(await index.text()).matchAll(/<a class="keret" href="([^"]+)">([^<]+)<\/a>/g)]
  .map((m) => ({
    href: m[1],
    // The slug is the filename without its extension: stable, unlike the
    // title, which carries accents and the source's own typos.
    id: m[1].replace(/^.*\//, '').replace(/\.html?$/i, ''),
    title: decodeEntities(m[2]).trim(),
  }));
if (links.length === 0) throw new Error('index: no quest links found');

const quests = [];
for (const link of links) {
  const res = await fetch(`${BASE}/${link.href}`);
  if (!res.ok) throw new Error(`quest ${link.id}: HTTP ${res.status}`);
  const quest = parseTavernQuestPage(await res.text(), link, resolveMonster);
  quests.push(quest);
  process.stdout.write(`${link.id}: ${quest.rows}x${quest.cols}, ${quest.cells.length} cells\n`);
}

const cells = quests.flatMap((q) => q.cells);

// A cell with monsterName set but monsterId null is exactly one whose base
// resolveMonster rejected when parseTavernQuestPage made its final call —
// see resolveMonster's comment on why this is checked here, not inside it.
const unresolved = new Set(
  cells.filter((c) => c.monsterName && c.monsterId == null).map((c) => c.monsterName),
);
if (unresolved.size > 0) {
  throw new Error(`unresolved sprite bases: ${[...unresolved].sort().join(', ')}`);
}

const questionCells = cells.filter((c) => c.hasQuestion).length;
const parsed = cells.filter((c) => c.question).length;
process.stdout.write(
  `\n${quests.length} quests, ${cells.length} cells, ` +
  `${questionCells} question tiles, ${parsed} with parsed options\n`,
);

writeFileSync(OUT, `${JSON.stringify(quests, null, 0)}\n`, 'utf-8');
process.stdout.write(`wrote ${OUT}\n`);
