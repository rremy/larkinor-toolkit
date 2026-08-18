# CLAUDE.md — larkinor-toolkit

Support tooling for [Larkinor](https://larkinor.hu), a Hungarian browser-based text RPG.
Published as [rremy/larkinor-toolkit](https://github.com/rremy/larkinor-toolkit); see
`README.md` for the user-facing documentation.

## Project structure

A single Vite + Preact + TypeScript project at the repo root: an in-game
userscript **and** a standalone database explorer, sharing one data layer and
theme.

```
larkinor-toolkit/
├── src/
│   ├── main.ts              # Entry: detect platform → bootMobile | bootDesktop
│   ├── mobile/boot.ts       # Mobile boot: proxy-DOM page replacement
│   ├── desktop/             # Desktop boot: dock + in-place enhancements
│   │   ├── boot.ts · DesktopDock.tsx
│   │   ├── enhanceNarration.ts · useKeyboardShortcuts.ts
│   │   └── desktop.css
│   ├── pages/               # FreeMove.tsx, Battle.tsx, Dungeon.tsx, Login.tsx, Home.tsx (mobile)
│   ├── components/          # StatBar, NavPad, NarrationPanel, MonsterCard, DatabaseOverlay
│   ├── hooks/               # useHotkeyConfig
│   ├── utils/               # platform, pageDetector, domExtract, narration, hotkeys, config
│   ├── shared/
│   │   ├── data/
│   │   │   ├── types.ts     # Weapon, Armor, Item, Monster, MapCell, Shop (typed models)
│   │   │   ├── monsters.ts  # Monster DB + retrieval
│   │   │   ├── source.ts    # DataSource (gmSource for GM, httpSource for fetch)
│   │   │   ├── loader.ts    # createDataLoader(source, baseUrl)
│   │   │   └── index.ts
│   │   ├── publicUrl.ts     # Deployment base URL + userscript data URL (build-time inject)
│   │   ├── text.ts          # foldAccents / matchesSearch (accent-insensitive search)
│   │   └── styles/theme.css # Single shared dark-medieval theme (variables + scopes)
│   └── database/            # Standalone DB (built separately; also mounted in-game)
│       ├── index.html · main.tsx · DatabaseApp.tsx   # hash-routed tabs
│       ├── explorer/        # DataTable, FilterBar, DetailPanel, ExplorerView, columns/filters/labels/lookups
│       ├── map/             # MapView, CellDetail, Legend, mapMeta
│       └── quests/          # QuestView, QuestGrid, QuestKeyLegend, QuestCellDetail, QuestQuestionCard, questMeta
├── static/db/*.json         # Game data — SINGLE SOURCE OF TRUTH
│                            #   monsters, weapons, armors, items, map-data, item-shops, weapon-shops,
│                            #   quests, tavern-quests
├── tests/                   # Vitest + @testing-library/preact (jsdom)
├── loader/larkinor-loader.user.js   # Hand-written ViolentMonkey loader (fetches + evals main script)
├── scripts/
│   ├── deploy.sh            # scp dist/ + static/ to the server (config from repo-root .env)
│   └── quests/              # scrape.mjs+parseQuest.mjs (royal), scrapeTavern.mjs+parseTavernQuest.mjs (tavern)
├── docs/superpowers/        # specs + plans
├── .github/workflows/ci.yml # CI: typecheck + test + build; deploys main to GitHub Pages
├── vite.config.ts           # Userscript build (vite-plugin-monkey)
├── vite.config.db.ts        # Standalone DB build
└── Makefile · serve.sh · README.md · package.json · tsconfig.json
```

## Overview

One Vite + Preact + TypeScript project delivering both an **in-game UI replacement** (userscript) and a **standalone database explorer**, from a shared data layer and theme. Targets Firefox for Android via ViolentMonkey; the standalone DB opens in any browser.

**Data conventions**:
- All game data is JSON under `static/db/` (the single source of truth).
- Hungarian language throughout (game is Hungarian) — UI copy stays Hungarian; identifiers/comments English.
- Map coordinates: `imageId = row*10 + col`, row 0 = north, col 0 = west.

> The original zero-dependency HTML explorer (`lc-database/`) has been fully
> ported into `src/database/` and removed; see git history if you need it.

### Architecture

#### Shared data layer (`src/shared/data/`)
- **TypeScript models** (`types.ts`): `Weapon`, `Armor`, `Item`, `Monster`, `MapCell`, `Shop` with full typing.
- **DataSource abstraction** (`source.ts`): `gmSource` (runs in userscript, uses `GM_xmlhttpRequest`) and `httpSource` (runs standalone, uses `fetch`). DB components must use `DataSource`, never call GM_* directly, so the same code runs in-game and standalone.
- **Data loader** (`loader.ts`): `createDataLoader(source, baseUrl)` → `DataLoader` with methods like `fetchMonsters()`, `fetchWeapons()`, etc. Cached via `GM_setValue` in-game, HTTP caching standalone.
- **Data single source of truth**: `static/db/*.json` (monsters, weapons, armors, items, map-data, item-shops, weapon-shops, quests, tavern-quests), deployed to `/larkinor/static/db/` on the production host.

#### Shared theme (`src/shared/styles/theme.css`)
- Single dark-medieval CSS variables sheet; **never add hardcoded hex/rgba in rule bodies** — use `:root` variables and `.lc-db` scopes.
- `.lc-db` classes scope explorer/map styles; userscript components use `lc-` classes.

#### In-game userscript (`src/main.ts`, `src/mobile/`, `src/desktop/`, `src/pages/`, `src/components/`)
- **Two-script pattern**: tiny hand-written loader (`loader/larkinor-loader.user.js`) fetches and `eval`s the built main script on every page load (cache-busted with `?v=`). Update the UI by re-uploading the built file — no reinstall.
  - **Critical**: because the loader `eval`s the main script, the main script's GM calls run in the **loader's** grant sandbox. The loader MUST `@grant` everything the main script uses: `GM_addStyle`, `GM_getValue`, `GM_setValue`, `GM_xmlhttpRequest`. Missing any → `ReferenceError` on boot.
- **Proxy-DOM pattern** (mobile only): on a page we handle (FreeMove, Battle, Dungeon, Login, Home), extract game state from the live DOM, move the original DOM into an off-screen `#lc-offscreen` container (never destroy), mount a Preact app into `#lc-root`. UI actions `.click()` the original hidden controls so the game's own form logic runs unchanged. The desktop mode does **not** do this — see *Two platform modes* below.
- **Page detection** (`utils/pageDetector.ts`): read hidden `input[name="oldalTipus"]` — `otVilag`→FreeMove, `otHarc`→Battle, `otTemplom`→Church, `otLogin`→Login, `otLabirintus`→Dungeon, `otSajathaz`→Home, `otVegyesbolt`/`otFegyverbolt`/`otPiac`→Shop, else→Unknown. Mobile renders FreeMove, Battle, Login, Dungeon and Home, and leaves the rest untouched; desktop adds its dock to every page.
- **In-game database** accessible via "Adatbázis" overlay button (DatabaseOverlay component); reuses standalone DB components with `gmSource`.
- **Two platform modes** (`utils/platform.ts`): `detectPlatform(window)` picks `mobile` when
  `(pointer: coarse)` matches or the viewport is under 900px, else `desktop`. A stored
  override (`lc-platform-override`, set from the config drawer's *Felület* toggle) wins over
  auto-detection; it takes effect on the next page load.
  - **Mobile** (`src/mobile/boot.ts`) is the proxy-DOM full replacement described above.
  - **Desktop** (`src/desktop/boot.ts`) *augments* instead: it never calls `hideOriginalDOM`
    or injects a viewport meta. It mounts a fixed `#lc-dock-root` companion dock (quick
    actions, encounter attack, config, database), makes DB-known monster names in the live
    narration clickable (`enhanceNarration` — text-node splicing only, never `innerHTML`,
    which would destroy the game's own `<a>` handlers), and binds keyboard shortcuts
    (WASD/arrows, Space, 1–9, Q, Esc — all suppressed while the event target is a form
    control, so typing in chat can't move the character). The dock renders on every page,
    including ones we don't recognise; only free-move gets the full action set.
  - Because the game page stays visible on desktop, **no CSS may use an unscoped element
    selector** — everything stays under `#lc-root`, `#lc-dock-root` or a `.lc-*` class.

#### Standalone database (`src/database/`, built separately)
- **Hash-routed tabs**: Fegyverek (Weapons), Vértek (Armors), Tárgyak (Items), Szörnyek (Monsters), Térkép (Map), Küldetések (Quests).
- **Explorer components** (`explorer/`): sortable/filterable DataTable with side DetailPanel, FilterBar with presets, ColumnDef/FilterDef system per tab.
- **Map viewer** (`map/`): clickable districts with cell details and resident monsters.
- **Quest viewer** (`quests/`): the 45 royal quests as interactive mazes, scraped once from a
  third-party fan site (`https://www.larkinorcenter.hu/kirkuld.html`) into the committed
  `static/db/quests.json` via `npm run scrape:quests` (`scripts/quests/scrape.mjs` +
  `parseQuest.mjs`). Hard-won facts about that source page, needed if the scraper or parser
  ever needs revisiting:
  - Each quest page is one `<table>`; a `<td>`'s class tokens encode its four sides —
    `f`/`j`/`a`/`b` = north/east/south/west. A bare token (`f`, `j`, …) is a solid wall; a
    suffixed token (`f_vas`, `j_arany`, …) is a locked door. The eight lock suffixes are
    `_vas` (iron), `_rez` (copper), `_bronz` (bronze), `_ezust` (silver), `_arany` (gold),
    `_platina` (platinum), `_tolvaj` (thief), `_cso` (pipe). A ninth, `_szel`, marks the edge
    of the drawn (often irregular) maze shape rather than a wall or door — see
    `docs/superpowers/specs/2026-08-13-quest-database-design.md` for the investigation.
  - Cell images follow `<base>[_<X>kulcs][_kt][_labikibe].jpg`: `_<X>kulcs` = this cell yields
    that lock's key, `_kt` = holds the quest item, `_labikibe` = labyrinth entrance/exit, a
    `boss` suffix on the base = boss monster.
  - Only 5 of the 45 quest pages carry `id="td<RR><CC>"` on their cells — coordinates come
    from row/column position in the table for the rest, with the ids used as a cross-check
    where present.
  - Quest 27 ships **seven** `<table>`s on one page. They are not seven floors — they are
    seven alternate views of the *same* maze (a hand-made "where is each key" overlay); the
    parser takes the first table and drops the rest.
  - **The blank tile is ambiguous, and only the drawn walls resolve it.** `nop.jpg` is a plain
    white image (`black.jpg` in the tavern set behaves the same), and both sources use it for
    two unrelated things: an empty room *inside* the maze, and the untouched canvas *around* a
    maze whose drawn shape is smaller than its bounding grid. Only the canvas may render as
    void (near-black); an empty room must render as a normal tile. `outsideMazeCells` in
    `src/database/quests/questMeta.ts` separates them — a cell that draws any side of its own
    is inside (the source only writes side classes on cells it drew), and the rest are settled
    by flooding inwards from every undrawn blank touching the grid's edge. A *neighbour's* wall
    proves nothing about this cell: the maze's outer wall is drawn by the rooms along its rim,
    so reading it as "inside" swallows the whole canvas next to it. A neighbour's `szel` is the
    one exception and also seeds the flood — it says the drawing stops at that side, so an
    enclosed pocket behind it is canvas (royal quest 39's cell (3,10), ringed by four `szel`
    edges, is the only such cell; no `szel` edge in either set faces a cell holding content).
    Concretely: royal quest 30's column 4 is an undrawn strip running in from the top edge
    (canvas), while its cell (2,1) is an undrawn blank whose four walls are all drawn by
    neighbours (a room). Deciding void from emptiness alone — the original bug, found via
    `demon_hadur`, where 8 of 96 cells went black including two behind locked doors — painted
    200 royal and 537 tavern rooms as solid rock. Totals are pinned in both data tests
    (377 royal / 70 tavern outside cells).
  - The maze is rendered as CSS grid + `<div>`s, **never a `<table>`** — the in-game page runs
    in quirks mode, where table cells don't inherit `color` and render black-on-dark (see
    *quirks-mode inheritance holes* below). Rendering divs sidesteps that class of bug rather
    than patching around it.
  - **Tavern quests** (*kocsmai küldetések*) are a second, independent quest body — 37 quests
    keyed by page slug rather than a number (ids like `GOMB` or `GY.I.K`, dots and mixed case
    included), titled from the index link's text — scraped from
    `https://www.larkinorcenter.hu/kocskuld/` via `npm run scrape:tavern`
    (`scripts/quests/scrapeTavern.mjs` + `parseTavernQuest.mjs`) into the committed
    `static/db/tavern-quests.json`. The slug (from the link's `href`) is stable; the title
    (the link's text) carries the source's own accents and typos, so the two are tracked
    separately rather than one derived from the other. It shares a page skeleton with the
    royal source but almost no grammar, which is why it has its own parser module rather than
    a dialect flag through `parseQuest.mjs`. Hard-won facts, each costly enough to be worth
    recording once:
    - **The filename grammar differs from the royal set's outright, not just in spelling.** A
      key cell is `<monster>_<lock>` (no `kulcs` suffix — royal: `_<lock>kulcs`), the quest
      item marker is `_kulditargy` (royal: `_kt`), the exit marker is `_labikibe` or `_kibe`,
      and markers can sit on **either side** of the sprite name (`kerdes_platina` and
      `labikibe_kerdes` both occur in the corpus). So `parseTavernImage` classifies every
      underscore-separated token rather than peeling an ordered suffix chain.
    - **`tolvaj` (thief) is both a lock name and part of a monster's name.**
      `berbunko_tolvaj.jpg` is monster #149 *Bérbunkó tolvaj* with no key; `klonolo_tolvaj.jpg`
      is #158 *Klónölő* plus a thief-locked key — identical token shape, opposite meanings. A
      lexical rule alone cannot tell them apart, so `parseTavernImage` takes an injected
      `isMonster` predicate and resolves the sprite name as the **longest leading prefix of
      tokens that names a known monster**; every token after that prefix is a marker.
    - **Edge-class typos are aliased; three more tokens are tolerated and ignored — never
      guessed.** `TAVERN_EDGE_ALIASES` corrects three misspelled lock suffixes (`azust` →
      `ezust`, `asrany` → `arany`, `bronnz` → `bronz`) after lowercasing, so a same-cased typo
      of an already-correct suffix (`Ezust`) needs no entry of its own. Separately, three
      tokens don't fit the side-prefix grammar at all and go in
      `TAVERN_TOLERATED_TOKENS`, dropped outright: `_rezf` (`kastely`, cell 2,8), `l_platina`
      (`kiralyno_7_torpe`, cell 6,8), and a bare `bronz` (`letezik_egy_labirintus`, cell 0,3) —
      one occurrence each across all 37 pages. Guessing would invent a door the source never
      drew, and on that third cell the other three tokens already declare all four sides, so
      dropping the stray one costs nothing. Any *other* unrecognised token still throws —
      that abort is the drift detector, mirroring `TOLERATED_TOKENS` in the royal parser.
    - **The `komponens` page has an unclosed `<img>` followed by a bare `<td="">`** (row 0,
      cell 5). A `</td>`-anchored lazy match runs past it, merging two cells into one and
      shifting the rest of the row one column left — exactly what a browser's own error
      recovery does, and what the parser must reproduce rather than "fix". The tavern cell
      regex therefore reads a cell's content up to the next `<td`/`</td` instead of requiring
      a closing tag; checked across all 306 rows of the 37 pages, exactly this one row
      changes shape.
    - **There is no question grammar at all**: zero `(n)` markers, arrows or ` -- ` outcome
      separators anywhere in the set (the royal set uses these — see `parseQuest.mjs`).
      Question tiles are instead identified by **image** (a `kerdes` token in the filename),
      and their `title` attribute is newline-delimited: line 0 is the setup, the remaining
      lines are the options, and there is **no outcome text at all** — the source simply never
      records one, unlike the royal set's choices.
    - Seven sprite basenames are misspelled or mis-encoded beyond what accent-folded name
      matching recovers on its own; `SPRITE_ALIASES` in `scrapeTavern.mjs` maps each by hand
      to a monster id.
    - `black.jpg` behaves exactly like `nop.jpg` — both resolve to an empty cell with no
      creature and no marker. Neither means "outside the maze": see *the blank tile is
      ambiguous* below.
    - Final data shape, and what `tests/quests/tavernQuestData.test.ts` locks in: 37 quests,
      2951 cells, 147 question tiles (132 with parsed options — the other 15 keep the marker
      but yield no card, same as the royal set), 0 unresolved sprites, every quest rectangular
      (`cells.length === rows * cols`).
  - **Persistence is per set.** The quest tab remembers which set was shown last
    (`lc-quest-set`) and, separately, the last selected quest **within each set**
    (`lc-quest-selected-royal` / `lc-quest-selected-tavern`, built by `questSelectedKey(set)`
    in `src/shared/prefKeys.ts`), with the legacy single key `lc-quest-selected` read once to
    seed the royal key on upgrade. Per-set rather than one shared key so switching to tavern,
    browsing, and switching back returns you to the royal quest you left, and so the
    stale-id fallback lands in the right set — a forgotten id falls back to the first quest of
    the *set the user was in*, which one key alone cannot tell you.
  - **The pub pre-selects the quest it hands you** (`src/utils/questOffer.ts` +
    `activateQuestOffer.ts`). The Kocsma page (`oldalTipus=otKocsma` → `PageType.Tavern`)
    prints the quest brief inside its narration, and that brief is the same text the fan
    site publishes as the quest's description — so a note the player has just accepted is
    identifiable. On a match the two prefs above are written, and the quests tab therefore
    opens on that quest. Desktop additionally appends a clickable *„Küldetés felismerve"*
    note under the narration (`src/desktop/questOfferNote.ts`, driven through the dock's
    `openQuestsSignal` nonce); mobile activates silently, since it does not mount any UI on
    the pub page and so has no overlay for the note to open.
    - Matching is **signature-first**: the folded description's opening 60 characters
      appearing verbatim in the folded narration. Word-overlap (≥0.6, and ≥2× the runner-up)
      is only the fallback for a lightly reworded brief. No match ⇒ **no write**, so an
      ordinary pint never clobbers the quest the player was reading.
    - **The stated size is written width×height — the transpose of our `rows`×`cols`.**
      Measured over the 13 descriptions carrying a `(NxN)` hint: 5 non-square ones match only
      when transposed, 0 match as `rows`×`cols`, 7 are square and prove nothing. The hint is
      also unreliable in its own right — 6 of those 13 disagree with the maze actually drawn,
      and `ki_vagyok_ne_erdekeljen` states `10x10` for a 9×10 grid. So it vetoes only the
      fuzzy path, never a verbatim signature match.
    - Only pub pages load `tavern-quests.json` (~1.4MB, then GM-cached), which is why this
      hangs off the page type rather than running everywhere.
- Uses `httpSource` for data fetching; no ViolentMonkey required — serves standalone at `/db/` during dev, `/larkinor/` in production.

### Real game DOM — hard-won facts (see `docs/superpowers/specs/2026-07-06-larkinor-real-dom-reference.md`)

The synthetic assumptions in the original plan were wrong; the real DOM is:
- Absolutely-positioned `<div>`s (no tables), many sharing an invalid duplicate `id="Layer3"`; page is **ISO-8859-2**.
- All controls are `<input type="image">` driving one shared `<form name="urlap">` via inline `onclick`. **Never parse/reconstruct the onclick** — locate the control (by image basename or `title`) and `.click()` it.
- **Stats are printed `max / current`** on BOTH screens (e.g. `Életpont: 303 / 260`) — the reverse of the intuitive order; `extractStats` swaps them. Gold (`Pénz:`) uses `&nbsp;`/space thousands separators → strip non-digits.
- Directions: image inputs `eszak`/`del`/`kelet`/`nyugat` → N/S/E/W. Actions: `select[name="tevFajta"]` + the `ok.gif` submit button. Buildings: other image inputs (excluding nav, `ok`, `tamadas`). Encounter attack button: `tamadas.gif` (`svEngageCreature`) → rendered icon-only in the NavPad centre. Status icons (insurance/curse/shield): the `<img>`s inside the stat `<b>` block, shown next to gold.
- Monster (battle): `img[title*="letpontja"]` → name before the comma, HP after `életpontja:`.
- Narration: the `font[face="Comic sans MS"]` block; `<br>` is converted to newlines (rendered with `white-space: pre-line`).
- **Monster detection uses narration sentence templates** (`utils/narration.ts` → `ENCOUNTER_PATTERNS`), each capturing the monster name, resolved against the DB. Add new templates as single-capture-group regexes to that array (there are unit tests per template).
- **The game wraps every monster name in `<b><font color="…">`**, with a trailing space inside the tag:
  `Valami <b><font color="#DF4B22">Gyakorlott vízmágus </font></b> csámborog a közelben!`
  So the encounter sentence is split across three text nodes while the name sits in one. Anything matching these templates against the live DOM must match the **flattened** block text and then map the captured name back to its node — matching per text node finds nothing at all, since no single node holds a whole template. `src/desktop/enhanceNarration.ts` does this; the mobile path is unaffected because `extractNarration` flattens first. When flattening, convert `<br>` to a newline, or sentences either side of a line break concatenate and a boundary-anchored pattern can match across them.
- **Monster image path**: the DB stores `/pic/szornyk/NAME_k.gif` but the live server serves it at `/szornyk/NAME_k.gif` (no `/pic`) — `MonsterCard.monsterImageUrl` strips the `/pic`. Asset base is `https://l2.larkinor.hu`.
- The game page ships **no viewport meta**, so mobile browsers assume ~980px; `src/mobile/boot.ts` injects `width=device-width` on pages we take over. The desktop boot deliberately does not — the ~980px assumption is correct there.
- **Encoding gotcha**: `db/monsters.json` had Latin-1/Latin-2 mojibake (`õ`/`û` instead of `ő`/`ű`) that broke name matching against the correctly-encoded live narration — fixed. Watch for this in any scraped Hungarian data.
- **The game page runs in quirks mode** (`document.compatMode === 'BackCompat'` — verified live; the doctype is unusable). Two inheritance holes bite anything we render inside it, and neither reproduces in the standalone build, which is standards mode:
  - **Quirks mode does not inherit `color` or `font-size` into tables.** Cells reset to the document default however light the ancestor is — black text at 16px on our dark background. This made the in-game DB overlay's explorer and map nearly unreadable; `theme.css` now forces `color: inherit` on the `.lc-db` table and form elements. The `font-size` half is deliberately left alone (it only makes cells 16px instead of 14px, and fixing it shifts row heights).
  - **Form controls never inherit `color`** in any mode, so `input`/`select`/`option`/`button`/`textarea` need it set explicitly too.
  - Practical rule: an in-game component that renders a `<table>` or a form control must set `color` explicitly rather than relying on a coloured ancestor. Everything else (divs, spans) inherits normally.
- **Geometry of the desktop chat panel** (`#mydiv`, measured live at both 1440×900 and 1280×720): `left: 60, top: 473, 500×300`, absolutely positioned, `z-index: 10`, with its own text input occupying the top ~22px. It is laid out in fixed pixels and **does not move with the window**, which is why `src/desktop/boot.ts`'s `alignDock` can measure once at boot with no resize listener. Its parent is the 633px game content column at `0,−97` — note the negative top, i.e. the column starts above the viewport.
- **The character page (`oldalTipus=otPlayerSettings`, title `karakterlap`) is the
  only page that prints the worn equipment set — and the only place equipment can
  be changed**, which is why capturing on every visit keeps the stored loadout
  current by construction rather than approximately. Its five slots (`Bal kéz`,
  `Jobb kéz`, `Test`, `Fej`, `Láb`) each carry the item's **full stat block inside
  the link's `onclick="alert('…')"`**, in the same `label: value` per-line grammar
  as the Home page's inventory — so `src/utils/characterExtract.ts` decodes the
  single-quoted payload (never executes it) and reuses `parseCuccDetail`. Facts
  that cost measurement to establish:
  - `Átlag sebzés` is never printed and never needs to be: `avgDamage ===
    maxDamage - spread/2` for all 1220 weapons carrying both fields, so the stored
    loadout is self-contained — the compare path does no database lookup and
    cannot fail to resolve a name.
  - `level` and `minLevel` are one quantity (0 mismatches across 1216 weapons and
    1279 armours), so the page's `Min. szint` compares directly against the
    database's `level`.
  - A shield prints `Fajta: kézbe` **and no `Min. szint` at all**, so `level` is
    genuinely nullable; shields occupy a hand, beside weapons.
  - Armour slots resolve from either vocabulary — database `type`
    (`Páncél`/`Sisak`/`Csizma`/`Pajzs`) or the page's `Fajta`
    (`testre`/`fejre`/`lábra`/`kézbe`) — via `armorTarget` in
    `src/shared/loadout.ts`. An unrecognised value yields **no** comparison, not a
    guessed slot.
  - The equipment cell is found by **scoring every `<td>` on how many slot labels
    it prints**, not by looking for `Bal kéz:`. Keying off one label means a page
    printing a different subset of slots finds nothing at all, and scoring also
    stops an unrelated cell that happens to print `Test:` from winning.
  - A capture saved through Playwright's `browser_evaluate` is a **JSON-encoded
    string**, not HTML. Feeding it to JSDOM finds no anchors and reads every slot
    as null, which looks exactly like an extractor bug; `JSON.parse` it first.
- **The compare card** (`src/hooks/useCompare.tsx` + `CompareCard`) diffs a hovered
  weapon or armour against the worn set on the explorer tables, the Home inventory
  and the Market panel, reading the loadout from a `LoadoutContext` that both
  boots and `DatabaseOverlay` provide. Deliberate choices, not to be relitigated:
  - A weapon shows **one column per equipped hand**; a shield compares only
    against a hand that holds a shield, since `Védelem` against `Maximum sebzés`
    is not a comparison.
  - **Lower `Szórás` is better** (`avgDamage = maxDamage − szórás/2`), and `Szint`
    is never "better" — only neutral, or red when it exceeds the player's level.
  - A weapon's `Típus` is **shown but never judged** (direction `info`): no class
    beats another. It is lower-cased on the way out because the two sources
    disagree on capitalisation for the same value — the page prints
    `szúró/vágó`, the database `Szúró/Vágó` — which side by side would read as
    two different types. Armour gets no such row: its slot header already says
    where it goes. `EquippedItem.type` carries the page's `Fajta` or the
    database's `type` in one field, since for armour that same string is what
    `armorTarget` resolves to a slot.
  - **`Loadout.version` is the drift gate.** It went to 2 when `type` was added:
    a version-1 item carries none, and reading its absence would mean guarding
    every consumer. A discarded loadout costs one visit to the character page.
  - The trigger uses **mouse events for hover and touch events for long-press,
    not pointer events**: jsdom ships no `PointerEvent`, so a pointer-based
    trigger could only be tested against a fabricated event. A tap's emulated
    `mouseenter` is suppressed for 800ms, or tapping a row would open the hover
    card on touch. Tests must drive it with `vi.advanceTimersByTimeAsync` — a
    re-render triggered from inside a timer lands on the microtask queue, which
    the synchronous timer API never flushes.
  - A table row is its own component (`DataRow`) because `useCompare` is a hook:
    calling it inside the rows' `.map()` would change the hook count whenever the
    filtered row count does.
  - **The standalone site never shows it.** It is a different origin with its own
    `localStorage` and cannot see the in-game loadout, so `LoadoutContext`
    defaults to null and every consumer renders normally without one.
- **The game's total width is 791px** (its widest element is the top banner; a right-hand sidebar runs `653–791`). Everything past that is empty page on a desktop window, which is where the minimised database overlay docks — `src/desktop/boot.ts` publishes it as `--lc-game-right`. It is a **constant, deliberately not measured**: the page carries third-party ad content that renders past the game, so taking the widest element on the page put the docked overlay's left edge too far right. The layout is fixed-pixel and ignores the viewport, so there is nothing to adapt to. The usable docked width is `window width − 791`: generous on a wide monitor (~720px at 1513), cramped below about 1200.

## Development workflow

All commands run from the repo root.

```bash
npm install

# Development
npm run dev          # Vite dev server for the userscript UI (make dev)
npm run dev:db       # Standalone DB dev server, data at /db (make dev-db)
npm test             # Vitest (jsdom); GM_* are mocked in tests/setup.ts
npm run test:watch   # Vitest in watch mode
npm run typecheck    # tsc --noEmit
npm run build        # Full build: build:userscript && build:db (make build)
npm run build:site   # build + stage static/ into dist/static/ (what CI deploys)
npm run serve        # Simple HTTP server for dist/ (http://localhost:9000)
```

**Build order** (important): `npm run build` runs `build:userscript` first (which wipes `dist/`), then `build:db` (which writes into `dist/` without emptying it — `emptyOutDir: false`). Both artifacts share the `dist/` root so the DB is the site entry point:
- `dist/index.html` (+ `dist/assets/`) — standalone database viewer (the site root)
- `dist/larkinor-ui.user.js` — userscript (run via ViolentMonkey loader)

**Data paths**:
- Dev userscript: data served from `/static/db/` (publicDir in `vite.config.ts`)
- Dev standalone DB: data served from `/db/` (publicDir in `vite.config.db.ts`, `dev` only)
- Prod standalone DB: resolves `static/db` **relative to `document.baseURI`**
  (`src/database/main.tsx`), so one build works at any mount path — `/larkinor/` on a
  private host, `/<repo>/` on GitHub Pages.
- `static/db/` is the single source. The DB build does not copy it; `npm run build:site`
  stages it into `dist/static/`, and `scripts/deploy.sh` ships it as a separate scp.
- The royal and tavern quest sets are separate files (`quests.json`, `tavern-quests.json`),
  each fetched only once its tab is actually shown, not both up front — together they run
  ~1.5MB + ~1.2MB, and most sessions never switch sets at all.

**Public base URL — never hardcode a host.** Everything the built userscript must reach at
runtime derives from one value, `LC_PUBLIC_BASE_URL` (default in `vite.config.ts`), injected
as `__PUBLIC_BASE_URL__` and read in `src/shared/publicUrl.ts`:
- the data URL (`USERSCRIPT_DATA_BASE_URL`, imported by both boot modules **and**
  `DatabaseOverlay` — one definition, not three);
- the `@connect` host (derived via `new URL(...).hostname`);
- `@downloadURL` / `@updateURL`, so a direct install self-updates.

So `LC_PUBLIC_BASE_URL=http://192.168.x.x:9912 npm run build` produces a bundle that is
entirely self-consistent for local testing — which is exactly what `serve.sh` does, instead
of patching the built output.

**Deploy — two independent targets:**
- **GitHub Pages (primary, automatic).** A push to `main` runs `.github/workflows/ci.yml`:
  typecheck → test → build, then a `deploy` job (gated on that passing, `main` only) rebuilds
  with `LC_PUBLIC_BASE_URL` set from `actions/configure-pages`' `base_url` output and
  publishes `dist/`. Nothing about the owner or repo name is hardcoded, so a fork deploys to
  itself. One-time repo setup: Settings → Pages → Source = GitHub Actions.
- **Private host (optional).** `make deploy` → `scripts/deploy.sh` scps `dist/.` and
  `static/.` over SSH, reading `REMOTE_USER`/`REMOTE_HOST`/`REMOTE_DIR` from a git-ignored
  `.env` (see `.env.example`). Never commit those values.

Static serving over HTTPS is enough — `GM_xmlhttpRequest` bypasses CORS.

**Local device testing** via userscript loader:
```bash
./serve.sh    # Builds, serves on port 9912 (or PORT=9000 ./serve.sh); prints loader URL
```
Install the printed loader into ViolentMonkey (one-time). After code changes, re-run `serve.sh` — the loader fetches the fresh script on next page load.

**Console-injection testing** (no ViolentMonkey; debug on the live game via DevTools):
1. Serve `dist/` with CORS on `127.0.0.1` (loopback is exempt from mixed-content blocking)
2. Paste GM_* shims (from `tests/setup.ts`) + the eval fetch line into the console
3. Re-inject in place rather than reloading (reloading logs out the game session)

## Game context

- **Language**: Hungarian
- **Base URL**: `https://larkinor.hu` (game pages), `https://l2.larkinor.hu` (assets, map images)
- **Map image URL pattern**: `https://l2.larkinor.hu/tajk/<imageId>.gif`
- **Districts**: városközpont, mágus-negyed, harcos-negyed, kezdő-negyed, sötét-negyed, sziklabarlangok, erdő, mocsár, temető, démonok-földje
- **Shop types**: palota, vegyesbolt, erőd, fegyverbolt, ékszerész, templom, mágustorony, kocsma, piac, kaszinó, aréna

## Code standards

- Build tools, bundlers, and frameworks are allowed — pick the best fit for the task
- External CDN dependencies are fine (the game is online; network access is assumed)
- **Minification is optional** but the source must always be human-readable
- Follow the existing dark-theme CSS variable system when adding UI elements
- **All comments and identifiers must be in English**
- **Temporary files** (screenshots, scratch scripts, debug output, Playwright
  artifacts, etc.) go in the repo-root `.tmp/` folder, which is git-ignored.
  Never leave them in the repo root or commit them.
