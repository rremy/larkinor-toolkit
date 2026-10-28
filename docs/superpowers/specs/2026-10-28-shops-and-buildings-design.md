# Shops and the remaining city buildings — design

**Date:** 2026-10-28
**Scope:** mobile pages for the Vegyesbolt, Fegyverbolt, Templom, Bank, Aréna,
Palota and Palota Küldetésterem; a desktop dock panel for the three shops.

## What the pages are (measured from saved pages, 2026-10-28)

| Page | `oldalTipus` | Page type | Shape |
|---|---|---|---|
| Vegyesbolt | `otVegyesbolt` | `Shop` (existing) | buy form, sell form, mass-sell list |
| Fegyverbolt | `otFegyverbolt` | `Shop` (existing) | same form, weapons and armour |
| Templom | `otTemplom` | `Church` (existing) | buy form only, plus prayers/insurance/collection box |
| Bank | `otEkszeresz` | `Bank` (new) | balance, deposit, withdraw, repay the king |
| Aréna | `otArena` | `Arena` (new) | fight, rest, clone bet and winnings |
| Palota | `otPalota` | `Palace` (new) | three titled entrances, nothing else |
| Palota Küldetésterem | `otPalotaKuldetes` | `PalaceQuest` (new) | the offered royal quest, accept, claim reward |

### The shop form

- **Buy** — `vetelUrlap.targy` (option `value` = game item id, text `"1 <name>"`),
  `vetelUrlap.mennyiseg`, the `vesz` button (`svVetel`). The handler reads
  `targy.value`, so setting `selectedIndex` (which sets the value) is enough.
  Detail blocks are `vetelTargyak[i]` in the Home grammar; unit prices are
  `vetelArak[i]`.
- **Sell one** — `eladasUrlap.targy` (option `value` = item id, text
  `"<count> <name>"`), `eladasUrlap.mennyiseg`, the `elad` button **inside that
  form** (`svEladas`). Details are `eladasTargyak[i]`, whose block ends
  `Elad.ár: N ezüst`; `eladasArak[i]` is the same figure — **half the Ár** on
  every item in both saved shops.
- **Sell many** (*Cs.E.*) — `#cuccLayer`, a hidden div listing **the whole
  backpack** (silver and keys included), one checkbox per entry whose `onclick`
  toggles `cuccArray[i]`, with the **page disabling what this shop will not take
  in bulk** (the weapon shop takes the bot and nothing else; the general store
  refuses weapons and church goods). Its own `elad` button submits
  `cuccArrayToString()` as `svSelejtezes`, selling **whole stacks**.
  We `.click()` the checkboxes — which runs the game's toggle — and then that
  button; `cuccArray` is never rebuilt.
- The single-sell list is not the same set as the bulk list: the general store
  will buy a sword one at a time but not in bulk. Rows join the two by
  lower-cased name, and a bulk entry with no sell row still gets a row (bulk
  only), so nothing the page offers is lost.
- Other controls: `vissza` (leave), `hatizsakba` (*Viselt tárgyak a hátizsákba*).
  The Templom adds titled image controls (four prayers, insurance, pay, steal)
  and a *Negatív hatások* box.

### Narration is not the first Comic Sans block

`extractNarration` reads the first `font[face="Comic sans MS"]`. On the shops
that is the *Vétel* heading, on the Bank *Számlád*, and on the quest room the
quest brief. The narration box on all seven pages is the positioned div
`width:600px`; `extractBuildingNarration` prefers it and falls back to the old
rule, so existing pages are unaffected.

## UI

### Shops (mobile page + desktop panel, one set of components)

Tabs **Vétel / Eladás / Egyéb** (Templom: Vétel / Egyéb), remembered in
`lc-shop-tab` because every trade reloads the page.

- **Vétel**: search, sort (név, ár, súly, piaci ár), one row per item — name
  (database link + compare card), weight, price, market price, a quantity
  field (starts at 1: this spends money), the total (red when unaffordable,
  never blocking), *Megvesz*.
- **Eladás**: search, sort (név, mennyiség, elad. ár, összesen, piaci ár), one
  row per backpack item — checkbox when the page allows bulk selling it, name,
  stack size, sell price per unit, shop price, market price, quantity (starts at
  1 — selling to a shop is not undoable and the market often pays far more),
  *Elad*. A **sticky bar** sums the ticked rows (`N tétel — összesen X`), offers
  *mind* for the visible bulk-sellable rows, and sells in **two presses** (arm,
  then confirm) because it sells whole stacks.
- **Egyéb**: the page's other controls, the Templom's *Negatív hatások* text.
- **Market price** on both sides: shop price × the rate captured on the last
  market visit (`lc-market-rates`, keyed by the same item id the forms carry).
  Absent when the market was never visited or does not quote the item.

The desktop panel (`lc-shop-open` / `lc-shop-minimized`) holds Vétel and
Eladás as tabs with the page's own buttons above them, like the Piac panel; the
Templom's prayers stay on the game page, which is visible on desktop.

### The other four pages (mobile only)

- **Bank**: balance, repaid-to-king figure, deposit and withdraw fields each with
  a *mind* fill (gold on hand / balance), *minden pénz be* (the page's own
  button), *törlesztés 50 000*, leave.
- **Aréna**: HP/MP, *Harc*, *Pihenés*, the clone block (status, bet field,
  winnings, *Benevezés*, *Nyeremény*), leave.
- **Palota**: the existing `BuildingLobby` page — titled controls only.
- **Küldetésterem**: the offered quest (id, brief, reward) with a button that
  opens it in the quest database, *Vállalom*, *Jutalom*, leave.

On desktop these four keep the plain dock: the page is visible and already
one click per action.

## Build order

1. `extractBuildingNarration`, new page types.
2. `shopExtract.ts` + tests (buy, sell, bulk, controls, market price).
3. Shared shop components, mobile `Shop` page, desktop `ShopPanel` + dock wiring.
4. `buildingExtract.ts` (bank, arena, quest room) + the three pages; Palota via
   `BuildingLobby`.
5. Mobile boot routing; CLAUDE.md.
