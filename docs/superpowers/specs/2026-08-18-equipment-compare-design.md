# Equipment capture and hover compare — design

**Status:** approved 2026-08-18
**Source:** the live character page (`oldalTipus=otPlayerSettings`, title `karakterlap`),
captured to `.tmp/karakterlap.html` during scouting
**Builds on:** `docs/superpowers/specs/2026-07-06-larkinor-real-dom-reference.md`

## Goal

Capture what the player is wearing when the character page is visited, store it,
and use it to answer one question everywhere a weapon or armour is listed: *is
this better than what I have on?* Hovering (desktop) or long-pressing (touch) a
weapon or armour row opens a small diff card — current value, candidate value,
signed delta, green for better and red for worse.

Two independent halves: a silent capture on one page, and a read-only compare UI
on three surfaces.

## Source analysis

The character page is `oldalTipus = otPlayerSettings` — a value `detectPage` does
not yet know, so the page currently falls through to `PageType.Unknown`. Like
every other game page it is ISO-8859-2 and quirks mode (`document.compatMode ===
'BackCompat'`), and it carries three forms (`targyurlap`, `tulajdonsagokUrlap`,
`urlap`).

### The equipped items carry their own stat blocks

All five slots live in one `<td>`, each a label followed by a link whose
`onclick` alerts the item's full detail:

```html
Bal kéz: <b><a href="#" onclick="alert('Típus: fegyver\nNév: Kaltenekker íj\nSúly: 2.6 kg.\n
  Ár: 7560 ezüst\nExtra: vámpirizál\nMin. szint: 21\nMaximum sebzés: 133\n
  Sebzés szórás: 7\nFajta: távolsági\nMágikus!!!\n');return false;">Kaltenekker íj</a></b><br>
Jobb kéz: …<br>Test: …<br>Fej: …<br>Láb: …<br>
Terhelés: <b>23.3229kg. / 111.2kg.</b>
```

The five slot labels are `Bal kéz`, `Jobb kéz`, `Test`, `Fej`, `Láb`. Decoded,
the alert payload is **exactly the `label: value` per-line grammar that
`parseCuccDetail` already parses** (`src/utils/homeExtract.ts:31`), including the
bare `Mágikus!!!` line — so the parser is reused rather than rewritten. Observed
labels: `Típus` (`fegyver` | `vért`), `Név`, `Súly`, `Ár`, `Extra`, `Min. szint`,
`Maximum sebzés`, `Sebzés szórás`, `Fajta`, `Védelem`.

Consequences worth stating, because each removes a failure mode:

- **The `onclick` is exactly `alert('…');return false;`** on every slot
  (verified across all five, in two captures), so the extractor anchors its
  match rather than searching loosely for a quote.
- **The payload is a JS single-quoted string literal**, not text — `\n` is two
  characters in the attribute. It must be decoded before parsing, the same
  concern `decodeJsString` handles for the Home page's `hazbanCucc[i]="…"` array.
  It is decoded, never executed.
