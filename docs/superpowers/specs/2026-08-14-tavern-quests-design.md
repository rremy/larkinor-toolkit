# Tavern quests (kocsmai küldetések) — design

**Status:** approved 2026-08-14
**Source:** `https://www.larkinorcenter.hu/kocskuld/index.html` (37 quests)
**Builds on:** `docs/superpowers/specs/2026-08-13-quest-database-design.md` (royal quests)

## Goal

Add the 37 tavern quests to the quest database tab, alongside the 45 royal
quests, reusing the maze grid, cell detail, key legend and question card
already built for the royal set.

## Source analysis

Measured across all 37 pages (crawled and cached during scouting; the
throwaway scripts live in `.tmp/kocskuld/`). The tavern pages share the royal
pages' skeleton — one `<table>` inside `<div class="lab">`, `Leírás:` and
`Jutalom:` in `<span class="tulajdonsagnev">`, `f`/`j`/`a`/`b` edge tokens with
lock suffixes — but differ in four ways that matter.

### 1. Identity is a slug, not a number

Quests are linked by filename (`GOMB.htm`, `alapito_okirat.htm`, `GY.I.K.htm`)
and titled in the link text (*GÖMB*, *Alapító Okirat*, *GY.I.K.*). Slugs mix
case and contain dots. There is no numbering anywhere on the source pages.

### 2. Filenames use a different grammar

Royal spells a key cell `<monster>_<lock>kulcs`; tavern spells it
`<monster>_<lock>`. Quest items are `_kulditargy` (royal: `_kt`), exits add
`_kibe` beside `_labikibe`, and markers appear in either position —
`kerdes_platina` and `labikibe_kerdes` both occur. Sprites live in per-quest
folders with descriptive names (`GOMB_elemei/agyszivo.jpg`), so only 195 of
1467 creature cells resolve by image basename.

`black.jpg` appears as void filler beside `nop.jpg`.

### 3. There is no structured question format

Zero occurrences across the whole set of `->`, ` -- `, or `(1)`-style markers —
the royal set's entire choice-parsing machinery has no input here. 24 cells
mention `KÉRDÉS` and 28 `VÁLASZ`, out of 1975 cells with title text.

What exists instead: 147 cells carry a `kerdes` image, and their titles are
newline-delimited.

| Question cells | Count |
|---|---|
| Total (image-derived) | 147 |
| Multi-line title | 132 |
| Single-line title | 2 |
| Empty title | 13 |

Across the 132 multi-line cells, line 0 is the setup and lines 1..n are the
options: 477 option lines, median 22 characters. Line 0 ends in `?` in 57 cases
and runs past 90 characters in 63 — it is framing text either way, sometimes a
terse question and sometimes narrative prose. Exactly **one** cell has
duplicated adjacent lines.

Multi-line does **not** imply question: 200 titles are multi-line overall, and
some are dialogue transcripts. The image stays the ground truth, exactly as
`hasQuestion` does for the royal set.

There are **no outcomes**. Tavern questions list options with nothing attached,
so the outcome text and its good/bad colouring are structurally absent from
this set. No amount of parsing recovers them.

### 4. The source has typos

Four malformed edge class tokens would make a strict parser throw:
`b_Ezust` (capital), `f_azust`, `j_asrany`, `j_bronnz`. `_szel` occurs 11 times
with its royal meaning (edge of the drawn maze, not a wall or door).

Seven sprite basenames are misspelled or mis-encoded relative to
`monsters.json`. All seven were confirmed by the user on 2026-08-14:

| Sprite base | Monster | Defect |
|---|---|---|
| `fureszfogu_%2520posvanyalligator` | #65 Fűrészfogú posványalligátor | double-encoded space |
| `orult_banyasztorp` | #26 Őrült bányásztörpe | missing trailing `e` |
| `skivei_orvgyilkos` | #151 Skivei orgyilkos | extra `v` |
| `nyamvadt_varazlotanonc` | #12 Nyamvadt varázslótanonc | `varazlo` for `varazslo` |
| `unikornis` | #83 Unikorn | trailing `s` |
| `donna_brutalisa` | #56 Donna Brutália | `brutalisa` for `brutalia` |
| `minus` | #132 Minusz | missing `z` |

With these aliases every creature sprite in the set resolves, so the scraper
keeps its abort-on-unresolved rule.

`labikibe_kerdes.jpg` is not a creature: it is a composite tile carrying
entrance, exit and question at once (confirmed by the user).

## Architecture

### Data model (`src/shared/data/types.ts`)

```ts
export type QuestSet = 'royal' | 'tavern';
```

`Quest` gains two fields and widens one:

- `id: string` — was `number`. Royal becomes `'1'`…`'45'`; tavern uses the
  source slug (`'GOMB'`, `'alapito_okirat'`, `'GY.I.K.'`).
- `set: QuestSet`
- `title: string` — the chip and header label. Royal holds the number as a
  string; tavern holds the display name.

`QuestCell`, `QuestQuestion` and `QuestChoice` are unchanged. Tavern choices
carry `outcome: ''`, which `QuestChoice` already permits and
`QuestQuestionCard` already renders correctly (it omits the outcome chip when
the string is empty).

### Two data files, fetched on demand

`static/db/quests.json` stays royal-only. Tavern goes to
`static/db/tavern-quests.json`. Royal is already 1.5MB and tavern adds roughly
1.2MB; merging them would mean fetching 2.7MB to open the tab. Separate files
let the view fetch only the set being viewed, and let one scrape fail without
poisoning the other.

