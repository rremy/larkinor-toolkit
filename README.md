# Larkinor Toolkit

[![CI](https://github.com/rremy/larkinor-toolkit/actions/workflows/ci.yml/badge.svg)](https://github.com/rremy/larkinor-toolkit/actions/workflows/ci.yml)
[![Database](https://img.shields.io/badge/database-live-d4a259)](https://rremy.github.io/larkinor-toolkit/)

Companion tooling for [Larkinor](https://larkinor.hu), a Hungarian browser-based
text RPG: a userscript that makes the game playable on a phone and adds a
companion dock on desktop, plus a standalone explorer for the game's data.

> **Unofficial.** This is third-party fan tooling. It is not affiliated with,
> endorsed by, or connected to larkinor.hu or its operators. It reads the pages
> the game already sends to your browser and clicks the game's own controls — it
> adds no capability a player does not already have. Game content and artwork
> belong to their respective owners.
>
> The interface is Hungarian throughout, because the game is.

## What's in here

Two artifacts are built from one codebase, sharing a data layer and a theme:

| | |
|---|---|
| **Userscript** | Runs on the live game. Two distinct UIs — a full-page replacement on mobile, a non-invasive companion dock on desktop. |
| **Database explorer** | A standalone site for weapons, armour, items, monsters and the world map. Needs no userscript: **[open it here](https://rremy.github.io/larkinor-toolkit/)**. The same explorer is also embedded in the userscript, reachable in-game. |

## Install

**1. Install a userscript manager.** [ViolentMonkey](https://violentmonkey.github.io/)
is what this is tested against — it's available for Firefox, Chrome, Edge, and
notably **Firefox for Android**, which is what makes the mobile UI possible.

**2. Install the script:** open
**[larkinor-ui.user.js](https://rremy.github.io/larkinor-toolkit/larkinor-ui.user.js)**.
Your userscript manager will offer to install it — confirm.

**3. Open [larkinor.hu](https://larkinor.hu)** and log in. The toolkit loads
itself and picks a UI based on your device.

Updates are automatic: the script carries `@updateURL`, so your userscript
manager pulls new versions as they ship.

## What it does

### On mobile

The game predates mobile browsers and ships no viewport meta, so phones render
it at roughly 980px wide and every tap is a pinch-zoom away. On a touch device
the toolkit replaces the page entirely: stat bars, a thumb-sized directional
pad, a narration panel, and monster cards, on pages it recognises (free move,
battle, dungeon, login, home).

Nothing is destroyed to do this. The original DOM is moved off-screen and kept,
and every action *clicks the game's own hidden control*, so the game's form logic
runs exactly as it always did.

### On desktop

The opposite posture: the game page keeps rendering itself, and the toolkit only
adds to it.

- **A companion dock** over the chat panel — quick actions with icons, plus
  access to the database, inventory and market panels.
- **Clickable monster names** in the narration text. Any monster the database
  knows becomes a link that opens its card, without touching the game's own links.
- **Keyboard shortcuts** — WASD/arrows to move, `Space`, `1`–`9` for quick
  actions, `Q`, `Esc`. All suppressed while you're typing in a form field, so
  chatting can't walk your character into a swamp.
- **Home and market panels** — inventory management and market listings with
  suggested prices, rendered beside the game rather than over it.

### The database

Sortable, filterable tables for weapons, armour, items and monsters, plus a
clickable district map with cell details and resident monsters, and an
interactive maze viewer for the game's quests — switch between **Királyi**
(the 45 royal quests) and **Kocsmai** (the 37 tavern quests) as independent
sets, each with its own key/lock legend and question tiles. Search is
accent-insensitive, so `gyikbor` finds `Gyíkbőr`.

## Configuration

Open the config drawer from the dock (desktop) or the UI (mobile) to choose which
quick actions appear as icon buttons, and to override platform detection —
handy on a tablet, or to see the desktop dock on a phone. The override takes
effect on the next page load. Settings persist through your userscript manager's
storage.

## Development

Requires Node 20+. All commands run from the repository root.

```bash
npm install

npm run dev          # dev server for the userscript UI
npm run dev:db       # dev server for the standalone database
npm test             # Vitest (jsdom); GM_* are mocked in tests/setup.ts
npm run test:watch
npm run typecheck    # tsc --noEmit
npm run build        # both targets into dist/
npm run build:site   # build + stage static/ into dist/ (what CI deploys)
```

A `Makefile` wraps the common ones (`make dev`, `make build`, `make deploy`).

### Testing on a real device

Userscript changes are best verified against the live game. `./serve.sh` builds
the script and serves it over your LAN:

```bash
./serve.sh              # port 9912
PORT=8080 ./serve.sh    # or pick your own
```

It prints a **loader** URL — install that once into ViolentMonkey on the device.
The loader re-fetches the script on every page load, so after a rebuild you just
refresh the game; no reinstalling. The build is pointed at your machine, so the
game data comes from your working copy too.

For direct installs the loader isn't needed — it exists to make phone iteration
bearable.

### Layout

```
src/
├── main.ts            # entry: detect platform → bootMobile | bootDesktop
├── mobile/            # proxy-DOM page replacement
├── desktop/           # companion dock, narration links, keyboard shortcuts
├── pages/             # FreeMove, Battle, Dungeon, Login, Home (mobile)
├── components/        # StatBar, NavPad, NarrationPanel, MonsterCard, panels
├── shared/            # data layer, theme, text helpers, public URLs
├── database/          # standalone explorer + map (built separately)
└── utils/             # platform/page detection, DOM extraction, narration
static/db/*.json       # game data — the single source of truth
tests/                 # Vitest + @testing-library/preact
```

`CLAUDE.md` holds the detailed architecture notes, including a hard-won
reference for the live game's DOM — absolutely-positioned layout, ISO-8859-2
encoding, stats printed `max / current`, and quirks-mode inheritance rules that
break anything rendered inside the page. Read it before changing extraction code.

## Deployment

Pushes to `main` run typecheck, tests and both builds; if they pass, the site
deploys to GitHub Pages automatically ([workflow](.github/workflows/ci.yml)).
Pull requests run the checks without deploying.

Two one-time setup steps in a fresh fork:

1. **Settings → Pages → Source: GitHub Actions.** Without this,
   `actions/configure-pages` fails and the deploy job cannot run.
2. Nothing else. The deployed URL is read from the Pages configuration at build
   time and baked into the userscript's data URL, `@connect` host and
   `@updateURL`, so a fork serves itself with no code changes.

To deploy somewhere other than Pages, set `LC_PUBLIC_BASE_URL` at build time:

```bash
LC_PUBLIC_BASE_URL="https://example.com/larkinor" npm run build:site
```

`scripts/deploy.sh` (`make deploy`) ships `dist/` and `static/` to a private host
over `scp`, reading connection details from a git-ignored `.env` — copy
`.env.example` and fill it in.

## Data

`static/db/*.json` is the single source of truth for game data, deployed
alongside both artifacts and fetched at runtime with a build-stamped `?v=` for
cache busting. The userscript fetches it via `GM_xmlhttpRequest` (which bypasses
CORS); the standalone site fetches it same-origin, resolved relative to wherever
the site is served from.

Hungarian text in this data is UTF-8 and must stay that way — Latin-1/Latin-2
mojibake (`õ` for `ő`) silently breaks monster-name matching against the live
game's narration.

## Tech stack

Vite · Preact · TypeScript · [vite-plugin-monkey](https://github.com/lisonge/vite-plugin-monkey) · Vitest

## License

[0BSD](LICENSE) — do whatever you like with this. Use it, copy it, modify it,
redistribute it, fold it into something else, with or without credit. There are
no conditions; the only clause is the usual disclaimer of warranty.

That covers the code in this repository. It does not cover Larkinor's game
content — the data under `static/db/` is derived from the game, and the artwork
the UI displays is served by the game. Those belong to the game's owners, not to
this project.
