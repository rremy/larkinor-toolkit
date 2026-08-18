# Equipment capture and hover compare — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture the player's equipped items when the character page is visited, and diff any weapon or armour row against them on hover (desktop) or long-press (touch).

**Architecture:** Two halves joined by one stored value. A silent capture on `oldalTipus=otPlayerSettings` parses each slot's `onclick="alert('…')"` stat block with the existing `parseCuccDetail` and writes a `Loadout` to GM storage. A pure `compare.ts` turns (candidate, loadout) into columns of labelled diff rows; a `useCompare` hook plus a `CompareCard` component render them on three surfaces, fed by a `LoadoutContext` the two boots provide.

**Tech Stack:** Vite + Preact + TypeScript, Vitest + @testing-library/preact (jsdom), ViolentMonkey GM storage.

**Spec:** `docs/superpowers/specs/2026-08-18-equipment-compare-design.md`

## Global Constraints

- All comments and identifiers in English; all user-facing copy in Hungarian.
- No hardcoded hex/rgba in CSS rule bodies — use the existing `:root` variables (`--good`, `--bad`, `--panel`, `--border`, `--text`, `--muted`).
- No unscoped element selectors in CSS: everything under `#lc-root`, `#lc-dock-root` or a `.lc-*` class (the game page stays visible on desktop).
- Anything rendering a `<table>` or form control inside the game page must set `color` explicitly — the game page is quirks mode (`BackCompat`) and does not inherit `color` into tables.
- `src/shared/**` and `src/database/**` must stay free of `GM_*` references (see the header comment in `src/shared/prefKeys.ts`).
- Temporary files go in the git-ignored `.tmp/`, never the repo root.
- Verification gates, all from the repo root: `npm run typecheck`, `npm test`, `npm run build`.
- Commit style: repo convention `type(scope): subject`, imperative, lowercase subject.

## Deviation from the spec (decided during planning, with reason)

The spec says the trigger works "off pointer events". **jsdom 24.1.3 does not implement `PointerEvent`** (verified: `typeof window.PointerEvent === 'undefined'`, while `MouseEvent` and `TouchEvent` both exist), so pointer-event tests would assert against a fabricated event object rather than the thing the browser sends. The hook therefore uses **mouse events for hover and touch events for long-press**, plus a suppression window so the emulated `mouseenter` a tap produces cannot open the hover card on touch. Same two gestures, same behaviour, honestly testable.

---

### Task 1: Detect the character page

**Files:**
- Modify: `src/utils/pageDetector.ts:1-52`
- Test: `tests/pageDetector.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `PageType.Character`, returned by `detectPage(doc)` for `oldalTipus === 'otPlayerSettings'`.

- [ ] **Step 1: Write the failing test**

Append to `tests/pageDetector.test.ts`, inside its existing `describe`, using the file's own `makeDoc` helper:

```ts
  it('detects the character page from otPlayerSettings', () => {
    expect(detectPage(makeDoc('otPlayerSettings'))).toBe(PageType.Character);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pageDetector.test.ts`
Expected: FAIL — `PageType.Character` is undefined, so the assertion compares against `undefined`.

- [ ] **Step 3: Write minimal implementation**

In `src/utils/pageDetector.ts`, add to the enum (after `Home`):

```ts
  Character = 'Character',
```

and to the switch (after the `otSajathaz` case):

```ts
    // The character page ("karakterlap"): the only page that prints the worn
    // equipment set, and the only place equipment can be changed. Nothing is
    // rendered on it — the boots capture the loadout and leave the page alone.
    case 'otPlayerSettings':
      return PageType.Character;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pageDetector.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/pageDetector.ts tests/pageDetector.test.ts
git commit -m "feat(compare): detect otPlayerSettings as the character page"
```

---

### Task 2: The loadout model

**Files:**
- Create: `src/shared/loadout.ts`
- Modify: `src/shared/prefKeys.ts` (append)
- Test: `tests/loadout.test.ts`

**Interfaces:**
- Consumes: nothing (deliberately dependency-free — no DOM, no GM, no imports from `src/utils/**`).
- Produces:
  - `type Slot = 'leftHand' | 'rightHand' | 'body' | 'head' | 'legs'`
  - `SLOT_LABEL: Record<Slot, string>`, `SLOT_ORDER: Slot[]`, `HAND_SLOTS: readonly Slot[]`
  - `LABEL_TO_SLOT: Record<string, Slot>`
  - `type ItemKind = 'fegyver' | 'vért'`
  - `interface EquippedItem`, `interface Loadout`
  - `emptySlots(): Record<Slot, EquippedItem | null>`
  - `serializeLoadout(l: Loadout): string`, `parseLoadout(raw: string | null): Loadout | null`
  - `type ArmorTarget = { kind: 'slot'; slot: Slot } | { kind: 'hand' }`, `armorTarget(raw: string | null): ArmorTarget | null`
  - `interface DetailLike`, `attrOf(d: DetailLike, label: string): string | null`, `equippedFromDetail(d: DetailLike): EquippedItem | null`
  - `avgDamageOf(maxDamage: number | null, spread: number | null): number | null`
  - `LOADOUT_PREF_KEY` (from `prefKeys.ts`)

- [ ] **Step 1: Write the failing test**

Create `tests/loadout.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  armorTarget, attrOf, avgDamageOf, emptySlots, equippedFromDetail,
  parseLoadout, serializeLoadout, type Loadout,
} from '@/shared/loadout';

const detail = (attrs: Array<[string, string]>, type = 'vért', magical = false) => ({ type, magical, attrs });

describe('armorTarget', () => {
  it('maps database types to slots', () => {
    expect(armorTarget('Páncél')).toEqual({ kind: 'slot', slot: 'body' });
    expect(armorTarget('Sisak')).toEqual({ kind: 'slot', slot: 'head' });
    expect(armorTarget('Csizma')).toEqual({ kind: 'slot', slot: 'legs' });
  });

  it('maps the page\'s Fajta values to the same slots', () => {
    expect(armorTarget('testre')).toEqual({ kind: 'slot', slot: 'body' });
    expect(armorTarget('fejre')).toEqual({ kind: 'slot', slot: 'head' });
    expect(armorTarget('lábra')).toEqual({ kind: 'slot', slot: 'legs' });
  });

  it('maps shields to a hand, from either vocabulary', () => {
    expect(armorTarget('Pajzs')).toEqual({ kind: 'hand' });
    expect(armorTarget('kézbe')).toEqual({ kind: 'hand' });
  });

  it('is accent- and case-insensitive, and rejects the unknown', () => {
    expect(armorTarget('PANCEL')).toEqual({ kind: 'slot', slot: 'body' });
    expect(armorTarget('nyakba')).toBeNull();
    expect(armorTarget(null)).toBeNull();
  });
});

describe('avgDamageOf', () => {
  it('derives average damage as max minus half the spread', () => {
    expect(avgDamageOf(133, 7)).toBe(129.5);
    expect(avgDamageOf(131, 2)).toBe(130);
  });

  it('is null when either input is missing', () => {
    expect(avgDamageOf(133, null)).toBeNull();
    expect(avgDamageOf(null, 7)).toBeNull();
  });
});

describe('equippedFromDetail', () => {
  it('reads a weapon\'s stats out of the parsed attribute pairs', () => {
    const item = equippedFromDetail(detail([
      ['Típus', 'fegyver'], ['Név', 'Kaltenekker íj'], ['Súly', '2.6 kg.'],
      ['Ár', '7560 ezüst'], ['Extra', 'vámpirizál'], ['Min. szint', '21'],
      ['Maximum sebzés', '133'], ['Sebzés szórás', '7'], ['Fajta', 'távolsági'],
    ], 'fegyver', true));
    expect(item).toEqual({
      name: 'Kaltenekker íj', kind: 'fegyver', level: 21, maxDamage: 133,
      spread: 7, defense: null, magical: true, vampiric: true,
    });
  });

  it('reads an armour\'s defence', () => {
    expect(equippedFromDetail(detail([['Név', 'ent sisak'], ['Min. szint', '20'], ['Védelem', '16'], ['Fajta', 'fejre']])))
      .toEqual({ name: 'ent sisak', kind: 'vért', level: 20, maxDamage: null, spread: null, defense: 16, magical: false, vampiric: false });
  });

  it('leaves level null for a shield, which prints no Min. szint', () => {
    const shield = equippedFromDetail(detail([['Név', 'bőrpajzs'], ['Védelem', '1'], ['Fajta', 'kézbe']]));
    expect(shield?.level).toBeNull();
    expect(shield?.defense).toBe(1);
  });

  it('rejects a plain item', () => {
    expect(equippedFromDetail(detail([['Név', 'ásó']], 'tárgy'))).toBeNull();
  });

  it('reads a labelled attribute, or null when absent', () => {
    const d = detail([['Védelem', '16']]);
    expect(attrOf(d, 'Védelem')).toBe('16');
    expect(attrOf(d, 'Extra')).toBeNull();
  });
});

describe('serializeLoadout / parseLoadout', () => {
  const loadout: Loadout = {
    version: 1,
    playerLevel: 23,
    capturedAt: 1_700_000_000_000,
    slots: {
      ...emptySlots(),
      body: { name: 'Zamárdi felsője', kind: 'vért', level: 19, maxDamage: null, spread: null, defense: 21, magical: false, vampiric: false },
    },
  };

  it('round-trips', () => {
    expect(parseLoadout(serializeLoadout(loadout))).toEqual(loadout);
  });

  it('treats junk, an absent value and a foreign version as no loadout', () => {
    expect(parseLoadout(null)).toBeNull();
    expect(parseLoadout('')).toBeNull();
    expect(parseLoadout('{ not json')).toBeNull();
    expect(parseLoadout(JSON.stringify({ ...loadout, version: 2 }))).toBeNull();
    expect(parseLoadout(JSON.stringify({ version: 1 }))).toBeNull();
  });

  it('starts every slot empty', () => {
    expect(emptySlots()).toEqual({ leftHand: null, rightHand: null, body: null, head: null, legs: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/loadout.test.ts`
Expected: FAIL — cannot resolve `@/shared/loadout`.

- [ ] **Step 3: Write minimal implementation**

Create `src/shared/loadout.ts`:

```ts
// The player's worn equipment, and the vocabulary for talking about slots.
//
// Deliberately free of DOM, GM_* and `src/utils/**` imports: this module is
// imported by `src/database/**` (which must stay GM-free — see the header of
// prefKeys.ts) as well as by the userscript's extractor. That is also why the
// parsed-detail input is described by the structural `DetailLike` below rather
// than importing `ParsedDetail` from @/utils/homeExtract, which would drag the
// DOM extractors into the standalone database bundle.

import { foldAccents } from '@/shared/text';

export type Slot = 'leftHand' | 'rightHand' | 'body' | 'head' | 'legs';

/** Hungarian slot names, exactly as the character page prints them. */
export const SLOT_LABEL: Record<Slot, string> = {
  leftHand: 'Bal kéz',
  rightHand: 'Jobb kéz',
  body: 'Test',
  head: 'Fej',
  legs: 'Láb',
};

export const SLOT_ORDER: Slot[] = ['leftHand', 'rightHand', 'body', 'head', 'legs'];

/** The two slots that can hold a weapon or a shield. */
export const HAND_SLOTS: readonly Slot[] = ['leftHand', 'rightHand'];

/** Reverse of SLOT_LABEL, for reading the page's own labels. */
export const LABEL_TO_SLOT: Record<string, Slot> = Object.fromEntries(
  SLOT_ORDER.map((slot) => [SLOT_LABEL[slot], slot]),
) as Record<string, Slot>;

export type ItemKind = 'fegyver' | 'vért';

export interface EquippedItem {
  name: string;
  kind: ItemKind;
  /** `Min. szint` — null for items that print none (shields). */
  level: number | null;
  maxDamage: number | null;
  spread: number | null;
  defense: number | null;
  magical: boolean;
  vampiric: boolean;
}

export interface Loadout {
  version: 1;
  playerLevel: number | null;
  /**
   * Diagnostics only. Equipment can only be changed on the character page, so
   * a capture written on every visit to it is current by construction — the UI
   * needs no staleness caveat.
   */
  capturedAt: number;
  slots: Record<Slot, EquippedItem | null>;
}

/** PrefStore key holding the serialised Loadout. */
export { LOADOUT_PREF_KEY } from '@/shared/prefKeys';

export function emptySlots(): Record<Slot, EquippedItem | null> {
  return { leftHand: null, rightHand: null, body: null, head: null, legs: null };
}

/**
 * Average damage. Derived rather than stored: verified to equal
 * `maxDamage - spread / 2` for all 1220 weapons carrying both fields, so one
 * rule covers the equipped side (which never prints it) and the database side.
 */
export function avgDamageOf(maxDamage: number | null, spread: number | null): number | null {
  if (maxDamage === null || spread === null) return null;
  return maxDamage - spread / 2;
}

export type ArmorTarget = { kind: 'slot'; slot: Slot } | { kind: 'hand' };

/**
 * Which slot a piece of armour belongs in, from either vocabulary: the
 * database's `type` (`Páncél`, `Sisak`, `Csizma`, `Pajzs`) or the character
 * page's `Fajta` (`testre`, `fejre`, `lábra`, `kézbe`). Shields resolve to
 * `hand` because they occupy a hand slot alongside weapons.
 *
 * Accent-folded and lower-cased so an encoding slip in either source still
 * resolves. An unrecognised value returns null — the caller then renders no
 * comparison rather than guessing a slot (see the design doc's Risks).
 */
const ARMOR_TARGETS: Record<string, ArmorTarget> = {
  pancel: { kind: 'slot', slot: 'body' },
  testre: { kind: 'slot', slot: 'body' },
  sisak: { kind: 'slot', slot: 'head' },
  fejre: { kind: 'slot', slot: 'head' },
  csizma: { kind: 'slot', slot: 'legs' },
  labra: { kind: 'slot', slot: 'legs' },
  pajzs: { kind: 'hand' },
  kezbe: { kind: 'hand' },
};

export function armorTarget(raw: string | null): ArmorTarget | null {
  if (!raw) return null;
  return ARMOR_TARGETS[foldAccents(raw.trim().toLowerCase())] ?? null;
}

/**
 * The shape of a `parseCuccDetail` result this module needs — structural so
 * that `ParsedDetail` (from the DOM-bound @/utils/homeExtract) satisfies it
 * without this module importing it.
 */
export interface DetailLike {
  type: string;
  magical: boolean;
  attrs: Array<[string, string]>;
}

export function attrOf(d: DetailLike, label: string): string | null {
  return d.attrs.find(([k]) => k === label)?.[1] ?? null;
}

/** First integer in a value like `"7560 ezüst"` or `"21"`, else null. */
function intOf(raw: string | null): number | null {
  if (raw === null) return null;
  const m = raw.match(/-?\d+/);
  return m ? parseInt(m[0], 10) : null;
}

/**
 * Maps a parsed stat block to an EquippedItem. Returns null for anything that
 * is not a weapon or armour (`Típus: tárgy`), which has nothing to compare.
 */
export function equippedFromDetail(d: DetailLike): EquippedItem | null {
  if (d.type !== 'fegyver' && d.type !== 'vért') return null;
  const extra = foldAccents((attrOf(d, 'Extra') ?? '').toLowerCase());
  return {
    name: attrOf(d, 'Név') ?? '?',
    kind: d.type,
    level: intOf(attrOf(d, 'Min. szint')),
    maxDamage: intOf(attrOf(d, 'Maximum sebzés')),
    spread: intOf(attrOf(d, 'Sebzés szórás')),
    defense: intOf(attrOf(d, 'Védelem')),
    magical: d.magical,
    vampiric: extra.includes('vampiriz'),
  };
}

export function serializeLoadout(l: Loadout): string {
  return JSON.stringify(l);
}

/**
 * Parses a stored loadout, or null for anything unusable — absent, unparseable,
 * or written by a different version of this shape. Failing to null means a
 * shape change degrades to "no compare" instead of a misread comparison.
 */
export function parseLoadout(raw: string | null): Loadout | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Loadout>;
    if (parsed?.version !== 1 || typeof parsed.slots !== 'object' || parsed.slots === null) return null;
    const slots = { ...emptySlots(), ...parsed.slots };
    return {
      version: 1,
      playerLevel: typeof parsed.playerLevel === 'number' ? parsed.playerLevel : null,
      capturedAt: typeof parsed.capturedAt === 'number' ? parsed.capturedAt : 0,
      slots,
    };
  } catch {
    return null;
  }
}
```

Append to `src/shared/prefKeys.ts`:

```ts
/**
 * PrefStore key holding the serialised `Loadout` — what the player is wearing,
 * captured on every character-page visit. Read by the compare card on every
 * surface; written only by the boots' loadout capture.
 */