`DataLoader` gains `loadTavernQuests()`, mirroring `loadQuests()`.

### A second parser

`scripts/quests/parseTavernQuest.mjs`, standalone and pure (no I/O), mirroring
the royal parser's shape so its tests look familiar. Sharing the royal parser
would mean threading a dialect flag through every function for two grammars
that overlap almost nowhere.

**Edge classes.** Lowercase the token, then apply an alias map for the four
source typos, then parse exactly as the royal parser does. An unknown token
still throws.

**Filenames.** Token-based rather than ordered suffix-stripping, because
markers appear in either position. Split the basename on `_` and classify each
token: locks (`vas`, `rez`, `bronz`, `ezust`, `arany`, `platina`, `tolvaj`,
`cso`) mark the key this cell yields; `kulditargy`/`kuldi`/`kt` mark the quest
item; `labikibe`/`kibe`/`labi` mark the entrance/exit; `kerdes` marks a
question; `boss` marks a boss. The remaining tokens rejoin to form the sprite
base. Scenery bases (`black`, `nop`, `kijarat`, `bejarat`, `csapda`, `halal`)
yield no monster.

**Titles.** `parseTavernTitle(title, isQuestionImage)` splits on newlines and
drops blanks:

- not a question image → every line joins into `narration`, question `null`
- question image, ≥2 lines → `prompt` = line 0, `choices` = lines 1..n, each
  with `outcome: ''` and a 1-based `index`
- question image, <2 lines → `narration` only, `hasQuestion: true`,
  `question: null`

The last case preserves the royal set's split between the image-derived marker
and the parsed structure, so a parse miss can never erase the marker.

**Monsters.** Resolution runs in three steps, in order: exact image basename,
then accent-folded monster name, then the seven-entry alias map. Folded-name
matching is safe here — the 1575 monsters produce 1127 distinct folded keys and
**zero** keys map to more than one sprite. No fuzzy or edit-distance matching:
at distance 1 it would also silently pair unrelated monsters, and the residue
is a known, fixed list of seven strings.

### Scraper

`scripts/quests/scrapeTavern.mjs`, run via `npm run scrape:tavern`. Crawls the
index for slug/title pairs, fetches each quest page, and writes
`static/db/tavern-quests.json`. Fails loudly rather than degrading — an unknown
edge token, an unresolved sprite, a missing field or an empty maze aborts
before anything is written.

### UI

`QuestView` gains a Királyi / Kocsmai toggle above the chip strip. Chips render
`q.title`. The header renders `12. küldetés` for royal and the bare title for
tavern.

`QuestGrid`, `QuestCellDetail`, `QuestKeyLegend`, `QuestQuestionCard` and
`questMeta` are untouched.

**Route.** `#quests/<set>/<id>`, e.g. `#quests/royal/12`,
`#quests/tavern/GOMB`. The route grammar widens to accept the tavern slug
charset (`[A-Za-z0-9._-]`).

**Persistence.** The in-game overlay remounts on every page load, so both the
set and the position within it must survive navigation. Three keys, from two
declarations in `src/shared/prefKeys.ts`:

- `QUEST_SET_PREF_KEY = 'lc-quest-set'` — `'royal'` or `'tavern'`
- `questSelectedKey(set)` → `'lc-quest-selected-royal'` /
  `'lc-quest-selected-tavern'`

`questSelectedKey` is the module's first function; its header comment
("holds nothing but such string constants") is updated to say the module holds
key definitions, constant or derived, and still pulls in no `GM_*` dependency
— which is the property that comment exists to protect.

Per-set selection keys mean switching to tavern, looking around, and switching
back to royal returns to the royal quest you were on rather than to quest 1.
Restore order on a null route: read the set first, then the selection within
that set. If the stored id no longer exists, fall back to the first quest **of
the stored set**, which is why the set cannot be inferred from the selection
alone.

The existing `lc-quest-selected` key (royal, numeric) seeds
`lc-quest-selected-royal` when the new key is absent, so the upgrade does not
lose the user's current position.

The desktop dock's `Küldetések` button is unchanged — it still routes to
`#quests`, which now restores the set as well as the quest.

## Testing

**Parser unit tests** against saved fixtures: each of the four edge typos; each
filename token class; the composite `labikibe_kerdes` and `kerdes_platina`
cells; the 2-line, 1-line and 0-line question cells; a multi-line non-question
title (the dialogue transcript) staying narration.

**Data invariants** (CI), mirroring `tests/quests/questData.test.ts`: 37 quests;
every creature sprite resolves to a monster id; 147 cells with `hasQuestion`;
no unrecognised edge tokens; every quest has a non-empty description, reward
and maze.

**UI tests:** the set toggle swaps which set the chip strip renders; a tavern
question cell renders prompt and options with no outcome chips; the pref
round-trip restores set and per-set selection.

## Risks and accepted limits

**"Line 0 is the setup" is a heuristic, not a grammar.** It holds across all
132 multi-line question cells measured, but the source does not guarantee it,
and a future edit to the fan site could break it silently. Accepted: the
alternative is showing an undifferentiated block of text.

**Tavern questions have no outcomes.** The outcome colouring built for the
royal set is absent here. This is a source limitation, documented in the spec
so it is not later mistaken for a bug.

**The typo alias lists are pinned to today's source.** New typos would abort the
scrape rather than corrupt the data, which is the intended failure mode — but
it does mean a source edit can require a code change to re-scrape.

**Widening `Quest.id` to `string` touches the royal path.** The royal route,
pref and dock deep link all change shape. The per-set pref keys are new, so the
one legacy key is read once for migration and then superseded.
