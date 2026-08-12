# Desktop support — design

**Date:** 2026-08-11
**Status:** approved

## Problem

The userscript was built for Firefox for Android: it takes over every page it
recognises, moving the original DOM off-screen (`hideOriginalDOM`) and rendering
a full Preact replacement into `#lc-root`. That is the right trade on a phone,
where the game's ~980px absolute layout is unusable.

On desktop the game's own layout is fine. Replacing it wholesale throws away a
working UI to gain nothing. What desktop actually lacks is convenience: every
free-move action is a `<select name="tevFajta">` plus a separate `ok.gif`
submit, monster names in the narration are inert text, and there is no keyboard
control at all.

So desktop needs the opposite posture — **augment, don't replace**. Add a small
set of elements, enhance a few existing ones, leave the page otherwise intact.

## Existing code this builds on

Verified against the current tree, because the design depends on each of these:

- **`extractFreeMove(doc)` is entirely read-only.** Every `trigger` in the
  returned state just `.click()`s the original control. It works unchanged with
  the game DOM visible; desktop needs no separate extractor.
- **`theme.css` has no unscoped element selectors.** Only `:root` custom
  properties plus `#lc-*` / `.lc-*` scopes. Injecting it while the game page is
  visible cannot restyle the game.
- **`.lc-drawer-backdrop` is a bottom sheet** (`align-items: flex-end`, slide-up
  keyframes). Desktop needs a centered-modal variant class, but `MonsterCard`,
  `ConfigDrawer` and `DatabaseOverlay` need no structural change.
- **`findMonsterMentions(text)` returns `{name, index, length}` offsets.**
  Already the right shape for splicing DOM text nodes, not only for rendering.
- **`partitionHotkeys` / `useHotkeyConfig` / `HOTKEY_CATALOG`** are
  platform-agnostic and reused as-is.
- **The loader already `@grant`s** `GM_addStyle`, `GM_getValue`, `GM_setValue`,
  `GM_xmlhttpRequest`. No loader change, no reinstall.

## Approach

A `src/desktop/` module tree behind a platform switch. `main.ts` becomes a thin
dispatcher; today's boot body moves verbatim into `src/mobile/boot.ts`. The two
UIs stay physically separate, so desktop work cannot regress mobile and
`main.ts` stops growing.

Rejected alternatives:

- **Responsive props inside the existing components** (one `FreeMove` rendering
  either a dock or a full page). The two layouts share almost nothing, so every
  component gains a branch and `FreeMove.tsx` doubles in size for no reuse win.
- **Two separate builds/userscripts.** The loader pattern is deliberately one
  script, and a build-time split forfeits the runtime override.

## 1. Platform detection — `src/utils/platform.ts`

```ts
export type Platform = 'mobile' | 'desktop';

export function detectPlatform(win: Window): Platform
```

Resolution order:

1. The stored override (`getPlatformOverride()`) wins outright when set to
   either `'mobile'` or `'desktop'`.
2. Otherwise auto-detect: `mobile` when `win.matchMedia('(pointer: coarse)')`
   matches **or** `win.innerWidth < 900`; `desktop` otherwise.

`(pointer: coarse)` catches phones and tablets regardless of width; the width
fallback covers desktop browsers in responsive-design mode, where the media
query does not reflect the emulated device. `detectPlatform` reads the
environment only through the `Window` it is handed, so tests drive auto-detection
with a fake `matchMedia` / `innerWidth`; the override is read via
`src/utils/config.ts` and driven by the `GM_*` mocks already in
`tests/setup.ts`.

The override lives in `src/utils/config.ts` beside `getEnabledHotkeys`:

```ts
export const PLATFORM_OVERRIDE_KEY = 'lc-platform-override';
export function getPlatformOverride(): Platform | null;  // null = auto
export function setPlatformOverride(value: Platform | null): void;
```

`ConfigDrawer` gains a three-way toggle (**Automatikus** / **Mobil** /
**Asztali**) writing that key. The drawer is reachable from both UIs, so either
mode can switch to the other. Changing it takes effect on the next page load.

## 2. Boot split

`main.ts` reduces to detection plus dispatch:

```ts
const platform = detectPlatform(window);
if (platform === 'desktop') bootDesktop(document);
else bootMobile(document);
```

`src/mobile/boot.ts` receives today's `boot()` body unchanged — `PageState`,
`extractPageState`, `ensureMobileViewport`, `hideOriginalDOM`, the `#lc-root`
mount and the deferred monster load. This is a move, not a rewrite; the existing
mobile tests are the regression signal.

