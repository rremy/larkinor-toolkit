# Quest tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the quest tab track a run — link the game's stated active royal quest, gray out tiles whose work is done, and carry a detected position forward through the player's steps.

**Architecture:** Three independent slices over the existing quest stack. Pure matchers in `src/utils/**` (no DOM, no GM_*), thin `activate*` modules that take injected `readPref`/`writePref`, one new shared wire-format module beside `questPosition.ts`, and read-only consumption in `src/database/quests/**` through the `PrefStore` those views already receive. Both platform boots call the activations; neither view learns anything new about how the userscript works.

**Tech Stack:** Vite + Preact + TypeScript, Vitest + @testing-library/preact (jsdom), plain CSS custom properties in `src/shared/styles/theme.css`.

**Spec:** `docs/superpowers/specs/2026-08-27-quest-tracking-design.md`

## Global Constraints

- All comments and identifiers in **English**; all player-facing copy in **Hungarian**.
- `src/shared/**` and `src/database/**` must stay free of `GM_*` and DOM-only imports — the standalone bundle ships them.
- `src/utils/dungeonPosition.ts` imports only from `@/shared/**`; it stays pure (no DOM, no fetching, no prefs).
- Never assign `innerHTML` anywhere near the game's own markup — it destroys the inline handlers driving the shared form. Text-node splicing only.
- No unscoped element selectors in CSS: everything under `#lc-root`, `#lc-dock-root`, `.lc-db` or a `.lc-*` class.
- No hardcoded colours in CSS rule bodies — declare a `:root` variable and use it.
- Never parse or reconstruct a control's `onclick`; locate the control and `.click()` it.
- Run `npm test` and `npm run typecheck` before every commit; both must pass.
- Temporary files go in the git-ignored repo-root `.tmp/`.
- Commit messages follow the repo's log style: lower-case `type(scope): imperative sentence`, one line, no trailing period.

---

## File Structure

**New files**

| File | Responsibility |
|---|---|
| `src/utils/activeQuest.ts` | Pure: find `Aktuális küldetés: (39)` in a narration, return the id and its offsets |
| `src/utils/activateActiveQuest.ts` | Prefs side of the above: remember the active royal quest, pre-select it on change |
| `src/utils/trackDungeonMove.ts` | Arm a capture-phase listener on the game's direction inputs; record the pending step |
| `src/shared/questCleared.ts` | Wire format for the per-quest cleared-cell set |
| `src/desktop/narrationSplice.ts` | Flatten a narration block and splice elements into its text nodes |
| `src/desktop/activeQuestLink.ts` | Desktop: turn the active-quest phrase in the live narration into a link |

**Modified files**

| File | Change |
|---|---|
| `src/shared/prefKeys.ts` | `ACTIVE_ROYAL_QUEST_PREF_KEY`, `QUEST_MOVE_PREF_KEY`, `questClearedKey` |
| `src/shared/questPosition.ts` | `source` field, `VERSION` → 2 |
| `src/utils/dungeonPosition.ts` | `propagatePosition`, `resolveDungeonPosition` |
| `src/utils/activateDungeonPosition.ts` | Pending move, active-quest preference, auto-clear writes |
| `src/utils/domExtract.ts` | `extractDungeonObservation`, `dungeonDirectionInputs` |
| `src/desktop/enhanceNarration.ts` | Consume the shared splice |
| `src/desktop/boot.ts`, `src/mobile/boot.ts` | Activate the active quest everywhere; arm move tracking in a dungeon |
| `src/desktop/DesktopDock.tsx` | Accept a royal `openQuestTarget` (type widening only) |
| `src/components/NarrationPanel.tsx` | Optional `questLink` span |
| `src/pages/FreeMove.tsx`, `Battle.tsx`, `Dungeon.tsx` | Wire the link to the quests tab |
| `src/database/quests/QuestGrid.tsx` | `cleared` set → `.cleared` class + badge |
| `src/database/quests/QuestCellDetail.tsx` | Cleared toggle for the selected cell |
| `src/database/quests/QuestView.tsx` | Cleared state, pref read/write, header reset |
| `src/database/quests/questMeta.ts` | `BADGE.cleared`, `CLEARED_LABEL` |
| `src/shared/styles/theme.css` | `.quest-cell.cleared`, `.quest-badge.cleared`, one new variable |
| `CLAUDE.md`, `README.md` | Record the hard-won facts and the user-facing behaviour |

---

## Task 1: The active-quest parser

**Files:**
- Create: `src/utils/activeQuest.ts`
- Test: `tests/activeQuest.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `findActiveQuest(narration: string): ActiveQuestMention | null` and `interface ActiveQuestMention { questId: string; index: number; length: number }`.

- [ ] **Step 1: Write the failing test**

Create `tests/activeQuest.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { findActiveQuest } from '../src/utils/activeQuest';

