# Larkinor — Island Map

## Coordinate system

Each cell on the island has a unique 2-digit **image ID** in the form `<row><col>`:
- `row` 0 = north edge of the map → row increases southward
- `col` 0 = west edge of the map → col increases eastward
- The terrain image URL is `https://l2.larkinor.hu/tajk/<imageId>.gif`

A 10×10 grid is likely (rows 0–9, cols 0–9).

## Coverage so far (batch 1)

**27 cells discovered**, all in **cols 4–8** of **rows 0–8**. The western half of the map (cols 0–3) and the bottom row (row 9) are **not yet explored** — needs batch 2 after re-login.

```
        c4         c5         c6         c7         c8
r0  szikla(04) szikla(05M) szikla(06M) szikla(07M)  ?
r1  kezdő(14)     ?       szikla(16M) szikla(17M) szikla(18)
r2  kezdő(24)     ?           ?       mágus(27M)k szikla(28M)
r3  kezdő(34)     ?           ?       szikla(37M) szikla(38M)
r4  V·HUB(44M)    ?           ?       szikla(47)  szikla(48M)
r5  város(54M)p   ?           ?       szikla(57)  szikla(58M)
r6      ?         ?           ?       sötét(67M)  szikla(68M)
r7      ?         ?           ?       sötét(77)   sötét(78M)
r8      ?         ?           ?       sötét(87)   sötét(88)
```

Legend: `district(id)` — `M` = monster present, lowercase letter after = key building (k=kocsma, p=piac). The HUB at `44` has all 8 main shops.

## Cells (per-coordinate detail)

Format: `imageId (row,col)  district  place name  shops  clan houses  monster?`

The game does not show a separate "place name" — the **district** is the only locational name surfaced by the UI (it is the `title` attribute on the terrain image). Cells within the same district are distinguished by the imageId and by which shops/clan houses sit on them.

| ID | (r,c) | District | Image | Shops | Clan houses | Mob |
|---|---|---|---|---|---|---|
| **04** | (0,4) | sziklabarlangok | `/tajk/04.gif` | — | — | |
| **05** | (0,5) | sziklabarlangok | `/tajk/05.gif` | — | — | ⚔ |
| **06** | (0,6) | sziklabarlangok | `/tajk/06.gif` | — | — | ⚔ |
| **07** | (0,7) | sziklabarlangok | `/tajk/07.gif` | — | — | ⚔ |
| **14** | (1,4) | kezdő-negyed | `/tajk/14.gif` | — | — | |
| **16** | (1,6) | sziklabarlangok | `/tajk/16.gif` | — | — | ⚔ |
| **17** | (1,7) | sziklabarlangok | `/tajk/17.gif` | — | — | ⚔ |
| **18** | (1,8) | sziklabarlangok | `/tajk/18.gif` | — | — | |
| **24** | (2,4) | kezdő-negyed | `/tajk/24.gif` | — | — | |
| **27** | (2,7) | mágus-negyed | `/tajk/27.gif` | kocsma | — | ⚔ |
| **28** | (2,8) | sziklabarlangok | `/tajk/28.gif` | — | — | ⚔ |
| **34** | (3,4) | kezdő-negyed | `/tajk/34.gif` | — | — | |
| **37** | (3,7) | sziklabarlangok | `/tajk/37.gif` | — | — | ⚔ |
| **38** | (3,8) | sziklabarlangok | `/tajk/38.gif` | — | — | ⚔ |
| **44** ★ HUB | (4,4) | városközpont | `/tajk/44.gif` | palota, vegyesbolt, erőd, fegyverbolt, ékszerész, templom, mágustorony, kocsma | — | ⚔ |
| **47** | (4,7) | sziklabarlangok | `/tajk/47.gif` | — | — | |
| **48** | (4,8) | sziklabarlangok | `/tajk/48.gif` | — | — | ⚔ |
| **54** | (5,4) | városközpont | `/tajk/54.gif` | piac | A KALMÁR KLÁN klánháza; A Égi Kalandorok klánháza | ⚔ |
| **57** | (5,7) | sziklabarlangok | `/tajk/57.gif` | — | — | |
| **58** | (5,8) | sziklabarlangok | `/tajk/58.gif` | — | — | ⚔ |
| **67** | (6,7) | sötét-negyed | `/tajk/67.gif` | — | — | ⚔ |
| **68** | (6,8) | sziklabarlangok | `/tajk/68.gif` | — | — | ⚔ |
| **77** | (7,7) | sötét-negyed | `/tajk/77.gif` | vegyesbolt, fegyverbolt, kocsma | A Soul Destroyers klánháza | |
| **78** | (7,8) | sötét-negyed | `/tajk/78.gif` | kaszino | A Serény Múmiák klánháza | ⚔ |
| **87** | (8,7) | sötét-negyed | `/tajk/87.gif` | mágustorony | — | |
| **88** | (8,8) | sötét-negyed | `/tajk/88.gif` | ékszerész | — | |