export const LOADOUT_PREF_KEY = 'lc-loadout';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/loadout.test.ts && npx tsc --noEmit`
Expected: PASS, and no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/shared/loadout.ts src/shared/prefKeys.ts tests/loadout.test.ts
git commit -m "feat(compare): add the loadout model and its storage key"
```

---

### Task 3: Extract the loadout from the character page

**Files:**
- Create: `src/utils/characterExtract.ts`
- Test: `tests/characterExtract.test.ts`
- Reference (real captured markup, git-ignored): `.tmp/karakterlap.html`

**Interfaces:**
- Consumes: `parseCuccDetail` from `@/utils/homeExtract`; `EquippedItem`, `Loadout`, `LABEL_TO_SLOT`, `emptySlots`, `equippedFromDetail` from `@/shared/loadout`.
- Produces:
  - `decodeSingleQuoted(body: string): string`
  - `alertPayload(onclick: string): string | null`
  - `extractCharacter(doc: Document): Loadout | null`

- [ ] **Step 1: Write the failing test**

Create `tests/characterExtract.test.ts`. The markup mirrors the real page (captured to `.tmp/karakterlap.html`): one `<td>` with five labelled links whose `onclick` alerts the stat block.

```ts
import { describe, expect, it } from 'vitest';
import { alertPayload, decodeSingleQuoted, extractCharacter } from '@/utils/characterExtract';

const slot = (label: string, name: string, detail: string) =>
  `${label}: <b><a href="#" onclick="alert('${detail}');return false;">${name}</a></b><br>`;

const WEAPON = 'Típus: fegyver\\nNév: Kaltenekker íj\\nSúly: 2.6 kg.\\nÁr: 7560 ezüst\\nExtra: vámpirizál\\nMin. szint: 21\\nMaximum sebzés: 133\\nSebzés szórás: 7\\nFajta: távolsági\\nMágikus!!!\\n';
const SHIELD = 'Típus: vért\\nNév: bőrpajzs\\nSúly: 2 kg.\\nÁr: 8 ezüst\\nVédelem: 1\\nFajta: kézbe\\n';
const BODY = 'Típus: vért\\nNév: Zamárdi felsője\\nSúly: 4.5 kg.\\nÁr: 1310 ezüst\\nMin. szint: 19\\nVédelem: 21\\nFajta: testre\\n';
const HEAD = 'Típus: vért\\nNév: ent sisak\\nSúly: 1.4 kg.\\nÁr: 1457 ezüst\\nMin. szint: 20\\nVédelem: 16\\nFajta: fejre\\n';

function pageWith(inner: string): Document {
  return new DOMParser().parseFromString(
    `<html><body><table><tr><td>Név: Remy Szint: 23 Tapasztalati pont: 3912013</td></tr>
     <tr><td>${inner}Terhelés: <b>23.3229kg. / 111.2kg.</b></td></tr></table></body></html>`,
    'text/html',
  );
}

const FULL = pageWith(
  slot('Bal kéz', 'Kaltenekker íj', WEAPON) +
  slot('Jobb kéz', 'bőrpajzs', SHIELD) +
  slot('Test', 'Zamárdi felsője', BODY) +
  slot('Fej', 'ent sisak', HEAD) +
  'Láb: <br>',
);

describe('decodeSingleQuoted', () => {
  it('decodes the escapes a JS single-quoted literal can carry', () => {
    expect(decodeSingleQuoted('a\\nb')).toBe('a\nb');
    expect(decodeSingleQuoted("Sam\\'s")).toBe("Sam's");
    expect(decodeSingleQuoted('back\\\\slash')).toBe('back\\slash');
    expect(decodeSingleQuoted('tab\\there')).toBe('tab\there');
  });
});

describe('alertPayload', () => {
  it('takes the argument of the alert call', () => {
    expect(alertPayload("alert('Név: ásó\\n');return false;")).toBe('Név: ásó\\n');
  });

  it('stops at the closing quote, not at an escaped one', () => {
    expect(alertPayload("alert('Sam\\'s hat');return false;")).toBe("Sam\\'s hat");
  });

  it('is null for an onclick that is not an alert', () => {
    expect(alertPayload('svEngageCreature();return false;')).toBeNull();
  });
});

describe('extractCharacter', () => {
  it('reads every occupied slot, keyed by the page\'s own labels', () => {
    const loadout = extractCharacter(FULL)!;
    expect(loadout.slots.leftHand).toEqual({
      name: 'Kaltenekker íj', kind: 'fegyver', level: 21, maxDamage: 133,
      spread: 7, defense: null, magical: true, vampiric: true,
    });
    expect(loadout.slots.body?.defense).toBe(21);
    expect(loadout.slots.head?.name).toBe('ent sisak');
  });

  it('reads a shield in a hand, level and all', () => {
    const shield = extractCharacter(FULL)!.slots.rightHand!;
    expect(shield).toMatchObject({ name: 'bőrpajzs', kind: 'vért', defense: 1, level: null });
  });

  it('leaves an empty slot null', () => {
    expect(extractCharacter(FULL)!.slots.legs).toBeNull();
  });

  it('captures the player level and a timestamp', () => {
    const loadout = extractCharacter(FULL)!;
    expect(loadout.playerLevel).toBe(23);
    expect(loadout.version).toBe(1);
    expect(loadout.capturedAt).toBeGreaterThan(0);
  });

  it('is null when the page carries no equipment block', () => {
    const doc = new DOMParser().parseFromString('<html><body><td>Semmi</td></body></html>', 'text/html');
    expect(extractCharacter(doc)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/characterExtract.test.ts`
