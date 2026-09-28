# Crafting in the Erőd and the Mágustorony — design

## Goal

In the two crafting halls, the Erőd's *kovácsok terme* and the Mágustorony's *mágusok
terme*, let the player search the database for what this hall can make, see the recipe
against what they carry, pick a count the materials can cover, and have the game's own
crafting form filled in and submitted.

Example: typing `sarkany szarv` in the kovácsok terme finds *sárkány szarv*
(`craftableAt: "Erőd"`) and lists its 10 sárkányfog / 5 sárkánykarom / 3 sárkánypikkely.
With 20 / 10 / 6 carried, each line is green and the count is capped at 2.

Success criteria:

- Search ignores case and accents (`matchesSearch`), and only lists items this hall makes.
- Each ingredient shows as green when carried in sufficient quantity for one piece, red
  otherwise.
- The count input cannot exceed what the carried materials cover. At 0 the craft button is
  disabled.
- Crafting fills and submits the game's form, so the game's own handler runs.
- Works on both platforms: mobile takes over all four building pages; desktop adds a docked
  panel in the two halls.

## Live DOM (measured 2026-09-28)

Four pages, two per building, identified by `oldalTipus`:

| `oldalTipus` | Page | Controls |
|---|---|---|
| `otErod` | Erőd lobby | `vissza` (exit), `belephatso` (`svBelso`, enter the hall), `kovacsplusz`, `1szurovago`, `1utozuzo`, `1tavolsagi` (skill training) |
| `otErodBelso` | Kovácsok terme | `fegyvercsinalUrlap` + `keszitfegyver`; `csapdaRendelUrlap` + `csapdarendel` / `kerdojel`; `vissza` |
| `otMagustorony` | Mágustorony lobby | `vissza`, `1tuz` / `1viz` / `1leg` / `1fold` (element training), `belephatso` (`svBelep`, enter the hall) |
| `otMagustoronyBelso` | Mágusok terme | `varfegyvercsinalUrlap` + `keszitvarazstargy`; `extravarazslatok.evarazslatok` + `tanulvarazslat`; `vissza` |

Every control is an `<input type="image">` identified by its image basename, as elsewhere
in the game. Nothing here parses or reconstructs an `onclick`.

### The crafting form

Both halls ship the same form under different names (`fegyvercsinalUrlap` in the Erőd,
`varfegyvercsinalUrlap` in the Mágustorony):

- Three ingredient slots, each a `targyN` select plus a `darabN` text input, and a
  `darabszam` text input for the number of pieces.
- All three selects list the same options: the player's backpack, one option per stack.
  `value` is the game's item id, and the text reads `"<count> <name>"`, e.g.
  `<option value="251">20 sárkányfog</option>`. Silver is the first option,
  `value="0"`, `"1168 ezüst"`.
- The form never names the item being made. The game infers it from the ingredients.
- The submit helper `fegyverAdatFeltolt()` packs
  `targy1.selectedIndex:darab1:targy2.selectedIndex:darab2:targy3.selectedIndex:darab3` into
  `urlap.par1` and `darabszam` into `par2`, then submits `svFegyverKeszit` /
  `svVarFegyverKeszit`. **It sends the selected index, not the value**, so the index is what
  must be set, the same as the market's offer handlers.
- **`darabN` is the per-piece quantity** (confirmed by the player): making 2 sárkány szarv
  is `darab = 10 / 5 / 3`, `darabszam = 2`.

### The database side

- `craftableAt` is `"Erőd"`, `"Mágustorony"` or `"Nem kovácsolható"` across weapons, armors
  and items. Craftable counts: Erőd 1249 (weapons 286, armors 961, items 2), Mágustorony
  1174 (weapons 878, armors 286, items 10). Another 97 are marked Erőd with an empty
  recipe. They are not listed, since there is nothing to fill in.
- Every recipe has at most 3 ingredients, so each fits the three slots. One Mágustorony
  recipe has 2.
- `recipe[].id` is the game item id and matches the option values (sárkányfog = `251`).
  Silver appears as `{ name: "ezüst", id: "0" }` in 52 recipes, matching the silver option.
- Six Erőd armors share one identical recipe (`107`×1000, `502`×50, `823`×50: the
  `gyíkacél` mellény / ködmön / zubbony / egyenruha / mellvért / páncél). The game, not the
  toolkit, decides which one comes out.

## Design

### 1. Crafting logic (`src/shared/crafting.ts`, pure)

- `type CraftingHall = 'forge' | 'mage'`, mapped to the `craftableAt` value (`Erőd` /
  `Mágustorony`).
- `craftableIn(hall, weapons, armors, items)` returns `Craftable[]`:
  `{ key, name, kind: 'weapon' | 'armor' | 'item', level, recipe }`. Only entries whose
  `craftableAt` matches and whose recipe is non-empty are included. `key` is `kind:id`,
  because ids are only unique within one file.
