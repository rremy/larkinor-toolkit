# Sea and island maps — design

**Status:** implemented 2026-11-11 (plan: `docs/superpowers/plans/2026-11-11-sea-and-island-maps.md`)
**Builds on:** the city map (`src/database/map/`, `static/db/map-data.json`), its
position marker (`captureMapPosition`, `lc-map-position`), and the move tracking
pattern of the labyrinths (`src/utils/trackDungeonMove.ts`,
`docs/superpowers/specs/2026-08-27-quest-tracking-design.md`).

## Why

Larkinor has an archipelago. Out at sea the game shows the same picture on every
square (`tajk/hajotengeren.gif`, "vízfelület") and never says where the ship is,
so a player in the middle of the sea cannot find the islands or their harbours.
The goal is simple to state: **while sailing, always know where you are and where
the islands and harbours are; on an island, see the island's map with you on it.**

Success looks like: leave a harbour, sail anywhere, and the map keeps a marker on
the right square the whole way; dock at another island and the map switches to
that island with you on its tile.

## Goals

- A **sea chart** of the whole archipelago, with land, harbours and the player's
  ship on it.
- A **small window around the player**, always on screen while at sea or on an
  island other than the city's, which opens the full chart in the database.
- A **full chart in the database's Térkép tab**, centred on the player.
- The player's position **on the sea**, tracked from their moves.
- The player's position **on an island**, from the tile picture where that is
  enough, from moves where it is not.
- **Thord-Artin**, the large northern island, drawn tile by tile with names and
  buildings.

## Non-goals

- Routing ("sail me to X"). The chart shows; the player steers.
- Monster data per sea square.
- Mapping the islands nobody has documented (the large unexplored southern one);
  they appear on the chart as unexplored land, and their tiles fill in as the
  player walks them (see *Learned island tiles*).

## Anti-goals

- **A confident wrong marker.** A marker on the wrong square is worse than none:
  the player would steer by it. When the page contradicts the tracked square,
  the marker goes and the window says the position is lost.
- **Anything new on the game screen while on the city island.** The city already
  has its map; nothing changes there.

## Live facts (measured 2026-11-11, character Remy, l2.larkinor.hu)

These were captured with Playwright on the live game; the raw pages are in
`.tmp/sea/` (git-ignored) and should be copied into `tests/fixtures/` as the
fixtures for this work. The toolkit's own containers were removed at capture,
but its narration enhancements were not: unwrap every `lc-`-classed element
(`span.lc-item-mention`, `a.lc-narr-link`, …) to its text when copying, so the
fixtures are the game's own markup.

### The sea is the city map's grid, extended

- The fan site's chart `https://www.larkinorcenter.hu/szigetvilag2.html` is a
  48×72 table of 20px `<td>`s. Its square (fan row `fr`, fan col `fc`) is our map
  grid's **`(row, col) = (fr − 36, fc − 5)`**: our city's 10×10 block sits at fan
  rows 36–45, cols 5–14. Verified three ways:
  - the three city harbours land on our cells `13`, `41`, `84`, the cells
    `map-data.json` gives a `kikötő`;
  - our `-1<col>` strip (`-11` erdő, `-14`/`-15` szikla) matches fan row 35;
  - **the game names harbour buildings by this grid**: the harbour picture on
    the `otKikoto` page is `/2/epulet/<row><col>kikoto.gif`, row and col written
    one after the other like the `-1<col>` strip — `-241kikoto.gif` for the small
    western island's harbour at (−24, 1), `-2224kikoto.gif` for Thord-Artin's
    Lápapály at (−22, 24). Both are exactly where the chart puts them.
- So the whole sea uses **our existing coordinates**, rows negative to the north,
  spanning rows −36…35 and cols −5…42.

### What a sea page says

- `oldalTipus=otVilag` — to the game it is free movement. The tile picture is
  `/tajk/hajotengeren.gif` (title `vízfelület`) on every square.
