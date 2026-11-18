# Multiple markets — design

## Intent

The game has more than one market: Larkinor's and Thord-Artin's (the island).
Each quotes its own rates and holds its own standing offers. Today every market
visit overwrites the one stored rate table and the one inventory `market`
location, so visiting the island replaced Larkinor's prices with the island's
44 quotes and its listings with the island's.

## What was measured (saved pages, 2026-11-18)

- Both pages are `oldalTipus=otPiac`, title `Piac`. The only thing telling them
  apart is the building picture: `54piac.gif` (Larkinor, tile 54) and
  `-1627piac.gif` (Thord-Artin, grid square (−16, 27)) — `<grid id>piac.gif`,
  the harbours' naming. `piacvesz.gif` must not match.
- Larkinor quotes 1425 items, Thord-Artin 44, three of them island-only
  (bőrpajzs, bőrsisak, kithrill). Shared items differ wildly (gyémánt 236% vs
  2900%, hidracél gigapallos 1933% vs 100%).

## Goals

- Market rates stored per market; a visit replaces only that market's table.
- Lists, columns, filters, shop rows, the character backpack: `marketPrice` is
  the **cheapest** known market price.
- Item detail (database page / overlay): one line per market quoting the item,
  `Piaci ár (Larkinor): …`, `Piaci ár (Thord-Artin): …`.
- Inventory: one market location per market, shown as `piac (Larkinor): 2`;
  the *Nálad* total sums them.

## Non-goals

- The market panel itself: it already reads the quote off the page in front of it.
- The standalone site: other origin, static prices only, as today.

## Approaches

- **Building picture on the page (chosen).** The page names itself; nothing to
  go stale.
- Sea position at capture time — rejected: it can be cleared after a
  contradiction, and it is a second-hand inference where the page states the
  answer.

## Design

- `marketIdOf(doc)` in `marketExtract.ts`: the grid id of the first
  `<id>piac.gif` image, or null. Null ⇒ nothing is recorded (rates or
  listings) — never guessed into Larkinor.
- `src/shared/markets.ts`: known markets `54` → Larkinor, `-1627` → Thord-Artin;
  `marketLabel(id)` falls back to `Piac (<id>)` for an unknown picture (the id
  cannot be split into row/col unambiguously, see `harbourById`). Larkinor's id
  is exported as the market the static `marketPrice` describes.
- `MarketRates` goes to **version 2**: `{ version: 2, markets: { [id]: {
  capturedAt, rates } } }` under the same `lc-market-rates` key. A version-1
  value parses as null — it cannot say which market wrote it (the player's last
  visit was the island). One visit per market rebuilds it.
- Rows: `marketPrice` = min over markets; `marketPrices: { market, price }[]`
  (label + price) added beside `holdings`. Larkinor's line is the live rate,
  else the static figure; every other market contributes only where it quotes
  the item. `marketPriceFor` (shops, character page) returns the cheapest
  quoted, as before null when nothing quotes it.
- Detail panel: with `marketPrices` present, the `Piaci ár` field is replaced by
  one `Piaci ár (<market>)` row per entry; without (standalone), unchanged.
- Inventory: `locations` keeps `backpack`/`house`; markets move to
  `markets: { [id]: InventorySnapshot }`. The old `locations.market` is dropped
  on read (same reason as the rates). `Holding` gains an optional `market`
  label; the detail panel prints `piac (<label>)`. The market page writes only
  its own market's snapshot.

## Left to the builder

Test fixtures cut down from the two saved pages; exact wording of comments;
CLAUDE.md's market notes updated to say the store is per market.
