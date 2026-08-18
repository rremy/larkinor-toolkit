import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * On a phone the quest tab is one scroll: the maze and the cell detail below it
 * move together. The side panel is a scroller of its own only at full width,
 * where it is a real column beside the maze — capping its height on a narrow
 * screen put a second, nested scrollbar inside the page's own.
 *
 * jsdom computes no layout, so the invariant can only be asserted against the
 * stylesheet.
 */
const CSS = readFileSync(resolve(__dirname, '../src/shared/styles/theme.css'), 'utf8');

/** The body of the first `@media (max-width: 900px)` block. */
function narrowViewportBlock(): string {
  const start = CSS.indexOf('@media (max-width: 900px)');
  expect(start, 'no narrow-viewport media block').toBeGreaterThan(-1);
  const open = CSS.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < CSS.length; i += 1) {
    if (CSS[i] === '{') depth += 1;
    if (CSS[i] === '}') {
      depth -= 1;
      if (depth === 0) return CSS.slice(open + 1, i);
    }
  }
  throw new Error('unterminated media block');
}

function ruleBody(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `no rule for ${selector}`).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf('}', start));
}

describe('quest side panel on narrow viewports', () => {
  it('flows into the page scroll instead of scrolling inside itself', () => {
    expect(ruleBody(narrowViewportBlock(), '.lc-db .quest-side')).toMatch(/overflow:\s*visible/);
  });

  it('puts no height cap on it, which is what forced the inner scrollbar', () => {
    expect(ruleBody(narrowViewportBlock(), '.lc-db .quest-side')).not.toMatch(/max-height/);
  });

  it('keeps the full-width column scrolling on its own', () => {
    expect(ruleBody(CSS, '.lc-db .quest-side')).toMatch(/overflow:\s*auto/);
  });
});
