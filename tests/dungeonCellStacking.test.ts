import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The dungeon tiles carry the *game's* own z-index values (3..6, see
 * DungeonCell). Those only stay inside the cell picture while `.lc-dungeon-cell`
 * is a stacking context of its own — without one they resolve against the root
 * and paint over `.lc-hero > .lc-stat-bar`, which is positioned but z-index
 * auto. That hid the HP/MP bars, the gold row and the config gear behind the
 * dungeon picture, and swallowed their clicks with it.
 *
 * jsdom computes no layout and no paint order, so the invariant can only be
 * asserted against the stylesheet itself.
 */
const CSS = readFileSync(resolve(__dirname, '../src/shared/styles/theme.css'), 'utf8');

function ruleBody(selector: string): string {
  const start = CSS.indexOf(`${selector} {`);
  expect(start, `no rule for ${selector}`).toBeGreaterThan(-1);
  return CSS.slice(start, CSS.indexOf('}', start));
}

describe('dungeon cell stacking', () => {
  it('gives the cell its own stacking context so tile z-indexes stay inside it', () => {
    expect(ruleBody('.lc-dungeon-cell')).toMatch(/isolation:\s*isolate/);
  });
});
