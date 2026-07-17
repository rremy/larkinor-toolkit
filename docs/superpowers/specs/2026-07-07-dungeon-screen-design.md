# Dungeon (Labirintus) support — lc-userscript

**Date:** 2026-07-07
**Status:** Approved (ready for implementation plan)

## Goal

Extend the lc-userscript mobile UI to take over Larkinor's **dungeon page**
(`oldalTipus=otLabirintus`), rendering a mobile-friendly view of the composed
labyrinth cell, doors, adjacent-monster markers, movement, and the
answer-a-question interaction — reusing the FreeMove machinery where the DOM is
identical.

## Real dungeon DOM — facts

Captured live from `https://l2.larkinor.hu/cgi-bin/larkinor` (charset
ISO-8859-2), consistent with the real-DOM reference doc.

- Hidden discriminator: `input[name="oldalTipus"]` value `otLabirintus`.
- Shared `<form name="urlap">` (same as the in-game pages) plus `specTevUrlap`.
- **Stats / gold / status icons / narration**: identical markup and formats to
  FreeMove (`Életpont: max / current`, `Pénz:`, the `<b>` stat block with
  status `img`s, and the `font[face="Comic sans MS"]` narration).
- **Composed cell image**: layered absolutely-positioned `img`s, each wrapped in
  a `div` with an inline `style` carrying `left/top/width/height/z-index`. In a
  150×150 cell (origin observed at `left:65 top:190`) with 50px edge strips:
  - `labirintus/<n>/talaj/talajN.gif` — floor base (z-3).
  - Per-edge passage tile (z-5), direction encoded by suffix
    `f`=north, `l`=south, `b`=west, `j`=east:
    - `.../ajto/ajto_<dir>_<variant>.gif` — **door**; `title` names the key
      ("Ajtó, rézkulcs nyitja" = copper, "vaskulcs" = iron, "bronzkulcs" =
      bronze, "csőkulcs" = tube, …). `<variant>` is the visual/material index.
    - `.../fal/fal_<dir>_N.gif` — **wall**, `title` "Fal".
    - `.../folyoso/foly_<dir>_N.gif` — **corridor** (free passage), `title`
      "Folyosó".
  - `labirintus/ellenfel/ellenfel_<dir>.gif` — **adjacent-monster marker**
    (z-4), 50×50 on the relevant edge. Generic "enemy present" image: **no
    title, no monster identity/name** (unlike the Battle screen).
  - `labirintus/figura_<bal|jobb>.gif` — player figure (z-6, centred), facing
    the last movement direction.
- **Movement**: standard `input[type="image"]` `eszak`/`del`/`kelet`/`nyugat`
  (reuse the existing `DIRECTION_BY_BASENAME` mapping). A **blocked** direction
  is not an input — it is a plain `<img src="ikon/nyugat.gif"
  title="Erre nem lehet menni">`, so it simply has no D-pad button.
- **Utility controls** (`input[type="image"]`): `pihen` (rest), `sc_gyogyvarazs`
  (heal), `klap` (settings), `labikibe` (**exit dungeon**), plus the `tevFajta`
  select + `ok.gif` submit — same action pattern as FreeMove.
- **Question** (movement-blocking; present only sometimes):
  - Prompt/answer text live inside the `font[face="Comic sans MS"]` block; the
    movement-result line (e.g. "Továbbjöttél délre.") precedes the prompt.
  - Answers are `input[type="radio"][name="valasz"]`, each with
    `onclick="document.urlap.par1.value=<index>;"` (0-based) and adjacent label
    text (e.g. "Megiszod a büdös zöld folyadékot").
  - Submit: `<input type="button" value="Válasz"
    onclick="if (document.urlap.par1.value) document.urlap.Submit.value='svValasz'; document.urlap.submit();">`.
  - Answering = click the chosen original radio (fires its onclick → sets
    `par1`), then click the original Válasz button (native submit). No
    reconstruction.

## Scope

**In scope**
- Detect the dungeon page and render a mobile dungeon view.
- Faithfully reproduce the composed cell image, upscaled for mobile.
- Movement via the reused NavPad (walls = absent buttons).
- Show adjacent monsters via the `ellenfel_<dir>` tile in the composite.
- Question interaction: prompt + answer buttons, tap-to-select then confirm
  with Válasz; controls are replaced by the question until answered.
- Reuse stats/gold/status-icons/narration/actions from FreeMove.

**Out of scope (v1)**
- Naming the adjacent monster (the `ellenfel` tile carries no identity).
- Tap-to-move directly on the composite image (movement stays on the NavPad).
- Non-radio question variants (only the `valasz` radio + `par1` form is
  handled; absence of `valasz` radios ⇒ "no question").

## Design

Reuses the **proxy-DOM pattern**: extract state from the live DOM, move the
original DOM off-screen, mount Preact, and drive the *original* controls so the
game's own logic runs unchanged.

### 1. Page detection — `src/utils/pageDetector.ts`