Expected: FAIL — cannot resolve `@/utils/characterExtract`.

- [ ] **Step 3: Write minimal implementation**

Create `src/utils/characterExtract.ts`:

```ts
// Extraction for the Larkinor character page ("karakterlap",
// oldalTipus=otPlayerSettings) — the only page that prints the worn equipment
// set, and the only place equipment can be changed.
//
// Each slot's item carries its whole stat block inside its link's
// `onclick="alert('…')"`, in the same `label: value` per-line grammar the Home
// page's inventory uses — so `parseCuccDetail` is reused rather than
// reimplemented. The payload is a JS single-quoted string literal, so it is
// decoded (never executed) first.
//
// See docs/superpowers/specs/2026-08-18-equipment-compare-design.md.

import { parseCuccDetail } from '@/utils/homeExtract';
import {
  emptySlots, equippedFromDetail, LABEL_TO_SLOT, type EquippedItem, type Loadout, type Slot,
} from '@/shared/loadout';

/** Decodes the escapes a JS single-quoted string literal body can carry. */
export function decodeSingleQuoted(body: string): string {
  let out = '';
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] !== '\\') { out += body[i]; continue; }
    i += 1;
    switch (body[i]) {
      case 'n': out += '\n'; break;
      case 't': out += '\t'; break;
      case 'r': out += '\r'; break;
      case undefined: break;
      default: out += body[i];
    }
  }
  return out;
}

/**
 * The still-escaped argument of `alert('…')`, or null when the handler is
 * something else. Scans for the closing quote rather than matching lazily, so
 * an apostrophe inside the payload cannot truncate it.
 */
export function alertPayload(onclick: string): string | null {
  const start = onclick.indexOf("alert('");
  if (start === -1) return null;
  const from = start + "alert('".length;
  for (let i = from; i < onclick.length; i += 1) {
    if (onclick[i] === '\\') { i += 1; continue; }
    if (onclick[i] === "'") return onclick.slice(from, i);
  }
  return null;
}

/** The `<td>` holding the equipment slots: the smallest one that lists them. */
function equipmentBlock(doc: Document): Element | null {
  const label = `${Object.keys(LABEL_TO_SLOT)[0]}:`; // "Bal kéz:"
  const candidates = Array.from(doc.querySelectorAll('td')).filter(
    (td) => (td.textContent ?? '').includes(label),
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((best, td) =>
    (td.textContent ?? '').length < (best.textContent ?? '').length ? td : best);
}

/** The stat block behind a slot's link, mapped to an EquippedItem. */
function itemFrom(anchor: Element): EquippedItem | null {
  const payload = alertPayload(anchor.getAttribute('onclick') ?? '');
  if (payload === null) return null;
  return equippedFromDetail(parseCuccDetail(decodeSingleQuoted(payload)));
}

/**
 * Reads the five equipment slots. Walks the block's child nodes in order,
 * tracking the label the most recent text node ended with and attaching the
 * next link to that slot — rather than splitting on `<br>`, so incidental
 * whitespace and markup changes around the separators do not matter.
 *
 * Returns null when the block is absent: a page whose shape has drifted fails
 * visibly instead of overwriting a good loadout with five empty slots.
 */
export function extractCharacter(doc: Document): Loadout | null {
  const block = equipmentBlock(doc);
  if (!block) return null;

  const slots = emptySlots();
  let pending: Slot | null = null;

  for (const node of Array.from(block.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const label = (node.textContent ?? '').match(/([^:<>\n]+):\s*$/)?.[1]?.trim();
      pending = label && label in LABEL_TO_SLOT ? LABEL_TO_SLOT[label] : pending;
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE || pending === null) continue;
    const el = node as Element;
    const anchor = el.matches('a[onclick]') ? el : el.querySelector('a[onclick]');
    if (!anchor) continue;
    slots[pending] = itemFrom(anchor);
    pending = null;
  }

  const levelMatch = (doc.body.textContent ?? '').match(/(?:^|\s)Szint:\s*(\d+)/);

  return {
    version: 1,
    playerLevel: levelMatch ? parseInt(levelMatch[1], 10) : null,
    capturedAt: Date.now(),
    slots,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/characterExtract.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Cross-check against the real captured page**

Confirms the extractor works on the actual markup, not just the fixture.

**First decode the capture.** Playwright's `browser_evaluate` saves the
*evaluation result* — a JSON-encoded string, starting with `"` and with every
quote and newline escaped — not raw HTML. Feeding it to JSDOM straight finds no
anchors at all and every slot reads null, which looks exactly like an extractor
bug and is not one:

```bash
python3 -c "
import json,io
raw=io.open('.tmp/karakterlap.html',encoding='utf-8').read()
html=json.loads(raw) if raw.lstrip().startswith('\"') else raw
io.open('.tmp/karakterlap.real.html','w',encoding='utf-8').write(html)
print('decoded chars:', len(html))
"
```

Then run the extractor over it in a scratch test (`tests/zz-realpage.test.ts`,
deleted immediately afterwards — vitest only collects from `tests/`):

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { extractCharacter } from '@/utils/characterExtract';

describe('extractCharacter against the real captured page', () => {
  it('reads the live markup', () => {
    const html = readFileSync('.tmp/karakterlap.real.html', 'utf8');
    const loadout = extractCharacter(new JSDOM(html).window.document as unknown as Document)!;
    console.log('playerLevel:', loadout.playerLevel);
    console.log(JSON.stringify(loadout.slots));
    expect(loadout).not.toBeNull();
  });
});
```

Expected: `playerLevel: 23` and all five slots populated — the two hand weapons
with their damage and spread, and defences on body/head/legs. If the capture is
absent (a fresh clone), skip this step; the unit tests cover the logic.

- [ ] **Step 6: Commit**

```bash
git add src/utils/characterExtract.ts tests/characterExtract.test.ts
git commit -m "feat(compare): extract the worn equipment from the character page"
```

---

### Task 4: Capture the loadout from both boots

**Files:**
- Create: `src/utils/captureLoadout.ts`
- Modify: `src/mobile/boot.ts` (imports + the `PageType.Tavern` hook area, ~line 82)
- Modify: `src/desktop/boot.ts` (imports + beside its `PageType.Tavern` hook, ~line 256)
- Modify: `src/utils/config.ts` (append `readLoadout`)
- Test: `tests/captureLoadout.test.ts`, `tests/mobileBoot.test.ts` (append)

**Interfaces:**
- Consumes: `extractCharacter` (Task 3); `serializeLoadout`, `parseLoadout`, `LOADOUT_PREF_KEY` (Task 2); `PageType.Character` (Task 1).
- Produces:
  - `captureLoadout(doc: Document, write: (key: string, value: string) => void): boolean`
  - `readLoadout(): Loadout | null` in `@/utils/config`

- [ ] **Step 1: Write the failing test**

Create `tests/captureLoadout.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { captureLoadout } from '@/utils/captureLoadout';
import { LOADOUT_PREF_KEY, parseLoadout } from '@/shared/loadout';

const page = (inner: string) => new DOMParser().parseFromString(
  `<html><body><table><tr><td>Név: Remy Szint: 23</td></tr><tr><td>${inner}Terhelés: <b>1kg. / 2kg.</b></td></tr></table></body></html>`,
  'text/html',
);

const HEAD = 'Típus: vért\\nNév: ent sisak\\nMin. szint: 20\\nVédelem: 16\\nFajta: fejre\\n';

