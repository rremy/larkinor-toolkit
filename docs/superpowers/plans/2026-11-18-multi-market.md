# Multiple Markets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Market rates and market listings are stored per market (Larkinor, Thord-Artin); lists show the cheapest price, the detail panel one price and one holding per market.

**Architecture:** The market page names itself through its building picture (`<grid id>piac.gif`). The rate store goes to version 2, keyed by that id; the inventory keeps a snapshot per market id. Row enrichment adds `marketPrices` beside `holdings`; `marketPrice` becomes the minimum.

**Tech Stack:** TypeScript, Preact, Vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-11-18-multi-market-design.md`

## Global Constraints

- Known markets: picture id `54` → `Larkinor`, `-1627` → `Thord-Artin`; unknown id → label `Piac (<id>)`.
- A market page with no `<id>piac.gif` picture records nothing (rates or listings).
- `lc-market-rates` keeps its key, shape `{ version: 2, markets: { [id]: { capturedAt, rates } } }`; version 1 parses as null.
- Inventory: old `locations.market` is dropped on read; markets live in `markets: { [id]: InventorySnapshot }`.
- UI copy Hungarian, identifiers/comments English; no hardcoded colours.
- `npm run typecheck` and `npm test; echo $?` (exit 0) before each commit.

## Review Focus

- `piacvesz.gif` / `piac.gif` with no id must not be read as a market id → Task 1 test.
- An item quoted only on the island, Larkinor captured but not quoting it, static figure present → Larkinor line uses static, cheapest is the min of both → Task 2 test.
- A stored version-1 rate table (island's 44 quotes) must not price anything after upgrade → Task 2 test.
- A Thord-Artin visit must not wipe Larkinor's listing → Task 3 test.
- Standalone site (no `marketPrices`) still renders `Piaci ár (ezüst)` → Task 4 test.

---

### Task 1: Market identity

**Files:**
- Create: `src/shared/markets.ts`
- Modify: `src/utils/marketExtract.ts` (add `marketIdOf`)
- Test: `tests/markets.test.ts`

**Interfaces:**
- Produces: `LARKINOR_MARKET_ID = '54'`, `marketLabel(id: string): string` (in `src/shared/markets.ts`, DOM-free); `marketIdOf(doc: Document): string | null` (in `marketExtract.ts`).

- [ ] **Step 1: Write failing tests** — `marketIdOf` returns `'54'` for `<img src="/2/epulet/54piac.gif">`, `'-1627'` for `./Piac-2_files/-1627piac.gif`, null for a page with only `piacvesz.gif` and for a bare `piac.gif`; `marketLabel('54') === 'Larkinor'`, `marketLabel('-1627') === 'Thord-Artin'`, `marketLabel('77') === 'Piac (77)'`.
- [ ] **Step 2: Run** `npx vitest run tests/markets.test.ts` — FAIL (module missing).
- [ ] **Step 3: Implement.** Match each `img` src's basename against `/^(-?\d+(?:-\d+)?)piac\.gif$/`; first match wins.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(market): a market page names itself by its building picture`.

### Task 2: Rates per market, cheapest price, per-market prices on rows

**Files:**
- Modify: `src/shared/marketRates.ts`, `src/utils/captureMarketRates.ts`, `src/shared/data/types.ts`, `src/shared/prefKeys.ts` (comment only)
- Test: `tests/marketRates.test.ts`, `tests/shopExtract.test.ts`, `tests/mobileBoot.test.ts` (update fixtures to v2 / add `54piac.gif`)

**Interfaces:**
- Consumes: `marketIdOf`, `marketLabel`, `LARKINOR_MARKET_ID` (Task 1).
- Produces:
  - `interface MarketQuote { capturedAt: number; rates: Record<string, number> }`
  - `interface MarketRates { version: 2; markets: Record<string, MarketQuote> }`
  - `interface MarketPrice { market: string; price: number }` in `types.ts`; optional `marketPrices?: MarketPrice[]` on `Ownership`'s siblings — add to `Weapon`, `Armor`, `Item` via a `MarketPricing` interface they extend.
  - `applyMarketRates(rows, rates)`: sets `marketPrices` (Larkinor first, then other markets in id order) and `marketPrice` = min of them, or the static value when the list is empty. Returns rows untouched when `rates` is null.
  - `marketPriceFor(id, price, rates)`: cheapest quoted across markets, null when none.
  - `recordMarketRates(previous: MarketRates | null, marketId: string, quote: MarketQuote): MarketRates`.
  - `captureMarketRates(doc, read, write, now)` — now also takes `read` to merge with the stored value. Boots (`src/mobile/boot.ts:205`, `src/desktop/boot.ts:467`) pass `getPref`.

