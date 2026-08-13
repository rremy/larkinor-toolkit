#!/usr/bin/env node
/**
 * Crawl the larkinorcenter.hu royal quest pages into static/db/quests.json.
 *
 * Run with `npm run scrape:quests`. Fails loudly rather than degrading: an
 * unknown class token, a missing field, an empty maze or an unresolved sprite
 * base aborts before anything is written, so source drift surfaces here rather
 * than as a broken page.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseQuestPage } from './parseQuest.mjs';

const BASE = 'https://www.larkinorcenter.hu/kirkuld';
const QUEST_COUNT = 45;
const OUT = 'static/db/quests.json';

const monsters = JSON.parse(readFileSync('static/db/monsters.json', 'utf-8'));

/** Sprite base (`moszkitoraj_k`) → monster, from each monster's image path. */
const byBase = new Map();
for (const m of monsters) {
  const base = m.image.replace(/^.*\//, '').replace(/\.[a-z]+$/i, '');
  if (base) byBase.set(base, m);
}

const unresolved = new Set();
function resolveMonster(base) {
  const hit = byBase.get(base) ?? byBase.get(`${base}_k`);
  if (!hit) { unresolved.add(base); return null; }
  return { id: hit.id, name: hit.name };
}

const quests = [];
for (let id = 1; id <= QUEST_COUNT; id += 1) {
  const res = await fetch(`${BASE}/${id}/index.html`);
  if (!res.ok) throw new Error(`quest ${id}: HTTP ${res.status}`);
  const quest = parseQuestPage(await res.text(), id, resolveMonster);
  quests.push(quest);
  process.stdout.write(`quest ${id}: ${quest.rows}x${quest.cols}, ${quest.cells.length} cells\n`);
}

if (unresolved.size > 0) {
  throw new Error(`unresolved sprite bases: ${[...unresolved].sort().join(', ')}`);
}

const cells = quests.flatMap((q) => q.cells);
const questions = cells.filter((c) => c.question).length;
const rawQuestionCells = cells.filter((c) => /K[ÉE]RD[ÉE]S/i.test(c.narration)).length;
process.stdout.write(
  `\n${quests.length} quests, ${cells.length} cells, ` +
  `${questions} questions parsed, ${rawQuestionCells} left as raw text\n`,
);

writeFileSync(OUT, `${JSON.stringify(quests, null, 0)}\n`, 'utf-8');
process.stdout.write(`wrote ${OUT}\n`);