Add `Dungeon = 'Dungeon'` to `PageType` and:

```ts
case 'otLabirintus':
  return PageType.Dungeon;
```

### 2. Extraction — `src/utils/domExtract.ts`

```ts
export interface DungeonTile {
  imageUrl: string;
  left: number; top: number; width: number; height: number; z: number;
}

export interface DungeonAnswer {
  label: string;
  /** Clicks the original radio, firing its onclick (sets urlap.par1). */
  select: () => void;
}

export interface DungeonQuestion {
  prompt: string;                 // text before the first answer radio
  answers: DungeonAnswer[];
  /** Clicks the original Válasz button (native submit). */
  submit: () => void;
}

export interface DungeonState {
  playerName: string;
  gold: number;
  hp: number; hpMax: number; mp: number; mpMax: number;
  statusIcons: StatusIcon[];
  tiles: DungeonTile[];
  directions: DirectionOption[];
  buildings: BuildingOption[];
  actions: Action[];
  narration: string;              // when no question is active
  question: DungeonQuestion | null;
}

export function extractDungeon(doc: Document): DungeonState;
```

- **Tiles**: select `img`s whose `src` matches
  `/(talaj|ajto|fal|folyoso|labirintus|ellenfel)\//`, read each parent `div`'s
  inline `style` for `left/top/width/height/z-index`, normalise `left/top` to
  the minimum tile origin so the composite box starts at `(0,0)`. `imageUrl` via
  the existing `absolutizeGameUrl`.
- **Directions**: reuse `extractDirections` (already keyed on
  `eszak/del/kelet/nyugat`). Walls contribute no button.
- **Buildings / actions / stats / status icons / narration**: reuse
  `extractBuildings`, `extractFreeMoveActions`, `extractStats`,
  `parsePlayerName`, `extractStatusIcons`, `extractNarration`.
- **Question**: `null` unless `input[name="valasz"]` exists. Otherwise:
  - `prompt`: text of the Comic-Sans block up to the first `valasz` radio.
  - `answers[i]`: label = the text node(s) following radio `i`; `select` =
    `() => radio.click()`.
  - `submit` = `() => valaszButton.click()` (located by `value="Válasz"`).

### 3. Components

- `src/components/DungeonCell.tsx` — renders `tiles` in a
  `position: relative` box sized to the normalised composite, each tile
  `position: absolute` at its (scaled) offset. Whole cell upscaled ~2–3×;
  `image-rendering: pixelated`; responsive `max-width`.
- `src/components/QuestionPanel.tsx` — `prompt` text, one button per answer
  (tap → `select()` and highlight as chosen), and a Válasz confirm button
  (`submit()`), disabled until an answer is selected.
- `src/pages/Dungeon.tsx` — always renders `DungeonCell` + `StatBar`; then
  **either** `QuestionPanel` (when `state.question`) **or**
  `NavPad` + buildings + actions + `NarrationPanel`.
- Reuse `StatBar`, `NavPad`, `NarrationPanel` unchanged.

### 4. Wiring — `src/main.ts`

Extend the `PageState` union and `extractPageState` with the Dungeon case. The
dungeon needs no monster DB (enemy tiles are unnamed), so the branch renders
once and skips `loadMonsters`.

### 5. Styles — `src/styles/base.css`

Add `lc-dungeon-*` and `lc-question-*` classes using existing CSS variables;
`image-rendering: pixelated` on the composite. No new colors.

## Testing (Vitest + @testing-library/preact, jsdom)

Fixtures reconstructed from the captured real markup.

- `pageDetector.test.ts`: `otLabirintus` → `PageType.Dungeon`.
- `domExtract.test.ts`:
  - tiles parsed with normalised offsets and absolutised URLs;
  - directions present vs. walled (blocked direction has no button);
  - `question` is `null` on a plain cell and populated on a question cell;
  - `answers[i].select()` clicks radio `i`; `submit()` clicks the Válasz button;
  - `prompt` excludes the answer labels; `narration` populated when no question.
- `DungeonCell.test.tsx`: renders one element per tile at expected scaled
  positions.
- `QuestionPanel.test.tsx`: renders all answers; Válasz disabled until an answer
  is tapped; confirm calls `select()` then `submit()`.
- `Dungeon.test.tsx`: shows NavPad when `question` is null; shows QuestionPanel
  (and not NavPad) when `question` is set.

## Acceptance criteria

- On the real dungeon page, the classic layout is hidden and the mobile dungeon
  view is shown: upscaled composite cell, stats, and movement.
- Doors, walls, corridors, the player figure, and an adjacent-monster marker all
  appear in the composite as the game renders them.
- Walls produce no D-pad button; open directions move exactly as the native
  controls would.
- When a question is present, controls are replaced by the question; selecting
  an answer and confirming with Válasz submits exactly as the native form would.
- All existing tests still pass; new tests cover detection, extraction, the two
  new components, and the page. `npx tsc --noEmit` is clean.