- **`Átlag sebzés` is not printed, and does not need to be.** Across all 1220
  weapons carrying the three fields, `avgDamage === maxDamage - spread / 2`
  holds exactly, with zero mismatches. The stored loadout is therefore
  self-contained: the compare path needs no database lookup, no async load, and
  has no name-resolution failure mode. (The names *do* resolve — `Kaltenekker íj`
  is weapon #261, `Zamárdi felsője` armour #259 — we simply do not depend on it.)
- **The slot is read from the page's own label**, not inferred from `Fajta`. The
  equipped side is thus never ambiguous, and `Fajta` matters only for deciding
  which slot a *hovered* candidate belongs to.
- The stat block above the slots prints `Szint: 23`, the player level. It is
  captured too, because `Min. szint` decides whether a "better" item is wearable
  at all.

### Armour slots

The candidate's slot comes from the database's `type` (explorer rows) or the
parsed `Fajta` (Home and Market rows, which are `ParsedDetail`):

| DB `type` | `Fajta`  | Slot        |
|-----------|----------|-------------|
| `Páncél`  | `testre` | Test        |
| `Sisak`   | `fejre`  | Fej         |
| `Csizma`  | `lábra`  | Láb         |
| `Pajzs`   | `kézbe`  | a hand      |

Shields occupy a hand, which is why the weapon side needed a decision of its
own. Verified on the live page with a shield equipped (`bőrpajzs`, `Bal kéz`).

That capture also showed a shield printing **no `Min. szint` line at all** — so
`level` is genuinely nullable, and the `Szint` row is absent for shields rather
than diffed against a missing value.

## Architecture

Six modules, split so that only the extractor (which must read the live page)
and the two component files touch a DOM; the model, the storage keys and all of
the comparison rules are pure.

### 1. Page detection — `src/utils/pageDetector.ts`

`PageType.Character` added for `otPlayerSettings`. Mobile needs no other change:
`extractPageState`'s `default: return null` (`src/mobile/boot.ts`) leaves the page
untouched, which is what we want — this feature mounts no UI on the character
page. The desktop dock already renders on every page and is unaffected.

### 2. Capture — `src/utils/characterExtract.ts`

`extractCharacter(doc): Loadout | null` — null when the equipment block is
absent, which is how a page shape that has drifted fails loudly-but-safely
instead of storing an all-empty loadout over a good one.

Finds the equipment `<td>` by its slot labels, then walks its child nodes in
order, tracking the most recent text node's trailing label and attaching the next
`<a>` to that slot. Walking nodes rather than splitting on `<br>` keeps it
independent of the markup's incidental whitespace and `<br>` placement — the
same reason `enhanceNarration` works on flattened text.

Per slot: read `onclick`, take the single-quoted `alert(...)` argument, decode it,
hand it to `parseCuccDetail`, and map its `attrs` to a typed `EquippedItem`. A
slot with no link stores `null`, so "nothing equipped there" stays distinguishable
from "never captured".

### 3. Loadout model and storage — `src/shared/loadout.ts`, `src/shared/prefKeys.ts`

GM-free, so `src/database/**` can import it (the constraint `prefKeys.ts`
documents).

```ts
type Slot = 'leftHand' | 'rightHand' | 'body' | 'head' | 'legs';

interface EquippedItem {
  name: string;
  kind: 'fegyver' | 'vért';
  level: number | null;        // Min. szint
  maxDamage: number | null;    // weapons
  spread: number | null;       // weapons
  defense: number | null;      // armour
  magical: boolean;
  vampiric: boolean;
}

interface Loadout {
  version: 1;
  playerLevel: number | null;
  capturedAt: number;  // diagnostics only — see the freshness invariant below
  slots: Record<Slot, EquippedItem | null>;
}
```

**Freshness is an invariant, not a hope.** Equipment can only be changed on the
character page itself, so a capture written on every visit to that page is by
construction current — there is no path by which the worn set changes while the
stored loadout does not. `capturedAt` is kept for diagnostics, not shown in the
UI; the compare card needs no staleness caveat.

`LOADOUT_PREF_KEY = 'lc-loadout'` joins the other keys in `prefKeys.ts`, holding
the JSON. Written with the existing `setPref`, read through `PrefStore` — no new
storage mechanism. `version` lets a future shape change be discarded rather than
misread; an unparseable or wrong-version value reads as "no loadout".

### 4. Compare logic — `src/shared/compare.ts`

Pure, no DOM, no Preact. Candidates arrive in two shapes — a database
`Weapon`/`Armor` in the explorer, a `ParsedDetail` in the Home and Market panels
— so three small adapters (`fromWeapon`, `fromArmor`, `fromParsedDetail`)
normalise both into one `CompareSubject`, and the rules below are written once
against that.

```ts
type Value = number | boolean | null;
type Direction = 'better' | 'worse' | 'same' | 'blocked';

interface CompareRow { label: string; current: Value; candidate: Value; delta: string | null; direction: Direction }
interface CompareColumn { slot: Slot; slotLabel: string; currentName: string | null; rows: CompareRow[] }
```

- `compareWeapon` returns **one column per hand holding a weapon** (the approved
  side-by-side layout), degrading to one column, or to none when both hands are
  empty.
- `compareArmor` returns the single column for the slot its type maps to.
  `Pajzs` compares against a hand **only if that hand holds a shield** (that is,
  an `EquippedItem` with `kind: 'vért'` and a `defense` value) — never against a
  sword, since `Védelem` against `Maximum sebzés` is not a comparison.
- Fields are exactly the approved set. Weapons: `Szint`, `Max sebzés`,
  `Átlag sebzés`, `Szórás`, `Mágikus`, `Vámpirizál`. Armour: `Szint`, `Védelem`.
- Direction is per field: higher is better everywhere except **`Szórás`, where
  lower is better** — `avgDamage = maxDamage − szórás/2`, so a tighter spread is
  strictly more damage.
- Booleans diff as gain (`nem → igen` = better) or loss.
- `Szint` reads the candidate's DB `level` (explorer) or its parsed
  `Min. szint` (Home, Market), and the equipped item's `Min. szint`. These are
  one quantity, not two: `level === minLevel` for every weapon and armour where
  the database carries both (0 mismatches in 1216 and 1279 records).
- `Szint` is never "better": a higher requirement is not an upgrade. It renders
  neutral, except `blocked` (red, flagged) when the candidate's `Min. szint`
  exceeds `playerLevel` — an item you cannot wear.
- A field missing on either side yields no row rather than a diff against zero.

### 5. Presentation — `src/components/CompareCard.tsx`, `src/hooks/useCompareTrigger.ts`

`CompareCard` renders the candidate's name and the columns as a small table.
Because it can render inside the quirks-mode game page it **sets `color`
explicitly** (the documented inheritance hole: quirks mode does not inherit
`color` into tables). Colours come from the theme's existing `--good` / `--bad`
variables — no new hex values. Styles are `.lc-cmp-*` scoped, added to
`theme.css`; positioned `fixed`, flipped to stay inside the viewport.

`useCompareTrigger` returns the props a row spreads onto itself, and handles both
gestures off pointer events: hover with a short open delay on desktop; long-press
(~500ms) on touch, cancelled by `pointermove` past a small threshold or by scroll,
with `contextmenu` suppressed and text selection disabled while a press is
pending — otherwise the long-press fights the browser's own selection and context
menu, the known cost of that gesture.

### 6. Wiring

Each boot reads the loadout once (`getPref` → parse) and provides it through a
`LoadoutContext`, rather than threading a prop down
`DatabaseApp → ExplorerView → DataTable`. Consumers read the context and render
nothing when it is null.

Providers: the mobile render root, the desktop dock root, and `DatabaseOverlay`.
The standalone `src/database/main.tsx` provides **nothing** — a different origin
with its own `localStorage` can never see the in-game loadout, so compare is
in-game only by design and standalone rows behave exactly as today.

Surfaces, per the approved scope: `DataTable` rows on the `weapons` and `armors`
tabs, `InventoryRow` on the Home page, and the Market panel's listing rows. Shop
pages are out of scope.

## Testing

Following the existing `tests/` patterns (Vitest + `@testing-library/preact`).

- `characterExtract`: against markup taken from the real captured page — all five
  slots, a shield in a hand (`Fajta: kézbe`, no `Min. szint`, so `level` is
  null), an empty slot, a missing equipment block, and the alert-string decoder
  (`\n` escapes, an apostrophe inside the payload).
- `pageDetector`: `otPlayerSettings` → `PageType.Character`.
- `mobileBoot`: the character page is left untouched (no `#lc-root`, original DOM
  not hidden) while the loadout is still written.
- `compare`: both hands, one hand, no hands, each armour slot, shield-against-
  shield, shield-against-sword (no column), `Szórás` direction, boolean gain and
  loss, `Szint` neutral vs `blocked` by player level, missing fields, and a
  candidate arriving as `ParsedDetail` vs as a DB record.
- `CompareCard`: renders columns, deltas, and the good/bad classes.
- `useCompareTrigger`: hover opens and closes, long-press opens, movement and
  scroll cancel, `contextmenu` suppressed.

## Risks and accepted limits

- **An unrecognised `Fajta` yields no compare card**, plus one `console.warn`
  naming the value — the same abort-as-drift-detector convention the quest
  parsers use. All four armour values are now observed (`testre`, `fejre`,
  `lábra`, `kézbe`), so this is drift detection rather than a known gap:
  guessing at a new value would silently compare against the wrong slot.
- **No compare in the standalone site**, as decided above.
- **Items (`tárgy`) are not compared**, per the agreed field list, even though
  some carry `Védelem`.
- **Long-press is undiscoverable** — the accepted cost of keeping single-tap free
  for the row actions that already exist.