Plus one cell not in batch 1 but seen post-login: **64** (6,4) `sötét-negyed`.

## Shops catalogued so far

| Shop icon (file) | Hungarian name | Cells where it appears |
|---|---|---|
| `palota.gif` | palota (palace) | 44 |
| `vegyesbolt.gif` | vegyesbolt (general store) | 44, 77 |
| `erod.gif` | erőd (fortress) | 44 |
| `fegyverbolt.gif` | fegyverbolt (weapon shop) | 44, 77 |
| `ekszeresz.gif` | ékszerész (jeweller) | 44, 88 |
| `templom.gif` | templom (church) | 44 |
| `magustorony.gif` | mágustorony (mage tower) | 44, 87 |
| `kocsma.gif` | kocsma (tavern) | 44, 27, 77 |
| `piac.gif` | piac (market) | 54 |
| `kaszino.gif` | kaszinó (casino) | 78 |

> Earlier session also identified `aréna` at a cell in the cluster near `54`, not in batch 1's frontier path. To be confirmed in batch 2.

## Clan houses catalogued

| Clan house | Cell |
|---|---|
| A KALMÁR KLÁN klánháza | 54 |
| A Égi Kalandorok klánháza | 54 |
| A Soul Destroyers klánháza | 77 |
| A Serény Múmiák klánháza | 78 |
| A Angyalok klánháza (from earlier session) | (a `mágus-negyed` cell in batch 2 to come) |
| A Pech egyveleg klánháza (from earlier session) | (a `városközpont` cell in batch 2 to come) |

## Districts observed

| District | Atmosphere | Cells |
|---|---|---|
| `városközpont` | Civic plaza, central hub | 44 (hub), 54 |
| `mágus-negyed` | Mage quarter (towers, glittering magic) | 27 |
| `harcos-negyed` | Warrior quarter (cavalry, training) | — (only seen as exit label) |
| `kezdő-negyed` | Newbie quarter (residential, sparring) | 14, 24, 34 |
| `sötét-negyed` | Dark / criminal quarter | 64, 67, 77, 78, 87, 88 |
| `sziklabarlangok` | Rocky-cave wilderness | 04, 05, 06, 07, 16, 17, 18, 28, 37, 38, 47, 48, 57, 58, 68 |

## What's left to explore (batch 2)

- **Cols 0–3** entirely — likely `harcos-negyed` (west of HUB), more `kezdő-negyed`, and likely more `sziklabarlangok` past the western frontier.
- **Row 9** — assumed to exist; reachable from south of row 8.
- **Cells inside the rectangle (rows 1–6, cols 5–6)** — these were skipped because BFS went around them; need to enter from neighbours.
- **The `aréna` cell** seen in the earlier session — likely at `(5,5)` or similar.

## Reproducibility

Raw data in [.tmp/larkinor-redesign/map-data.json](map-data.json). Edges in the BFS graph at [.tmp/larkinor-redesign/explore-batch1.json](explore-batch1.json).