describe('findActiveQuest', () => {
  it('finds the quest number and the run to make clickable', () => {
    const narration = 'Sétálsz a városban.\nAktuális küldetés: (39)\nEgy macska fut át az úton.';
    const hit = findActiveQuest(narration)!;
    expect(hit.questId).toBe('39');
    expect(narration.slice(hit.index, hit.index + hit.length)).toBe('Aktuális küldetés: (39)');
  });

  // The game page is ISO-8859-2 and decoding has misfired before (see CLAUDE.md
  // on the monsters.json mojibake), so the accents must not be load-bearing.
  it('matches an unaccented spelling too', () => {
    expect(findActiveQuest('Aktualis kuldetes: (7)')?.questId).toBe('7');
  });

  it('tolerates spacing and a missing colon', () => {
    expect(findActiveQuest('Aktuális  küldetés  (12)')?.questId).toBe('12');
  });

  it('returns null when the line is absent', () => {
    expect(findActiveQuest('Pihensz egy kicsit...')).toBeNull();
  });

  // Writing an id the royal set cannot resolve would silently send the tab to
  // its fallback quest, which reads as a bug rather than as "unknown".
  it('rejects a number outside the royal set', () => {
    expect(findActiveQuest('Aktuális küldetés: (0)')).toBeNull();
    expect(findActiveQuest('Aktuális küldetés: (46)')).toBeNull();
  });

  it('returns null for an empty narration', () => {
    expect(findActiveQuest('')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/activeQuest.test.ts`
Expected: FAIL — cannot resolve `../src/utils/activeQuest`.

- [ ] **Step 3: Write minimal implementation**

Create `src/utils/activeQuest.ts`:

```ts
// Recognising the active royal quest the game names in its narration.
//
// A page printing `Aktuális küldetés: (39)` states outright what the pub
// matcher (`questOffer.ts`) can only infer from wording, so this is the
// cheapest and most reliable quest signal we have.
//
// Deliberately data-free: a royal quest's `Quest.id` *is* the number the game
// prints, and its title is the same string, so nothing here needs quests.json
// (~1.5MB) on an ordinary city page. Pure, like `questOffer` — no DOM, no GM_*.

/** Highest royal quest number in the committed set (`static/db/quests.json`). */
const MAX_ROYAL_QUEST = 45;

/**
 * Matched on the **raw** narration rather than a folded copy: the offsets are
 * what let both platforms wrap the phrase in a link, and folding would shift
 * them. Accent tolerance comes from character classes instead, so a source that
 * arrives unaccented still matches at the right position.
 */
const ACTIVE_QUEST_RE = /Aktu[aá]lis\s+k[uü]ldet[eé]s\s*:?\s*\(\s*(\d{1,2})\s*\)/i;

export interface ActiveQuestMention {
  /** `Quest.id` of the royal quest — the bare number as a string. */
  questId: string;
  /** Offset of the whole matched phrase in the narration. */
  index: number;
  length: number;
}

/**
 * The active royal quest a narration names, or null.
 *
 * The whole phrase is returned as the run to link, not just the digits: a
 * sentence-sized target is reachable on a phone, and two characters are not.
 *
 * Out-of-range numbers yield null rather than a best guess — see
 * `MAX_ROYAL_QUEST`.
 */
export function findActiveQuest(narration: string): ActiveQuestMention | null {
  const match = ACTIVE_QUEST_RE.exec(narration);
  if (!match || match.index === undefined) return null;

  const number = Number(match[1]);
  if (!Number.isInteger(number) || number < 1 || number > MAX_ROYAL_QUEST) return null;

  return { questId: String(number), index: match.index, length: match[0].length };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/activeQuest.test.ts && npm run typecheck`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/utils/activeQuest.ts tests/activeQuest.test.ts
git commit -m "feat(quests): read the active royal quest out of the narration"
```

---

## Task 2: Remembering the active quest

**Files:**
- Modify: `src/shared/prefKeys.ts`
- Create: `src/utils/activateActiveQuest.ts`
- Test: `tests/activateActiveQuest.test.ts`

**Interfaces:**
- Consumes: `findActiveQuest`, `ActiveQuestMention` (Task 1).
- Produces: `ACTIVE_ROYAL_QUEST_PREF_KEY` (`'lc-quest-active-royal'`) and `activateActiveQuest(narration: string, readPref: ReadPref, writePref: WritePref): ActiveQuestMention | null`. `ReadPref`/`WritePref` are re-exported from `activateDungeonPosition.ts` — import the types from there, do not redeclare them.

- [ ] **Step 1: Write the failing test**

Create `tests/activateActiveQuest.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { activateActiveQuest } from '../src/utils/activateActiveQuest';
import { ACTIVE_ROYAL_QUEST_PREF_KEY, QUEST_SET_PREF_KEY, questSelectedKey } from '@/shared/prefKeys';

function makePrefs(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    read: (key: string) => store.get(key) ?? null,
    write: vi.fn((key: string, value: string) => { store.set(key, value); }),
    stored: store,
  };
}

const NARRATION = 'Aktuális küldetés: (39)';

describe('activateActiveQuest', () => {
  it('remembers a newly seen active quest and pre-selects it', () => {
    const prefs = makePrefs();
    const hit = activateActiveQuest(NARRATION, prefs.read, prefs.write);

    expect(hit?.questId).toBe('39');
    expect(prefs.stored.get(ACTIVE_ROYAL_QUEST_PREF_KEY)).toBe('39');
    expect(prefs.stored.get(questSelectedKey('royal'))).toBe('39');
  });

  // The player opened quest 12 to read it; every step they take afterwards
  // prints the active-quest line again and must not drag them back to 39.
  it('leaves the selection alone when the active quest has not changed', () => {
    const prefs = makePrefs({
      [ACTIVE_ROYAL_QUEST_PREF_KEY]: '39',
      [questSelectedKey('royal')]: '12',
    });
    activateActiveQuest(NARRATION, prefs.read, prefs.write);

    expect(prefs.stored.get(questSelectedKey('royal'))).toBe('12');
  });

  // The line is printed by ordinary city pages, so switching the set here would
  // drag a player mid-way through a tavern quest back to royal on every step.
  it('never writes the quest set', () => {
    const prefs = makePrefs({ [QUEST_SET_PREF_KEY]: 'tavern' });
    activateActiveQuest(NARRATION, prefs.read, prefs.write);

    expect(prefs.write).not.toHaveBeenCalledWith(QUEST_SET_PREF_KEY, expect.anything());
    expect(prefs.stored.get(QUEST_SET_PREF_KEY)).toBe('tavern');
  });

  it('writes nothing and returns null when no line is present', () => {
    const prefs = makePrefs();
    expect(activateActiveQuest('Pihensz egy kicsit...', prefs.read, prefs.write)).toBeNull();
    expect(prefs.write).not.toHaveBeenCalled();
  });

  it('survives a throwing store and still reports the mention', () => {
    const hit = activateActiveQuest(NARRATION, () => null, () => { throw new Error('quota'); });
    expect(hit?.questId).toBe('39');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/activateActiveQuest.test.ts`
Expected: FAIL — cannot resolve `../src/utils/activateActiveQuest`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/shared/prefKeys.ts`:

```ts
/**
 * PrefStore key holding the royal quest the game itself names as active
 * (`Aktuális küldetés: (39)`).
 *
 * Kept apart from `questSelectedKey('royal')` — which follows the player's
 * browsing — because the two answer different questions: what the character is
 * doing, and what the reader is looking at. Keeping both is what lets the
 * selection move when the *active* quest changes and stay put otherwise.
 */
export const ACTIVE_ROYAL_QUEST_PREF_KEY = 'lc-quest-active-royal';
```

Create `src/utils/activateActiveQuest.ts`:

```ts
// Turning the game's own "Aktuális küldetés: (39)" into a database selection.
//
// Sits between the pure parser (`activeQuest`) and the boot modules, taking its
// preference access as injected collaborators so it stays testable without
// GM_* — the same shape as `activateQuestOffer` and `activateDungeonPosition`.

import { findActiveQuest, type ActiveQuestMention } from './activeQuest';
import { ACTIVE_ROYAL_QUEST_PREF_KEY, questSelectedKey } from '@/shared/prefKeys';
import type { ReadPref, WritePref } from './activateDungeonPosition';

/**
 * Remember the active royal quest, and pre-select it **only when it changed**.
 *
 * Accepting a new quest is the moment pre-selecting helps; every page load
 * afterwards is when it would fight a player who deliberately opened some other
 * quest to read it. The same restraint `activateQuestOffer` applies by writing
 * only on a match.
 *
 * Deliberately never writes `lc-quest-set`: ordinary city pages print this
 * line, so switching the set here would pull a player mid-way through a tavern
 * quest back to royal on every step. The set moves only when the player clicks
 * the link, which routes explicitly.
 *
 * Failures are swallowed — a missed pre-selection is never a reason to break
 * the page — and the mention is still returned so the caller can render its
 * link.
 */
export function activateActiveQuest(
  narration: string,
  readPref: ReadPref,
  writePref: WritePref,
): ActiveQuestMention | null {
  const mention = findActiveQuest(narration);
  if (!mention) return null;

  try {
    const previous = readPref(ACTIVE_ROYAL_QUEST_PREF_KEY);
    writePref(ACTIVE_ROYAL_QUEST_PREF_KEY, mention.questId);
    if (previous !== mention.questId) writePref(questSelectedKey('royal'), mention.questId);
  } catch (err) {
    console.warn('[Larkinor UI] Active quest: could not store the selection:', err);
  }

  return mention;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/activateActiveQuest.test.ts && npm run typecheck`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/shared/prefKeys.ts src/utils/activateActiveQuest.ts tests/activateActiveQuest.test.ts
git commit -m "feat(quests): remember the active royal quest the game names"
```

---

## Task 3: Extract the narration splice

Refactor only — no behaviour change. `enhanceNarration` owns machinery Task 4 needs; two copies of text-node splicing over the game's live markup is exactly the duplication that eventually diverges.

**Files:**
- Create: `src/desktop/narrationSplice.ts`
- Modify: `src/desktop/enhanceNarration.ts`
- Test: `tests/narrationSplice.test.ts` (new), `tests/enhanceNarration.test.ts` (must stay green untouched)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `narrationBlock(doc: Document): Element | null`
  - `interface NarrationSegment { node: Text; start: number; end: number }`
  - `flattenNarration(doc: Document, root: Element): { segments: NarrationSegment[]; text: string }`
  - `segmentFor(segments: NarrationSegment[], index: number, end: number): NarrationSegment | undefined`
  - `isInsideAnchor(node: Text, root: Element): boolean`
  - `spliceIntoTextNode(doc: Document, node: Text, runs: SpliceRun[]): void` where `interface SpliceRun { index: number; length: number; build(label: string): Node }` — offsets are relative to that node's own text, runs must be sorted ascending, and an overlapping run is skipped.

- [ ] **Step 1: Write the failing test**

Create `tests/narrationSplice.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  flattenNarration, isInsideAnchor, narrationBlock, segmentFor, spliceIntoTextNode,
} from '../src/desktop/narrationSplice';

function docWith(html: string): Document {
  return new JSDOM(`<html><body>${html}</body></html>`).window.document;
}

describe('narrationSplice', () => {
  it('finds the game narration block', () => {
    const doc = docWith('<font face="Comic sans MS">Szia</font>');
    expect(narrationBlock(doc)?.textContent).toBe('Szia');
  });

  // The game splits every monster name into its own <b><font> run, so a match
  // has to be made against the flattened text and mapped back afterwards.
  it('flattens element boundaries and turns <br> into a newline', () => {
    const doc = docWith('<font face="Comic sans MS">Valami <b>Vízmágus </b>áll ott.<br>Hideg van.</font>');
    const { text, segments } = flattenNarration(doc, narrationBlock(doc)!);

    expect(text).toBe('Valami Vízmágus áll ott.\nHideg van.');
    expect(segments).toHaveLength(4);
    const segment = segmentFor(segments, text.indexOf('Vízmágus'), text.indexOf('Vízmágus') + 8);
    expect(segment?.node.textContent).toBe('Vízmágus ');
  });

  it('reports no segment for a run spanning two nodes', () => {
    const doc = docWith('<font face="Comic sans MS">Valami <b>Vízmágus </b>áll ott.</font>');
    const { text, segments } = flattenNarration(doc, narrationBlock(doc)!);
    expect(segmentFor(segments, text.indexOf('Valami'), text.indexOf('áll') + 3)).toBeUndefined();
  });

  it('detects a text node already inside an anchor', () => {
    const doc = docWith('<font face="Comic sans MS">Menj <a href="#">tovább</a></font>');
    const block = narrationBlock(doc)!;
    const { segments } = flattenNarration(doc, block);
    expect(isInsideAnchor(segments[0].node, block)).toBe(false);
    expect(isInsideAnchor(segments[1].node, block)).toBe(true);
  });

  it('splices runs into one text node, skipping overlaps', () => {
    const doc = docWith('<font face="Comic sans MS">Aktuális küldetés: (39) most</font>');
    const block = narrationBlock(doc)!;
    const { segments } = flattenNarration(doc, block);
    const build = (label: string) => {
      const el = doc.createElement('span');
      el.className = 'marked';
      el.textContent = label;
      return el;
    };

    spliceIntoTextNode(doc, segments[0].node, [
      { index: 0, length: 23, build },
      { index: 5, length: 3, build }, // overlaps the first — dropped
    ]);

    expect(block.querySelectorAll('.marked')).toHaveLength(1);
    expect(block.querySelector('.marked')!.textContent).toBe('Aktuális küldetés: (39)');
    expect(block.textContent).toBe('Aktuális küldetés: (39) most');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/narrationSplice.test.ts`
Expected: FAIL — cannot resolve `../src/desktop/narrationSplice`.

- [ ] **Step 3: Write minimal implementation**

Create `src/desktop/narrationSplice.ts`:

```ts
// Text-node surgery on the game's live narration block, shared by every desktop
// enhancement that turns part of the narration into something clickable.
//
// The rule this module exists to keep: never assign innerHTML anywhere near the
// game's own markup. Its <a> elements carry inline handlers that drive the
// shared form, and reserialising the block destroys them. So we flatten to read
// and splice text nodes to write, and nothing else.

/** The game's narration block. */
export function narrationBlock(doc: Document): Element | null {
  return doc.querySelector('font[face="Comic sans MS"]');
}

/** One text node's span within the block's flattened text. */
export interface NarrationSegment {
  node: Text;
  start: number;
  /** Exclusive. */
  end: number;
}

/**
 * Flattens the block to a single string and records where each text node landed
 * in it, so a match found in the flat text can be mapped back to the DOM.
 *
 * Collected up front, before any mutation, so the offsets stay valid.
 *
 * `<br>` contributes a newline without a segment, mirroring `extractNarration`.
 * Without it two sentences either side of a line break would be concatenated,
 * and a pattern anchored on a sentence boundary could match across them.
 */
export function flattenNarration(
  doc: Document,
  root: Element,
): { segments: NarrationSegment[]; text: string } {
  const walker = doc.createTreeWalker(root, 0x5 /* SHOW_ELEMENT | SHOW_TEXT */);
  const segments: NarrationSegment[] = [];
  let text = '';
  let current: Node | null;

  while ((current = walker.nextNode()) !== null) {
    if (current.nodeType === 1 /* ELEMENT_NODE */) {
      if ((current as Element).tagName === 'BR') text += '\n';
      continue;
    }
    const node = current as Text;
    const content = node.textContent ?? '';
    segments.push({ node, start: text.length, end: text.length + content.length });
    text += content;
  }

  return { segments, text };
}

/**
 * The single text node containing `[index, end)`, or undefined when the run
 * spans element boundaries — which the callers treat as "leave it as plain
 * text", since wrapping it would mean restructuring markup whose inline
 * handlers drive the game.
 */
export function segmentFor(
  segments: NarrationSegment[],
  index: number,
  end: number,
): NarrationSegment | undefined {
  return segments.find((s) => index >= s.start && end <= s.end);
}

/** Text nodes already inside an anchor are skipped — no nested links. */
export function isInsideAnchor(node: Text, root: Element): boolean {
  let el = node.parentElement;
  while (el && el !== root) {
    if (el.tagName === 'A') return true;
    el = el.parentElement;
  }
  return false;
}

/** One run of a text node to replace with an element. */
export interface SpliceRun {
  /** Offset within this node's own text. */
  index: number;
  length: number;
  /** Builds the replacement element from the run's own text. */
  build(label: string): Node;
}

/**
 * Replaces one text node with a run of plain text and built elements.
 *
 * Runs must be sorted ascending; one overlapping an already-emitted run is
 * skipped rather than nested.
 */
export function spliceIntoTextNode(doc: Document, node: Text, runs: SpliceRun[]): void {
  const text = node.textContent ?? '';
  const fragment = doc.createDocumentFragment();
  let cursor = 0;

  for (const run of runs) {
    if (run.index < cursor) continue; // overlaps an emitted element
    if (run.index > cursor) fragment.appendChild(doc.createTextNode(text.slice(cursor, run.index)));
    fragment.appendChild(run.build(text.slice(run.index, run.index + run.length)));
    cursor = run.index + run.length;
  }

  if (cursor < text.length) fragment.appendChild(doc.createTextNode(text.slice(cursor)));

  node.parentNode?.replaceChild(fragment, node);
}
```

- [ ] **Step 4: Rewrite `enhanceNarration` on top of it**

In `src/desktop/enhanceNarration.ts`: delete the local `isInsideAnchor`, `Segment`, `flatten` and `spliceLinks` definitions and import the shared ones. Keep `buildLink`, `ENHANCED_ATTR` and the doc comments as they are (adjusting the paragraph that described the now-shared flattening to point at `narrationSplice.ts`). The body becomes:

```ts
import {
  flattenNarration, isInsideAnchor, narrationBlock, segmentFor, spliceIntoTextNode,
} from './narrationSplice';

// …buildLink unchanged…

export function enhanceNarration(
  doc: Document,
  db: MonsterDatabase,
  onMonsterClick: (monster: Monster) => void
): void {
  const block = narrationBlock(doc);
  if (!block || block.hasAttribute(ENHANCED_ATTR)) return;

  const { segments, text } = flattenNarration(doc, block);

  // Group by node so one node containing several mentions is spliced once,
  // with spliceIntoTextNode resolving any overlaps between them.
  const byNode = new Map<Text, ResolvedMention[]>();

  for (const mention of findMonsterMentions(text)) {
    const monster = db.getByName(mention.name);
    if (!monster) continue; // unknown name — leave as plain text

    const segment = segmentFor(segments, mention.index, mention.index + mention.length);
    if (!segment) continue; // name spans elements (see above)
    if (isInsideAnchor(segment.node, block)) continue; // no nested links

    const hits = byNode.get(segment.node) ?? [];
    // Re-base the offset from the flattened text onto this node's own text.
    hits.push({ mention: { ...mention, index: mention.index - segment.start }, monster });
    byNode.set(segment.node, hits);
  }

  for (const [node, hits] of byNode) {
    spliceIntoTextNode(doc, node, hits
      .sort((a, b) => a.mention.index - b.mention.index)
      .map(({ mention, monster }) => ({
        index: mention.index,
        length: mention.length,
        build: (label: string) => buildLink(doc, label, monster, onMonsterClick),
      })));
  }

  block.setAttribute(ENHANCED_ATTR, 'true');
}
```

- [ ] **Step 5: Run the whole suite to verify nothing changed**

Run: `npx vitest run tests/narrationSplice.test.ts tests/enhanceNarration.test.ts && npm test && npm run typecheck`
Expected: PASS. `tests/enhanceNarration.test.ts` must pass **unmodified** — it is the proof this refactor changed no behaviour.

- [ ] **Step 6: Commit**

```bash
git add src/desktop/narrationSplice.ts src/desktop/enhanceNarration.ts tests/narrationSplice.test.ts
git commit -m "refactor(desktop): share the narration splice between enhancements"
```

---

## Task 4: Desktop — the active quest as a link

**Files:**
- Create: `src/desktop/activeQuestLink.ts`
- Modify: `src/desktop/boot.ts`, `src/desktop/DesktopDock.tsx`, `src/desktop/desktop.css`
- Test: `tests/activeQuestLink.test.ts`, `tests/desktopBootActiveQuest.test.ts`

**Interfaces:**
- Consumes: `narrationSplice` (Task 3), `activateActiveQuest` (Task 2).
- Produces: `renderActiveQuestLink(doc: Document, mention: ActiveQuestMention, onOpen: () => void): HTMLElement | null` — returns the created link, or null when the phrase spans element boundaries or the block is missing.

- [ ] **Step 1: Write the failing test**

Create `tests/activeQuestLink.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { renderActiveQuestLink } from '../src/desktop/activeQuestLink';
import { findActiveQuest } from '../src/utils/activeQuest';
import { narrationBlock } from '../src/desktop/narrationSplice';
import { extractNarration } from '../src/utils/domExtract';

function gameDoc(inner: string): Document {
  return new JSDOM(
    `<html><body><font face="Comic sans MS">${inner}</font></body></html>`,
    { url: 'https://l2.larkinor.hu/cgi-bin/larkinor' },
  ).window.document;
}

describe('renderActiveQuestLink', () => {
  it('turns the phrase into a link and fires onOpen', () => {
    const doc = gameDoc('Sétálsz.<br>Aktuális küldetés: (39)<br>Vége.');
    const onOpen = vi.fn();
    const link = renderActiveQuestLink(doc, findActiveQuest(extractNarration(doc))!, onOpen)!;

    expect(link.textContent).toBe('Aktuális küldetés: (39)');
    link.dispatchEvent(new doc.defaultView!.MouseEvent('click', { bubbles: true }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('leaves the surrounding text and the game anchors intact', () => {
    const doc = gameDoc('Menj <a href="#" onclick="return false">tovább</a>.<br>Aktuális küldetés: (39)');
    const anchor = doc.querySelector('a')!;
    renderActiveQuestLink(doc, findActiveQuest(extractNarration(doc))!, vi.fn());

    expect(doc.querySelector('a[onclick]')).toBe(anchor); // never reserialised
    expect(narrationBlock(doc)!.textContent).toContain('Menj tovább.');
    expect(narrationBlock(doc)!.textContent).toContain('Aktuális küldetés: (39)');
  });

  it('is idempotent within one page load', () => {
    const doc = gameDoc('Aktuális küldetés: (39)');
    const mention = findActiveQuest(extractNarration(doc))!;
    renderActiveQuestLink(doc, mention, vi.fn());
    renderActiveQuestLink(doc, mention, vi.fn());

    expect(doc.querySelectorAll('.lc-active-quest').length).toBe(1);
  });

  it('opens on Enter as well as click', () => {
    const doc = gameDoc('Aktuális küldetés: (39)');
    const onOpen = vi.fn();
    const link = renderActiveQuestLink(doc, findActiveQuest(extractNarration(doc))!, onOpen)!;

    link.dispatchEvent(new doc.defaultView!.KeyboardEvent('keydown', { code: 'Enter', bubbles: true }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('returns null when there is no narration block', () => {
    const doc = new JSDOM('<html><body></body></html>').window.document;
    expect(renderActiveQuestLink(doc, { questId: '39', index: 0, length: 5 }, vi.fn())).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/activeQuestLink.test.ts`
Expected: FAIL — cannot resolve `../src/desktop/activeQuestLink`.

- [ ] **Step 3: Write minimal implementation**

Create `src/desktop/activeQuestLink.ts`:

```ts
// Desktop-only: the game's own "Aktuális küldetés: (39)" phrase, made clickable
// in place.
//
// Splices text nodes through `narrationSplice` rather than appending a note
// beside the block (as `questOfferNote` does): the game already says the
// sentence, so the affordance belongs on the sentence. Nothing is reserialised,
// so the game's own inline handlers survive.

import type { ActiveQuestMention } from '@/utils/activeQuest';
import {
  flattenNarration, isInsideAnchor, narrationBlock, segmentFor, spliceIntoTextNode,
} from './narrationSplice';

const LINK_CLASS = 'lc-active-quest';
/** Marker attribute making a second call within one page load a no-op. */
const LINKED_ATTR = 'data-lc-active-quest';

function buildLink(doc: Document, label: string, onOpen: () => void): HTMLAnchorElement {
  const link = doc.createElement('a');
  link.className = LINK_CLASS;
  link.textContent = label;
  // Hungarian, like every other piece of player-facing copy.
  link.title = 'Megnyitás az adatbázisban';
  // No href, so this is a mouse-only affordance by default — it must also be
  // operable from the keyboard and announced as a control, not a destination.
  link.tabIndex = 0;
  link.setAttribute('role', 'button');
  link.addEventListener('click', (event) => {
    // The page's controls submit the shared form; make sure this can never be
    // mistaken for one of them.
    event.preventDefault();
    event.stopPropagation();
    onOpen();
  });
  link.addEventListener('keydown', (event) => {
    if (event.code === 'Enter' || event.code === 'Space') {
      event.preventDefault();
      onOpen();
    }
  });
  return link;
}

/**
 * Wrap the active-quest phrase in a link that opens the quests tab.
 *
 * Returns the link, or null when there is nothing to attach to: no narration
 * block, the phrase already linked, it spans element boundaries, or it sits
 * inside one of the game's own anchors. Each of those is a reason to leave the
 * text exactly as the game wrote it.
 */
export function renderActiveQuestLink(
  doc: Document,
  mention: ActiveQuestMention,
  onOpen: () => void,
): HTMLElement | null {
  const block = narrationBlock(doc);
  if (!block || block.hasAttribute(LINKED_ATTR)) return null;

  const { segments } = flattenNarration(doc, block);
  const segment = segmentFor(segments, mention.index, mention.index + mention.length);
  if (!segment || isInsideAnchor(segment.node, block)) return null;

  let created: HTMLElement | null = null;
  spliceIntoTextNode(doc, segment.node, [{
    index: mention.index - segment.start,
    length: mention.length,
    build: (label) => (created = buildLink(doc, label, onOpen)),
  }]);

  block.setAttribute(LINKED_ATTR, 'true');
  return created;
}
```

Add to `src/desktop/desktop.css`, beside the existing `.lc-quest-offer-btn` rules:

```css
/* The game's own active-quest sentence, made clickable in place. Underlined
   rather than boxed: it is part of the game's prose, not a control we added. */
#lc-dock-root ~ * .lc-active-quest,
.lc-active-quest {
  color: var(--accent);
  text-decoration: underline dotted;
  cursor: pointer;
}
.lc-active-quest:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/activeQuestLink.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Widen the dock's quest target**

In `src/desktop/DesktopDock.tsx` the `openQuestTarget` prop is already `{ set: QuestSet; id: string } | null` — no change needed. In `src/desktop/boot.ts` change the local declaration from the tavern-only literal to the general type:

```ts
let openQuestTarget: { set: QuestSet; id: string } | null = null;
```

and add `import type { QuestSet } from '@/shared/data';` to the existing `@/shared/data` import.

- [ ] **Step 6: Write the failing boot test**

Create `tests/desktopBootActiveQuest.test.ts`, modelled on `tests/desktopBootQuestOffer.test.ts` (copy its `beforeEach` GM mock setup verbatim from that file):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { bootDesktop } from '../src/desktop/boot';
import { ACTIVE_ROYAL_QUEST_PREF_KEY, QUEST_SET_PREF_KEY, questSelectedKey } from '../src/shared/prefKeys';

const GAME_URL = 'https://l2.larkinor.hu/cgi-bin/larkinor';

/** A free-move page whose narration names the active royal quest. */
function cityDoc(): Document {
  return new JSDOM(`<html><body>
    <form name="urlap"><input type="hidden" name="oldalTipus" value="otVilag"></form>
    <div id="mydiv"><input type="text"></div>
    <font face="Comic sans MS">Sétálsz a városban.<br>Aktuális küldetés: (39)</font>
  </body></html>`, { url: GAME_URL }).window.document;
}

describe('bootDesktop and the active royal quest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // GM storage is mocked in tests/setup.ts; back it with a fresh map per test.
    const store = new Map<string, string>();
    vi.mocked(GM_getValue).mockImplementation(((key: string, fallback: string) =>
      store.get(key) ?? fallback) as unknown as typeof GM_getValue);
    vi.mocked(GM_setValue).mockImplementation(((key: string, value: string) => {
      store.set(key, value);
    }) as unknown as typeof GM_setValue);
    vi.mocked(GM_xmlhttpRequest).mockImplementation(((opts: {
      onload?: (res: { status: number; responseText: string }) => void;
    }) => opts.onload?.({ status: 200, responseText: '[]' })) as unknown as typeof GM_xmlhttpRequest);
  });

  it('stores the active quest and links the phrase', () => {
    const doc = cityDoc();
    bootDesktop(doc);

    expect(GM_setValue).toHaveBeenCalledWith(ACTIVE_ROYAL_QUEST_PREF_KEY, '39');
    expect(GM_setValue).toHaveBeenCalledWith(questSelectedKey('royal'), '39');
    expect(GM_setValue).not.toHaveBeenCalledWith(QUEST_SET_PREF_KEY, expect.anything());
    expect(doc.querySelector('.lc-active-quest')?.textContent).toBe('Aktuális küldetés: (39)');
  });

  it('leaves a page without the line untouched', () => {
    const doc = new JSDOM(`<html><body>
      <form name="urlap"><input type="hidden" name="oldalTipus" value="otVilag"></form>
      <font face="Comic sans MS">Pihensz egy kicsit...</font>
    </body></html>`, { url: GAME_URL }).window.document;
    bootDesktop(doc);

    expect(doc.querySelector('.lc-active-quest')).toBeNull();
    expect(GM_setValue).not.toHaveBeenCalledWith(ACTIVE_ROYAL_QUEST_PREF_KEY, expect.anything());
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npx vitest run tests/desktopBootActiveQuest.test.ts`
Expected: FAIL — no `.lc-active-quest` element; the boot does not call the activation yet.

- [ ] **Step 8: Wire the boot**

In `src/desktop/boot.ts`, after `renderDock();` and before the `PageType.Character` capture, add:

```ts
  // The game names the active royal quest in its narration on ordinary pages.
  // Remember it (never switching the set — see activateActiveQuest) and make
  // the sentence itself the way into the quests tab.
  const activeQuest = activateActiveQuest(extractNarration(doc), getPref, setPref);
  if (activeQuest) {
    renderActiveQuestLink(doc, activeQuest, () => {
      // Route explicitly rather than leaning on the preference just written:
      // QuestView reads the stored set once at mount, so an overlay already
      // open would never see it.
      openQuestTarget = { set: 'royal', id: activeQuest.questId };
      openQuestsSignal += 1;
      renderDock();
    });
  }
```

with the imports:

```ts
import { activateActiveQuest } from '@/utils/activateActiveQuest';
import { renderActiveQuestLink } from '@/desktop/activeQuestLink';
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `npx vitest run tests/desktopBootActiveQuest.test.ts tests/desktopBoot.test.ts tests/desktopBootQuestOffer.test.ts && npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/desktop/activeQuestLink.ts src/desktop/boot.ts src/desktop/desktop.css \
  tests/activeQuestLink.test.ts tests/desktopBootActiveQuest.test.ts
git commit -m "feat(desktop): open the quests tab from the active quest sentence"
```

---

## Task 5: Mobile — the active quest as a link

**Files:**
- Modify: `src/components/NarrationPanel.tsx`, `src/pages/FreeMove.tsx`, `src/pages/Battle.tsx`, `src/pages/Dungeon.tsx`, `src/mobile/boot.ts`
- Test: `tests/NarrationPanel.test.tsx`, `tests/FreeMove.test.tsx`, `tests/mobileBootActiveQuest.test.ts` (new)

**Interfaces:**
- Consumes: `findActiveQuest` (Task 1), `activateActiveQuest` (Task 2).
- Produces: `NarrationPanelProps.questLink?: { index: number; length: number; onClick(): void }`.

- [ ] **Step 1: Write the failing NarrationPanel test**

Append to `tests/NarrationPanel.test.tsx`:

```ts
  it('renders the active-quest phrase as a tappable span at its own offsets', () => {
    const text = 'Sétálsz.\nAktuális küldetés: (39)\nVége.';
    const onClick = vi.fn();
    const { container } = render(
      <NarrationPanel
        text={text}
        db={null}
        onMonsterClick={vi.fn()}
        questLink={{ index: text.indexOf('Aktuális'), length: 'Aktuális küldetés: (39)'.length, onClick }}
      />
    );

    const link = container.querySelector('.lc-quest-link')!;
    expect(link.textContent).toBe('Aktuális küldetés: (39)');
    fireEvent.click(link);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(container.textContent).toBe(text);
  });

  it('ignores a questLink whose offsets fall outside the text', () => {
    const { container } = render(
      <NarrationPanel text="Rövid" db={null} onMonsterClick={vi.fn()}
        questLink={{ index: 40, length: 5, onClick: vi.fn() }} />
    );
    expect(container.querySelector('.lc-quest-link')).toBeNull();
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/NarrationPanel.test.tsx`
Expected: FAIL — `questLink` is not a known prop; no `.lc-quest-link` rendered.

- [ ] **Step 3: Add the span to NarrationPanel**

In `src/components/NarrationPanel.tsx` extend the props:

```ts
  /**
   * The active-quest phrase to make tappable, by offset into `text`.
   *
   * Offsets rather than a search string, unlike `links`: the parser already
   * knows where it matched, and a phrase the game could print twice must land
   * where it was found rather than at the first `indexOf`.
   */
  questLink?: { index: number; length: number; onClick(): void };
```

destructure it (`questLink = null` is not valid for an optional object — use `questLink`), and push its span before the monster mentions so it wins any overlap:

```ts
  if (questLink && questLink.index >= 0 && questLink.index + questLink.length <= text.length) {
    spans.push({
      index: questLink.index,
      length: questLink.length,
      node: (
        <span class="lc-quest-link" onClick={() => questLink.onClick()}>
          {text.slice(questLink.index, questLink.index + questLink.length)}
        </span>
      ),
    });
  }
```

Add to `src/shared/styles/theme.css` next to `.lc-monster-link`:

```css
#lc-root .lc-quest-link {
  color: var(--accent);
  text-decoration: underline dotted;
  cursor: pointer;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/NarrationPanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write the failing page test**

Append to `tests/FreeMove.test.tsx` (that file's state fixture helper is `buildState`):

```ts
  it('opens the quests tab on the active quest named in the narration', async () => {
    const state = buildState({ narration: 'Sétálsz.\nAktuális küldetés: (39)' });
    const { container } = render(<FreeMove state={state} db={null} />);

    fireEvent.click(container.querySelector('.lc-quest-link')!);

    // The overlay mounts its quests tab; the heading is enough to prove the route.
    await waitFor(() => expect(container.querySelector('.lc-db')).not.toBeNull());
  });
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run tests/FreeMove.test.tsx`
Expected: FAIL — no `.lc-quest-link` in the rendered narration.

- [ ] **Step 7: Wire the three pages**

In each of `src/pages/FreeMove.tsx`, `src/pages/Battle.tsx` and `src/pages/Dungeon.tsx`:

```ts
import { findActiveQuest } from '@/utils/activeQuest';
```

Inside the component, beside the existing overlay state:

```ts
  // The game names the active royal quest in the narration; make the sentence
  // the way into the quests tab. The pref writes happen in the boot — this is
  // only the affordance.
  const activeQuest = findActiveQuest(state.narration);
  const [questRoute, setQuestRoute] = useState<{ id: string; seq: number } | null>(null);
```

Pass to the narration panel:

```tsx
        questLink={activeQuest
          ? {
              index: activeQuest.index,
              length: activeQuest.length,
              onClick: () => {
                setQuestRoute((r) => ({ id: activeQuest.questId, seq: (r?.seq ?? 0) + 1 }));
                setDbOpen(true);
              },
            }
          : undefined}
```

and to the overlay (in `Dungeon.tsx`, whose `initialTab`/`initialTabKey` are already driven by `questsSeq`, combine the two: prefer `questRoute` when it is set, and keep `questsSeq` for the StatBar button):

```tsx
      <DatabaseOverlay
        open={dbOpen}
        initialItemId={dbItemId ?? undefined}
        initialTab={questRoute ? 'quests' : undefined}
        initialTabKey={questRoute?.seq}
        initialQuest={questRoute ? { set: 'royal', id: questRoute.id } : null}
        onClose={() => setDbOpen(false)}
      />
```

The nonce (`seq`) matters for the same reason `Dungeon`'s `questsSeq` does: setting the same `initialTab` value again is a no-op state update, so a second press would never re-navigate an overlay the player had since moved away from.

- [ ] **Step 8: Write the failing mobile boot test**

Create `tests/mobileBootActiveQuest.test.ts`, copying the GM-mock `beforeEach` from `tests/desktopBootActiveQuest.test.ts` (Task 4) and using `bootMobile` with the same `cityDoc()` fixture. Assert:

```ts
    expect(GM_setValue).toHaveBeenCalledWith(ACTIVE_ROYAL_QUEST_PREF_KEY, '39');
    expect(GM_setValue).toHaveBeenCalledWith(questSelectedKey('royal'), '39');
    expect(GM_setValue).not.toHaveBeenCalledWith(QUEST_SET_PREF_KEY, expect.anything());
```

- [ ] **Step 9: Wire the mobile boot**

In `src/mobile/boot.ts`, before the `pageState` early return and beside the other cross-page activations:

```ts
  // Runs on every page, like the pub and dungeon activations above: the
  // active-quest line is not tied to a page type we render, and the link the
  // pages draw is a separate concern from remembering the id.
  activateActiveQuest(extractNarration(doc), getPref, setPref);
```

with `import { activateActiveQuest } from '@/utils/activateActiveQuest';`.

- [ ] **Step 10: Run tests to verify they pass**

Run: `npx vitest run tests/NarrationPanel.test.tsx tests/FreeMove.test.tsx tests/Battle.test.tsx tests/Dungeon.test.tsx tests/mobileBootActiveQuest.test.ts && npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/components/NarrationPanel.tsx src/pages/FreeMove.tsx src/pages/Battle.tsx \
  src/pages/Dungeon.tsx src/mobile/boot.ts src/shared/styles/theme.css \
  tests/NarrationPanel.test.tsx tests/FreeMove.test.tsx tests/mobileBootActiveQuest.test.ts
git commit -m "feat(mobile): open the quests tab from the active quest sentence"
```

---

## Task 6: The cleared-cell wire format

**Files:**
- Create: `src/shared/questCleared.ts`
- Modify: `src/shared/prefKeys.ts`
- Test: `tests/questCleared.test.ts`

**Interfaces:**
- Consumes: `QuestSet` from `@/shared/data/types`.
- Produces: `serialiseCleared(cells: ReadonlySet<string>): string`, `parseCleared(raw: string | null): Set<string>`, and `questClearedKey(set: QuestSet, questId: string): string` → `lc-quest-cleared-<set>-<id>`.

- [ ] **Step 1: Write the failing test**

Create `tests/questCleared.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseCleared, serialiseCleared } from '@/shared/questCleared';
import { questClearedKey } from '@/shared/prefKeys';

describe('questCleared', () => {
  it('round-trips a set of cell keys', () => {
    const cells = new Set(['0,0', '3,4', '12,7']);
    expect(parseCleared(serialiseCleared(cells))).toEqual(cells);
  });

  it('keys a pref per set and quest', () => {
    expect(questClearedKey('royal', '39')).toBe('lc-quest-cleared-royal-39');
    expect(questClearedKey('tavern', 'GY.I.K')).toBe('lc-quest-cleared-tavern-GY.I.K');
  });

  // Progress, unlike a position, is long-lived — so an unreadable value must
  // degrade to "nothing cleared yet" rather than make the caller give up.
  it('degrades to an empty set on anything unusable', () => {
    expect(parseCleared(null)).toEqual(new Set());
    expect(parseCleared('')).toEqual(new Set());
    expect(parseCleared('not json')).toEqual(new Set());
    expect(parseCleared('{"version":99,"cells":["1,1"]}')).toEqual(new Set());
    expect(parseCleared('{"version":1,"cells":"1,1"}')).toEqual(new Set());
  });

  it('drops entries that are not cell keys', () => {
    expect(parseCleared('{"version":1,"cells":["1,1","nope",7,null,"2,-1"]}')).toEqual(new Set(['1,1']));
  });

  it('serialises deterministically, so an unchanged set does not churn the store', () => {
    expect(serialiseCleared(new Set(['3,4', '0,0']))).toBe(serialiseCleared(new Set(['0,0', '3,4'])));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/questCleared.test.ts`
Expected: FAIL — cannot resolve `@/shared/questCleared`.

- [ ] **Step 3: Write minimal implementation**

Create `src/shared/questCleared.ts`:

```ts
// Which cells of a quest maze the player is done with — a monster killed, a
// question answered, a trap sprung.
//
// Free of DOM, GM_* and `src/utils/**` imports for the same reason as
// `questPosition.ts` and `loadout.ts`: the writers are the userscript's boot
// and the quests tab, while the reader ships in the GM-free standalone bundle.
// This module is only the shape they agree on.
//
// Unlike a `QuestPosition` — an observation about the page currently open —
// this is *progress*, and it is long-lived. So an unreadable value degrades to
// an empty set rather than being treated as a reason to stop: the worst case is
// a player re-marking a few cells, and the best case of strictness would be
// silently refusing to record anything.

/** Wire-format version. Bumped only if the shape changes. */
const VERSION = 1;

/** `row,col`, the same key `questMeta.cellKey` builds. */
const CELL_KEY_RE = /^\d+,\d+$/;

/**
 * Serialise a cleared set. Sorted, so an unchanged set always produces the same
 * string and a no-op write never churns the store.
 */
export function serialiseCleared(cells: ReadonlySet<string>): string {
  return JSON.stringify({ version: VERSION, cells: [...cells].sort() });
}

/** Parse a stored cleared set, or an empty set when there is nothing usable. */
export function parseCleared(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw) as { version?: unknown; cells?: unknown };
    if (parsed?.version !== VERSION || !Array.isArray(parsed.cells)) return new Set();
    return new Set(parsed.cells.filter(
      (key): key is string => typeof key === 'string' && CELL_KEY_RE.test(key),
    ));
  } catch {
    return new Set();
  }
}
```

Append to `src/shared/prefKeys.ts`:

```ts
/**
 * PrefStore key holding one quest's cleared cells (see `questCleared.ts`).
 *
 * One key per quest rather than a single blob: a quest holds at most ~150
 * cells so each value stays small, resetting a quest is a single write, and no
 * write ever has to merge against another quest's progress. Only quests
 * actually walked get a key.
 */
export function questClearedKey(set: QuestSet, questId: string): string {
  return `lc-quest-cleared-${set}-${questId}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/questCleared.test.ts && npm run typecheck`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/shared/questCleared.ts src/shared/prefKeys.ts tests/questCleared.test.ts
git commit -m "feat(quests): store which maze cells are cleared, per quest"
```

---

## Task 7: Read the dungeon page's contents

**Files:**
- Modify: `src/utils/domExtract.ts`
- Test: `tests/domExtract.test.ts`

**Interfaces:**
- Consumes: `extractDungeonSides`, `SideObservations` (existing).
- Produces:
  - `interface DungeonObservation { sides: SideObservations; enemy: boolean; question: boolean }`
  - `extractDungeonObservation(doc: Document): DungeonObservation`
  - `dungeonDirectionInputs(doc: Document): Array<{ side: Side; input: HTMLInputElement }>`

- [ ] **Step 1: Write the failing test**

Append to `tests/domExtract.test.ts` (follow the file's existing JSDOM helper style):

```ts
describe('extractDungeonObservation', () => {
  const dungeon = (inner: string) => new JSDOM(
    `<html><body><form name="urlap"><input type="hidden" name="oldalTipus" value="otLabirintus">${inner}</form></body></html>`,
  ).window.document;

  it('reports an enemy from the composed picture', () => {
    const doc = dungeon('<img src="/pic/labirintus/ellenfel/ellenfel_b.gif">');
    expect(extractDungeonObservation(doc).enemy).toBe(true);
  });

  // Two independent signals, because the monster rule is the one auto-clear
  // rule that has not been watched across a kill: the game cannot offer an
  // attack against a creature that is gone.
  it('reports an enemy from the attack control alone', () => {
    const doc = dungeon('<input type="image" src="/pic/tamadas.gif" title="Támadás">');
    expect(extractDungeonObservation(doc).enemy).toBe(true);
  });

  it('reports no enemy when neither signal is present', () => {
    const doc = dungeon('<img src="/pic/labirintus/fal/fal_f_8.gif">');
    expect(extractDungeonObservation(doc).enemy).toBe(false);
  });

  it('reports a pending question from its answer radios', () => {
    expect(extractDungeonObservation(dungeon('<input type="radio" name="valasz" value="1">')).question).toBe(true);
    expect(extractDungeonObservation(dungeon('')).question).toBe(false);
  });

  it('carries the same sides extractDungeonSides reads', () => {
    const doc = dungeon(`
      <img src="/pic/labirintus/fal/fal_f_8.gif">
      <img src="/pic/labirintus/folyoso/foly_l_3.gif">`);
    expect(extractDungeonObservation(doc).sides).toEqual(extractDungeonSides(doc));
    expect(extractDungeonObservation(doc).sides).toEqual({ N: 'wall', S: 'open' });
  });
});

describe('dungeonDirectionInputs', () => {
  it('pairs each direction control with its side', () => {
    const doc = new JSDOM(`<html><body><form name="urlap">
      <input type="image" src="/pic/eszak.gif" title="Észak">
      <input type="image" src="/pic/nyugat.gif" title="Nyugat">
      <input type="image" src="/pic/ok.gif">
    </form></body></html>`).window.document;

    expect(dungeonDirectionInputs(doc).map((d) => d.side).sort()).toEqual(['N', 'W']);
    expect(dungeonDirectionInputs(doc)[0].input.tagName).toBe('INPUT');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/domExtract.test.ts`
Expected: FAIL — `extractDungeonObservation` / `dungeonDirectionInputs` are not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/utils/domExtract.ts`, after `extractDungeonSides`:

```ts
/** Directory of the enemy silhouette in the composed cell picture. */
const ENEMY_TILE_RE = /\/ellenfel\//;

/**
 * What the dungeon page says about the cell the player is in: its sides, and
 * whether the cell still holds work.
 *
 * `sides` is `extractDungeonSides` verbatim, so the corpus tests that pin the
 * matcher's rates keep testing exactly what they tested before.
 *
 * `enemy` reads **two** independent signals — the silhouette drawn in the
 * composed picture and the game's own attack control — and reports true if
 * either is present. The auto-clear rule that consumes it (a monster the data
 * knows about being gone) is the one rule not yet verified across a live kill,
 * so it is deliberately hard to trip: the game cannot offer an attack against a
 * creature that is no longer there.
 *
 * `question` is the presence of the answer radios, the same signal
 * `extractDungeonQuestion` reads — radios are how the live page asks, and their
 * absence is how it stops asking.
 */
export function extractDungeonObservation(doc: Document): DungeonObservation {
  const enemyTile = Array.from(doc.querySelectorAll<HTMLImageElement>('img'))
    .some((img) => ENEMY_TILE_RE.test(img.getAttribute('src') ?? ''));
  const attackControl = doc.querySelector(`input[type="image"][src*="${ATTACK_BASENAME}.gif"]`) !== null;

  return {
    sides: extractDungeonSides(doc),
    enemy: enemyTile || attackControl,
    question: doc.querySelector('input[name="valasz"]') !== null,
  };
}

/**
 * The game's own direction controls paired with the side each one leads to.
 *
 * Exposed so `trackDungeonMove` can listen on the controls themselves rather
 * than re-deriving the basename map: every movement path in the toolkit ends in
 * a `.click()` on one of these, so they are the one place a step is observable
 * regardless of how it was initiated.
 */
export function dungeonDirectionInputs(
  doc: Document,
): Array<{ side: Side; input: HTMLInputElement }> {
  const found: Array<{ side: Side; input: HTMLInputElement }> = [];
  doc.querySelectorAll<HTMLInputElement>('input[type="image"]').forEach((input) => {
    const dir = DIRECTION_BY_BASENAME[basename(input.getAttribute('src') ?? '')];
    if (dir) found.push({ side: SIDE_BY_DIRECTION[dir], input });
  });
  return found;
}
```

and beside `DungeonState`:

```ts
/** What the dungeon page reveals about the cell the player is standing in. */
export interface DungeonObservation {
  sides: SideObservations;
  /** An enemy is still present: the silhouette is drawn, or an attack is offered. */
  enemy: boolean;
  /** A question is waiting to be answered (its answer radios are on the page). */
  question: boolean;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/domExtract.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/domExtract.ts tests/domExtract.test.ts
git commit -m "feat(dungeon): read whether the cell still holds an enemy or a question"
```

---

## Task 8: Draw a cleared tile

**Files:**
- Modify: `src/database/quests/questMeta.ts`, `src/database/quests/QuestGrid.tsx`, `src/shared/styles/theme.css`
- Test: `tests/database/QuestGrid.test.tsx`

**Interfaces:**
- Consumes: `cellKey` (existing), `questCleared` (Task 6, only for the caller).
- Produces: `QuestGridProps.cleared?: ReadonlySet<string> | null`; `BADGE.cleared = '✓'`; `CLEARED_LABEL = 'teljesítve'`.

- [ ] **Step 1: Write the failing test**

Append to `tests/database/QuestGrid.test.tsx`:

```ts
  it('marks a cleared cell and badges it', () => {
    const { container } = render(
      <QuestGrid quest={quest} monsters={monsters} selected={null} onSelect={() => {}}
        cleared={new Set(['1,0'])} />,
    );
    const cell = container.querySelector('.quest-cell[data-row="1"][data-col="0"]')!;
    expect(cell.classList.contains('cleared')).toBe(true);
    expect(cell.querySelector('.quest-badge.cleared')).not.toBeNull();
    expect(cell.getAttribute('title')).toContain('teljesítve');
  });

  it('leaves other cells alone', () => {
    const { container } = render(
      <QuestGrid quest={quest} monsters={monsters} selected={null} onSelect={() => {}}
        cleared={new Set(['1,0'])} />,
    );
    expect(container.querySelectorAll('.quest-cell.cleared')).toHaveLength(1);
  });

  // Walls are what the player navigates by, and the position marker outranks
  // everything: neither may be swallowed by the dimming.
  it('keeps the walls and the position marker on a cleared cell', () => {
    const { container } = render(
      <QuestGrid quest={quest} monsters={monsters} selected={null} onSelect={() => {}}
        cleared={new Set(['0,1'])}
        position={{ set: 'royal', questId: '1', cells: [{ row: 0, col: 1 }], exact: true, source: 'narration' }} />,
    );
    const cell = container.querySelector('.quest-cell[data-row="0"][data-col="1"]')!;
    expect(cell.classList.contains('cleared')).toBe(true);
    expect(cell.classList.contains('here')).toBe(true);
    expect(cell.querySelector('.quest-edge.wall')).not.toBeNull();
    expect(cell.querySelector('.quest-badge.here')).not.toBeNull();
  });

  it('renders normally without a cleared set', () => {
    const { container } = render(
      <QuestGrid quest={quest} monsters={monsters} selected={null} onSelect={() => {}} />,
    );
    expect(container.querySelectorAll('.quest-cell.cleared')).toHaveLength(0);
  });
```

Note the `source: 'narration'` in the position literal — that field lands in Task 10. Until then TypeScript rejects it, so **write this test with the field and expect it to fail to compile until Task 10**, or run Task 10 first. Simplest ordering: keep the field and note in the commit that `npm run typecheck` passes only from Task 10 onward — so run Task 10 before Task 8 if you prefer a green typecheck at every commit. (The plan orders them this way because the visual work is easier to review on its own; either order is correct.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/database/QuestGrid.test.tsx`
Expected: FAIL — no `.cleared` class or badge.

- [ ] **Step 3: Add the marker to questMeta**

In `src/database/quests/questMeta.ts`, inside `BADGE`:

```ts
  /** A cell whose work is done — monster killed, question answered, trap sprung. */
  cleared: '✓',
```

and beside `HERE_LABEL`:

```ts
/** Tooltip and button copy for a cell the player is done with. */
export const CLEARED_LABEL = 'teljesítve';
```

- [ ] **Step 4: Render it in QuestGrid**

Add the prop:

```ts
  /**
   * Cells the player is done with, keyed by `cellKey`. Dimmed rather than
   * hidden: the maze still has to be readable as a map, and a cleared tile's
   * walls are the part still load-bearing.
   */
  cleared?: ReadonlySet<string> | null;
```

Destructure it with `cleared = null`, then in the per-cell loop after the `void` check:

```ts
        const isCleared = cleared !== null && cleared.has(cellKey(cell));
        if (isCleared) classes.push('cleared');
```

Add the badge as the **first** child of `.quest-badges` (so it reads before the facts it qualifies):

```tsx
              {isCleared && (
                <span class="quest-badge cleared" title={CLEARED_LABEL}>{BADGE.cleared}</span>
              )}
```

and extend the cell title so the state is available without hovering a badge:

```ts
        const titleParts = [coordLabel(cell)];
        if (isHere) titleParts.push(position?.exact ? HERE_LABEL : MAYBE_HERE_LABEL);
        if (isCleared) titleParts.push(CLEARED_LABEL);
```

with `title={titleParts.join(' — ')}` replacing the existing ternary.

- [ ] **Step 5: Style it**

In `src/shared/styles/theme.css` add the variable to `:root`:

```css
  --quest-cleared-bg: #1d1a17;
```

and after the `.quest-badge.here` rule:

```css
/* A cell whose work is done. Dimming is applied to the *contents* rather than
   the cell, on purpose: `opacity` on `.quest-cell` would take its walls with
   it, and the walls are exactly what still matters on a tile you have already
   emptied. The position marker (a ::before on the cell) and its badge stay at
   full strength — standing on a cleared tile is the common case. */
.lc-db .quest-cell.cleared { background: var(--quest-cleared-bg); }
.lc-db .quest-cell.cleared .quest-sprite,
.lc-db .quest-cell.cleared .quest-big-icon,
.lc-db .quest-cell.cleared .quest-badge:not(.here):not(.cleared) {
  opacity: 0.3;
  filter: grayscale(1);
}
.lc-db .quest-badge.cleared { background: var(--quest-cleared-bg); color: var(--text-dim); }
```

- [ ] **Step 6: Run it to verify it passes**

Run: `npx vitest run tests/database/QuestGrid.test.tsx && npm run typecheck`
Expected: PASS (typecheck green once Task 10 has landed — see Step 1's note).

- [ ] **Step 7: Commit**

```bash
git add src/database/quests/questMeta.ts src/database/quests/QuestGrid.tsx \
  src/shared/styles/theme.css tests/database/QuestGrid.test.tsx
git commit -m "feat(quests): gray out the maze tiles whose work is done"
```

---

## Task 9: Toggle and reset cleared cells in the tab

**Files:**
- Modify: `src/database/quests/QuestCellDetail.tsx`, `src/database/quests/QuestView.tsx`
- Test: `tests/database/QuestCellDetail.test.tsx`, `tests/database/QuestView.test.tsx`

**Interfaces:**
- Consumes: `parseCleared`/`serialiseCleared` (Task 6), `questClearedKey` (Task 6), `CLEARED_LABEL` (Task 8), `PrefStore` (existing).
- Produces: `QuestCellDetailProps.cleared?: boolean` and `QuestCellDetailProps.onToggleCleared?: (cell: QuestCell) => void`.

- [ ] **Step 1: Write the failing detail test**

Append to `tests/database/QuestCellDetail.test.tsx`:

```ts
  it('offers a cleared toggle for the selected cell', () => {
    const onToggle = vi.fn();
    const target = cell({ row: 2, col: 3, monsterId: 1 });
    render(<QuestCellDetail cell={target} monsters={monsters} onJumpToMonster={() => {}}
      cleared={false} onToggleCleared={onToggle} />);

    const button = screen.getByRole('button', { name: /Teljesítve/ });
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith(target);
  });

  it('offers to undo it when the cell is already cleared', () => {
    render(<QuestCellDetail cell={cell({ row: 2, col: 3 })} monsters={monsters}
      onJumpToMonster={() => {}} cleared onToggleCleared={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Visszavonás/ })).toBeTruthy();
  });

  it('omits the toggle when no handler is supplied (standalone read-only use)', () => {
    render(<QuestCellDetail cell={cell({ row: 2, col: 3 })} monsters={monsters} onJumpToMonster={() => {}} />);
    expect(screen.queryByRole('button', { name: /Teljesítve/ })).toBeNull();
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/database/QuestCellDetail.test.tsx`
Expected: FAIL — no such button.

- [ ] **Step 3: Add the toggle**

In `src/database/quests/QuestCellDetail.tsx` extend the props:

```ts
  /** Whether this cell is marked cleared. */
  cleared?: boolean;
  /**
   * Toggles the mark. Optional: without it no control is rendered, which is
   * what a read-only host (or a test that does not care) gets.
   */
  onToggleCleared?(cell: QuestCell): void;
```

and render it at the top of the populated panel, above the markers list:

```tsx
      {onToggleCleared && (
        <button
          type="button"
          class={`quest-clear-toggle${cleared ? ' active' : ''}`}
          aria-pressed={cleared === true}
          onClick={() => onToggleCleared(cell)}
        >
          {cleared ? `${CLEARED_LABEL} — Visszavonás` : 'Teljesítve'}
        </button>
      )}
```

Import `CLEARED_LABEL` from `./questMeta`. Add to `theme.css`:

```css
.lc-db .quest-clear-toggle {
  display: block;
  width: 100%;
  margin-bottom: 8px;
  padding: 6px 8px;
  background: var(--panel);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 4px;
  cursor: pointer;
}
.lc-db .quest-clear-toggle.active { color: var(--text-dim); }
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/database/QuestCellDetail.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write the failing view test**

Append to `tests/database/QuestView.test.tsx`:

```ts
  it('persists a cleared cell per quest and offers a reset', async () => {
    const prefStore = makePrefStore({ [QUEST_SET_PREF_KEY]: 'royal', [questSelectedKey('royal')]: '1' });
    const { container } = render(<QuestView loader={makeLoader()} questSet="royal" questId="1"
      prefStore={prefStore} onSelectQuest={() => {}} onJumpToMonster={() => {}} />);

    // Queried by coordinate attributes rather than by title: the tile's title
    // is a composed Hungarian label (`1. sor, 1. oszlop — …`) that these tests
    // have no reason to depend on.
    const tile = await waitFor(() => {
      const el = container.querySelector('.quest-cell[data-row="0"][data-col="0"]');
      expect(el).not.toBeNull();
      return el!;
    });
    fireEvent.click(tile);
    fireEvent.click(screen.getByRole('button', { name: /Teljesítve/ }));

    await waitFor(() => expect(
      parseCleared(prefStore.read(questClearedKey('royal', '1'))),
    ).toEqual(new Set(['0,0'])));
    expect(screen.getByText(/Teljesített: 1/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Visszaállítás/ }));
    await waitFor(() => expect(
      parseCleared(prefStore.read(questClearedKey('royal', '1'))),
    ).toEqual(new Set()));
  });

  it('renders cells the store already marks as cleared', async () => {
    const prefStore = makePrefStore({
      [QUEST_SET_PREF_KEY]: 'royal',
      [questSelectedKey('royal')]: '1',
      [questClearedKey('royal', '1')]: serialiseCleared(new Set(['0,1'])),
    });
    const { container } = render(<QuestView loader={makeLoader()} questSet="royal" questId="1"
      prefStore={prefStore} onSelectQuest={() => {}} onJumpToMonster={() => {}} />);

    await waitFor(() => expect(
      container.querySelector('.quest-cell[data-row="0"][data-col="1"]')?.classList.contains('cleared'),
    ).toBe(true));
  });

  it('shows no reset control when nothing is cleared', async () => {
    const prefStore = makePrefStore({ [QUEST_SET_PREF_KEY]: 'royal', [questSelectedKey('royal')]: '1' });
    const { container } = render(<QuestView loader={makeLoader()} questSet="royal" questId="1"
      prefStore={prefStore} onSelectQuest={() => {}} onJumpToMonster={() => {}} />);

    await waitFor(() => expect(container.querySelector('.quest-cell')).not.toBeNull());
    expect(screen.queryByRole('button', { name: /Visszaállítás/ })).toBeNull();
  });
```

Add the imports `parseCleared, serialiseCleared` from `@/shared/questCleared` and `questClearedKey` from `@/shared/prefKeys`.

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run tests/database/QuestView.test.tsx`
Expected: FAIL — no toggle rendered, nothing persisted.

- [ ] **Step 7: Wire QuestView**

Add state, keyed by the quest actually on screen:

```ts
  /**
   * Cells of the current quest the player is done with.
   *
   * Loaded per quest (and re-loaded when the quest changes) rather than held
   * for the whole set: the store is one key per quest, and a maze is the only
   * scope in which a coordinate means anything.
   */
  const [cleared, setCleared] = useState<Set<string>>(() => new Set());
```

After `const selectedQuestId = quest?.id ?? null;` add:

```ts
  // Re-read whenever the quest on screen changes, and once the data arrives —
  // the boot's auto-clear write can land after this tab mounts, exactly like
  // the detected position above.
  useEffect(() => {
    if (!prefStore || selectedQuestId == null) { setCleared(new Set()); return; }
    setCleared(parseCleared(prefStore.read(questClearedKey(activeSet, selectedQuestId))));
  }, [prefStore, activeSet, selectedQuestId, quests]);

  /** Toggle one cell's cleared mark, writing through to the store. */
  function toggleCleared(cell: QuestCell) {
    if (selectedQuestId == null) return;
    const next = new Set(cleared);
    if (!next.delete(cellKey(cell))) next.add(cellKey(cell));
    setCleared(next);
    prefStore?.write(questClearedKey(activeSet, selectedQuestId), serialiseCleared(next));
  }

  /** Forget this quest's progress — for a repeat run of the same maze. */
  function resetCleared() {
    if (selectedQuestId == null) return;
    setCleared(new Set());
    prefStore?.write(questClearedKey(activeSet, selectedQuestId), serialiseCleared(new Set()));
  }
```

Import `cellKey` from `./questMeta`, `parseCleared`/`serialiseCleared` from `@/shared/questCleared` and `questClearedKey` from `@/shared/prefKeys`; add `QuestCell` to the type import if not already there.

Render the counter beside the stats line, inside `.quest-details`:

```tsx
              {cleared.size > 0 && (
                <div class="quest-stats quest-cleared-count">
                  Teljesített: {cleared.size}
                  <button type="button" class="quest-cleared-reset" onClick={resetCleared}>
                    Visszaállítás
                  </button>
                </div>
              )}
```

Pass the set down:

```tsx
            <QuestGrid … cleared={cleared} />
```

```tsx
          <QuestCellDetail cell={selectedCell} monsters={monsters} onJumpToMonster={onJumpToMonster}
            cleared={selectedCell !== null && cleared.has(cellKey(selectedCell))}
            onToggleCleared={prefStore ? toggleCleared : undefined} />
```

Style in `theme.css`:

```css
.lc-db .quest-cleared-count { display: flex; align-items: center; gap: 8px; }
.lc-db .quest-cleared-reset {
  padding: 2px 6px;
  background: var(--panel);
  color: var(--text-dim);
  border: 1px solid var(--border);
  border-radius: 4px;
  cursor: pointer;
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run tests/database && npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/database/quests/QuestCellDetail.tsx src/database/quests/QuestView.tsx \
  src/shared/styles/theme.css tests/database/QuestCellDetail.test.tsx tests/database/QuestView.test.tsx
git commit -m "feat(quests): mark a maze cell cleared by hand, and reset a quest"
```

---

## Task 10: Record where a position came from

**Files:**
- Modify: `src/shared/questPosition.ts`
- Test: `tests/questPosition.test.ts`, plus every existing test asserting a whole `QuestPosition`

**Interfaces:**
- Consumes: nothing.
- Produces: `QuestPosition.source: 'narration' | 'move'`, wire `VERSION = 2`.

- [ ] **Step 1: Write the failing test**

Append to `tests/questPosition.test.ts`:

```ts
  it('round-trips the source', () => {
    const position: QuestPosition = {
      set: 'royal', questId: '35', cells: [{ row: 0, col: 6 }], exact: true, source: 'move',
    };
    expect(parseQuestPosition(serialiseQuestPosition(position))).toEqual(position);
  });

  // A stored v1 value costs one step in the maze to replace, so it is dropped
  // rather than migrated — the same argument the module already makes.
  it('drops a version-1 value', () => {
    expect(parseQuestPosition(JSON.stringify({
      version: 1, set: 'royal', questId: '35', cells: [{ row: 0, col: 6 }], exact: true,
    }))).toBeNull();
  });

  it('defaults an unrecognised source to narration', () => {
    const parsed = parseQuestPosition(JSON.stringify({
      version: 2, set: 'royal', questId: '35', cells: [{ row: 0, col: 6 }], exact: true, source: 'psychic',
    }));
    expect(parsed?.source).toBe('narration');
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/questPosition.test.ts`
Expected: FAIL — `source` is not a property of `QuestPosition`.

- [ ] **Step 3: Write minimal implementation**

In `src/shared/questPosition.ts` add to the interface:

```ts
  /**
   * How the position was arrived at: matched against the page's narration and
   * walls, or carried forward from the previous cell through a step the player
   * took.
   *
   * Not rendered — a step confirmed by the drawn walls is not a guess to be
   * hedged, and a second visual language for "you are here" would read as a
   * second player. The field exists so the tests and any future diagnostics can
   * tell the two apart.
   */
  source: 'narration' | 'move';
```

Bump `const VERSION = 2;` and in `parseQuestPosition`, before the return:

```ts
    // Defaulted rather than rejected: an unknown source is a diagnostic detail,
    // and the cells — the part that actually places a marker — are unaffected.
    const source = parsed.source === 'move' ? 'move' : 'narration';
```

returning `{ set: parsed.set, questId: parsed.questId, cells, exact: cells.length === 1, source }`.

- [ ] **Step 4: Update the existing assertions**

`locateDungeonPosition` now has to produce `source: 'narration'`. Add that to its returned literal in `src/utils/dungeonPosition.ts`, then fix every test that compares a whole position — at minimum `tests/activateDungeonPosition.test.ts` (`toEqual({ set: 'royal', questId: '35', cells: […], exact: true, source: 'narration' })`) and any `QuestGrid`/`QuestView` fixture literal.

Run: `npm test` and add `source: 'narration'` wherever the compiler or a failing assertion points.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/shared/questPosition.ts src/utils/dungeonPosition.ts tests
git commit -m "feat(quests): record whether a position was matched or walked to"
```

---

## Task 11: Carry a position through a step

**Files:**
- Modify: `src/utils/dungeonPosition.ts`
- Test: `tests/dungeonPosition.test.ts`

**Interfaces:**
- Consumes: `QuestPosition` with `source` (Task 10), `sidesAgree`, `SideObservations` (existing).
- Produces: `propagatePosition(previous: QuestPosition, dir: Side, quest: Quest, observed: SideObservations): QuestPositionCell[]`.

- [ ] **Step 1: Write the failing test**

Append to `tests/dungeonPosition.test.ts`:

```ts
describe('propagatePosition', () => {
  const at = (row: number, col: number, source: 'narration' | 'move' = 'narration'): QuestPosition => ({
    set: 'royal', questId: quest35.id, cells: [{ row, col }], exact: true, source,
  });
  /** An open-sided cell of quest 35 and its northern neighbour, from the data. */
  const openStep = quest35.cells.find((c) => c.edges.N.kind === 'open' && c.row > 0)!;

  it('steps one cell in the moved direction', () => {
    const cells = propagatePosition(at(openStep.row, openStep.col), 'N', quest35, {});
    expect(cells).toEqual([{ row: openStep.row - 1, col: openStep.col }]);
  });

  // The data's own account of whether the step was even possible. A wall means
  // the click cannot have moved the player, whatever the page then printed.
  it('refuses a step through a wall or a szel edge', () => {
    const walled = quest35.cells.find((c) => c.edges.N.kind === 'wall')!;
    expect(propagatePosition(at(walled.row, walled.col), 'N', quest35, {})).toEqual([]);
  });

  it('allows a step through a door', () => {
    const doored = quest35.cells.find((c) => c.edges.E.kind === 'door')!;
    expect(propagatePosition(at(doored.row, doored.col), 'E', quest35, {}))
      .toEqual([{ row: doored.row, col: doored.col + 1 }]);
  });

  it('refuses to step off the grid', () => {
    const top = quest35.cells.find((c) => c.row === 0 && c.edges.N.kind === 'open');
    if (top) expect(propagatePosition(at(0, top.col), 'N', quest35, {})).toEqual([]);
    expect(propagatePosition(at(0, 0), 'W', quest35, {})).toEqual([]);
  });

  it('drops a target the page contradicts', () => {
    const target = quest35.cells.find((c) => c.row === openStep.row - 1 && c.col === openStep.col)!;
    // Claim the opposite of one of the target's real sides.
    const lying: SideObservations = { S: target.edges.S.kind === 'open' ? 'wall' : 'open' };
    expect(propagatePosition(at(openStep.row, openStep.col), 'N', quest35, lying)).toEqual([]);
  });

  // The whole point of propagating a *list*: several candidates stepped and
  // filtered often leave one where no single page could.
  it('propagates every candidate of an ambiguous position', () => {
    const previous: QuestPosition = {
      set: 'royal', questId: quest35.id, exact: false, source: 'narration',
      cells: quest35.cells.filter((c) => c.edges.N.kind === 'open' && c.row > 0)
        .slice(0, 3).map((c) => ({ row: c.row, col: c.col })),
    };
    const cells = propagatePosition(previous, 'N', quest35, {});
    expect(cells.length).toBeGreaterThan(1);
    expect(cells.every((c) => previous.cells.some((p) => p.row === c.row + 1 && p.col === c.col))).toBe(true);
  });
});
```

Add `propagatePosition` to the imports and `import type { QuestPosition } from '@/shared/questPosition';`.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/dungeonPosition.test.ts`
Expected: FAIL — `propagatePosition` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/utils/dungeonPosition.ts`:

```ts
/** Row/column delta of one step towards each side. */
const STEP: Record<Side, { row: number; col: number }> = {
  N: { row: -1, col: 0 },
  E: { row: 0, col: 1 },
  S: { row: 1, col: 0 },
  W: { row: 0, col: -1 },
};

/**
 * Where the player can now be, having taken one step from a known position.
 *
 * Every candidate of `previous` is carried one cell in `dir` and kept only if
 * three things hold: the source cell's own edge in that direction is passable
 * (the data's account of whether the step was possible at all), the target
 * exists in the grid, and the target's sides agree with what the page drew.
 *
 * Propagating the whole candidate list rather than only an exact position is
 * the same code and strictly more useful: three candidates stepped north and
 * filtered by the walls frequently leave one, which no single page could do.
 *
 * A `door` is passable here — a locked door offers no button and cannot have
 * been the step taken, and the caller resolves a failed step by preferring the
 * narration (see `resolveDungeonPosition`).
 */
export function propagatePosition(
  previous: QuestPosition,
  dir: Side,
  quest: Quest,
  observed: SideObservations,
): QuestPositionCell[] {
  const byPosition = new Map(quest.cells.map((c) => [`${c.row},${c.col}`, c]));
  const delta = STEP[dir];
  const out: QuestPositionCell[] = [];

  for (const from of previous.cells) {
    const source = byPosition.get(`${from.row},${from.col}`);
    if (!source) continue;
    const kind = source.edges[dir].kind;
    if (kind === 'wall' || kind === 'szel') continue;

    const target = byPosition.get(`${from.row + delta.row},${from.col + delta.col}`);
    if (!target || !sidesAgree(target, observed)) continue;
    if (out.some((c) => c.row === target.row && c.col === target.col)) continue;
    out.push({ row: target.row, col: target.col });
  }

  return out;
}
```

Import `QuestPositionCell` alongside the existing `QuestPosition` type import.

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/dungeonPosition.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/dungeonPosition.ts tests/dungeonPosition.test.ts
git commit -m "feat(quests): carry a maze position through the step just taken"
```

---

## Task 12: Combine the narration and the step

**Files:**
- Modify: `src/utils/dungeonPosition.ts`
- Test: `tests/dungeonPosition.test.ts`

**Interfaces:**
- Consumes: `locateDungeonPosition`, `propagatePosition` (Task 11).
- Produces:
```ts
export function resolveDungeonPosition(
  narration: string,
  observed: SideObservations,
  quests: readonly Quest[],
  preferredQuestId: string | null,
  previous: QuestPosition | null,
  move: Side | null,
): QuestPosition | null;
```

- [ ] **Step 1: Write the failing test**

Append to `tests/dungeonPosition.test.ts`:

```ts
describe('resolveDungeonPosition', () => {
  const cellAt = (row: number, col: number) =>
    quest35.cells.find((c) => c.row === row && c.col === col)!;
  const sidesOf = (cell: QuestCell): SideObservations => ({
    N: cell.edges.N.kind === 'open' ? 'open' : 'wall',
    E: cell.edges.E.kind === 'open' ? 'open' : 'wall',
    S: cell.edges.S.kind === 'open' ? 'open' : 'wall',
    W: cell.edges.W.kind === 'open' ? 'open' : 'wall',
  });
  /** A pair of vertically adjacent cells of quest 35 where the step is open. */
  const from = quest35.cells.find((c) =>
    c.edges.N.kind === 'open' && c.row > 0 && cellAt(c.row - 1, c.col).narration === '')!;
  const to = cellAt(from.row - 1, from.col);
  const previous: QuestPosition = {
    set: 'royal', questId: '35', cells: [{ row: from.row, col: from.col }], exact: true,
    source: 'narration',
  };

  it('falls back to the step when the page prints no cell text', () => {
    const resolved = resolveDungeonPosition('', sidesOf(to), royal, '35', previous, 'N');
    expect(resolved).toEqual({
      set: 'royal', questId: '35', cells: [{ row: to.row, col: to.col }], exact: true, source: 'move',
    });
  });

  it('keeps the narration match when there is no step to apply', () => {
    const resolved = resolveDungeonPosition(RESTED_AT_0_6, OBSERVED_AT_0_6, royal, '35', null, null);
    expect(resolved).toEqual(locateDungeonPosition(RESTED_AT_0_6, OBSERVED_AT_0_6, royal, '35'));
  });

  it('intersects the two when both have something to say', () => {
    const narrated = quest35.cells.find((c) =>
      c.narration !== '' && c.row > 0 && c.edges.N.kind === 'open')!;
    const target = cellAt(narrated.row - 1, narrated.col);
    const start: QuestPosition = {
      set: 'royal', questId: '35', exact: false, source: 'narration',
      cells: [{ row: narrated.row, col: narrated.col }, { row: 0, col: 0 }],
    };
    const resolved = resolveDungeonPosition(
      target.narration, sidesOf(target), royal, '35', start, 'N',
    );
    expect(resolved?.cells).toContainEqual({ row: target.row, col: target.col });
  });

  // A locked door is drawn *and* offered: the click fails, the player never
  // moves, and the page still describes the old cell. Evidence must win, or the
  // marker confidently walks through a door the player could not open.
  it('believes the narration when the step disagrees, and drops the chain', () => {
    const resolved = resolveDungeonPosition(
      RESTED_AT_0_6, OBSERVED_AT_0_6, royal, '35',
      { set: 'royal', questId: '35', cells: [{ row: 5, col: 5 }], exact: true, source: 'narration' },
      'N',
    );
    expect(resolved?.cells).toEqual([{ row: 0, col: 6 }]);
    expect(resolved?.source).toBe('narration');
  });

  it('returns null when neither source knows anything', () => {
    expect(resolveDungeonPosition('', {}, royal, '35', null, null)).toBeNull();
  });

  // A step is only meaningful inside the maze it was taken in.
  it('ignores a step from a position in another quest than the one matched', () => {
    const foreign: QuestPosition = {
      set: 'tavern', questId: 'GOMB', cells: [{ row: 0, col: 0 }], exact: true, source: 'narration',
    };
    const resolved = resolveDungeonPosition(RESTED_AT_0_6, OBSERVED_AT_0_6, royal, '35', foreign, 'N');
    expect(resolved?.questId).toBe('35');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/dungeonPosition.test.ts`
Expected: FAIL — `resolveDungeonPosition` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/utils/dungeonPosition.ts`:

```ts
/**
 * The player's position from both signals the page offers: the text it printed,
 * and the step they took to get here.
 *
 * Order of authority, and why:
 *
 * 1. **An exact narration match wins outright.** A click on a direction is not
 *    proof of a move — a locked door in a maze is drawn *and* offered, and
 *    clicking it without the key leaves the player where they were. The
 *    narration then still describes the old cell, so believing the page is what
 *    keeps the marker honest. A disagreement drops the chain rather than
 *    averaging two incompatible answers.
 * 2. **They intersect when both are ambiguous or agree**, which is where the
 *    tracking earns its keep: a step filtered by the drawn walls routinely
 *    collapses several candidates to one.
 * 3. **Either fills in for the other's silence.** Roughly a quarter of cells
 *    print no text at all, and that is exactly where a step is the only thing
 *    that knows anything.
 */
export function resolveDungeonPosition(
  narration: string,
  observed: SideObservations,
  quests: readonly Quest[],
  preferredQuestId: string | null,
  previous: QuestPosition | null,
  move: Side | null,
): QuestPosition | null {
  const detected = locateDungeonPosition(narration, observed, quests, preferredQuestId);

  const quest = previous && move
    ? quests.find((q) => q.id === previous.questId && q.set === previous.set)
    : undefined;
  if (!quest || !previous || !move) return detected;

  const stepped = propagatePosition(previous, move, quest, observed);
  if (stepped.length === 0) return detected;

  const walked: QuestPosition = {
    set: quest.set,
    questId: quest.id,
    cells: stepped,
    exact: stepped.length === 1,
    source: 'move',
  };

  if (!detected) return walked;
  // A step out of one maze cannot narrow a match in another.
  if (detected.set !== walked.set || detected.questId !== walked.questId) return detected;

  const both = walked.cells.filter((c) =>
    detected.cells.some((d) => d.row === c.row && d.col === c.col));
  if (both.length === 0) return detected;
  if (detected.exact) return detected;

  return { ...walked, cells: both, exact: both.length === 1 };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/dungeonPosition.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/dungeonPosition.ts tests/dungeonPosition.test.ts
git commit -m "feat(quests): resolve a position from the narration and the step together"
```

---

## Task 13: Record the step the player takes

**Files:**
- Create: `src/utils/trackDungeonMove.ts`
- Modify: `src/shared/prefKeys.ts`
- Test: `tests/trackDungeonMove.test.ts`

**Interfaces:**
- Consumes: `dungeonDirectionInputs` (Task 7).
- Produces: `QUEST_MOVE_PREF_KEY` (`'lc-quest-move'`), `armDungeonMoveTracking(doc: Document, writePref: WritePref): void`, `takePendingMove(readPref: ReadPref, writePref: WritePref): Side | null`.

- [ ] **Step 1: Write the failing test**

Create `tests/trackDungeonMove.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { armDungeonMoveTracking, takePendingMove } from '../src/utils/trackDungeonMove';
import { QUEST_MOVE_PREF_KEY } from '@/shared/prefKeys';

function makePrefs(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    read: (key: string) => store.get(key) ?? null,
    write: vi.fn((key: string, value: string) => { store.set(key, value); }),
    stored: store,
  };
}

function dungeonDoc(): Document {
  return new JSDOM(`<html><body><form name="urlap">
    <input type="hidden" name="oldalTipus" value="otLabirintus">
    <input type="image" src="/pic/eszak.gif" title="Észak">
    <input type="image" src="/pic/del.gif" title="Dél">
    <input type="image" src="/pic/ok.gif">
  </form></body></html>`).window.document;
}

describe('trackDungeonMove', () => {
  it('records the side of the control that was clicked', () => {
    const doc = dungeonDoc();
    const prefs = makePrefs();
    armDungeonMoveTracking(doc, prefs.write);

    doc.querySelector<HTMLInputElement>('input[src*="eszak"]')!.click();
    expect(prefs.stored.get(QUEST_MOVE_PREF_KEY)).toBe('N');
  });

  // Every movement path in the toolkit ends in a .click() on the game's own
  // control — mobile's NavPad, the desktop shortcuts, and the player's own
  // click — so listening there catches all of them.
  it('records the last click when several happen', () => {
    const doc = dungeonDoc();
    const prefs = makePrefs();
    armDungeonMoveTracking(doc, prefs.write);

    doc.querySelector<HTMLInputElement>('input[src*="eszak"]')!.click();
    doc.querySelector<HTMLInputElement>('input[src*="del"]')!.click();
    expect(prefs.stored.get(QUEST_MOVE_PREF_KEY)).toBe('S');
  });

  it('ignores controls that are not directions', () => {
    const doc = dungeonDoc();
    const prefs = makePrefs();
    armDungeonMoveTracking(doc, prefs.write);

    doc.querySelector<HTMLInputElement>('input[src*="ok"]')!.click();
    expect(prefs.write).not.toHaveBeenCalled();
  });

  it('reads a pending move once and clears it', () => {
    const prefs = makePrefs({ [QUEST_MOVE_PREF_KEY]: 'W' });
    expect(takePendingMove(prefs.read, prefs.write)).toBe('W');
    expect(prefs.stored.get(QUEST_MOVE_PREF_KEY)).toBe('');
    expect(takePendingMove(prefs.read, prefs.write)).toBeNull();
  });

  it('rejects a stored value that is not a side', () => {
    const prefs = makePrefs({ [QUEST_MOVE_PREF_KEY]: 'up' });
    expect(takePendingMove(prefs.read, prefs.write)).toBeNull();
  });

  it('survives a throwing store', () => {
    const doc = dungeonDoc();
    armDungeonMoveTracking(doc, () => { throw new Error('quota'); });
    expect(() => doc.querySelector<HTMLInputElement>('input[src*="eszak"]')!.click()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/trackDungeonMove.test.ts`
Expected: FAIL — cannot resolve `../src/utils/trackDungeonMove`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/shared/prefKeys.ts`:

```ts
/**
 * PrefStore key holding the step the player has just taken inside a labyrinth
 * (`'N'`/`'E'`/`'S'`/`'W'`), written the moment a direction control is clicked
 * and consumed by the next dungeon page.
 *
 * Only a direction, deliberately: the cell it started from is whatever
 * `QUEST_POSITION_PREF_KEY` still holds when the next page reads it, so the
 * click handler needs nothing that detection may not have produced yet.
 */
export const QUEST_MOVE_PREF_KEY = 'lc-quest-move';
```

Create `src/utils/trackDungeonMove.ts`:

```ts
// Noticing that the player has walked somewhere.
//
// A dungeon page never states a coordinate, but the step taken to reach it is
// observable: every movement path in the toolkit — the player's own click, the
// mobile NavPad, the desktop keyboard shortcuts — ends in a `.click()` on one
// of the game's own direction controls. A capture-phase listener there sees all
// of them without knowing about any of them.
//
// Two properties make this safe:
//
// - **It cannot race the detection.** The listener is attached at boot, long
//   before the async quest-data load resolves, and it stores only a direction:
//   the cell it came from is read on the *next* page load, from the position
//   pref that is still standing.
// - **It is armed only on dungeon pages**, so a step taken in the city can
//   never be replayed against a maze.

import type { Side } from '@/shared/data';
import { QUEST_MOVE_PREF_KEY } from '@/shared/prefKeys';
import { dungeonDirectionInputs } from './domExtract';
import type { ReadPref, WritePref } from './activateDungeonPosition';

const SIDES: readonly Side[] = ['N', 'E', 'S', 'W'];

/**
 * Start recording the player's steps on this dungeon page.
 *
 * Capture phase, so the write lands before the game's own inline handler
 * submits the form and navigates away. Failures are swallowed: a lost step
 * costs a marker, never the move.
 */
export function armDungeonMoveTracking(doc: Document, writePref: WritePref): void {
  for (const { side, input } of dungeonDirectionInputs(doc)) {
    input.addEventListener('click', () => {
      try {
        writePref(QUEST_MOVE_PREF_KEY, side);
      } catch (err) {
        console.warn('[Larkinor UI] Dungeon move: could not store the step:', err);
      }
    }, true);
  }
}

/**
 * Read the pending step and clear it in the same breath.
 *
 * Clearing on read is what keeps a phantom step from being replayed: resting,
 * answering a question, fighting and a move the game refused all produce a new
 * page without a step, and any of them would otherwise inherit the last one.
 */
export function takePendingMove(readPref: ReadPref, writePref: WritePref): Side | null {
  let raw: string | null = null;
  try {
    raw = readPref(QUEST_MOVE_PREF_KEY);
    if (raw) writePref(QUEST_MOVE_PREF_KEY, '');
  } catch (err) {
    console.warn('[Larkinor UI] Dungeon move: could not read the step:', err);
    return null;
  }
  return SIDES.includes(raw as Side) ? (raw as Side) : null;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/trackDungeonMove.test.ts && npm run typecheck`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/utils/trackDungeonMove.ts src/shared/prefKeys.ts tests/trackDungeonMove.test.ts
git commit -m "feat(dungeon): record the direction the player steps in"
```

---

## Task 14: Activate tracking, the active quest and auto-clear

**Files:**
- Modify: `src/utils/activateDungeonPosition.ts`, `src/mobile/boot.ts`, `src/desktop/boot.ts`
- Test: `tests/activateDungeonPosition.test.ts`, `tests/mobileBootDungeonPosition.test.ts` / `tests/desktopBoot.test.ts` (whichever boot dungeon tests exist — extend both)

**Interfaces:**
- Consumes: `resolveDungeonPosition` (Task 12), `takePendingMove` (Task 13), `parseCleared`/`serialiseCleared`/`questClearedKey` (Task 6), `DungeonObservation` (Task 7), `ACTIVE_ROYAL_QUEST_PREF_KEY` (Task 2).
- Produces: the new signature
```ts
export async function activateDungeonPosition(
  narration: string,
  observation: DungeonObservation,
  loader: DataLoader,
  readPref: ReadPref,
  writePref: WritePref,
): Promise<QuestPosition | null>;
```
(the second parameter changes from `SideObservations` to the richer `DungeonObservation`).

- [ ] **Step 1: Write the failing tests**

In `tests/activateDungeonPosition.test.ts`, change the existing calls to pass an observation
(`{ sides: OBSERVED_AT_0_6, enemy: false, question: false }`) and append:

```ts
  it('prefers the quest the game names as active over the last browsed one', async () => {
    const prefs = makePrefs({
      [QUEST_SET_PREF_KEY]: 'royal',
      [questSelectedKey('royal')]: '12',
      [ACTIVE_ROYAL_QUEST_PREF_KEY]: '35',
    });
    const position = await activateDungeonPosition(
      RESTED_AT_0_6, observed(), makeLoader(), prefs.read, prefs.write,
    );
    expect(position?.questId).toBe('35');
  });

  it('carries the position through a pending step when the page prints no text', async () => {
    const from = quest35.cells.find((c) => c.edges.N.kind === 'open' && c.row > 0)!;
    const to = quest35.cells.find((c) => c.row === from.row - 1 && c.col === from.col)!;
    const prefs = makePrefs({
      [QUEST_SET_PREF_KEY]: 'royal',
      [questSelectedKey('royal')]: '35',
      [QUEST_POSITION_PREF_KEY]: serialiseQuestPosition({
        set: 'royal', questId: '35', cells: [{ row: from.row, col: from.col }],
        exact: true, source: 'narration',
      }),
      [QUEST_MOVE_PREF_KEY]: 'N',
    });

    const position = await activateDungeonPosition('', observed(to), makeLoader(), prefs.read, prefs.write);

    expect(position).toEqual({
      set: 'royal', questId: '35', cells: [{ row: to.row, col: to.col }], exact: true, source: 'move',
    });
    // Consumed, so the next page cannot replay it.
    expect(prefs.stored.get(QUEST_MOVE_PREF_KEY)).toBe('');
  });

  it('marks a killed monster cleared', async () => {
    const monsterCell = quest35.cells.find((c) => c.monsterId != null && c.narration !== '')!;
    const prefs = makePrefs({ [QUEST_SET_PREF_KEY]: 'royal', [questSelectedKey('royal')]: '35' });

    await activateDungeonPosition(
      monsterCell.narration,
      { sides: {}, enemy: false, question: false },
      makeLoader(), prefs.read, prefs.write,
    );

    expect(parseCleared(prefs.stored.get(questClearedKey('royal', '35')) ?? null))
      .toContain(`${monsterCell.row},${monsterCell.col}`);
  });

  it('leaves a monster that is still standing there alone', async () => {
    const monsterCell = quest35.cells.find((c) => c.monsterId != null && c.narration !== '')!;
    const prefs = makePrefs({ [QUEST_SET_PREF_KEY]: 'royal', [questSelectedKey('royal')]: '35' });

    await activateDungeonPosition(
      monsterCell.narration,
      { sides: {}, enemy: true, question: false },
      makeLoader(), prefs.read, prefs.write,
    );

    expect(parseCleared(prefs.stored.get(questClearedKey('royal', '35')) ?? null)).toEqual(new Set());
  });

  it('marks a trap cell cleared on arrival', async () => {
    const trapCell = quest35.cells.find((c) => c.trap && c.narration !== '');
    if (!trapCell) return; // the fixture quest has no narrated trap
    const prefs = makePrefs({ [QUEST_SET_PREF_KEY]: 'royal', [questSelectedKey('royal')]: '35' });

    await activateDungeonPosition(
      trapCell.narration, { sides: {}, enemy: false, question: false },
      makeLoader(), prefs.read, prefs.write,
    );

    expect(parseCleared(prefs.stored.get(questClearedKey('royal', '35')) ?? null))
      .toContain(`${trapCell.row},${trapCell.col}`);
  });

  it('clears nothing when the position is ambiguous', async () => {
    // A narration shared by more than one cell of the quest, so no single cell
    // can be credited with the clearing.
    const prefs = makePrefs({ [QUEST_SET_PREF_KEY]: 'royal' });
    const shared = royal.flatMap((q) => q.cells).find((c) =>
      c.narration !== '' && royal.flatMap((q) => q.cells)
        .filter((o) => o.narration === c.narration).length > 3)!;

    const position = await activateDungeonPosition(
      shared.narration, { sides: {}, enemy: false, question: false },
      makeLoader(), prefs.read, prefs.write,
    );

    if (position && !position.exact) {
      expect(parseCleared(prefs.stored.get(questClearedKey(position.set, position.questId)) ?? null))
        .toEqual(new Set());
    }
  });
```

Add a helper at the top of the file and the new imports:

```ts
const quest35 = royal.find((q) => q.id === '35')!;
const observed = (cell?: { edges: Record<'N'|'E'|'S'|'W', { kind: string }> }) => ({
  sides: cell
    ? Object.fromEntries((['N', 'E', 'S', 'W'] as const)
        .map((s) => [s, cell.edges[s].kind === 'open' ? 'open' : 'wall'])) as SideObservations
    : OBSERVED_AT_0_6,
  enemy: false,
  question: false,
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/activateDungeonPosition.test.ts`
Expected: FAIL — the signature does not take an observation and nothing is cleared.

- [ ] **Step 3: Rewrite the activation**

Replace the body of `activateDungeonPosition` in `src/utils/activateDungeonPosition.ts`:

```ts
export async function activateDungeonPosition(
  narration: string,
  observation: DungeonObservation,
  loader: DataLoader,
  readPref: ReadPref,
  writePref: WritePref,
): Promise<QuestPosition | null> {
  const storedSet = readPref(QUEST_SET_PREF_KEY);
  const set: QuestSet = isQuestSet(storedSet) ? storedSet : 'royal';

  // Read before anything is written: both of these describe the page *before*
  // this one, and the writes below overwrite them.
  const previous = parseQuestPosition(readPref(QUEST_POSITION_PREF_KEY));
  const move = takePendingMove(readPref, writePref);

  let quests: Quest[];
  try {
    quests = set === 'tavern' ? await loader.loadTavernQuests() : await loader.loadQuests();
  } catch (err) {
    console.warn('[Larkinor UI] Dungeon position: quest data unavailable:', err);
    return null;
  }

  // What the game says the character is doing beats what the reader last
  // browsed — but only within the royal set, since an active royal quest says
  // nothing about whether the player has wandered into a tavern labyrinth.
  const preferred = (set === 'royal' ? readPref(ACTIVE_ROYAL_QUEST_PREF_KEY) : null)
    ?? readPref(questSelectedKey(set));

  const position = resolveDungeonPosition(
    narration, observation.sides, quests, preferred, previous, move,
  );

  try {
    writePref(QUEST_POSITION_PREF_KEY, position ? serialiseQuestPosition(position) : '');
    // A hit outside the remembered quest is the store being stale, not the
    // player being lost — move the selection so the grid opens on the maze they
    // are actually walking.
    if (position) writePref(questSelectedKey(position.set), position.questId);
  } catch (err) {
    console.warn('[Larkinor UI] Dungeon position: could not store the position:', err);
  }

  if (position?.exact) {
    recordClearedCell(position, quests, observation, readPref, writePref);
  }

  return position;
}

/**
 * Mark the cell the player is standing on as cleared, when the page proves its
 * work is done.
 *
 * Only ever called for an **exact** position: a mark on the wrong cell is worse
 * than no mark, and an ambiguous match has no single cell to credit.
 *
 * Three rules, each comparing the page against the data:
 *
 * - a monster the data knows about, with neither the enemy silhouette nor an
 *   attack control on the page → killed;
 * - a question cell with no answer radios → answered;
 * - a trap cell → sprung, on arrival: a trap fires on entry, so standing here
 *   *is* the evidence.
 *
 * Nothing is written when the cell holds none of those, so an ordinary empty
 * room never accumulates a mark it does not deserve.
 */
function recordClearedCell(
  position: QuestPosition,
  quests: readonly Quest[],
  observation: DungeonObservation,
  readPref: ReadPref,
  writePref: WritePref,
): void {
  const quest = quests.find((q) => q.id === position.questId && q.set === position.set);
  const [at] = position.cells;
  const cell = quest?.cells.find((c) => c.row === at.row && c.col === at.col);
  if (!cell) return;

  const done = (cell.monsterId != null && !observation.enemy)
    || (cell.hasQuestion && !observation.question)
    || cell.trap;
  if (!done) return;

  try {
    const key = questClearedKey(position.set, position.questId);
    const cleared = parseCleared(readPref(key));
    const cellId = `${cell.row},${cell.col}`;
    if (cleared.has(cellId)) return;
    cleared.add(cellId);
    writePref(key, serialiseCleared(cleared));
  } catch (err) {
    console.warn('[Larkinor UI] Dungeon position: could not store the cleared cell:', err);
  }
}
```

with the imports:

```ts
import { ACTIVE_ROYAL_QUEST_PREF_KEY, QUEST_POSITION_PREF_KEY, QUEST_SET_PREF_KEY, questClearedKey, questSelectedKey } from '@/shared/prefKeys';
import { parseQuestPosition, serialiseQuestPosition, type QuestPosition } from '@/shared/questPosition';
import { parseCleared, serialiseCleared } from '@/shared/questCleared';
import { resolveDungeonPosition } from './dungeonPosition';
import { takePendingMove } from './trackDungeonMove';
import type { DungeonObservation } from './domExtract';
```

Note the import cycle to avoid: `trackDungeonMove` imports the `ReadPref`/`WritePref` types from this module and this module imports `takePendingMove` from it. Type-only imports do not create a runtime cycle, but keep it clean by moving `ReadPref`/`WritePref` into `src/shared/prefKeys.ts` and re-exporting them from `activateDungeonPosition.ts` for its existing importers:

```ts
// in prefKeys.ts
/** Writes one preference. In the userscript this is `setPref` (GM-backed). */
export type WritePref = (key: string, value: string) => void;
/** Reads one preference. In the userscript this is `getPref` (GM-backed). */
export type ReadPref = (key: string) => string | null;
```

```ts
// in activateDungeonPosition.ts — keeps every existing import path working
export type { ReadPref, WritePref } from '@/shared/prefKeys';
```

- [ ] **Step 4: Update both boots**

In `src/mobile/boot.ts` and `src/desktop/boot.ts`, replace the dungeon branch with:

```ts
  if (pageType === PageType.Dungeon) {
    // Armed first, and synchronously: a step taken before the async detection
    // resolves must still be recorded.
    armDungeonMoveTracking(doc, setPref);
    activateDungeonPosition(
      extractNarration(doc),
      extractDungeonObservation(doc),
      createDataLoader(gmSource(), DATA_BASE_URL),
      getPref,
      setPref,
    ).catch((err) => console.warn('[Larkinor UI] Dungeon position failed:', err));
  } else {
    clearDungeonPosition(setPref);
  }
```

swapping `extractDungeonSides` for `extractDungeonObservation` in the imports and adding `import { armDungeonMoveTracking } from '@/utils/trackDungeonMove';`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS. Fix any boot test still passing a bare `SideObservations`.

- [ ] **Step 6: Commit**

```bash
git add src/utils/activateDungeonPosition.ts src/shared/prefKeys.ts src/mobile/boot.ts \
  src/desktop/boot.ts tests
git commit -m "feat(quests): track steps in the maze and clear the tiles behind you"
```

---

## Task 15: Measure what tracking is worth

**Files:**
- Modify: `tests/dungeonPosition.test.ts`

**Interfaces:**
- Consumes: `resolveDungeonPosition` (Task 12), the committed corpora.
- Produces: nothing — a measurement that fails loudly if a data refresh degrades detection.

- [ ] **Step 1: Write the measurement**

Append to `tests/dungeonPosition.test.ts`:

```ts
/**
 * Match rates along a **walk**, rather than page by page.
 *
 * The per-page rates above are what one page can do on its own. These are what
 * the same pages achieve when the step between them is known — the whole
 * argument for tracking movement, measured rather than asserted.
 *
 * The walk is deterministic (a seeded PRNG, no Math.random) so the pinned
 * numbers mean something: a data refresh that degrades detection fails here.
 */
describe('corpus walk rates', () => {
  /** mulberry32 — small, seeded, and adequate for choosing an exit. */
  function rng(seed: number): () => number {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const STEP = { N: [-1, 0], E: [0, 1], S: [1, 0], W: [0, -1] } as const;
  const sidesOf = (cell: QuestCell): SideObservations => Object.fromEntries(
    (['N', 'E', 'S', 'W'] as const).map((s) => [
      s,
      cell.edges[s].kind === 'open' ? 'open' : cell.edges[s].kind === 'door' ? 'door' : 'wall',
    ]),
  ) as SideObservations;

  /** Share of steps resolved to a single cell, walking each quest once. */
  function walkRate(quests: Quest[], useMoves: boolean): number {
    const random = rng(20260827);
    let steps = 0;
    let exact = 0;

    for (const quest of quests) {
      const byPosition = new Map(quest.cells.map((c) => [`${c.row},${c.col}`, c]));
      let at = quest.cells.find((c) => c.portal === 'entrance') ?? quest.cells[0];
      let previous: QuestPosition | null = null;
      let move: Side | null = null;

      for (let i = 0; i < 40; i += 1) {
        const resolved = resolveDungeonPosition(
          at.narration, sidesOf(at), quests, quest.id,
          useMoves ? previous : null, useMoves ? move : null,
        );
        steps += 1;
        if (resolved?.exact) exact += 1;
        previous = resolved;

        const exits = (['N', 'E', 'S', 'W'] as const).filter((s) => {
          if (at.edges[s].kind === 'wall' || at.edges[s].kind === 'szel') return false;
          const [dr, dc] = STEP[s];
          return byPosition.has(`${at.row + dr},${at.col + dc}`);
        });
        if (exits.length === 0) break;
        move = exits[Math.floor(random() * exits.length)];
        const [dr, dc] = STEP[move];
        at = byPosition.get(`${at.row + dr},${at.col + dc}`)!;
      }
    }

    return exact / steps;
  }

  it('pins how much the step adds on a royal walk', () => {
    const withoutMoves = walkRate(royal, false);
    const withMoves = walkRate(royal, true);
    // Replace both numbers with the values the first run prints, to 2 decimals.
    expect(withoutMoves).toBeCloseTo(0, 2);
    expect(withMoves).toBeCloseTo(0, 2);
    expect(withMoves).toBeGreaterThan(withoutMoves);
  });

  it('pins the tavern walk', () => {
    const withoutMoves = walkRate(tavern, false);
    const withMoves = walkRate(tavern, true);
    expect(withoutMoves).toBeCloseTo(0, 2);
    expect(withMoves).toBeCloseTo(0, 2);
    expect(withMoves).toBeGreaterThanOrEqual(withoutMoves);
  });
});
```

- [ ] **Step 2: Run it to read the real numbers**

Run: `npx vitest run tests/dungeonPosition.test.ts -t 'walk'`
Expected: FAIL, printing the actual rates.

- [ ] **Step 3: Pin the measured numbers**

Replace each `toBeCloseTo(0, 2)` with the printed value rounded to two decimals, and write a one-line comment above each pair stating the gap in words (e.g. `// 74% page-by-page → 93% when the step is known.`). Do **not** relax `toBeCloseTo`'s precision to make a number fit.

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/dungeonPosition.test.ts && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/dungeonPosition.test.ts
git commit -m "test(quests): pin how much tracking the step improves detection"
```

---

## Task 16: Verify the enemy signal on the live game

The one rule in this plan resting on an unverified assumption. It ships behind two signals and a manual override, so this task confirms or corrects it rather than gating the feature.

**Files:**
- Modify: `CLAUDE.md` (record the finding), `src/utils/domExtract.ts` (only if the finding contradicts the rule)
- Artifacts: `.tmp/dungeon-enemy-before.html`, `.tmp/dungeon-enemy-after.html`

- [ ] **Step 1: Capture a dungeon cell holding a live monster**

With a game session open (Playwright MCP, or DevTools on the live page), navigate into a labyrinth cell whose quest data lists a monster and save the page:

```js
document.body.innerHTML
```

Write it to `.tmp/dungeon-enemy-before.html`. Remember that a capture taken through `browser_evaluate` arrives **JSON-encoded** — `JSON.parse` it before feeding it to JSDOM, or every query reads as null and looks like an extractor bug (see CLAUDE.md).

- [ ] **Step 2: Kill it and capture the same cell again**

Save the post-kill page to `.tmp/dungeon-enemy-after.html`.

- [ ] **Step 3: Compare what the two pages say**

```bash
for f in .tmp/dungeon-enemy-before.html .tmp/dungeon-enemy-after.html; do
  echo "== $f"
  grep -o 'ellenfel[^"]*' "$f" | sort -u
  grep -o 'tamadas[^"]*' "$f" | sort -u
done
```

Expected if the assumption holds: both tokens present before, neither after.

- [ ] **Step 4: Record the finding in CLAUDE.md**

Under the dungeon-page bullets, add what was observed — in the affirmative case:

```
  - **The enemy silhouette and the attack control are both dropped once the
    creature is dead** (verified live on <date>, captures in `.tmp/`), which is
    what lets a killed monster be inferred rather than tracked: see
    `extractDungeonObservation`. Both are read, not one, because either alone
    would be a single point of failure for a rule that writes persistent state.
```

If the capture contradicts it, fix `extractDungeonObservation` to use whichever signal proved reliable (or drop the automatic monster rule and leave it to the manual toggle), update `tests/domExtract.test.ts`, and record what was actually seen — a wrong note here is worse than no note.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md src/utils/domExtract.ts tests/domExtract.test.ts
git commit -m "docs(dungeon): record what the page shows after a kill"
```

---

## Task 17: Document the behaviour

**Files:**
- Modify: `CLAUDE.md`, `README.md`

- [ ] **Step 1: Add the hard-won facts to CLAUDE.md**

Under the quest viewer section, beside *the labyrinth marks where you are standing*, add three bullets:

- **The game names the active royal quest.** `Aktuális küldetés: (39)` in any page's narration is a royal `Quest.id` — tavern quests are keyed by slug and have no number to print — so the recognition needs no data file at all (`src/utils/activeQuest.ts`). The selection moves **only when the id changes** and the *set* is never written from it: ordinary city pages print the line, so writing the set would drag a player mid-way through a tavern quest back to royal on every step. Desktop splices the sentence itself into a link (`activeQuestLink.ts`, through the shared `narrationSplice.ts`); mobile passes offsets to `NarrationPanel`, which already splices spans by offset.
- **Cleared tiles are inferred, not tracked.** `extractDungeonObservation` reads two independent enemy signals (the `ellenfel/` silhouette and the `tamadas` control) plus the question radios; a monster the data knows about with neither enemy signal present is dead, a question cell with no radios is answered, and a trap cell is sprung by the act of standing on it. Only an **exact** position may write a mark. Progress lives one key per quest (`lc-quest-cleared-<set>-<id>`) and never expires — unlike a position, it is progress, so an unreadable value degrades to "nothing cleared" instead of stopping the caller.
- **A step is evidence, but weaker evidence than the page.** `lc-quest-move` holds only a direction, written in the capture phase on the game's own direction control (which every movement path in the toolkit clicks) and consumed-and-cleared by the next dungeon page. `resolveDungeonPosition` lets an exact narration match win a conflict, because a **locked door is drawn and offered**: the click fails, the player never moves, and only the narration knows. Where the two agree or are both ambiguous they intersect, which is what collapses candidate sets a single page cannot separate; where the page prints nothing, the step is all there is. Rates for both are pinned in `tests/dungeonPosition.test.ts`.

- [ ] **Step 2: Add the user-facing lines to README.md**

In the quest-tab feature list, add: the active quest is a link into the tab; cleared tiles gray out automatically and can be toggled by hand (with a per-quest reset); the position marker follows the player's steps.

- [ ] **Step 3: Final verification**

Run: `npm test && npm run typecheck && npm run build`
Expected: all pass, both bundles built.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs(quests): record the active quest, cleared tiles and step tracking"
```

---

## Self-Review

**Spec coverage**

| Spec section | Task |
|---|---|
| Part 1 source analysis, `findActiveQuest` | 1 |
| `activateActiveQuest`, write-on-change, never the set | 2 |
| Shared splice machinery | 3 |
| Desktop link + boot + explicit route | 4 |
| Mobile `NarrationPanel` span + three pages + boot | 5 |
| Active quest as preferred quest for detection | 14 (`preferred`) |
| `questCleared.ts`, per-quest key, lenient parse | 6 |
| `extractDungeonObservation`, both enemy signals | 7 |
| `.cleared` rendering, walls and marker preserved | 8 |
| Manual toggle, header reset, `QuestView` state | 9 |
| `QuestPosition.source`, VERSION 2 | 10 |
| `propagatePosition` | 11 |
| `resolveDungeonPosition`, four branches, locked door | 12 |
| `trackDungeonMove`, `dungeonDirectionInputs`, consume-and-clear | 13 |
| Auto-clear rules, boots armed | 14 |
| Seeded walk measurement | 15 |
| Live confirmation of the enemy assumption | 16 |
| Documentation | 17 |

**Known ordering note:** Task 8's test fixture uses `QuestPosition.source`, which Task 10 introduces. Either run Task 10 first, or accept that Task 8's `npm run typecheck` is red until Task 10 lands. Task 8 states this in its Step 1.

**Type consistency:** `ReadPref`/`WritePref` are defined once in `prefKeys.ts` from Task 14 onward and re-exported from `activateDungeonPosition.ts`, so imports written in Tasks 2 and 13 keep resolving. `Side` (not `Direction`) is the movement vocabulary in `propagatePosition`, `resolveDungeonPosition`, `trackDungeonMove` and `dungeonDirectionInputs`. `cellKey`-shaped `'row,col'` strings are the cleared-set vocabulary in `questCleared.ts`, `QuestGrid`, `QuestView` and `recordClearedCell`.