- **All four sides are always described**, at fixed positions around the
  picture (the same slots as the city's direction buttons):
  - open sea: an image input `eszak|del|kelet|nyugat.gif`, title
    `<dir> hajózol - tenger`;
  - a harbour: an image input `kikoto.gif`, title `<dir> hajózol - kikötő`;
    clicking it docks;
  - land: an `<img>` `/2/ikon/szarazfold.gif`, title `<dir> szárazföld` — coast
    the ship cannot enter.
  - `<dir>` follows vowel harmony: **`északra`, `nyugatra`, but `délre`,
    `keletre`**. A pattern that only accepts `-ra` misses south and east; this
    cost an hour of wrong conclusions during the investigation.
- A step prints `Tovább hajózol...` as the narration's first line, then one random
  flavour line (and sometimes the player's own item lines, `Hat a
  csodatarisznyád!`). The flavour lines carry no information.
- Leaving a harbour prints `Elindulsz a hajóddal egy távoli helyre...` (preceded,
  if the ship had to be fetched, by `A hajód egy másik kikötőben van.` and the
  fee). The ship appears on **the sea square next to the harbour**; on that page
  the harbour is one of the four sides (`<dir> hajózol - kikötő`). Leaving
  harbour 13 put the ship at (0, 3), harbour to the south.
- **A sea monster attacks on arrival**: the battle page (`otHarc`) opens with
  `Tovább hajózol...` and `Egy tengeri szörny akar próbára tenni, és neked esik`.
  The fight is in the square sailed into, so the step counts. Twice, fleeing
  (`menekul.gif`, then *Folytatás*) put the ship back on a sea page with an
  **empty narration**, and the next steps matched the chart from the square the
  fight was in — fleeing did not move the ship in either observation.
- Docking (`<dir> hajózol - kikötő`) leads to the harbour building, `otKikoto`
  (narration `Kikötsz a hajóddal...`), with `vissza.gif` (leave the building,
  onto the island), `hajovesz.gif` *Tengerre szállsz, hajót hazaszállítatsz* and
  `kikotokuldetes.gif` *Hajót veszel*.
- Over 72 sailed squares, **every side the page drew agreed with the chart**,
  with one correction: the fan chart's lone `F` square at fan (16, 2) — our
  (−20, −3) — is a harbour (the game drew `kikötő` there).

### What an island page says

- **Thord-Artin** names its tiles with the fan site's own names:
  `/tajk/nagysziget/szig_<c>-<r>.gif`. Measured: Lápapály is `szig_2-10`; east of
  it `szig_3-10`, north of it `szig_2-11`. Rows count **up toward the north**.
  Its grid position is **`(row, col) = (−12 − r, c + 22)`** — Lápapály
  `szig_2-10` → (−22, 24), the harbour picture's own `-2224`.
- **The small western island** (around (−24, 1)) uses per-district sets with no
  shared numbering: the harbour tile is `/tajk/szighar/szighar_1-1.gif`, east of
  it `szighar_2-1`, south of it `/tajk/szigmag/szigmag_2--21.gif`. Those three
  are the whole island; every other side is coast. The picture identifies a tile
  but does not place it.
- Island pages are ordinary free-move pages (`otVilag`): walking is
  `<dir> nyomulsz - <district>` buttons, coast is `/2/ikon/tenger.gif`
  `<dir> tengerpart`, the harbour is a `kikoto.gif` building control.
- **A harbour may be unfinished.** The small island's harbour accepted the ship
  but, entered from land, printed `Ennek az épületnek a felépítéséhez még 299371
  építőkő kell… Ez az épület még nem készült el!` and offered no way to sea. The
  player got off with *hómport*. Thord-Artin's `taterkep.html` lists each
  harbour's state (`készültség: kész` or the stone still needed).
- The fan chart's **colours inside islands are approximate** (it shows harcos
  where the game says sivatag). Use it for water / land / harbour only; the
  district comes from the game page or Thord-Artin's tile data.

### The existing position capture

`captureMapPosition` stores `lc-map-position` only for `tajk/<id>.gif` with no
sub-directory and a numeric-looking id, so today a sea or island page leaves the
stored city tile untouched (it keeps saying "harbour 13"). That stays true for
the city map; the sea needs a position of its own.

## The data

### `static/db/sea-chart.json` (new, committed)

Built by a scraper script from a **committed snapshot** of `szigetvilag2.html`
(under `scripts/sea/`, like the archived quest pages: the source may change or
vanish, and the page is small). One entry per square that is not open sea, in
our coordinates:

```ts
interface SeaChart {
  rows: { min: number; max: number };   // −36 … 35
  cols: { min: number; max: number };   // −5 … 42
  squares: SeaSquare[];                 // land and harbours only; absent = sea
}
interface SeaSquare {
  row: number; col: number;
  kind: 'land' | 'unexplored';          // fan `unex`/`ununex` → unexplored
  district?: string;                    // fan class, approximate inside islands
  harbour?: true;
}
```

- **The legend is inside the table and must be dropped.** Fan rows 1–8 carry
  colour swatches in fan columns 1 and 39 (next to the `colspan` label cells
  `Víz`, `Városközpont`, … `Kikötő`): a swatch is not land, and the `o` beside
  `Kikötő` (fan (7, 39)) is not a harbour. Real harbours after dropping it: our
  (−34, 25), (−24, 1), (−22, 24), (−20, −3), (−16, 25), (−13, 27), (1, 3), (4, 1),
  (8, 4). The builder should pin that list in a test.
- The `F` at fan (16, 2) becomes a harbour (live correction above).
- **Two squares are uncertain and excluded from every side check** (decided by
  the author, not measured): the fan's lone `feltoltes` ("Feltöltés", reclaimed
  land) square at our (−27, 9), walled on all sides in open sea, whose
  appearance from a ship nobody has seen; and our (−23, 2), which the chart draws
  as sivatag but which both live island tiles beside it (`szighar_2-1` to its
  north, `szigmag_2--21` to its west) show as coast. Mark them `kind: 'unknown'`
  in the data (add it to the union) and draw them as unexplored.
- The fan's per-side wall classes (`fp`/`jp`/`ap`/`bp`) are not needed: at sea a
  side is decided by what the neighbouring square is.

### `static/db/islands.json` (new, committed)

Island tiles, keyed by the game's picture path relative to `/tajk/` (the id the
page shows):

```ts
interface IslandTile {
  image: string;          // 'nagysziget/szig_2-10'
  row: number; col: number;
  island: string;         // 'Thord-Artin'
  name?: string;          // 'Lápapály'
  district?: string;      // 'mocsár'
  buildings?: { name: string; ready: boolean; note?: string }[];
}
```

- **Thord-Artin** from a committed snapshot of
  `https://www.larkinorcenter.hu/taterkep.html`: each `<td>`'s
  `img.terkepelem` gives `szig_<c>-<r>`, the modal gives the name (`modalcim`),
  district (`Negyed / Terület`) and buildings (`Épületek`, with `kész` or the
  stone still needed). **Several real names sit in HTML comments** (the visible
  copy says `Nem meghódított terület`, the commented copy `Északi kikötő`,
  `É-i Teleport`, `Kútfalva`, `Lövegek`…); prefer the commented name when the
  visible one is that placeholder. Placed by `(−12 − r, c + 22)`.
- **The small western island**: the three tiles measured live, entered by hand.

### Learned island tiles

For islands whose pictures do not place themselves, the toolkit learns. When the
player steps from a known square onto an island tile whose picture it does not
know, it records `picture → square` (shared storage, not per character: it is a
fact about the game). Seeing a known picture again pins the position outright.
Because a learned entry is itself derived from tracking, and is shared and
permanent (the author's calls):

- **Learn only from a confirmed position**: the step was tracked from a known
  square *and* the page's own sides passed the check below on that page.
- **One square per picture, with a conflict flag.** If a picture is later seen
  where tracking (again confirmed) puts the player on a different square, the
  entry is marked conflicting and never pins again; tracking alone carries on.
- Seeded entries (`islands.json`) always win over learned ones.

### What counts as an island page (the author's call)

A free-move page whose tile picture sits in a `/tajk/` **sub-directory whose name
starts with `szig` or is `nagysziget`** (`szighar/`, `szigmag/`, `nagysziget/`
seen so far). Anything else — the city's `tajk/<id>.gif`, `hajotengeren.gif`,
and any other directory the game may use for airships, events or other realms —
is not an island: no window, no learning, no step applied, and the sea position
is left as it was. A new island whose directory does not match is simply not
tracked until its directory is added; that is the safe failure.

## Where the player is

One stored position for the archipelago, separate from `lc-map-position`:
`lc-sea-position` = `{ row, col, source, at }` or absent. It is **per
character** (add it to `CHARACTER_KEYS` in `src/utils/config.ts` and to
`tests/characterScope.test.ts`), like every position.

- **City island** (`tajk/<id>.gif` that `parseMapPosition` accepts): the city
  map works as today. The sea position is set to the cell's grid square, so a
  departure from that harbour has a start.
- **Harbour building** (`otKikoto`): the picture `/2/epulet/<row><col>kikoto.gif`
  names the harbour's square; store it.
- **Leaving a harbour** (sea page with `Elindulsz a hajóddal`): the ship is on the
  sea square beside the harbour, on the side opposite the page's `kikötő` side.
  The harbour's square is known from the building page just before; if it is
  not, the chart's harbours whose sea neighbour fits the page's four sides are
  the candidates, and only a single candidate is accepted.
- **A step at sea or on an island**: record the clicked direction in the capture
  phase on the game's own direction control (the `trackDungeonMove` pattern —
  every toolkit movement path clicks that control), consume it on the next page.
  At sea it applies when the narration starts `Tovább hajózol`; on an island when
  the page is a free-move page.
- **A sea fight**: a battle page whose narration starts `Tovább hajózol` advances
  the position by the pending step, like `advancePositionThroughBattle` in the
  labyrinths. The sea page after a flee (empty narration, no pending step) holds
  the position.
- **Thord-Artin and learned tiles**: the picture is the position; it overrides
  the tracked one.
- **The check on every sea or island page**: the four sides the page draws are
  compared with the chart, skipping the `unknown` squares. A contradiction
  clears the position and the window says it is lost. It is never "corrected"
  to a guess. Which disagreements count (the author's call):
  - **At sea, both ways**: the page shows land or a harbour where the chart has
    sea, or open sea where the chart has land, or a harbour where the chart has
    none. The chart's outline held on all 72 sailed squares.
  - **On an island, one way only**: the page shows a walkable side
    (`<dir> nyomulsz`) where the chart has sea — a contradiction. The page
    showing coast where the chart has land is **no information**, since the
    chart's island interiors are only approximate.
- **Setting it by hand**: *📍 Itt állok* on the chart's selected square, as in the
  labyrinths, writes a `'manual'` position that tracking carries on from.
- Leaving the archipelago any other way (hómport, death, logout) is a non-sea,
  non-island page: the position is replaced by the city tile as soon as one is
  seen, so a stale ship marker never survives a return to town.

## What the player sees

### The small window (in-game only)

- Shown on a sea page and on an island page that is not the city's; gone on the
  city island and inside buildings.
- **Desktop:** a docked panel beside the game, like the other dock panels
  (`DockedPanel`). **Mobile:** in place of the `hajotengeren.gif` / island tile
  picture on the free-move page.
- The squares around the player — the picked size is the builder's, around
  11×13 — water, land coloured by district, unexplored land grey, ⚓ harbours,
  and the player (⛵ at sea, 📍 on land) in the middle. When no harbour is in
  view, a small arrow at the window's edge points toward the nearest one.
- When the position is lost, the window says so in place of the marker.
- Tapping it opens the database on the full chart.

### The full chart (database, Térkép tab)

- The Térkép tab gets a **Város / Tenger** switch. *Város* is today's map,
  unchanged. *Tenger* draws the whole archipelago from `sea-chart.json`, with
  `islands.json` tiles drawn over their squares and the city's cells drawn from
  `map-data.json` at their own grid squares.
- It opens on *Tenger*, centred on the player, whenever the stored sea position
  is off the city island; otherwise on *Város*, as today.
- Selecting a square shows what is known: a city cell's existing detail panel; an
  island tile's name, district and buildings (with a harbour's readiness); a
  harbour's coordinates.
- The standalone site shows the chart too, without a marker (other origin, as
  with every position).
- A mockup of the look, from the real chart data, is in
  `.superpowers/brainstorm/62319-1794386888/content/sea-chart.html`.

## Theme and platform rules that apply

- Colours as `theme.css` variables, never hex in rule bodies; the district
  colours the city map already uses are reused for island land.
- The chart is a CSS grid of `<div>`s, never a `<table>` (quirks mode, see
  CLAUDE.md).
- Every new sortable or persisted UI state goes through the existing pref
  helpers and is classified per character or shared.

## Left to the builder

- Module boundaries, component names, and how the window and the chart share
  rendering.
- Window size, chart zoom, the nearest-harbour arrow's exact look.
- How the learned-tile store is shaped and capped.
- Whether the city island's position write reuses `captureMapPosition` or sits
  beside it.

## Open risks

- **Fleeing at sea not moving the ship rests on two observations.** If it ever
  does move the ship, the next page with land in view will contradict the
  position and clear it, which is the safe failure.
- **Leaving a harbour reached only by ship.** The small island's harbour shows
  that arriving and leaving can differ; nothing here depends on it, but the
  harbour detail should show a harbour's readiness where it is known.
- The fan chart is a fan's drawing. Its water/land outline held on every sailed
  square; its island interiors did not. Treat the game as the authority wherever
  they disagree.