`src/desktop/boot.ts` is the mirror image and deliberately calls **neither**
`hideOriginalDOM` (the game DOM must stay visible) nor `ensureMobileViewport`
(the game's ~980px assumption is correct on desktop):

```
detectPage(document)
  ├─ FreeMove → extractFreeMove(document)
  │             → mount <DesktopDock state db>
  │             → enhanceNarration(document, db, onMonsterClick)  [after db resolves]
  └─ every other page type, including Shop / Church / Unknown
                → mount <DesktopDock dbButtonOnly>
```

The mount point is a `#lc-dock-root` div appended to `document.body`, styled
`position: fixed` — outside the game's absolutely-positioned layout, so it
cannot be reflowed by it.

`detectPage` currently `console.warn`s on an unrecognised `oldalTipus` because
mobile then renders nothing. On desktop the minimal dock still renders, so the
desktop boot must not treat `Unknown` as a failure; the warning stays in
`detectPage` (mobile still needs it) and the desktop boot simply proceeds.

## 3. `DesktopDock` — `src/desktop/DesktopDock.tsx`

A fixed, collapsible bar in the bottom-right corner.

```
Props: { state: FreeMoveState | null; db: MonsterDatabase | null; dbButtonOnly?: boolean }
```

```
┌─ #lc-dock-root (fixed, bottom-right) ─────────────────────────┐
│  ⌃ (collapse)                                                 │
│  [🍖 Kajálsz] [🙏 Imádkozol] [⛏ Ásol]  ← enabled hotkeys only │
│  [Alvás] [Ásás] …                      ← remaining tevFajta   │
│  [⚔ Támadás]                           ← only when attack ≠ null │
│  [⚙] [🔍 Adatbázis]                                           │
└───────────────────────────────────────────────────────────────┘
```

- Actions come from `partitionHotkeys(state.actions, enabled)` with
  `useHotkeyConfig()` — the same GM-stored hotkey set the mobile UI uses, so a
  set configured on the phone appears in the desktop dock.
- The attack button renders only when `state.attack` is non-null.
- `dbButtonOnly` collapses the dock to the `⚙` + `🔍` pair.
- Collapsed state persists under GM key `lc-dock-collapsed`, so a dock pushed
  out of the way stays out of the way across page loads.
- Owns the modal state: selected monster (→ `MonsterCard`), config open (→
  `ConfigDrawer`), database open (→ `DatabaseOverlay`).

### Styles

Two files, split by what the rule belongs to:

- **`src/desktop/desktop.css`** (new) holds the dock's own styles, every
  selector scoped under `#lc-dock-root` or `.lc-dock-*`. Imported `?raw` and
  appended to the `GM_addStyle` call in the desktop boot.
- **`src/shared/styles/theme.css`** gains the two rules that modify existing
  shared components — `.lc-drawer-backdrop--center` and `.lc-narr-link` — so
  they sit beside the `.lc-drawer-backdrop` base they override.

New CSS variables only — no hardcoded hex or rgba in rule bodies, per the
existing rule. `z-index` ordering: dock below modals, both above the game page.

### Desktop modal variant

`.lc-drawer-backdrop--center` overrides `align-items: center`, caps
`.lc-drawer` at `max-width: 520px` with full `border-radius`, and swaps the
slide-up keyframes for a fade. `MonsterCard` and `ConfigDrawer` take an optional
`variant?: 'sheet' | 'modal'` prop (default `'sheet'`) that only selects the
class — no other change to those components.

## 4. In-place narration enhancement — `src/desktop/enhanceNarration.ts`

```ts
export function enhanceNarration(
  doc: Document,
  db: MonsterDatabase,
  onMonsterClick: (monster: Monster) => void
): void
```

1. Locate `font[face="Comic sans MS"]`; return if absent.
2. Return immediately if the block carries `data-lc-enhanced` — idempotent, so a
   second call is harmless.
3. Walk its **text nodes only** with a `TreeWalker`. Never assign `innerHTML`:
   the block contains the game's own `<a>` elements whose native handlers drive
   the shared form, and reserialising would destroy them.
4. Per text node, run `findMonsterMentions(node.textContent)`, resolve each
   captured name against `db`, and for each hit split the node into
   `[text, <a class="lc-narr-link">name</a>, text]`.
5. Each anchor gets a `click` listener calling `onMonsterClick(monster)`, which
   sets dock state and opens `MonsterCard` in its centered-modal variant.
6. Mark the block `data-lc-enhanced`.

**Known limitation, accepted:** matching per text node means a mention split
across a `<br>` or `<b>` boundary is not found. The encounter templates are
single-sentence and the mobile path shows they normally arrive in one node;
reassembling the whole block and re-splitting it is not worth the fragility.

Styling is a single rule in `theme.css` — `.lc-narr-link` (dotted underline,
`--accent`, `cursor: pointer`) — the only place the design alters the game
page's appearance.

## 5. Keyboard shortcuts — `src/desktop/useKeyboardShortcuts.ts`

A hook installed only by the desktop boot, listening on `document`.

| Key | Action |
|---|---|
| `↑` / `W` | move north |
| `↓` / `S` | move south |
| `←` / `A` | move west |
| `→` / `D` | move east |
| `Space` | `state.attack.trigger()`, when an encounter is present |
| `1`–`9` | the nth enabled hotkey, in the order the dock renders them (the `hotkeyActions` order from `partitionHotkeys`) |
| `Q` | open the Adatbázis overlay |
| `Esc` | close the topmost open modal |

`Q` opens rather than toggles: guard 3 below suppresses every binding except
`Esc` while a modal is open, so `Esc` is the single, consistent way to close one.

Guards, evaluated in order — a keystroke is ignored when:

1. Any of `ctrlKey` / `altKey` / `metaKey` is held (leave browser shortcuts
   alone).
2. `e.target` is an `input`, `textarea`, `select`, or `contenteditable` element.
   The game has a chat field; typing "wasd" must not walk the character into a
   swamp. This guard is what makes letter bindings safe.
3. A modal is open, except for `Esc` (which closes it).

`preventDefault()` is called only on keys actually consumed, so page scrolling
and everything else behave normally otherwise.

Directions are matched from `state.directions` by `dir`; a direction absent from
the current tile has no binding and the key is a no-op.

## 6. Error handling

The premise is augment-not-replace, so **any failure must leave a working game
page**. `bootDesktop` wraps the dock mount and the `enhanceNarration` call in
separate `try`/`catch` blocks, each logging `console.warn('[Larkinor UI] …')`
and continuing. A throwing extractor costs the dock, never the page.

- `extractFreeMove` returning an empty `actions` array (game markup changed)
  renders the dock in its `dbButtonOnly` form rather than an empty bar.
- A failed monster-DB fetch leaves the narration un-enhanced and the dock fully
  functional — the same degradation the mobile path already has.

## 7. Testing

New Vitest files following the existing jsdom + `@testing-library/preact` setup
(`GM_*` mocked in `tests/setup.ts`):

- `tests/platform.test.ts` — the override wins over auto-detection in both
  directions; coarse pointer → mobile; narrow width → mobile; wide viewport with
  a fine pointer → desktop.
- `tests/enhanceNarration.test.ts` — wraps a known mention; leaves pre-existing
  `<a>` elements and their listeners intact; idempotent on a second call; no-op
  when the captured name is not in the DB.
- `tests/desktopDock.test.tsx` — renders the enabled hotkeys; omits the attack
  button when `state.attack` is null; `dbButtonOnly` collapses to two buttons.
- `tests/useKeyboardShortcuts.test.ts` — arrow keys fire the matching direction
  trigger; keystrokes originating in an `<input>` are ignored; events with a
  modifier held are ignored.

The existing mobile test suite must pass untouched — that is the regression
signal for the `boot.ts` move.

Verification gate before the work is called done: `npx tsc --noEmit`,
`npm test`, `npm run build`.

## Out of scope for v1

Stated as decisions, not oversights:

- **Battle-page dock** (monster card plus one-click attack/flee/spell on
  `otHarc`). The natural second increment.
- **Shop and Home desktop enhancements.**
- **Item-name inspection** anywhere other than through the Adatbázis overlay,
  which already provides weapon/armor/item lookup.

## File plan

| Path | Change |
|---|---|
| `src/main.ts` | reduced to detect + dispatch |
| `src/mobile/boot.ts` | new — today's `boot()` body, moved verbatim |
| `src/utils/platform.ts` | new — `detectPlatform` |
| `src/utils/config.ts` | add platform-override and dock-collapsed accessors |
| `src/desktop/boot.ts` | new — desktop boot |
| `src/desktop/DesktopDock.tsx` | new — the dock |
| `src/desktop/enhanceNarration.ts` | new — in-place narration links |
| `src/desktop/useKeyboardShortcuts.ts` | new — keyboard bindings |
| `src/desktop/desktop.css` | new — dock + centered-modal styles |
| `src/components/ConfigDrawer.tsx` | add platform toggle, `variant` prop |
| `src/components/MonsterCard.tsx` | add `variant` prop |
| `src/shared/styles/theme.css` | add `.lc-drawer-backdrop--center`, `.lc-narr-link` |
| `tests/*` | four new test files |
