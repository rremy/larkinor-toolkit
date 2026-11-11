#!/usr/bin/env node
/**
 * Build static/db/sea-chart.json and static/db/islands.json from the fan pages
 * committed under scripts/sea/archive/. Run with `npm run build:sea`.
 *
 * Snapshots rather than live fetches, like the archived quest pages: the fan
 * site may change or vanish, and both pages are small. Fails loudly on a chart
 * class it does not know or a chart of the wrong size.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseChart } from './parseChart.mjs';
import { parseThordArtin, WESTERN_ISLAND } from './parseIslands.mjs';

const DIR = 'scripts/sea/archive';

const chart = parseChart(readFileSync(`${DIR}/szigetvilag2.html`, 'utf-8'));
const islands = [...parseThordArtin(readFileSync(`${DIR}/taterkep.html`, 'utf-8')), ...WESTERN_ISLAND];

writeFileSync('static/db/sea-chart.json', `${JSON.stringify(chart, null, 2)}\n`);
writeFileSync('static/db/islands.json', `${JSON.stringify(islands, null, 2)}\n`);
console.log(`sea-chart.json: ${chart.squares.length} squares; islands.json: ${islands.length} tiles`);