- [ ] **Step 1: Update/write failing tests**
  - `parseMarketRates('{"version":1,"capturedAt":1,"rates":{"338":3000}}')` → null.
  - Larkinor quotes 338 at 3000, island 338 at 1000, price 26 → `marketPrices` `[{Larkinor,780},{Thord-Artin,260}]`, `marketPrice` 260.
  - Larkinor captured without 999, island quotes 999 at 200, price 10, static 50 → `[{Larkinor,50},{Thord-Artin,20}]`, `marketPrice` 20.
  - No Larkinor capture, static 50, island quotes nothing for the row → `[{Larkinor,50}]`, 50. Static null and no quotes → `[]`, null.
  - `marketPriceFor('338', 26, both)` → 260; unquoted → null.
  - `captureMarketRates` on a page with `54piac.gif` writes `markets['54']` and keeps a stored `markets['-1627']`; a page without a market picture writes nothing and warns.
- [ ] **Step 2: Run** `npx vitest run tests/marketRates.test.ts` — FAIL.
- [ ] **Step 3: Implement** the interfaces above; update the boot call sites and the shop/mobile-boot test fixtures to v2.
- [ ] **Step 4: Run** `npm run typecheck && npm test; echo $?` — 0.
- [ ] **Step 5: Commit** `feat(market): rates are kept per market, and a row's market price is the cheapest`.

### Task 3: Inventory per market

**Files:**
- Modify: `src/shared/inventory.ts`, `src/utils/captureInventory.ts`, `src/shared/data/types.ts` (`Holding.market?: string`)
- Test: `tests/inventory.test.ts`, `tests/captureInventory.test.ts`

**Interfaces:**
- Consumes: `marketIdOf`, `marketLabel` (Task 1).
- Produces:
  - `InventoryLocation = 'backpack' | 'house'`; `Inventory = { version: 1; locations: Partial<Record<InventoryLocation, InventorySnapshot>>; markets: Record<string, InventorySnapshot> }`.
  - `PageInventory` gains `market?: { id: string; items: InventoryEntry[] }`.
  - `holdingsOf` emits one `{ location: 'market', market: marketLabel(id), quantity, capturedAt }` per market holding the row.

- [ ] **Step 1: Failing tests**
  - `parseInventory` of a stored value with `locations.market` → no market holdings; `markets` `{}`.
  - Recording `{ market: { id: '-1627', items: [opál×5] } }` over a stored `markets['54']` keeps both.
  - `holdingsOf` for opál held 2 at `54`, 5 at `-1627` → two holdings labelled `Larkinor`, `Thord-Artin`; `applyInventory` total 7.
  - `captureInventory(PageType.Market, …)` on a document with no market picture returns false and writes nothing (the test mocks `extractMarket`, so add the picture to `document.body` for the positive case).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run typecheck && npm test; echo $?` — 0.
- [ ] **Step 5: Commit** `feat(inventory): each market keeps its own listing`.

### Task 4: Detail panel shows each market

**Files:**
- Modify: `src/database/explorer/DetailPanel.tsx`
- Test: `tests/database/ExplorerOwnership.test.tsx` (or a new `tests/database/DetailPanelMarkets.test.tsx`)

**Interfaces:**
- Consumes: `marketPrices` (Task 2), `Holding.market` (Task 3).

- [ ] **Step 1: Failing tests**
  - Row with `marketPrices` `[{Larkinor,780},{Thord-Artin,260}]` → texts `Piaci ár (Larkinor)` + `780` and `Piaci ár (Thord-Artin)` + `260`; no `Piaci ár (ezüst)`.
  - Row without `marketPrices`, `marketPrice` 50 → `Piaci ár (ezüst)` still shown.
  - Holding `{ location: 'market', market: 'Larkinor', quantity: 2 }` → `piac (Larkinor): 2`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** — in the stats `dl`, when `rec.marketPrices` is an array, render its entries in place of the `marketPrice` field; holding label `market` → `piac (<held.market>)` (`piac` when absent); list key includes the market.
- [ ] **Step 4: Run** `npm run typecheck && npm test; echo $?` — 0.
- [ ] **Step 5: Update CLAUDE.md** market notes (per-market store, the picture rule, island quotes 44 items) and **commit** `feat(database): the item detail lists the price and your offers per market`.