describe('captureLoadout', () => {
  it('writes the extracted loadout under the loadout key', () => {
    const write = vi.fn();
    const doc = page(`Fej: <b><a href="#" onclick="alert('${HEAD}');return false;">ent sisak</a></b><br>`);

    expect(captureLoadout(doc, write)).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    const [key, value] = write.mock.calls[0];
    expect(key).toBe(LOADOUT_PREF_KEY);
    expect(parseLoadout(value)!.slots.head!.name).toBe('ent sisak');
  });

  it('writes nothing when the page has no equipment block', () => {
    const write = vi.fn();
    const doc = new DOMParser().parseFromString('<html><body><td>Semmi</td></body></html>', 'text/html');

    expect(captureLoadout(doc, write)).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });
});
```

Append to `tests/mobileBoot.test.ts` (reuse the file's existing document-building helper and imports):

```ts
it('captures the loadout on the character page and renders nothing there', () => {
  document.body.innerHTML = `
    <form name="urlap"><input name="oldalTipus" value="otPlayerSettings"></form>
    <table><tr><td>Név: Remy Szint: 23</td></tr>
    <tr><td>Fej: <b><a href="#" onclick="alert('Típus: vért\\nNév: ent sisak\\nMin. szint: 20\\nVédelem: 16\\nFajta: fejre\\n');return false;">ent sisak</a></b><br>Terhelés: <b>1kg. / 2kg.</b></td></tr></table>`;

  bootMobile(document);

  // Capture happened...
  expect(GM_setValue).toHaveBeenCalledWith(LOADOUT_PREF_KEY, expect.stringContaining('ent sisak'));
  // ...but the page is left completely alone.
  expect(document.getElementById('lc-root')).toBeNull();
  expect(document.getElementById('lc-offscreen')).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/captureLoadout.test.ts tests/mobileBoot.test.ts`
Expected: FAIL — cannot resolve `@/utils/captureLoadout`.

- [ ] **Step 3: Write minimal implementation**

Create `src/utils/captureLoadout.ts`:

```ts
// Capturing the worn equipment when the character page is visited.
//
// Shared by both boots and injected with its writer (like activateQuestOffer),
// so the capture is testable without GM_* and the two boots cannot drift.

import { extractCharacter } from '@/utils/characterExtract';
import { LOADOUT_PREF_KEY, serializeLoadout } from '@/shared/loadout';

/**
 * Extracts and stores the loadout. Returns whether anything was written — a
 * page with no equipment block leaves the stored loadout untouched rather than
 * replacing it with five empty slots.
 */
export function captureLoadout(doc: Document, write: (key: string, value: string) => void): boolean {
  const loadout = extractCharacter(doc);
  if (!loadout) {
    console.warn('[Larkinor UI] Character page carried no equipment block — loadout not updated');
    return false;
  }
  write(LOADOUT_PREF_KEY, serializeLoadout(loadout));
  return true;
}
```

Append to `src/utils/config.ts`:

```ts
/**
 * The stored loadout, or null when nothing usable is stored. The read side of
 * `captureLoadout` — every compare surface goes through this.
 */
export function readLoadout(): Loadout | null {
  return parseLoadout(getPref(LOADOUT_PREF_KEY));
}
```

with imports at the top of `src/utils/config.ts`:

```ts
import { LOADOUT_PREF_KEY, parseLoadout, type Loadout } from '@/shared/loadout';
```

In `src/mobile/boot.ts`, add the imports:

```ts
import { captureLoadout } from '@/utils/captureLoadout';
```

and, directly after the `PageType.Tavern` block (before `const pageState = extractPageState(...)`):

```ts
  // The character page is the only page that prints the worn equipment set, and
  // the only place it can be changed — so capturing on every visit keeps the
  // stored loadout current by construction. Like the quest offer above this
  // runs before the early return, because the page has no state of its own and
  // mobile deliberately renders nothing on it.
  if (pageType === PageType.Character) captureLoadout(doc, setPref);
```

In `src/desktop/boot.ts`, add the same import and, beside its `PageType.Tavern` block:

```ts
  if (pageType === PageType.Character) captureLoadout(doc, setPref);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/captureLoadout.test.ts tests/mobileBoot.test.ts tests/desktopBoot.test.ts && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/captureLoadout.ts src/utils/config.ts src/mobile/boot.ts src/desktop/boot.ts tests/captureLoadout.test.ts tests/mobileBoot.test.ts
git commit -m "feat(compare): capture the loadout on every character-page visit"
```

---

### Task 5: The comparison rules

**Files:**
- Create: `src/shared/compare.ts`
- Test: `tests/compare.test.ts`

**Interfaces:**
- Consumes: Task 2's `loadout.ts` exports; `Weapon`, `Armor` types from `@/shared/data`.
- Produces:
  - `type CompareValue = number | boolean | null`, `type Direction = 'better' | 'worse' | 'same' | 'blocked'`
  - `interface CompareRow { label: string; current: CompareValue; candidate: CompareValue; delta: string | null; direction: Direction }`
  - `interface CompareColumn { slot: Slot; slotLabel: string; currentName: string; rows: CompareRow[] }`
  - `interface CompareSubject extends EquippedItem { armorType: string | null }`
  - `fromWeapon(w: Weapon): CompareSubject`, `fromArmor(a: Armor): CompareSubject`, `fromDetail(d: DetailLike): CompareSubject | null`
  - `compareToLoadout(subject: CompareSubject, loadout: Loadout): CompareColumn[]`
  - `formatDelta(n: number): string`

- [ ] **Step 1: Write the failing test**

Create `tests/compare.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { compareToLoadout, formatDelta, fromArmor, fromDetail, fromWeapon, type CompareSubject } from '@/shared/compare';
import { emptySlots, type EquippedItem, type Loadout } from '@/shared/loadout';

const weapon = (over: Partial<EquippedItem> = {}): EquippedItem => ({
  name: 'kard', kind: 'fegyver', level: 20, maxDamage: 100, spread: 10,
  defense: null, magical: false, vampiric: false, ...over,
});
const armor = (over: Partial<EquippedItem> = {}): EquippedItem => ({
  name: 'vért', kind: 'vért', level: 20, maxDamage: null, spread: null,
  defense: 10, magical: false, vampiric: false, ...over,
});
const subject = (item: EquippedItem, armorType: string | null = null): CompareSubject => ({ ...item, armorType });

const loadoutWith = (slots: Partial<Loadout['slots']>, playerLevel: number | null = 30): Loadout => ({
  version: 1, playerLevel, capturedAt: 1, slots: { ...emptySlots(), ...slots },
});

const rowsOf = (cols: ReturnType<typeof compareToLoadout>, label: string) =>
  cols.map((c) => c.rows.find((r) => r.label === label));

describe('compareToLoadout — weapons', () => {
  const loadout = loadoutWith({
    leftHand: weapon({ name: 'balos', maxDamage: 90, spread: 4 }),
    rightHand: weapon({ name: 'jobbos', maxDamage: 110, spread: 20 }),
  });

  it('returns one column per hand holding a weapon, in slot order', () => {
    const cols = compareToLoadout(subject(weapon()), loadout);
    expect(cols.map((c) => [c.slot, c.slotLabel, c.currentName]))
      .toEqual([['leftHand', 'Bal kéz', 'balos'], ['rightHand', 'Jobb kéz', 'jobbos']]);
  });

  it('scores max damage in both directions', () => {
    const [left, right] = rowsOf(compareToLoadout(subject(weapon({ maxDamage: 100 })), loadout), 'Max sebzés');
    expect(left).toMatchObject({ current: 90, candidate: 100, delta: '+10', direction: 'better' });
    expect(right).toMatchObject({ current: 110, candidate: 100, delta: '-10', direction: 'worse' });
  });

  it('treats a lower spread as better', () => {
    const [left, right] = rowsOf(compareToLoadout(subject(weapon({ spread: 10 })), loadout), 'Szórás');
    expect(left).toMatchObject({ current: 4, candidate: 10, direction: 'worse' });
    expect(right).toMatchObject({ current: 20, candidate: 10, direction: 'better' });
  });

  it('derives average damage from max and spread', () => {
    const [left] = rowsOf(compareToLoadout(subject(weapon({ maxDamage: 133, spread: 7 })), loadout), 'Átlag seb.');
    expect(left).toMatchObject({ current: 88, candidate: 129.5, direction: 'better' });
  });

  it('scores gaining a boolean as better and losing it as worse', () => {
    const gained = rowsOf(compareToLoadout(subject(weapon({ vampiric: true })), loadout), 'Vámpirizál');
    expect(gained[0]).toMatchObject({ current: false, candidate: true, direction: 'better', delta: null });

    const lost = compareToLoadout(subject(weapon()), loadoutWith({ leftHand: weapon({ magical: true }) }));
    expect(lost[0].rows.find((r) => r.label === 'Mágikus')).toMatchObject({ direction: 'worse' });
  });

  it('never calls a level difference better, but blocks what you cannot wear', () => {
    const wearable = rowsOf(compareToLoadout(subject(weapon({ level: 25 })), loadout), 'Szint');
    expect(wearable[0]).toMatchObject({ candidate: 25, delta: '+5', direction: 'same' });

    const tooHigh = rowsOf(compareToLoadout(subject(weapon({ level: 40 })), loadout), 'Szint');
    expect(tooHigh[0]).toMatchObject({ direction: 'blocked' });
  });

  it('has nothing to say when both hands are empty', () => {
    expect(compareToLoadout(subject(weapon()), loadoutWith({}))).toEqual([]);
  });

  it('ignores a hand holding a shield', () => {
    const cols = compareToLoadout(subject(weapon()), loadoutWith({ leftHand: armor(), rightHand: weapon() }));
    expect(cols.map((c) => c.slot)).toEqual(['rightHand']);
  });
});

describe('compareToLoadout — armour', () => {
  it('compares against the one slot the type maps to', () => {
    const loadout = loadoutWith({ head: armor({ name: 'sisak', defense: 16 }), body: armor({ name: 'páncél', defense: 21 }) });
    const cols = compareToLoadout(subject(armor({ defense: 20 }), 'Sisak'), loadout);
    expect(cols).toHaveLength(1);
    expect(cols[0]).toMatchObject({ slot: 'head', currentName: 'sisak' });
    expect(cols[0].rows.find((r) => r.label === 'Védelem')).toMatchObject({ current: 16, candidate: 20, direction: 'better' });
  });

  it('compares a shield only against a hand that holds one', () => {
    const loadout = loadoutWith({ leftHand: armor({ name: 'bőrpajzs', defense: 1 }), rightHand: weapon() });
    const cols = compareToLoadout(subject(armor({ defense: 5 }), 'Pajzs'), loadout);
    expect(cols.map((c) => c.slot)).toEqual(['leftHand']);
    expect(cols[0].rows.find((r) => r.label === 'Védelem')).toMatchObject({ direction: 'better' });
  });

  it('says nothing rather than diffing a shield against a sword', () => {
    expect(compareToLoadout(subject(armor(), 'Pajzs'), loadoutWith({ leftHand: weapon(), rightHand: weapon() }))).toEqual([]);
  });

  it('says nothing for an unrecognised type', () => {
    expect(compareToLoadout(subject(armor(), 'Nyaklánc'), loadoutWith({ body: armor() }))).toEqual([]);
  });

  it('omits a row when either side lacks the field', () => {
    const cols = compareToLoadout(subject(armor({ level: null }), 'Sisak'), loadoutWith({ head: armor() }));
    expect(cols[0].rows.map((r) => r.label)).toEqual(['Védelem']);
  });

  it('leaves the empty slot uncompared', () => {
    expect(compareToLoadout(subject(armor(), 'Sisak'), loadoutWith({ body: armor() }))).toEqual([]);
  });
});

describe('adapters', () => {
  it('reads a database weapon', () => {
    const w = { name: 'íj', level: 21, maxDamage: 133, spread: 7, magical: true, vampiric: true } as never;
    expect(fromWeapon(w)).toEqual({
      name: 'íj', kind: 'fegyver', level: 21, maxDamage: 133, spread: 7,
      defense: null, magical: true, vampiric: true, armorType: null,
    });
  });

  it('reads a database armour, keeping its type for slot resolution', () => {
    const a = { name: 'sisak', level: 20, defense: 16, magical: false, type: 'Sisak' } as never;
    expect(fromArmor(a)).toMatchObject({ kind: 'vért', defense: 16, armorType: 'Sisak' });
  });

  it('reads a parsed stat block, keeping Fajta as the type', () => {
    const d = { type: 'vért', magical: false, attrs: [['Név', 'bőrpajzs'], ['Védelem', '1'], ['Fajta', 'kézbe']] as Array<[string, string]> };
    expect(fromDetail(d)).toMatchObject({ name: 'bőrpajzs', defense: 1, armorType: 'kézbe' });
  });

  it('rejects a plain item', () => {
    expect(fromDetail({ type: 'tárgy', magical: false, attrs: [['Név', 'ásó']] })).toBeNull();
  });
});

describe('formatDelta', () => {
  it('signs the number and localises the decimal', () => {
    expect(formatDelta(10)).toBe('+10');
    expect(formatDelta(-10)).toBe('-10');
    expect(formatDelta(-0.5)).toBe('-0,5');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/compare.test.ts`
Expected: FAIL — cannot resolve `@/shared/compare`.

- [ ] **Step 3: Write minimal implementation**

Create `src/shared/compare.ts`:

```ts
// Comparing a candidate weapon or armour against what the player is wearing.
//
// Pure: no DOM, no Preact, no GM_*. Candidates reach it in two shapes — a
// database Weapon/Armor in the explorer, a parsed stat block in the Home and
// Market panels — so three adapters normalise both into one CompareSubject and
// the rules below are written once.

import type { Armor, Weapon } from '@/shared/data';
import {
  armorTarget, avgDamageOf, equippedFromDetail, HAND_SLOTS, SLOT_LABEL, SLOT_ORDER,
  type DetailLike, type EquippedItem, type Loadout, type Slot,
} from '@/shared/loadout';

export type CompareValue = number | boolean | null;

/** `blocked` is the candidate's level exceeding the player's — unwearable. */
export type Direction = 'better' | 'worse' | 'same' | 'blocked';

export interface CompareRow {
  label: string;
  current: CompareValue;
  candidate: CompareValue;
  /** Signed, localised difference; null for booleans and for no change. */
  delta: string | null;
  direction: Direction;
}

export interface CompareColumn {
  slot: Slot;
  slotLabel: string;
  currentName: string;
  rows: CompareRow[];
}

/** A candidate item, plus the raw type string its slot is resolved from. */
export interface CompareSubject extends EquippedItem {
  /** Database `type` or the page's `Fajta`; null for weapons. */
  armorType: string | null;
}

export function fromWeapon(w: Weapon): CompareSubject {
  return {
    name: w.name, kind: 'fegyver', level: w.level, maxDamage: w.maxDamage,
    spread: w.spread, defense: null, magical: w.magical, vampiric: w.vampiric,
    armorType: null,
  };
}

export function fromArmor(a: Armor): CompareSubject {
  return {
    name: a.name, kind: 'vért', level: a.level, maxDamage: null, spread: null,
    defense: a.defense, magical: a.magical, vampiric: false, armorType: a.type,
  };
}

export function fromDetail(d: DetailLike): CompareSubject | null {
  const item = equippedFromDetail(d);
  if (!item) return null;
  return { ...item, armorType: d.attrs.find(([k]) => k === 'Fajta')?.[1] ?? null };
}

export function formatDelta(n: number): string {
  const sign = n > 0 ? '+' : '-';
  return `${sign}${Math.abs(n).toLocaleString('hu')}`;
}

type NumericField = {
  label: string;
  of: (item: EquippedItem) => number | null;
  betterWhen: 'higher' | 'lower';
};

const WEAPON_FIELDS: NumericField[] = [
  { label: 'Max sebzés', of: (i) => i.maxDamage, betterWhen: 'higher' },
  { label: 'Átlag seb.', of: (i) => avgDamageOf(i.maxDamage, i.spread), betterWhen: 'higher' },
  // Damage is max minus up to the spread, so a tighter spread is strictly more
  // damage — see avgDamageOf.
  { label: 'Szórás', of: (i) => i.spread, betterWhen: 'lower' },
];

const ARMOR_FIELDS: NumericField[] = [
  { label: 'Védelem', of: (i) => i.defense, betterWhen: 'higher' },
];

function numericRow(field: NumericField, current: EquippedItem, candidate: CompareSubject): CompareRow | null {
  const a = field.of(current);
  const b = field.of(candidate);
  if (a === null || b === null) return null;
  const diff = b - a;
  const better = field.betterWhen === 'higher' ? diff > 0 : diff < 0;
  return {
    label: field.label,
    current: a,
    candidate: b,
    delta: diff === 0 ? null : formatDelta(diff),
    direction: diff === 0 ? 'same' : better ? 'better' : 'worse',
  };
}

function boolRow(label: string, a: boolean, b: boolean): CompareRow {
  return {
    label,
    current: a,
    candidate: b,
    delta: null,
    direction: a === b ? 'same' : b ? 'better' : 'worse',
  };
}

/**
 * The level row. A higher requirement is never an upgrade, so this is neutral
 * however it differs — except when the candidate is above the player's level,
 * where it is `blocked`: an item that cannot be worn is not a better item.
 */
function levelRow(current: EquippedItem, candidate: CompareSubject, playerLevel: number | null): CompareRow | null {
  if (current.level === null || candidate.level === null) return null;
  const diff = candidate.level - current.level;
  const blocked = playerLevel !== null && candidate.level > playerLevel;
  return {
    label: 'Szint',
    current: current.level,
    candidate: candidate.level,
    delta: diff === 0 ? null : formatDelta(diff),
    direction: blocked ? 'blocked' : 'same',
  };
}

function column(slot: Slot, current: EquippedItem, candidate: CompareSubject, playerLevel: number | null): CompareColumn {
  const fields = candidate.kind === 'fegyver' ? WEAPON_FIELDS : ARMOR_FIELDS;
  const rows: CompareRow[] = [];

  const level = levelRow(current, candidate, playerLevel);
  if (level) rows.push(level);
  for (const field of fields) {
    const row = numericRow(field, current, candidate);
    if (row) rows.push(row);
  }
  rows.push(boolRow('Mágikus', current.magical, candidate.magical));
  if (candidate.kind === 'fegyver') rows.push(boolRow('Vámpirizál', current.vampiric, candidate.vampiric));

  return { slot, slotLabel: SLOT_LABEL[slot], currentName: current.name, rows };
}

const isShield = (item: EquippedItem): boolean => item.kind === 'vért' && item.defense !== null;

/**
 * Which equipped slots a candidate should be compared against:
 * - a weapon: every hand holding a weapon (both, when both do);
 * - body/head/leg armour: that one slot;
 * - a shield: only a hand that already holds a shield — `Védelem` against
 *   `Maximum sebzés` is not a comparison;
 * - anything whose type does not resolve: none at all.
 */
function targetSlots(subject: CompareSubject, loadout: Loadout): Slot[] {
  const at = (slot: Slot): EquippedItem | null => loadout.slots[slot];

  if (subject.kind === 'fegyver') {
    return HAND_SLOTS.filter((slot) => at(slot)?.kind === 'fegyver');
  }

  const target = armorTarget(subject.armorType);
  if (!target) return [];
  if (target.kind === 'hand') {
    return HAND_SLOTS.filter((slot) => { const it = at(slot); return it !== null && isShield(it); });
  }
  return at(target.slot) ? [target.slot] : [];
}

export function compareToLoadout(subject: CompareSubject, loadout: Loadout): CompareColumn[] {
  const slots = targetSlots(subject, loadout);
  return SLOT_ORDER
    .filter((slot) => slots.includes(slot))
    .map((slot) => column(slot, loadout.slots[slot]!, subject, loadout.playerLevel));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/compare.test.ts && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/compare.ts tests/compare.test.ts
git commit -m "feat(compare): add the comparison rules and their adapters"
```

---

### Task 6: The compare card

**Files:**
- Create: `src/components/CompareCard.tsx`
- Modify: `src/shared/styles/theme.css` (append a `.lc-cmp` section)
- Test: `tests/CompareCard.test.tsx`

**Interfaces:**
- Consumes: `CompareColumn`, `CompareRow`, `Direction` (Task 5).
- Produces: `CompareCard({ name, columns, x, y }: CompareCardProps)`.

- [ ] **Step 1: Write the failing test**

Create `tests/CompareCard.test.tsx`:

```tsx
import { h } from 'preact';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/preact';
import { CompareCard } from '@/components/CompareCard';
import type { CompareColumn } from '@/shared/compare';

const columns: CompareColumn[] = [
  {
    slot: 'leftHand', slotLabel: 'Bal kéz', currentName: 'balos',
    rows: [
      { label: 'Max sebzés', current: 90, candidate: 100, delta: '+10', direction: 'better' },
      { label: 'Szórás', current: 4, candidate: 10, delta: '+6', direction: 'worse' },
      { label: 'Szint', current: 20, candidate: 40, delta: '+20', direction: 'blocked' },
      { label: 'Vámpirizál', current: false, candidate: true, delta: null, direction: 'better' },
    ],
  },
];

describe('CompareCard', () => {
  it('names the candidate and every compared slot', () => {
    render(<CompareCard name="kard" columns={columns} x={10} y={20} />);
    expect(screen.getByText('kard')).toBeTruthy();
    expect(screen.getByText('Bal kéz')).toBeTruthy();
    expect(screen.getByText('balos')).toBeTruthy();
  });

  it('marks each row with its direction', () => {
    const { container } = render(<CompareCard name="kard" columns={columns} x={0} y={0} />);
    expect(container.querySelectorAll('.lc-cmp-better').length).toBe(2);
    expect(container.querySelectorAll('.lc-cmp-worse').length).toBe(1);
    expect(container.querySelectorAll('.lc-cmp-blocked').length).toBe(1);
  });

  it('shows the delta and renders booleans in Hungarian', () => {
    render(<CompareCard name="kard" columns={columns} x={0} y={0} />);
    expect(screen.getByText('+10')).toBeTruthy();
    expect(screen.getAllByText('igen').length).toBeGreaterThan(0);
    expect(screen.getAllByText('nem').length).toBeGreaterThan(0);
  });

  it('sets colour explicitly, because the game page is quirks mode', () => {
    const { container } = render(<CompareCard name="kard" columns={columns} x={0} y={0} />);
    expect(container.querySelector('table')!.getAttribute('style')).toContain('color');
  });

  it('positions itself at the given point', () => {
    const { container } = render(<CompareCard name="kard" columns={columns} x={40} y={50} />);
    const style = container.querySelector('.lc-cmp')!.getAttribute('style')!;
    expect(style).toContain('left: 40px');
    expect(style).toContain('top: 50px');
  });

  it('renders nothing without columns', () => {
    const { container } = render(<CompareCard name="kard" columns={[]} x={0} y={0} />);
    expect(container.querySelector('.lc-cmp')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/CompareCard.test.tsx`
Expected: FAIL — cannot resolve `@/components/CompareCard`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/CompareCard.tsx`:

```tsx
import { h, type JSX } from 'preact';
import type { CompareColumn, CompareValue } from '@/shared/compare';

export interface CompareCardProps {
  /** The hovered item's name. */
  name: string;
  columns: CompareColumn[];
  /** Viewport coordinates of the card's top-left corner. */
  x: number;
  y: number;
}

function renderValue(value: CompareValue): string {
  if (value === null) return '—';
  if (typeof value === 'boolean') return value ? 'igen' : 'nem';
  return value.toLocaleString('hu');
}

/**
 * The hover/long-press diff: the hovered item against what is worn, one column
 * per compared slot.
 *
 * The inline `color` on the table is not decoration. This renders inside the
 * live game page, which is quirks mode — where table cells do not inherit
 * `color` from an ancestor and would come out black on our dark panel. Set
 * inline rather than in the stylesheet so it cannot be lost to specificity.
 */
export function CompareCard({ name, columns, x, y }: CompareCardProps): JSX.Element | null {
  if (columns.length === 0) return null;
  const labels = columns[0].rows.map((r) => r.label);

  return (
    <div class="lc-cmp" style={{ left: `${x}px`, top: `${y}px` }} role="tooltip">
      <div class="lc-cmp-title">{name}</div>
      <table style={{ color: 'var(--text)' }}>
        <thead>
          <tr>
            <th />
            {columns.map((col) => (
              <th key={col.slot}>
                <span class="lc-cmp-slot">{col.slotLabel}</span>
                <span class="lc-cmp-current">{col.currentName}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labels.map((label, i) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              {columns.map((col) => {
                const row = col.rows[i];
                return (
                  <td key={col.slot} class={`lc-cmp-${row.direction}`}>
                    <span class="lc-cmp-from">{renderValue(row.current)}</span>
                    <span class="lc-cmp-arrow" aria-hidden="true">→</span>
                    <span class="lc-cmp-to">{renderValue(row.candidate)}</span>
                    {row.delta && <span class="lc-cmp-delta">{row.delta}</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

Append to `src/shared/styles/theme.css`:

```css
/* ================================================================
   Equipment compare card — the hover/long-press diff against the
   worn set. Rendered inside the live game page as well as our own
   UI, so: every selector is .lc-* scoped, colours come from the
   palette variables, and the table sets `color` inline (quirks mode
   does not inherit it into table cells).
   ================================================================ */
.lc-cmp {
  position: fixed;
  z-index: 10002; /* above the database overlay's own close button (10001) */
  max-width: min(92vw, 420px);
  padding: 8px 10px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 4px;
  box-shadow: 0 6px 18px var(--quest-badge-bg);
  color: var(--text);
  font: 12px/1.35 -apple-system, 'Segoe UI', sans-serif;
  pointer-events: none; /* never swallows the hover it was opened by */
}
.lc-cmp-title { font-weight: bold; margin-bottom: 6px; }
.lc-cmp table { border-collapse: collapse; }
.lc-cmp th,
.lc-cmp td { padding: 2px 6px; text-align: right; white-space: nowrap; }
.lc-cmp thead th { color: var(--muted); font-weight: normal; text-align: right; }
.lc-cmp tbody th { color: var(--muted); font-weight: normal; text-align: left; }
.lc-cmp-slot { display: block; color: var(--text); }
.lc-cmp-current { display: block; font-size: 11px; color: var(--muted); }
.lc-cmp-from { color: var(--muted); }
.lc-cmp-arrow { margin: 0 3px; color: var(--muted); }
.lc-cmp-delta { margin-left: 4px; font-weight: bold; }
.lc-cmp-better .lc-cmp-to,
.lc-cmp-better .lc-cmp-delta { color: var(--good); }
.lc-cmp-worse .lc-cmp-to,
.lc-cmp-worse .lc-cmp-delta { color: var(--bad); }
.lc-cmp-blocked .lc-cmp-to,
.lc-cmp-blocked .lc-cmp-delta { color: var(--bad); }
.lc-cmp-same .lc-cmp-to { color: var(--text); }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/CompareCard.test.tsx && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/CompareCard.tsx src/shared/styles/theme.css tests/CompareCard.test.tsx
git commit -m "feat(compare): add the compare card and its theme scope"
```

---

### Task 7: The hover / long-press trigger

**Files:**
- Create: `src/components/LoadoutContext.ts`
- Create: `src/hooks/useCompare.tsx`
- Test: `tests/useCompare.test.tsx`

**Interfaces:**
- Consumes: `Loadout` (Task 2); `compareToLoadout`, `CompareSubject` (Task 5); `CompareCard` (Task 6).
- Produces:
  - `LoadoutContext` (Preact context, default `null`)
  - `useCompare(subject: CompareSubject | null): { props: CompareTriggerProps; card: JSX.Element | null }`
  - constants `HOVER_DELAY_MS = 150`, `LONG_PRESS_MS = 500`

- [ ] **Step 1: Write the failing test**

Create `tests/useCompare.test.tsx`:

```tsx
import { h } from 'preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/preact';
import { LoadoutContext } from '@/components/LoadoutContext';
import { useCompare } from '@/hooks/useCompare';
import { emptySlots, type Loadout } from '@/shared/loadout';
import type { CompareSubject } from '@/shared/compare';

const loadout: Loadout = {
  version: 1, playerLevel: 30, capturedAt: 1,
  slots: {
    ...emptySlots(),
    head: { name: 'sisak', kind: 'vért', level: 20, maxDamage: null, spread: null, defense: 16, magical: false, vampiric: false },
  },
};

const candidate: CompareSubject = {
  name: 'jobb sisak', kind: 'vért', level: 21, maxDamage: null, spread: null,
  defense: 20, magical: false, vampiric: false, armorType: 'Sisak',
};

function Row({ subject = candidate as CompareSubject | null }: { subject?: CompareSubject | null }) {
  const cmp = useCompare(subject);
  return <div data-testid="row" {...cmp.props}>sisak{cmp.card}</div>;
}

const mount = (value: Loadout | null, subject: CompareSubject | null = candidate) =>
  render(
    <LoadoutContext.Provider value={value}>
      <Row subject={subject} />
    </LoadoutContext.Provider>,
  );

const row = () => screen.getByTestId('row');
const card = () => document.querySelector('.lc-cmp');

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useCompare — hover', () => {
  it('opens after the hover delay and closes on leave', () => {
    mount(loadout);
    fireEvent.mouseEnter(row(), { clientX: 5, clientY: 5 });
    expect(card()).toBeNull();

    vi.advanceTimersByTime(200);
    expect(card()).not.toBeNull();
    expect(screen.getByText('jobb sisak')).toBeTruthy();

    fireEvent.mouseLeave(row());
    expect(card()).toBeNull();
  });

  it('does not open when the pointer leaves before the delay elapses', () => {
    mount(loadout);
    fireEvent.mouseEnter(row(), { clientX: 5, clientY: 5 });
    fireEvent.mouseLeave(row());
    vi.advanceTimersByTime(500);
    expect(card()).toBeNull();
  });
});

describe('useCompare — long press', () => {
  it('opens after the press is held, and not before', () => {
    mount(loadout);
    fireEvent.touchStart(row(), { touches: [{ clientX: 5, clientY: 5 }] });
    vi.advanceTimersByTime(300);
    expect(card()).toBeNull();

    vi.advanceTimersByTime(300);
    expect(card()).not.toBeNull();
  });

  it('cancels when the finger moves away or lifts early', () => {
    mount(loadout);
    fireEvent.touchStart(row(), { touches: [{ clientX: 5, clientY: 5 }] });
    fireEvent.touchMove(row(), { touches: [{ clientX: 5, clientY: 40 }] });
    vi.advanceTimersByTime(600);
    expect(card()).toBeNull();

    fireEvent.touchStart(row(), { touches: [{ clientX: 5, clientY: 5 }] });
    fireEvent.touchEnd(row());
    vi.advanceTimersByTime(600);
    expect(card()).toBeNull();
  });

  it('closes on a tap elsewhere, and on scroll', () => {
    mount(loadout);
    fireEvent.touchStart(row(), { touches: [{ clientX: 5, clientY: 5 }] });
    vi.advanceTimersByTime(600);
    expect(card()).not.toBeNull();

    fireEvent.touchStart(document.body, { touches: [{ clientX: 200, clientY: 200 }] });
    expect(card()).toBeNull();

    fireEvent.touchStart(row(), { touches: [{ clientX: 5, clientY: 5 }] });
    vi.advanceTimersByTime(600);
    fireEvent.scroll(window);
    expect(card()).toBeNull();
  });

  it('suppresses the context menu while a press is pending', () => {
    mount(loadout);
    fireEvent.touchStart(row(), { touches: [{ clientX: 5, clientY: 5 }] });
    const menu = new Event('contextmenu', { bubbles: true, cancelable: true });
    row().dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
  });

  it('ignores the emulated mouseenter a tap produces', () => {
    mount(loadout);
    fireEvent.touchStart(row(), { touches: [{ clientX: 5, clientY: 5 }] });
    fireEvent.touchEnd(row());
    // The browser follows a tap with mouse events; they must not open the card.
    fireEvent.mouseEnter(row(), { clientX: 5, clientY: 5 });
    vi.advanceTimersByTime(600);
    expect(card()).toBeNull();
  });
});

describe('useCompare — when there is nothing to compare', () => {
  it('does nothing without a stored loadout', () => {
    mount(null);
    fireEvent.mouseEnter(row(), { clientX: 5, clientY: 5 });
    vi.advanceTimersByTime(600);
    expect(card()).toBeNull();
  });

  it('does nothing without a subject', () => {
    mount(loadout, null);
    fireEvent.mouseEnter(row(), { clientX: 5, clientY: 5 });
    vi.advanceTimersByTime(600);
    expect(card()).toBeNull();
  });

  it('does nothing when the comparison yields no column', () => {
    mount(loadout, { ...candidate, armorType: 'Nyaklánc' });
    fireEvent.mouseEnter(row(), { clientX: 5, clientY: 5 });
    vi.advanceTimersByTime(600);
    expect(card()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/useCompare.test.tsx`
Expected: FAIL — cannot resolve `@/components/LoadoutContext`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/LoadoutContext.ts`:

```ts
import { createContext } from 'preact';
import type { Loadout } from '@/shared/loadout';

/**
 * What the player is wearing, for the compare card. Provided at each in-game
 * mount root (both boots and the database overlay) from GM storage.
 *
 * The default is null, which is also what the standalone database site gets: a
 * different origin cannot see the in-game loadout, so compare is in-game only
 * and every consumer must render normally without one.
 */
export const LoadoutContext = createContext<Loadout | null>(null);
```

Create `src/hooks/useCompare.tsx`:

```tsx
import { h, type JSX } from 'preact';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { LoadoutContext } from '@/components/LoadoutContext';
import { CompareCard } from '@/components/CompareCard';
import { compareToLoadout, type CompareSubject } from '@/shared/compare';

/** Hover has to be deliberate, or the card flickers across a scanned table. */
export const HOVER_DELAY_MS = 150;
export const LONG_PRESS_MS = 500;
/** Movement past this many pixels means a scroll, not a press. */
const MOVE_CANCEL_PX = 10;
/**
 * A tap is followed by emulated mouse events. Ignore the hover path for this
 * long afterwards, or a plain tap opens the card on touch devices.
 */
const TOUCH_SUPPRESS_MS = 800;

interface Point { x: number; y: number }

export interface CompareTriggerProps {
  onMouseEnter: (e: MouseEvent) => void;
  onMouseLeave: () => void;
  onTouchStart: (e: TouchEvent) => void;
  onTouchMove: (e: TouchEvent) => void;
  onTouchEnd: () => void;
  onTouchCancel: () => void;
  onContextMenu: (e: Event) => void;
}

/**
 * Wires one row to the compare card: hover on a mouse, long-press on touch.
 *
 * Mouse plus touch rather than pointer events on purpose — jsdom ships no
 * PointerEvent, so a pointer-based trigger could only be tested against a
 * fabricated event. Both gestures are the same in either implementation.
 *
 * Returns nothing to render (and binds no useful handler) when there is no
 * loadout, no subject, or nothing comparable — so rows stay untouched in the
 * standalone site, which never has a loadout.
 */
export function useCompare(subject: CompareSubject | null): { props: CompareTriggerProps; card: JSX.Element | null } {
  const loadout = useContext(LoadoutContext);
  const [at, setAt] = useState<Point | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressing = useRef(false);
  const pressFrom = useRef<Point | null>(null);
  const lastTouch = useRef(0);
  /** The element the trigger is bound to, so an outside tap can be told apart. */
  const hostRef = useRef<Node | null>(null);

  const columns = useMemo(
    () => (subject && loadout ? compareToLoadout(subject, loadout) : []),
    [subject, loadout],
  );
  const enabled = columns.length > 0;

  const clear = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    pressing.current = false;
    pressFrom.current = null;
  }, []);

  const close = useCallback(() => { clear(); setAt(null); }, [clear]);

  // Open and stay open until dismissed: a tap elsewhere, or any scroll (which
  // would otherwise leave the card stranded beside the row it describes).
  useEffect(() => {
    if (at === null) return undefined;
    const onOutside = (e: Event) => { if (!(e.target instanceof Node) || !hostRef.current?.contains(e.target)) close(); };
    document.addEventListener('touchstart', onOutside, true);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('touchstart', onOutside, true);
      window.removeEventListener('scroll', close, true);
    };
  }, [at, close]);

  useEffect(() => clear, [clear]);

  const openAt = (p: Point) => setAt(p);

  const props: CompareTriggerProps = {
    onMouseEnter: (e) => {
      if (!enabled || Date.now() - lastTouch.current < TOUCH_SUPPRESS_MS) return;
      hostRef.current = e.currentTarget as Node;
      const p = { x: e.clientX + 12, y: e.clientY + 12 };
      clear();
      timer.current = setTimeout(() => openAt(p), HOVER_DELAY_MS);
    },
    onMouseLeave: () => { if (enabled) close(); },
    onTouchStart: (e) => {
      lastTouch.current = Date.now();
      if (!enabled) return;
      hostRef.current = e.currentTarget as Node;
      const t = e.touches[0];
      const p = { x: (t?.clientX ?? 0) + 12, y: (t?.clientY ?? 0) + 12 };
      clear();
      pressing.current = true;
      pressFrom.current = p;
      timer.current = setTimeout(() => { pressing.current = false; openAt(p); }, LONG_PRESS_MS);
    },
    onTouchMove: (e) => {
      const from = pressFrom.current;
      const t = e.touches[0];
      if (!from || !t) return;
      if (Math.abs(t.clientX + 12 - from.x) > MOVE_CANCEL_PX || Math.abs(t.clientY + 12 - from.y) > MOVE_CANCEL_PX) close();
    },
    onTouchEnd: () => { if (timer.current !== null) close(); },
    onTouchCancel: close,
    // The long press must not also raise the browser's own menu.
    onContextMenu: (e) => { if (pressing.current) e.preventDefault(); },
  };

  return {
    props,
    card: at && enabled && subject
      ? <CompareCard name={subject.name} columns={columns} x={at.x} y={at.y} />
      : null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/useCompare.test.tsx && npx tsc --noEmit`
Expected: PASS. If a test fails on timer or listener ordering, fix the hook — not the test's intent.

- [ ] **Step 5: Commit**

```bash
git add src/components/LoadoutContext.ts src/hooks/useCompare.tsx tests/useCompare.test.tsx
git commit -m "feat(compare): add the hover and long-press compare trigger"
```

---

### Task 8: Wire the explorer tables

**Files:**
- Modify: `src/database/explorer/DataTable.tsx` (extract a row component, add `subjectOf`)
- Modify: `src/database/explorer/ExplorerView.tsx:88-96` (pass `subjectOf` per tab)
- Modify: `src/components/DatabaseOverlay.tsx` (provide the loadout)
- Test: `tests/compareExplorer.test.tsx`

**Interfaces:**
- Consumes: `useCompare` (Task 7), `fromWeapon`/`fromArmor` (Task 5), `readLoadout` (Task 4), `LoadoutContext` (Task 7).
- Produces: `DataTableProps.subjectOf?: (row: T) => CompareSubject | null`.

- [ ] **Step 1: Write the failing test**

Create `tests/compareExplorer.test.tsx`:

```tsx
import { h } from 'preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/preact';
import { DataTable } from '@/database/explorer/DataTable';
import { COLS } from '@/database/explorer/columns';
import { LoadoutContext } from '@/components/LoadoutContext';
import { fromArmor } from '@/shared/compare';
import { emptySlots, type Loadout } from '@/shared/loadout';

const loadout: Loadout = {
  version: 1, playerLevel: 30, capturedAt: 1,
  slots: {
    ...emptySlots(),
    head: { name: 'ent sisak', kind: 'vért', level: 20, maxDamage: null, spread: null, defense: 16, magical: false, vampiric: false },
  },
};

const rows = [{ id: 1, name: 'jobb sisak', level: 21, type: 'Sisak', defense: 20, magical: false, weight: 1, price: 10, marketPrice: null, craftableAt: '' }];

const mount = (value: Loadout | null) =>
  render(
    <LoadoutContext.Provider value={value}>
      <DataTable
        columns={COLS.armors}
        rows={rows as never}
        onSelect={() => {}}
        subjectOf={(row) => fromArmor(row as never)}
      />
    </LoadoutContext.Provider>,
  );

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('explorer compare', () => {
  it('opens the diff when a row is hovered', () => {
    mount(loadout);
    fireEvent.mouseEnter(screen.getByText('jobb sisak').closest('tr')!, { clientX: 5, clientY: 5 });
    vi.advanceTimersByTime(200);

    expect(document.querySelector('.lc-cmp')).not.toBeNull();
    expect(screen.getByText('Fej')).toBeTruthy();
    expect(screen.getByText('ent sisak')).toBeTruthy();
  });

  it('stays out of the way with no loadout — the standalone site', () => {
    mount(null);
    fireEvent.mouseEnter(screen.getByText('jobb sisak').closest('tr')!, { clientX: 5, clientY: 5 });
    vi.advanceTimersByTime(200);
    expect(document.querySelector('.lc-cmp')).toBeNull();
  });

  it('still selects the row it is hovering', () => {
    const onSelect = vi.fn();
    render(
      <LoadoutContext.Provider value={loadout}>
        <DataTable columns={COLS.armors} rows={rows as never} onSelect={onSelect} subjectOf={(row) => fromArmor(row as never)} />
      </LoadoutContext.Provider>,
    );
    fireEvent.click(screen.getByText('jobb sisak').closest('tr')!);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/compareExplorer.test.tsx`
Expected: FAIL — `subjectOf` is not a `DataTable` prop, so no card appears.

- [ ] **Step 3: Write minimal implementation**

In `src/database/explorer/DataTable.tsx`: add the import and prop, and move the row markup into its own component (a hook cannot be called inside the `.map()` — the row count changes between renders).

```tsx
import { useCompare } from '@/hooks/useCompare';
import type { CompareSubject } from '@/shared/compare';
```

Add to `DataTableProps<T>`:

```tsx
  /**
   * Turns a row into a compare subject, enabling the hover/long-press diff
   * against the worn set. Omitted for tabs with nothing to compare (items,
   * monsters) and by the standalone site, which has no loadout.
   */
  subjectOf?: (row: T) => CompareSubject | null;
```

Add the row component (above `DataTable`):

```tsx
interface DataRowProps<T> {
  row: T;
  columns: ColumnDef[];
  selected: boolean;
  onSelect: (row: T) => void;
  subject: CompareSubject | null;
}

/**
 * One table row. Its own component because `useCompare` is a hook: calling it
 * inside the rows' `.map()` would change the hook count whenever the filtered
 * row count changes.
 */
function DataRow<T extends Record<string, unknown>>({ row, columns, selected, onSelect, subject }: DataRowProps<T>): VNode {
  const cmp = useCompare(subject);
  return (
    <tr class={`row${selected ? ' selected' : ''}`} onClick={() => onSelect(row)} {...cmp.props}>
      {columns.map((c, i) => (
        <td key={c.key} class={c.cls || ''}>
          {formatCell(row[c.key], c)}
          {i === 0 && cmp.card}
        </td>
      ))}
    </tr>
  );
}
```

and replace the `slice.map(...)` body with:

```tsx
        {slice.map((row) => (
          <DataRow
            key={String(row.id)}
            row={row}
            columns={columns}
            selected={selected != null && selected.id === row.id}
            onSelect={onSelect}
            subject={subjectOf?.(row) ?? null}
          />
        ))}
```

(destructure `subjectOf` alongside the other props at the top of `DataTable`).

In `src/database/explorer/ExplorerView.tsx`, add the import:

```tsx
import { fromArmor, fromWeapon, type CompareSubject } from '@/shared/compare';
```

then, above the returned JSX:

```tsx
  // Only weapons and armours have a worn counterpart to diff against.
  const subjectOf = tab === 'weapons'
    ? (row: Row): CompareSubject => fromWeapon(row as unknown as Weapon)
    : tab === 'armors'
      ? (row: Row): CompareSubject => fromArmor(row as unknown as Armor)
      : undefined;
```

and pass `subjectOf={subjectOf}` to `<DataTable>`.

In `src/components/DatabaseOverlay.tsx`, add:

```tsx
import { LoadoutContext } from '@/components/LoadoutContext';
import { readLoadout } from '@/utils/config';
```

then inside the component, beside the other `useMemo`s:

```tsx
  // The worn set, for the explorer's compare card. Read once per mount: the
  // game reloads the page on every action, so there is no staler window than
  // the panel's own lifetime.
  const loadout = useMemo(() => readLoadout(), []);
```

and wrap the rendered `<DatabaseApp>` in `<LoadoutContext.Provider value={loadout}>…</LoadoutContext.Provider>`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/compareExplorer.test.tsx tests/DatabaseOverlay.test.tsx && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/database/explorer/DataTable.tsx src/database/explorer/ExplorerView.tsx src/components/DatabaseOverlay.tsx tests/compareExplorer.test.tsx
git commit -m "feat(compare): diff explorer weapon and armour rows against the worn set"
```

---

### Task 9: Wire the Home inventory and Market panels

**Files:**
- Modify: `src/components/InventoryRow.tsx`
- Modify: `src/desktop/MarketPanel.tsx` (the shared `NameLine`, plus its two call sites)
- Modify: `src/mobile/boot.ts` (provide the loadout around the rendered page)
- Modify: `src/desktop/boot.ts` (provide the loadout around the dock)
- Test: `tests/compareSurfaces.test.tsx`

**Interfaces:**
- Consumes: `useCompare` (Task 7), `fromDetail` (Task 5), `readLoadout` (Task 4), `LoadoutContext` (Task 7).
- Produces: nothing new — the last two surfaces.

- [ ] **Step 1: Write the failing test**

Create `tests/compareSurfaces.test.tsx`:

```tsx
import { h } from 'preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/preact';
import { InventoryRow } from '@/components/InventoryRow';
import { LoadoutContext } from '@/components/LoadoutContext';
import { emptySlots, type Loadout } from '@/shared/loadout';
import type { HomeItem } from '@/utils/homeExtract';

const loadout: Loadout = {
  version: 1, playerLevel: 30, capturedAt: 1,
  slots: {
    ...emptySlots(),
    head: { name: 'ent sisak', kind: 'vért', level: 20, maxDamage: null, spread: null, defense: 16, magical: false, vampiric: false },
  },
};

const item: HomeItem = {
  index: 0, name: 'jobb sisak', type: 'vért', weight: 1, amount: 1, totalWeight: 1,
  price: 10, magical: false,
  attrs: [['Név', 'jobb sisak'], ['Min. szint', '21'], ['Védelem', '20'], ['Fajta', 'fejre']],
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('inventory compare', () => {
  it('diffs a stored armour against the worn one on hover', () => {
    render(
      <LoadoutContext.Provider value={loadout}>
        <InventoryRow item={item} moveGlyph="🎒" moveTitle="Hátizsákba" onMove={() => {}} onOpenDetail={() => {}} />
      </LoadoutContext.Provider>,
    );

    fireEvent.mouseEnter(document.querySelector('.lc-inv-name-line')!, { clientX: 5, clientY: 5 });
    vi.advanceTimersByTime(200);

    expect(document.querySelector('.lc-cmp')).not.toBeNull();
    expect(screen.getByText('Fej')).toBeTruthy();
    expect(document.querySelector('.lc-cmp-better')).not.toBeNull();
  });

  it('leaves a plain item alone', () => {
    const shovel: HomeItem = { ...item, name: 'ásó', type: 'tárgy', attrs: [['Név', 'ásó']] };
    render(
      <LoadoutContext.Provider value={loadout}>
        <InventoryRow item={shovel} moveGlyph="🎒" moveTitle="Hátizsákba" onMove={() => {}} onOpenDetail={() => {}} />
      </LoadoutContext.Provider>,
    );

    fireEvent.mouseEnter(document.querySelector('.lc-inv-name-line')!, { clientX: 5, clientY: 5 });
    vi.advanceTimersByTime(200);
    expect(document.querySelector('.lc-cmp')).toBeNull();
  });

  it('still opens the item detail when the name is clicked', () => {
    const onOpenDetail = vi.fn();
    render(
      <LoadoutContext.Provider value={loadout}>
        <InventoryRow item={item} moveGlyph="🎒" moveTitle="Hátizsákba" onMove={() => {}} onOpenDetail={onOpenDetail} />
      </LoadoutContext.Provider>,
    );
    fireEvent.click(screen.getByText('jobb sisak'));
    expect(onOpenDetail).toHaveBeenCalledTimes(1);
  });
});
```

Also append to `tests/MarketPanel.test.tsx`, inside its existing `describe('MarketPanel')` — it uses that file's `makeState`, and adds the two imports below at the top of the file:

```tsx
import { LoadoutContext } from '../src/components/LoadoutContext';
import { emptySlots, type Loadout } from '../src/shared/loadout';
```

```tsx
  it('diffs an offerable armour against the worn one on hover', () => {
    vi.useFakeTimers();
    try {
      const loadout: Loadout = {
        version: 1, playerLevel: 30, capturedAt: 1,
        slots: {
          ...emptySlots(),
          head: { name: 'ent sisak', kind: 'vért', level: 20, maxDamage: null, spread: null, defense: 16, magical: false, vampiric: false },
        },
      };
      // An armour in the backpack, with the stat block the game prints for one.
      const helmet: MarketItem = {
        name: 'jobb sisak', amount: 1, index: 5, price: 1457, pricePercent: null, suggestedPrice: null,
        type: 'vért', weight: 1.4, totalWeight: 1.4, magical: false,
        attrs: [['Név', 'jobb sisak'], ['Min. szint', '21'], ['Védelem', '20'], ['Fajta', 'fejre']],
      };
      const { container } = render(
        <LoadoutContext.Provider value={loadout}>
          <MarketPanel open state={makeState({ items: [helmet] })} onClose={vi.fn()} />
        </LoadoutContext.Provider>,
      );

      fireEvent.mouseEnter(rowFor(container, 'jobb sisak').querySelector('.lc-mkt-name-line')!, { clientX: 5, clientY: 5 });
      vi.advanceTimersByTime(200);

      expect(document.querySelector('.lc-cmp')).not.toBeNull();
      expect(screen.getByText('Fej')).toBeTruthy();
      // Védelem 16 → 20 is an upgrade.
      expect(document.querySelector('.lc-cmp-better')).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/compareSurfaces.test.tsx`
Expected: FAIL — no `.lc-cmp` is rendered by `InventoryRow`.

- [ ] **Step 3: Write minimal implementation**

In `src/components/InventoryRow.tsx`, add:

```tsx
import { useCompare } from '@/hooks/useCompare';
import { fromDetail } from '@/shared/compare';
```

inside the component, before the return:

```tsx
  // A weapon or armour in the house or backpack diffs against the worn set;
  // fromDetail returns null for plain items, which disables the trigger.
  const cmp = useCompare(fromDetail(item));
```

and change the name line to carry the trigger and the card:

```tsx
        <div class="lc-inv-name-line" {...cmp.props}>
          <button class="lc-inv-name" onClick={onOpenDetail}>{item.name}</button>
          {TYPE_LABEL[item.type] && <span class="lc-inv-badge">{TYPE_LABEL[item.type]}</span>}
          {item.magical && <span class="lc-inv-badge">mágikus</span>}
          {cmp.card}
        </div>
```

In `src/desktop/MarketPanel.tsx`, add:

```tsx
import { useCompare } from '@/hooks/useCompare';
import { fromDetail } from '@/shared/compare';
import type { DetailLike } from '@/shared/loadout';
```

add to `NameLineProps`:

```tsx
  /** Parsed stat block, when there is one, for the compare card. */
  detail?: DetailLike | null;
```

and in `NameLine` — one change covering both columns, which is why the trigger goes here rather than in each row:

```tsx
function NameLine({ text, detailName, pricePercent, assumedRate, onOpenDetail, detail, children }: NameLineProps): JSX.Element {
  const cmp = useCompare(detail ? fromDetail(detail) : null);
  return (
    <div class="lc-mkt-name-line" {...cmp.props}>
      {cmp.card}
```

(leave the rest of the body unchanged).

Then pass the detail at both call sites: in `OfferRow`, `detail={item}`; in `ListingRow`, `detail={listing.detail}`.

In `src/mobile/boot.ts`, add:

```ts
import { LoadoutContext } from '@/components/LoadoutContext';
import { readLoadout } from '@/utils/config';
```

read it once before `renderPage`:

```ts
  const loadout = readLoadout();
```

and wrap each page render, e.g.:

```ts
      case PageType.Home:
        render(h(LoadoutContext.Provider, { value: loadout }, h(Home, { state: pageState.state })), root);
        break;
```

Do the same for the `FreeMove`, `Battle`, `Login` and `Dungeon` cases, so any database overlay opened from them inherits the loadout too.

In `src/desktop/boot.ts`, add the same two imports, read `const loadout = readLoadout();` beside the other boot-time reads, and wrap the dock render:

```ts
      render(h(LoadoutContext.Provider, { value: loadout }, h(DesktopDock, { /* …existing props unchanged… */ })), root);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/compareSurfaces.test.tsx tests/MarketPanel.test.tsx tests/InventoryList.test.tsx tests/Home.test.tsx tests/desktopDock.test.tsx tests/mobileBoot.test.ts tests/desktopBoot.test.ts && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/InventoryRow.tsx src/desktop/MarketPanel.tsx src/mobile/boot.ts src/desktop/boot.ts tests/compareSurfaces.test.tsx tests/MarketPanel.test.tsx
git commit -m "feat(compare): diff inventory and market rows against the worn set"
```

---

### Task 10: Full verification and documentation

**Files:**
- Modify: `CLAUDE.md` (the character page + compare feature)
- Test: the whole suite

- [ ] **Step 1: Run every gate**

```bash
npm run typecheck && npm test && npm run build
```
Expected: no type errors, all tests pass, both bundles build. Fix anything that fails before continuing — do not proceed on a red gate.

- [ ] **Step 2: Document the feature in CLAUDE.md**

Add to the *Real game DOM — hard-won facts* list:

```markdown
- **The character page (`oldalTipus=otPlayerSettings`, title `karakterlap`) is the
  only page that prints the worn equipment set — and the only place equipment can
  be changed**, which is why capturing on every visit keeps the stored loadout
  current by construction rather than approximately. Its five slots (`Bal kéz`,
  `Jobb kéz`, `Test`, `Fej`, `Láb`) each carry the item's **full stat block inside
  the link's `onclick="alert('…')"`**, in the same `label: value` per-line grammar
  as the Home page's inventory — so `characterExtract` decodes the single-quoted
  payload (never executes it) and reuses `parseCuccDetail`. Notes that cost
  measurement to establish:
  - `Átlag sebzés` is never printed and never needs to be: `avgDamage ===
    maxDamage - spread/2` for all 1220 weapons carrying both fields, so the
    stored loadout is self-contained — the compare path does no database lookup
    and cannot fail to resolve a name.
  - `level` and `minLevel` are one quantity (0 mismatches across 1216 weapons and
    1279 armours), so the page's `Min. szint` compares directly with the
    database's `level`.
  - A shield prints `Fajta: kézbe` **and no `Min. szint` at all**, so `level` is
    genuinely nullable; shields occupy a hand, beside weapons.
  - Armour slots resolve from either vocabulary — database `type`
    (`Páncél`/`Sisak`/`Csizma`/`Pajzs`) or the page's `Fajta`
    (`testre`/`fejre`/`lábra`/`kézbe`) — via `armorTarget` in
    `src/shared/loadout.ts`. An unrecognised value yields **no** comparison plus a
    warning, rather than a guessed slot.
- **The compare card** (`useCompare` + `CompareCard`) diffs a hovered weapon or
  armour against the worn set on the explorer tables, the Home inventory and the
  Market panel, reading the loadout from a `LoadoutContext` that both boots and
  `DatabaseOverlay` provide. Deliberate choices worth not relitigating:
  - A weapon shows **one column per equipped hand**; a shield compares only
    against a hand that holds a shield, since `Védelem` against `Maximum sebzés`
    is not a comparison.
  - **Lower `Szórás` is better** (`avgDamage = maxDamage − szórás/2`), and `Szint`
    is never "better" — only neutral, or red when it exceeds the player's level.
  - The trigger uses **mouse events for hover and touch events for long-press,
    not pointer events**: jsdom ships no `PointerEvent`, so a pointer-based
    trigger could only be tested against a fabricated event. A tap's emulated
    `mouseenter` is suppressed for 800ms so tapping never opens the hover card.
  - **The standalone site never shows it.** It is a different origin with its own
    `localStorage` and cannot see the in-game loadout, so `LoadoutContext`
    defaults to null and every consumer renders normally without one.
```

- [ ] **Step 3: Verify the built userscript is self-consistent**

```bash
npm run build && grep -c "lc-loadout" dist/larkinor-ui.user.js
```
Expected: at least 1 — the capture and read paths both shipped.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(compare): document the character page and the compare card"
```

- [ ] **Step 5: Manual check on the live game (optional but recommended)**

Per the console-injection notes in CLAUDE.md, or `./serve.sh` with the ViolentMonkey loader: visit the character page (loadout captured), then open Adatbázis → Vértek and hover a row — the diff should name `Fej`/`Test`/`Láb` and colour the deltas. Screenshots go in `.tmp/`.