- `planCraft(recipe, owned: ReadonlyMap<string, number>)` returns
  `{ lines: { id, name, needed, owned, ok }[], max }`, where
  `max = min(floor(owned / needed))`. An ingredient absent from `owned` counts as 0.
- `sharesRecipe(craftable, all)` finds other entries with the same recipe signature, used
  for the note on the `gyíkacél` case.

### 2. Page layer

- `pageDetector.ts` gains `ForgeLobby` (`otErod`), `ForgeHall` (`otErodBelso`),
  `MageLobby` (`otMagustorony`) and `MageHall` (`otMagustoronyBelso`).
- `src/utils/craftingExtract.ts`:
  - `extractCraftingHall(doc)` locates whichever of the two forms is present and returns
    `{ hall, owned, craft, sideForm }`, or null when the form is missing.
  - `owned` is parsed from `targy1`'s options: the leading integer is the count, the
    option value is the id, and the rest of the text is the name, kept for the UI.
  - The submit control is found by basename (`keszitfegyver` / `keszitvarazstargy`).
  - `craft(recipe, count)` finds each ingredient's option index by value in every
    `targyN`, sets `selectedIndex` and `darabN` to the per-piece quantity, and leaves an
    unused slot's `darabN` empty. It then sets `darabszam` and clicks the submit control.
    It throws if an ingredient has no option, which the UI prevents by disabling the
    button.
  - `sideForm` is a discriminated union. Erőd: trap ordering, i.e. the `targy` select,
    `mennyiseg` and the `csapdarendel` control. The price is computed by the page's own
    `kerdojel` control rather than re-implemented. Mágustorony: spell learning, i.e.
    `evarazslatok` and the `tanulvarazslat` control. Both drive the game's own controls.
- Lobbies reuse `extractImageControl` / the building-option extraction: each image
  control, excluding nothing, labelled by its `title`.

### 3. The crafting panel (`src/components/CraftingPanel.tsx`, shared)

- A search input, then the matching craftables of this hall, sorted by name. Each row
  shows the name, a kind label (fegyver / vért / tárgy), the level, and a "max N" badge.
  Rows with max 0 stay listed but are dimmed.
- Selecting a row shows its ingredients as `name needed / owned db`, coloured with new
  `--lc-ok` / `--lc-short` theme variables (not hardcoded colours). Then comes a count
  input, clamped to `1…max`, and an **Elkészít** button, disabled at max 0. For a shared
  recipe, a note lists the alternatives the game may produce instead.
- The selection is persisted per hall (`lc-craft-selected-forge` /
  `lc-craft-selected-mage`, added to `src/shared/prefKeys.ts`). Crafting reloads the page,
  and the reload should land on the same item with the updated counts. The game's result
  line appears in the narration above the panel.
- Inputs and selects set `color` explicitly (quirks-mode inheritance hole).

### 4. Platforms

- **Mobile** (`src/mobile/boot.ts`, proxy-DOM as usual):
  - `pages/BuildingLobby.tsx`, one component for both lobbies: StatBar, narration, and the
    page's image controls as a labelled button list.
  - `pages/CraftingHall.tsx`, one component for both halls: StatBar, narration,
    `CraftingPanel`, a collapsible *Csapda* / *Varázslatok* section for the side form, and
    a back button (`vissza`).
- **Desktop** (`src/desktop/boot.ts` + `DesktopDock.tsx`): on the two hall pages the dock
  gains a *Kovácsolás* button that opens `CraftingPanel` in a docked panel, following
  `MarketPanel`'s open-state handling. Lobbies get nothing new; the dock already renders
  there.
- **Data**: the hall pages load weapons, armors and items through the `DataLoader`
  (GM-cached). No other page loads them for this feature.

### 5. Error handling

- Hall form missing or unparseable: extraction returns null. Mobile leaves the page
  untouched, and desktop hides the *Kovácsolás* button, the same as a failed market
  extraction. It warns to the console, never throws out of boot.
- An option text whose count doesn't parse is skipped. That ingredient reads as owned 0 and
  shows red rather than wrongly green.
- Database load failure: the panel shows an error line. The original form stays usable on
  desktop, and on mobile the side form still works.

### 6. Testing

- `tests/crafting.test.ts`: `craftableIn` filtering and empty-recipe exclusion, `planCraft`
  max/shortfall/silver/missing ingredient, and the shared-recipe detection (the six
  `gyíkacél` armors).
- `tests/craftingExtract.test.ts` against live captures of both halls
  (`otMagustoronyBelso` is captured; `otErodBelso` still needs capturing): owned map,
  submit control, side form, and `craft` setting the exact `selectedIndex` / `darabN` /
  `darabszam` values and clicking the control.
- `tests/CraftingPanel.test.tsx`: accent-insensitive search, pre-filtering to the hall,
  colouring, count clamping, the disabled button at max 0, and selection persistence.
- Page detector cases for the four new `oldalTipus` values.

## Out of scope

- Crafting from anywhere other than the two halls.
- Checking the player's crafting skill or level against the item. The page states neither.
- Anything about the result page beyond showing its narration.
