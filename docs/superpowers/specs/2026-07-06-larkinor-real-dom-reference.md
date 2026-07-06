# Larkinor Real DOM Reference (ground truth)

Derived from real saved game pages (`~/Downloads/l-save`) on 2026-07-06. This
supersedes the synthetic-fixture assumptions in the original plan for
pageDetector and domExtract.

> **Security note:** the raw saved pages contain a live session token
> (`kulcs`) and `loginname`. They MUST NOT be committed. Test fixtures are
> sanitized reconstructions of the structure below (fake kulcs/name).

## Page layout in general

- The game renders as **absolutely-positioned `<div>`s**, no semantic tables.
- Many divs share the **invalid duplicate `id="Layer3"`** — never rely on
  `getElementById('Layer3')`.
- Page is **ISO-8859-2** (Hungarian). At runtime the browser decodes entities;
  the userscript reads the live DOM, so `&#39;`/`&nbsp;` appear decoded.

## Canonical page-type signal — `oldalTipus`

Every page has a shared form `<form name="urlap">` with a hidden field:
`<input type="hidden" name="oldalTipus" value="ot...">`. This is the reliable
page-type discriminator (read `input[name="oldalTipus"]`.value):

| oldalTipus        | Scene            | v1 PageType |
|-------------------|------------------|-------------|
| `otVilag`         | free movement    | FreeMove    |
| `otHarc`          | combat           | Battle      |
| `otTemplom`       | church/temple    | Church      |
| `otVegyesbolt`    | item shop        | Shop        |
| `otFegyverbolt`   | weapon shop      | Shop        |
| `otPiac`          | market           | Shop        |
| `otKocsma`        | pub              | Unknown (v1)|
| `otLabirintus`    | dungeon          | Unknown (v1)|
| `otPlayerSettings`| character sheet  | Unknown (v1)|
| `otLogin`         | login            | Unknown (v1)|

Missing/unknown value → `Unknown` (leave original UI, console.warn).

## Shared action mechanism

All interactions drive `<form name="urlap">` (hidden fields: `oldalTipus`,
`loginname`, `kulcs`, `idopont`, `Submit`, `par1`, `par2`, `par3`), posting to
`https://l2.larkinor.hu/cgi-bin/larkinor`. Each on-screen control is an
`<input type="image">` (or the `ok.gif` button) whose inline `onclick` sets
`Submit`/`par*` and calls `document.urlap.submit()`.

**Extraction strategy:** do NOT reconstruct or parse the onclick strings.
Identify the original control (by image basename or `title`) and invoke
`element.click()` — the game's own onclick fires natively and submits. This is
resilient to the exact submit tokens.

## FreeMove (`otVilag`)

**Stats block** — a `<b>` element containing:
`<a title="karakterlap"><font color="blue">Remy </font></a> [994/800]`,
`Pénz: 1&nbsp;979`, `Életpont: 284 / 284`, `Varázspont: 275 / 275`.
- `playerName`: text of `a[title="karakterlap"]`, trimmed (e.g. "Remy").
- `gold`: substring after `Pénz:` — **digits separated by `&nbsp;`/space**
  (thousands separators). Strip all non-digits from the run: `1&nbsp;979` → 1979.
- `hp`/`hpMax`: `Életpont: N / N`.
- `mp`/`mpMax`: `Varázspont: N / N`.
- Bracket `[994/800]` is XP-related, **not level** — do not expose level.

**Location image** — inside the "Tájkép helye" div: an `<img title="<district>">`
(e.g. `title="harcos-negyed"`), 145×125. Live src pattern
`https://l2.larkinor.hu/tajk/NN.gif`. Best-effort selector: an `img` whose
`src` contains `/tajk/`, else an `img[width="145"]` with a title. Expose
`locationImageUrl` and `locationName` (the district title).

**Directions** — `input[type="image"]` whose src basename is one of:
`eszak.gif`→north, `del.gif`→south, `kelet.gif`→east, `nyugat.gif`→west.
Only present buttons are available. `label` from the input `title`
(e.g. "északra nyomulsz - harcos-negyed"). `trigger` = `input.click()`.

**Actions** — `select[name="tevFajta"]` with `<option value="kajal">kajálsz</option>`
etc. Submit button: `input[type="image"][src*="ok.gif"]` inside
`form[name="specTevUrlap"]`. `trigger(option)` = set the select's value to the
option value, then `okButton.click()` (its onclick reads the select and submits
`urlap`).

**Narration** — the "messages" div: the element containing
`font[face="Comic sans MS"]`. `narration` = that font element's `textContent`,
trimmed (empty when nothing is happening).

Building buttons (sajathaz/fegyverbolt/kocsma/klanhaz) are out of v1 scope.

## Battle (`otHarc`)

**Monster** — inside the "szornykép helye" div: an `<img>` with
`title="Unikorn, életpontja: 148"`.
- `monsterName`: title text before the first comma ("Unikorn").
- `monsterHp`: integer after `életpontja:` (148).
- `monsterImageUrl`: that img's src (live `https://l2.larkinor.hu/pic/szornyk/...`).

**Actions** — `input[type="image"]` buttons, `label` from `title`,
`trigger` = `el.click()`:
- `balk.gif` — attack with left-hand weapon.
- `jobbk.gif` — attack with right-hand weapon.
- `menekul.gif` — flee ("próbálsz menekülni").
- spell buttons `fold.gif`/`lev.gif`/`viz.gif`/`tuz.gif` (earth/air/water/fire) —
  include if present; labels may be empty (no title) so fall back to element name.
Exclude the `ok.gif` + `select[name="tevFajta"]` suicide/quit control from the
primary battle actions.

**Stats block** — identical `<b>` format as FreeMove.

**Narration** — same `font[face="Comic sans MS"]` container. In combat it holds
the battle description ("A lezúzandó szörnyeteg egy Unikorn... Életpont:148 ...").

## Corrected TypeScript interfaces

```typescript
export type Direction = 'north' | 'south' | 'east' | 'west';
export interface Action { label: string; trigger: () => void; }
export interface DirectionOption { dir: Direction; label: string; trigger: () => void; }

export interface FreeMoveState {
  playerName: string;
  gold: number;
  hp: number; hpMax: number;
  mp: number; mpMax: number;
  locationImageUrl: string;
  locationName: string;
  directions: DirectionOption[];
  actions: Action[];
  narration: string;
}

export interface BattleState {
  monsterName: string;
  monsterHp: number | null;
  monsterImageUrl: string;
  narration: string;
  actions: Action[];
  hp: number; hpMax: number;
  mp: number; mpMax: number;
}
```

(Removed from the original plan: `level`/`maxLevel`, `availableDirections`.
Added: `locationName`, `directions: DirectionOption[]`, `monsterHp`.)
