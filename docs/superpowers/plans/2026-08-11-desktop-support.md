# Desktop Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Larkinor userscript a desktop mode that augments the game page (fixed quick-action dock, clickable monster names, keyboard shortcuts) instead of replacing it, while the existing mobile full-replacement UI keeps working unchanged.

**Architecture:** A platform switch in `src/main.ts` dispatches to one of two boot modules. `src/mobile/boot.ts` receives today's boot body verbatim (proxy-DOM: extract → `hideOriginalDOM` → mount `#lc-root`). `src/desktop/boot.ts` never hides the game DOM; it mounts a fixed-position `#lc-dock-root` and enhances the original narration in place. Both reuse the same read-only extractors, data layer, hooks and modal components.

**Tech Stack:** Vite + Preact + TypeScript, `vite-plugin-monkey` (userscript build), Vitest + `@testing-library/preact` in jsdom, ViolentMonkey `GM_*` APIs (mocked in `tests/setup.ts`).

**Spec:** `docs/superpowers/specs/2026-08-11-desktop-support-design.md`

## Global Constraints

- **All comments and identifiers in English.** UI copy stays Hungarian (the game is Hungarian).
- **Never add hardcoded hex/rgba in CSS rule bodies.** Declare a variable in the `:root` block of `src/shared/styles/theme.css` and reference it.
- **Every CSS selector must be scoped** under `#lc-root`, `#lc-dock-root`, or a `.lc-*` / `.lc-db` class. An unscoped element selector would restyle the live game page, which stays visible in desktop mode.
- **Never parse or reconstruct the game's inline `onclick` handlers.** Locate the original control and call `.click()` on it.
- **Never assign `innerHTML` on any node inside the live game DOM.** It destroys the game's own `<a>` handlers. Mutate text nodes only.
- **Desktop mode must never break the game page.** Every desktop enhancement is wrapped so a failure logs `console.warn('[Larkinor UI] …')` and leaves a working page.
- Any temporary/scratch file goes in the git-ignored repo-root `.tmp/`.
- Type-check with `npx tsc --noEmit`; tests with `npm test`; full build with `npm run build`.
- Work happens on branch `feature/desktop-support` (already created).

## File Structure

| Path | Responsibility | Task |
|---|---|---|
| `src/utils/platform.ts` | **New.** `Platform` type + `detectPlatform(win)`. Pure w.r.t. the `Window` handed in. | 1 |
| `src/utils/config.ts` | **Modify.** Add platform-override and dock-collapsed GM accessors. | 1 |
| `src/components/drawer.ts` | **New.** `DrawerVariant` type + `backdropClass()` — the sheet/modal class decision, shared by the two drawer components. | 2 |
| `src/shared/styles/theme.css` | **Modify.** Add `--dock-shadow` var, `.lc-drawer-backdrop--center`, `lc-fade-in` keyframes, `.lc-narr-link`, `.lc-config-platform*`. | 2, 3 |
| `src/components/MonsterCard.tsx` | **Modify.** Accept `variant` prop. | 2 |
| `src/components/ConfigDrawer.tsx` | **Modify.** Accept `variant` prop (task 2); add the platform toggle section (task 3). | 2, 3 |
| `src/desktop/DesktopDock.tsx` | **New.** The fixed dock: quick actions, attack, config + database buttons, collapse toggle, and owner of all desktop modal state. | 4 |
| `src/desktop/desktop.css` | **New.** Dock-only styles, all scoped under `#lc-dock-root` / `.lc-dock-*`. | 4 |
| `src/desktop/enhanceNarration.ts` | **New.** Wraps monster mentions in the live narration block with `.lc-narr-link` anchors. | 5 |
| `src/desktop/useKeyboardShortcuts.ts` | **New.** Document-level key bindings with the input/modifier/modal guards. | 6 |
| `src/desktop/boot.ts` | **New.** Desktop boot: detect page, extract (FreeMove only), mount the dock, load the monster DB. | 7 |
| `src/mobile/boot.ts` | **New.** Today's `boot()` body, moved verbatim and exported as `bootMobile(doc)`. | 8 |
| `src/main.ts` | **Modify.** Reduced to platform detection + dispatch. | 8 |

New tests: `tests/platform.test.ts` (1), `tests/drawer.test.ts` (2), `tests/desktopDock.test.tsx` (4), `tests/enhanceNarration.test.ts` (5), `tests/useKeyboardShortcuts.test.ts` (6), `tests/desktopBoot.test.ts` (7), `tests/mobileBoot.test.ts` (8). Extended: `tests/config.test.ts` (1), `tests/MonsterCard.test.tsx` (2), `tests/ConfigDrawer.test.tsx` (2, 3).

### One refinement against the spec

The spec's data-flow sketch has `bootDesktop` call `enhanceNarration(...)` directly. In this plan **`DesktopDock` calls it from a `useEffect`** instead, because the dock — not the boot — owns the `selectedMonster` state that the click handler must set, and it already receives `db`. Wiring it from the boot would need a mutable callback holder or an imperative handle for no benefit. Every spec requirement is preserved: the call is still `try`/`catch`-wrapped so a failure only costs the narration links, and `data-lc-enhanced` still makes it idempotent across re-renders.

---

### Task 1: Platform detection and config accessors

**Files:**
- Create: `src/utils/platform.ts`
- Modify: `src/utils/config.ts` (append)
- Create test: `tests/platform.test.ts`
- Modify test: `tests/config.test.ts` (append two describe blocks)

**Interfaces:**
- Consumes: `GM_getValue` / `GM_setValue` globals (mocked in `tests/setup.ts`).
- Produces:
  - `type Platform = 'mobile' | 'desktop'` and `detectPlatform(win: Window): Platform` from `@/utils/platform`
  - `PLATFORM_OVERRIDE_KEY: string`, `DOCK_COLLAPSED_KEY: string`, `getPlatformOverride(): Platform | null`, `setPlatformOverride(value: Platform | null): void`, `getDockCollapsed(): boolean`, `setDockCollapsed(value: boolean): void` from `@/utils/config`

**Note on the import direction:** `config.ts` imports `Platform` from `platform.ts` with a **type-only** `import type`, and `platform.ts` imports the override functions from `config.ts` at runtime. A type-only import is erased at build time, so there is no runtime cycle. Write it exactly as shown.

- [ ] **Step 1: Write the failing tests for `detectPlatform`**

Create `tests/platform.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { detectPlatform } from '../src/utils/platform';
import { PLATFORM_OVERRIDE_KEY, setPlatformOverride } from '../src/utils/config';

/** Minimal Window stand-in: detectPlatform only reads matchMedia and innerWidth. */
function fakeWin(opts: { coarse: boolean; width: number }): Window {
  return {
    innerWidth: opts.width,
    matchMedia: (query: string) => ({
      matches: query.includes('coarse') ? opts.coarse : false,
    }),
  } as unknown as Window;
}

const DESKTOP_WIN = fakeWin({ coarse: false, width: 1440 });
const PHONE_WIN = fakeWin({ coarse: true, width: 412 });

describe('detectPlatform', () => {
  beforeEach(() => {
    GM_setValue(PLATFORM_OVERRIDE_KEY, '');
  });

  it('auto-detects desktop for a wide viewport with a fine pointer', () => {
    expect(detectPlatform(DESKTOP_WIN)).toBe('desktop');
  });

  it('auto-detects mobile for a coarse pointer regardless of width', () => {
    expect(detectPlatform(fakeWin({ coarse: true, width: 1440 }))).toBe('mobile');
  });

  it('auto-detects mobile for a narrow viewport even with a fine pointer', () => {
    expect(detectPlatform(fakeWin({ coarse: false, width: 800 }))).toBe('mobile');
  });

  it('treats exactly 900px as desktop (the threshold is exclusive)', () => {
    expect(detectPlatform(fakeWin({ coarse: false, width: 900 }))).toBe('desktop');
  });

  it('lets a stored desktop override win over mobile auto-detection', () => {
    setPlatformOverride('desktop');
    expect(detectPlatform(PHONE_WIN)).toBe('desktop');
  });

  it('lets a stored mobile override win over desktop auto-detection', () => {
    setPlatformOverride('mobile');
    expect(detectPlatform(DESKTOP_WIN)).toBe('mobile');
  });

  it('falls back to auto-detection once the override is cleared', () => {
    setPlatformOverride('mobile');
    setPlatformOverride(null);
    expect(detectPlatform(DESKTOP_WIN)).toBe('desktop');
  });

  it('ignores a garbage override value and auto-detects', () => {
    GM_setValue(PLATFORM_OVERRIDE_KEY, 'tablet');
    expect(detectPlatform(DESKTOP_WIN)).toBe('desktop');
  });
});
```

- [ ] **Step 2: Write the failing tests for the new config accessors**

Append to `tests/config.test.ts`:

```ts
import {
  getPlatformOverride,
  setPlatformOverride,
  PLATFORM_OVERRIDE_KEY,
  getDockCollapsed,
  setDockCollapsed,
  DOCK_COLLAPSED_KEY,
} from '../src/utils/config';

describe('platform-override config', () => {
  it('returns null when nothing is stored', () => {
    GM_setValue(PLATFORM_OVERRIDE_KEY, '');
    expect(getPlatformOverride()).toBeNull();
  });

  it('round-trips each platform through GM storage', () => {
    setPlatformOverride('desktop');
    expect(getPlatformOverride()).toBe('desktop');
    setPlatformOverride('mobile');
    expect(getPlatformOverride()).toBe('mobile');
  });

  it('clears the override when set to null', () => {
    setPlatformOverride('desktop');
    setPlatformOverride(null);
    expect(getPlatformOverride()).toBeNull();
  });

  it('returns null for an unrecognised stored value', () => {
    GM_setValue(PLATFORM_OVERRIDE_KEY, 'tablet');
    expect(getPlatformOverride()).toBeNull();
  });
});

describe('dock-collapsed config', () => {
  it('defaults to expanded when nothing is stored', () => {
    GM_setValue(DOCK_COLLAPSED_KEY, '');
    expect(getDockCollapsed()).toBe(false);
  });

  it('round-trips the collapsed flag through GM storage', () => {
    setDockCollapsed(true);
    expect(getDockCollapsed()).toBe(true);
    setDockCollapsed(false);
    expect(getDockCollapsed()).toBe(false);
  });
});
```

Note: `tests/config.test.ts` already imports `describe, it, expect` from `vitest` at the top — do not duplicate that import, just add the `../src/utils/config` import members to the existing import statement or add a second import line for the new names.

- [ ] **Step 3: Run both test files to verify they fail**

Run: `npx vitest run tests/platform.test.ts tests/config.test.ts`
Expected: FAIL — `tests/platform.test.ts` cannot resolve `../src/utils/platform`, and `config.test.ts` reports the new exports as undefined.

- [ ] **Step 4: Append the config accessors**

Append to `src/utils/config.ts`:

```ts
/** GM storage key holding the manual mobile/desktop override ('' = automatic). */
export const PLATFORM_OVERRIDE_KEY = 'lc-platform-override';

/** GM storage key holding the desktop dock's collapsed flag. */
export const DOCK_COLLAPSED_KEY = 'lc-dock-collapsed';

/**
 * The user's manual platform choice, or null for automatic detection. Values
 * other than the two known platforms are treated as "no override" so a stale or
 * hand-edited key degrades to auto-detection rather than a broken UI.
 */
export function getPlatformOverride(): Platform | null {
  const raw = GM_getValue(PLATFORM_OVERRIDE_KEY, '');
  return raw === 'mobile' || raw === 'desktop' ? raw : null;
}

export function setPlatformOverride(value: Platform | null): void {
  GM_setValue(PLATFORM_OVERRIDE_KEY, value ?? '');
}

/** Whether the desktop dock is collapsed to its handle. */
export function getDockCollapsed(): boolean {
  return GM_getValue(DOCK_COLLAPSED_KEY, '') === 'true';
}

export function setDockCollapsed(value: boolean): void {
  GM_setValue(DOCK_COLLAPSED_KEY, value ? 'true' : '');
}
```

Add this type-only import at the top of `src/utils/config.ts` (below the existing header comment, above `ENABLED_HOTKEYS_KEY`):

```ts
import type { Platform } from '@/utils/platform';
```

- [ ] **Step 5: Create `src/utils/platform.ts`**

```ts
// Chooses between the two UIs. Mobile replaces the whole page (proxy-DOM);
// desktop leaves the game page in place and only augments it. The decision is
// made once per page load in src/main.ts.

import { getPlatformOverride } from '@/utils/config';

export type Platform = 'mobile' | 'desktop';

/**
 * Viewport width below which we assume the phone/tablet UI, used only as a
 * fallback: desktop browsers in responsive-design mode report a fine pointer
 * even while emulating a phone, so width has to back up the media query.
 */
export const MOBILE_MAX_WIDTH = 900;

/**
 * Resolves the UI to render. A stored override always wins; otherwise a coarse
 * pointer (phone/tablet) or a narrow viewport selects the mobile UI.
 *
 * Reads the environment only through the `win` it is handed, so tests can pass
 * a stand-in with a fake `matchMedia` / `innerWidth`.
 */
export function detectPlatform(win: Window): Platform {
  const override = getPlatformOverride();
  if (override) return override;

  const coarsePointer = win.matchMedia('(pointer: coarse)').matches;
  if (coarsePointer || win.innerWidth < MOBILE_MAX_WIDTH) return 'mobile';
  return 'desktop';
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/platform.test.ts tests/config.test.ts`
Expected: PASS — all 8 `detectPlatform` cases and all 6 new config cases green.

- [ ] **Step 7: Type-check and run the full suite**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; the whole suite passes (nothing else changed yet).

- [ ] **Step 8: Commit**

```bash
git add src/utils/platform.ts src/utils/config.ts tests/platform.test.ts tests/config.test.ts
git commit -m "feat(platform): mobile/desktop detection with a stored override"
```

---

### Task 2: Desktop modal variant for the shared drawers

**Files:**
- Create: `src/components/drawer.ts`
- Modify: `src/shared/styles/theme.css` (add `:root` var, backdrop variant, keyframes, `.lc-narr-link`)
- Modify: `src/components/MonsterCard.tsx`
- Modify: `src/components/ConfigDrawer.tsx`
- Create test: `tests/drawer.test.ts`
- Modify test: `tests/MonsterCard.test.tsx`, `tests/ConfigDrawer.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `type DrawerVariant = 'sheet' | 'modal'` and `backdropClass(variant: DrawerVariant): string` from `@/components/drawer`
  - `MonsterCardProps.variant?: DrawerVariant` and `ConfigDrawerProps.variant?: DrawerVariant`, both defaulting to `'sheet'`
  - CSS classes `.lc-drawer-backdrop--center` and `.lc-narr-link`; CSS variable `--dock-shadow`

The mobile UI keeps passing nothing, so its rendering is byte-identical — that is what the untouched existing assertions in `MonsterCard.test.tsx` / `ConfigDrawer.test.tsx` verify.

- [ ] **Step 1: Write the failing test for `backdropClass`**

Create `tests/drawer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { backdropClass } from '../src/components/drawer';

describe('backdropClass', () => {
  it('returns the bare backdrop class for the sheet variant', () => {
    expect(backdropClass('sheet')).toBe('lc-drawer-backdrop');
  });

  it('adds the centering modifier for the modal variant', () => {
    expect(backdropClass('modal')).toBe('lc-drawer-backdrop lc-drawer-backdrop--center');
  });

  it('keeps the base class first so backdrop-click detection still matches', () => {
    // MonsterCard/ConfigDrawer close on a click whose target carries
    // 'lc-drawer-backdrop' — the modifier must be additive, never a replacement.
    expect(backdropClass('modal').split(' ')).toContain('lc-drawer-backdrop');
  });
});
```

- [ ] **Step 2: Write the failing variant tests for the two components**

Append to `tests/MonsterCard.test.tsx` (inside the existing `describe('MonsterCard', ...)` block, or as a new describe at the end — either is fine; `MONSTER` is already defined at module scope):

```tsx
  it('renders as a bottom sheet by default', () => {
    const { container } = render(<MonsterCard monster={MONSTER} onClose={vi.fn()} />);
    const backdrop = container.querySelector('.lc-drawer-backdrop')!;
    expect(backdrop.classList.contains('lc-drawer-backdrop--center')).toBe(false);
  });

  it('renders as a centered modal when the modal variant is requested', () => {
    const { container } = render(
      <MonsterCard monster={MONSTER} onClose={vi.fn()} variant="modal" />
    );
    const backdrop = container.querySelector('.lc-drawer-backdrop')!;
    expect(backdrop.classList.contains('lc-drawer-backdrop--center')).toBe(true);
  });

  it('still closes on a backdrop click in the modal variant', () => {
    const onClose = vi.fn();
    const { container } = render(
      <MonsterCard monster={MONSTER} onClose={onClose} variant="modal" />
    );
    fireEvent.click(container.querySelector('.lc-drawer-backdrop')!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
```

Append to `tests/ConfigDrawer.test.tsx`:

```tsx
  it('renders as a centered modal when the modal variant is requested', () => {
    const { container } = render(
      <ConfigDrawer enabled={[]} onToggle={vi.fn()} onClose={vi.fn()} variant="modal" />
    );
    expect(
      container.querySelector('.lc-drawer-backdrop')!.classList.contains('lc-drawer-backdrop--center')
    ).toBe(true);
  });
```

Check the existing import lines in each file first — `render`, `fireEvent` and `vi` may already be imported; add only what is missing.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/drawer.test.ts tests/MonsterCard.test.tsx tests/ConfigDrawer.test.tsx`
Expected: FAIL — `../src/components/drawer` does not resolve, and the `variant` prop is rejected / has no effect.

- [ ] **Step 4: Create `src/components/drawer.ts`**

```ts
// Shared sheet/modal decision for the bottom-drawer components. Mobile shows
// them as bottom sheets; desktop shows the same components as centered modals,
// so only the backdrop class differs.

export type DrawerVariant = 'sheet' | 'modal';

/**
 * Backdrop class list for a drawer variant. The base class stays first and is
 * always present — both drawers close by testing the click target for
 * 'lc-drawer-backdrop', so the modal form must be additive.
 */
export function backdropClass(variant: DrawerVariant): string {
  return variant === 'modal'
    ? 'lc-drawer-backdrop lc-drawer-backdrop--center'
    : 'lc-drawer-backdrop';
}
```

- [ ] **Step 5: Add the `variant` prop to `MonsterCard`**

In `src/components/MonsterCard.tsx`, add the import:

```tsx
import { backdropClass, type DrawerVariant } from '@/components/drawer';
```

Add to `MonsterCardProps`:

```tsx
  /** 'sheet' (mobile bottom drawer) or 'modal' (desktop centered dialog). */
  variant?: DrawerVariant;
```

Change the signature and the backdrop element:

```tsx
export function MonsterCard({ monster, onClose, onItemClick, variant = 'sheet' }: MonsterCardProps) {
```

```tsx
    <div class={backdropClass(variant)} onClick={handleBackdropClick}>
```

Leave `handleBackdropClick` exactly as it is — its `classList.contains('lc-drawer-backdrop')` check still matches.

- [ ] **Step 6: Add the `variant` prop to `ConfigDrawer`**

In `src/components/ConfigDrawer.tsx`, add the same import, add to `ConfigDrawerProps`:

```tsx
  /** 'sheet' (mobile bottom drawer) or 'modal' (desktop centered dialog). */
  variant?: DrawerVariant;
```

and update the signature and backdrop:

```tsx
export function ConfigDrawer({ enabled, onToggle, onClose, variant = 'sheet' }: ConfigDrawerProps): JSX.Element {
```

```tsx
    <div class={backdropClass(variant)} onClick={handleBackdropClick}>
```

- [ ] **Step 7: Add the CSS**

In `src/shared/styles/theme.css`, add to the `:root` block (after the `--sea` line):

```css
  --dock-shadow: rgba(0, 0, 0, 0.5);
```

Then, immediately after the existing `@keyframes lc-slide-up` block, add:

```css
/* Desktop variant: the same drawer components as a centered modal dialog. */
.lc-drawer-backdrop--center {
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.lc-drawer-backdrop--center > .lc-drawer {
  position: relative;
  width: auto;
  min-width: 320px;
  max-width: 520px;
  max-height: 84dvh;
  border: 1px solid var(--border);
  border-radius: 12px;
  animation: lc-fade-in 0.15s ease-out;
}

@keyframes lc-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

/* Monster name made clickable inside the live game narration (desktop only). */
.lc-narr-link {
  color: var(--accent);
  border-bottom: 1px dotted var(--accent);
  cursor: pointer;
}
```

The `> .lc-drawer` overrides matter: the base rule sets `width: 100%`, `border-top: 2px`, `border-radius: 12px 12px 0 0` and the slide-up animation, all wrong for a centered dialog.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run tests/drawer.test.ts tests/MonsterCard.test.tsx tests/ConfigDrawer.test.tsx`
Expected: PASS — including every pre-existing assertion in the two component test files, which is the proof mobile rendering is unchanged.

- [ ] **Step 9: Type-check and run the full suite**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; full suite passes.

- [ ] **Step 10: Commit**

```bash
git add src/components/drawer.ts src/components/MonsterCard.tsx src/components/ConfigDrawer.tsx src/shared/styles/theme.css tests/drawer.test.ts tests/MonsterCard.test.tsx tests/ConfigDrawer.test.tsx
git commit -m "feat(ui): centered-modal variant for the shared drawers"
```

---

### Task 3: Platform toggle in the config drawer

**Files:**
- Modify: `src/components/ConfigDrawer.tsx`
- Modify: `src/shared/styles/theme.css`
- Modify test: `tests/ConfigDrawer.test.tsx`

**Interfaces:**
- Consumes: `getPlatformOverride` / `setPlatformOverride` and `type Platform` (task 1); `DrawerVariant` (task 2).
- Produces: a three-button `.lc-config-platform` group inside `ConfigDrawer`, each button carrying `data-platform="auto" | "mobile" | "desktop"` and `aria-pressed`.

`ConfigDrawer` writes the override itself rather than taking a prop, mirroring how it already delegates hotkey persistence — but the write goes straight to GM storage here because no on-screen state depends on it until the next page load. The Hungarian copy is fixed: heading **"Felület"**, buttons **"Automatikus"**, **"Mobil"**, **"Asztali"**, plus the note **"A váltás a következő oldalbetöltéskor lép érvénybe."**

- [ ] **Step 1: Write the failing tests**

Append to `tests/ConfigDrawer.test.tsx`:

```tsx
describe('ConfigDrawer platform toggle', () => {
  it('marks Automatikus as active when no override is stored', () => {
    setPlatformOverride(null);
    const { container } = render(
      <ConfigDrawer enabled={[]} onToggle={vi.fn()} onClose={vi.fn()} />
    );
    const auto = container.querySelector('[data-platform="auto"]')!;
    expect(auto.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('[data-platform="mobile"]')!.getAttribute('aria-pressed')).toBe('false');
  });

  it('marks the stored override as active', () => {
    setPlatformOverride('desktop');
    const { container } = render(
      <ConfigDrawer enabled={[]} onToggle={vi.fn()} onClose={vi.fn()} />
    );
    expect(container.querySelector('[data-platform="desktop"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('[data-platform="auto"]')!.getAttribute('aria-pressed')).toBe('false');
  });

  it('persists the chosen override and reflects it immediately', () => {
    setPlatformOverride(null);
    const { container } = render(
      <ConfigDrawer enabled={[]} onToggle={vi.fn()} onClose={vi.fn()} />
    );
    fireEvent.click(container.querySelector('[data-platform="mobile"]')!);
    expect(getPlatformOverride()).toBe('mobile');
    expect(container.querySelector('[data-platform="mobile"]')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('clears the override when Automatikus is chosen', () => {
    setPlatformOverride('desktop');
    const { container } = render(
      <ConfigDrawer enabled={[]} onToggle={vi.fn()} onClose={vi.fn()} />
    );
    fireEvent.click(container.querySelector('[data-platform="auto"]')!);
    expect(getPlatformOverride()).toBeNull();
  });

  it('keeps the hotkey section working alongside the toggle', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ConfigDrawer enabled={[]} onToggle={onToggle} onClose={vi.fn()} />
    );
    fireEvent.click(container.querySelector('[data-key="kajal"]')!);
    expect(onToggle).toHaveBeenCalledWith('kajal');
  });
});
```

Add to the imports at the top of the file:

```tsx
import { getPlatformOverride, setPlatformOverride } from '../src/utils/config';
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/ConfigDrawer.test.tsx`
Expected: FAIL — `container.querySelector('[data-platform="auto"]')` is null, so the non-null assertion throws.

- [ ] **Step 3: Add the toggle to `ConfigDrawer`**

In `src/components/ConfigDrawer.tsx`, add imports:

```tsx
import { useState } from 'preact/hooks';
import { getPlatformOverride, setPlatformOverride } from '@/utils/config';
import type { Platform } from '@/utils/platform';
```

Above the component, add the option table:

```tsx
/** 'auto' is the absence of an override; the other two force a UI. */
type PlatformChoice = 'auto' | Platform;

const PLATFORM_CHOICES: { value: PlatformChoice; label: string }[] = [
  { value: 'auto', label: 'Automatikus' },
  { value: 'mobile', label: 'Mobil' },
  { value: 'desktop', label: 'Asztali' },
];
```

Inside the component, above the `return`:

```tsx
  const [platform, setPlatform] = useState<PlatformChoice>(() => getPlatformOverride() ?? 'auto');

  const choosePlatform = (choice: PlatformChoice) => {
    setPlatform(choice);
    setPlatformOverride(choice === 'auto' ? null : choice);
  };
```

Then, inside `.lc-drawer` after the closing `</div>` of `.lc-config-hotkeys`, add:

```tsx
        <h2 class="lc-config-title">Felület</h2>
        <div class="lc-config-platform">
          {PLATFORM_CHOICES.map(choice => (
            <button
              key={choice.value}
              class={`lc-config-platform-btn${platform === choice.value ? ' lc-config-platform-btn--on' : ''}`}
              data-platform={choice.value}
              aria-pressed={platform === choice.value}
              onClick={() => choosePlatform(choice.value)}
            >
              {choice.label}
            </button>
          ))}
        </div>
        <p class="lc-config-note">A váltás a következő oldalbetöltéskor lép érvénybe.</p>
```

- [ ] **Step 4: Add the CSS**

In `src/shared/styles/theme.css`, after the existing `.lc-config-hotkey-check` rule, add:

```css
.lc-config-platform { display: flex; gap: 6px; margin-bottom: 8px; }
.lc-config-platform-btn {
  flex: 1;
  padding: 8px 10px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
}
.lc-config-platform-btn--on { border-color: var(--accent); background: var(--accent-dim); color: var(--accent); }
.lc-config-note { margin: 0; font-size: 11px; color: var(--muted); }
```

Note the existing `.lc-config-title` rule already has `margin: 0 0 12px`; the second heading reuses it, which is intended.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/ConfigDrawer.test.tsx`
Expected: PASS — the five new cases plus every pre-existing one.

- [ ] **Step 6: Type-check and run the full suite**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; full suite passes.

- [ ] **Step 7: Commit**

```bash
git add src/components/ConfigDrawer.tsx src/shared/styles/theme.css tests/ConfigDrawer.test.tsx
git commit -m "feat(config): three-way platform toggle in the config drawer"
```

---

### Task 4: The desktop dock

**Files:**
- Create: `src/desktop/DesktopDock.tsx`
- Create: `src/desktop/desktop.css`
- Create test: `tests/desktopDock.test.tsx`

**Interfaces:**
- Consumes: `getDockCollapsed` / `setDockCollapsed` (task 1); `backdropClass` indirectly via the `variant="modal"` props (task 2); the existing `FreeMoveState`, `Action`, `partitionHotkeys`, `getHotkey`, `hotkeyIconUrl`, `useHotkeyConfig`, `MonsterCard`, `ConfigDrawer`, `DatabaseOverlay`, `MonsterDatabase`.
- Produces: `DesktopDock` component with props
  `{ doc: Document; state: FreeMoveState | null; db: MonsterDatabase | null; dbButtonOnly?: boolean }`,
  and the class names `.lc-dock`, `.lc-dock--collapsed`, `.lc-dock-toggle`, `.lc-dock-row`, `.lc-dock-hotkey`, `.lc-dock-btn`, `.lc-dock-btn--attack`, `.lc-dock-icon`.

The `doc` prop is threaded now because tasks 5 and 6 both need it; in this task it is stored but not yet read. Tasks 5 and 6 modify this same file to use it.

`minimal` mode (the `dbButtonOnly` form) is entered when `dbButtonOnly` is set, `state` is null, **or** `state.actions` is empty — the last case is the spec's "game markup changed" degradation.

- [ ] **Step 1: Write the failing tests**

Create `tests/desktopDock.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/preact';
import { DesktopDock } from '../src/desktop/DesktopDock';
import { DOCK_COLLAPSED_KEY, ENABLED_HOTKEYS_KEY } from '../src/utils/config';
import type { FreeMoveState } from '../src/utils/domExtract';

function makeState(overrides: Partial<FreeMoveState> = {}): FreeMoveState {
  return {
    playerName: 'Remy',
    gold: 100,
    hp: 200,
    hpMax: 300,
    mp: 50,
    mpMax: 80,
    locationImageUrl: '',
    locationName: 'harcos-negyed',
    directions: [],
    buildings: [],
    attack: null,
    settingsButton: null,
    restButton: null,
    statusIcons: [],
    actions: [
      { label: 'kajálsz', actionKey: 'kajal', trigger: vi.fn() },
      { label: 'imádkozol', actionKey: 'imadkozas', trigger: vi.fn() },
      { label: 'ásol', actionKey: 'as', trigger: vi.fn() },
    ],
    narration: '',
    narrationLinks: [],
    ...overrides,
  };
}

describe('DesktopDock', () => {
  beforeEach(() => {
    GM_setValue(DOCK_COLLAPSED_KEY, '');
    GM_setValue(ENABLED_HOTKEYS_KEY, '[]');
  });

  it('renders enabled actions as icon hotkeys and the rest as text buttons', () => {
    GM_setValue(ENABLED_HOTKEYS_KEY, JSON.stringify(['kajal']));
    const { container } = render(
      <DesktopDock doc={document} state={makeState()} db={null} />
    );
    expect(container.querySelectorAll('.lc-dock-hotkey').length).toBe(1);
    // The two non-enabled actions fall through to text buttons.
    const labels = Array.from(container.querySelectorAll('.lc-dock-btn')).map(b => b.textContent);
    expect(labels).toContain('imádkozol');
    expect(labels).toContain('ásol');
  });

  it('fires the original action trigger when a hotkey is clicked', () => {
    GM_setValue(ENABLED_HOTKEYS_KEY, JSON.stringify(['kajal']));
    const state = makeState();
    const { container } = render(<DesktopDock doc={document} state={state} db={null} />);
    fireEvent.click(container.querySelector('.lc-dock-hotkey')!);
    expect(state.actions[0].trigger).toHaveBeenCalledTimes(1);
  });

  it('omits the attack button when there is no encounter', () => {
    const { container } = render(<DesktopDock doc={document} state={makeState()} db={null} />);
    expect(container.querySelector('.lc-dock-btn--attack')).toBeNull();
  });

  it('renders the attack button and fires its trigger during an encounter', () => {
    const attack = { label: 'Támadás!!!', iconUrl: 'https://l2.larkinor.hu/2/ikon/tamadas.gif', trigger: vi.fn() };
    const { container } = render(
      <DesktopDock doc={document} state={makeState({ attack })} db={null} />
    );
    const btn = container.querySelector('.lc-dock-btn--attack')!;
    fireEvent.click(btn);
    expect(attack.trigger).toHaveBeenCalledTimes(1);
  });

  it('shows only the config and database buttons in dbButtonOnly mode', () => {
    const { container } = render(
      <DesktopDock doc={document} state={null} db={null} dbButtonOnly />
    );
    expect(container.querySelector('.lc-dock-hotkey')).toBeNull();
    expect(container.querySelector('.lc-dock-config')).not.toBeNull();
    expect(container.querySelector('.lc-dock-db')).not.toBeNull();
  });

  it('degrades to dbButtonOnly when the action list comes back empty', () => {
    const { container } = render(
      <DesktopDock doc={document} state={makeState({ actions: [] })} db={null} />
    );
    expect(container.querySelector('.lc-dock-btn--attack')).toBeNull();
    expect(container.querySelector('.lc-dock-db')).not.toBeNull();
  });

  it('opens the database overlay from the dock button', () => {
    const { container } = render(<DesktopDock doc={document} state={makeState()} db={null} />);
    expect(container.querySelector('.lc-db-overlay')).toBeNull();
    fireEvent.click(container.querySelector('.lc-dock-db')!);
    expect(container.querySelector('.lc-db-overlay')).not.toBeNull();
  });

  it('opens the config drawer as a centered modal', () => {
    const { container } = render(<DesktopDock doc={document} state={makeState()} db={null} />);
    fireEvent.click(container.querySelector('.lc-dock-config')!);
    const backdrop = container.querySelector('.lc-drawer-backdrop')!;
    expect(backdrop.classList.contains('lc-drawer-backdrop--center')).toBe(true);
  });

  it('collapses and persists the collapsed flag', () => {
    const { container } = render(<DesktopDock doc={document} state={makeState()} db={null} />);
    fireEvent.click(container.querySelector('.lc-dock-toggle')!);
    expect(container.querySelector('.lc-dock--collapsed')).not.toBeNull();
    expect(GM_getValue(DOCK_COLLAPSED_KEY, '')).toBe('true');
    // Collapsed dock hides the action rows but keeps the toggle reachable.
    expect(container.querySelector('.lc-dock-row')).toBeNull();
    expect(container.querySelector('.lc-dock-toggle')).not.toBeNull();
  });

  it('starts collapsed when the stored flag says so', () => {
    GM_setValue(DOCK_COLLAPSED_KEY, 'true');
    const { container } = render(<DesktopDock doc={document} state={makeState()} db={null} />);
    expect(container.querySelector('.lc-dock--collapsed')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/desktopDock.test.tsx`
Expected: FAIL — cannot resolve `../src/desktop/DesktopDock`.

- [ ] **Step 3: Create `src/desktop/DesktopDock.tsx`**

```tsx
import { h, type JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { FreeMoveState } from '@/utils/domExtract';
import type { MonsterDatabase, Monster } from '@/shared/data/monsters';
import { partitionHotkeys, getHotkey, hotkeyIconUrl } from '@/utils/hotkeys';
import { useHotkeyConfig } from '@/hooks/useHotkeyConfig';
import { getDockCollapsed, setDockCollapsed } from '@/utils/config';
import { MonsterCard } from '@/components/MonsterCard';
import { ConfigDrawer } from '@/components/ConfigDrawer';
import { DatabaseOverlay } from '@/components/DatabaseOverlay';

export interface DesktopDockProps {
  /** The live game document — narration enhancement and key bindings target it. */
  doc: Document;
  /** Free-move state, or null on pages where we only offer the DB button. */
  state: FreeMoveState | null;
  db: MonsterDatabase | null;
  /** Force the minimal (config + database) form regardless of state. */
  dbButtonOnly?: boolean;
}

/**
 * Fixed, collapsible companion bar for desktop. Unlike the mobile pages this
 * adds to the game UI rather than replacing it, so it renders no stats or
 * navigation — only the affordances the desktop page lacks: one-click quick
 * actions (the game needs a select + submit for each), the encounter attack
 * button, and the config/database entry points.
 *
 * It also owns every desktop modal, because the narration links added by
 * enhanceNarration and the keyboard shortcuts both open them.
 */
export function DesktopDock({ doc, state, db, dbButtonOnly = false }: DesktopDockProps): JSX.Element {
  const [collapsed, setCollapsed] = useState(() => getDockCollapsed());
  const [selectedMonster, setSelectedMonster] = useState<Monster | null>(null);
  const [configOpenLocal, setConfigOpenLocal] = useState(false);
  const [dbOpen, setDbOpen] = useState(false);
  const [dbItemId, setDbItemId] = useState<number | null>(null);
  const { enabled, toggleHotkey } = useHotkeyConfig();

  // No actions to offer means nothing but the DB button is useful: either the
  // page genuinely has none, or the game markup changed under us.
  const minimal = dbButtonOnly || !state || state.actions.length === 0;
  const { hotkeyActions, buttonActions } = minimal
    ? { hotkeyActions: [], buttonActions: [] }
    : partitionHotkeys(state.actions, enabled);
  const attack = minimal ? null : state.attack;

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    setDockCollapsed(next);
  };

  const openDatabase = () => {
    setDbItemId(null);
    setDbOpen(true);
  };

  return (
    <div class={`lc-dock${collapsed ? ' lc-dock--collapsed' : ''}`}>
      <button
        class="lc-dock-toggle"
        aria-label={collapsed ? 'Panel kinyitása' : 'Panel becsukása'}
        aria-expanded={!collapsed}
        onClick={toggleCollapsed}
      >
        {collapsed ? '⌃' : '⌄'}
      </button>

      {!collapsed && (
        <>
          {hotkeyActions.length > 0 && (
            <div class="lc-dock-row">
              {hotkeyActions.map((action, i) => {
                const hk = getHotkey(action.actionKey!)!;
                return (
                  <button
                    key={`hk${i}`}
                    class="lc-dock-hotkey"
                    title={hk.label}
                    aria-label={hk.label}
                    onClick={() => action.trigger()}
                  >
                    <img class="lc-dock-icon" src={hotkeyIconUrl(hk)} alt={hk.label} />
                  </button>
                );
              })}
            </div>
          )}

          {buttonActions.length > 0 && (
            <div class="lc-dock-row lc-dock-row--wrap">
              {buttonActions.map((action, i) => (
                <button key={`act${i}`} class="lc-dock-btn" onClick={() => action.trigger()}>
                  {action.label}
                </button>
              ))}
            </div>
          )}

          {attack && (
            <div class="lc-dock-row">
              <button
                class="lc-dock-btn lc-dock-btn--attack"
                title={attack.label}
                onClick={() => attack.trigger()}
              >
                {attack.iconUrl && <img class="lc-dock-icon" src={attack.iconUrl} alt="" />}
                <span>{attack.label}</span>
              </button>
            </div>
          )}

          <div class="lc-dock-row">
            <button
              class="lc-dock-btn lc-dock-config"
              aria-label="Beállítások"
              title="Beállítások"
              onClick={() => setConfigOpenLocal(true)}
            >
              ⚙
            </button>
            <button class="lc-dock-btn lc-dock-db" onClick={openDatabase}>
              Adatbázis
            </button>
          </div>
        </>
      )}

      <MonsterCard
        monster={selectedMonster}
        variant="modal"
        onClose={() => setSelectedMonster(null)}
        onItemClick={(id) => { setSelectedMonster(null); setDbItemId(id); setDbOpen(true); }}
      />

      {configOpenLocal && (
        <ConfigDrawer
          enabled={enabled}
          variant="modal"
          onToggle={toggleHotkey}
          onClose={() => setConfigOpenLocal(false)}
        />
      )}

      <DatabaseOverlay open={dbOpen} initialItemId={dbItemId ?? undefined} onClose={() => setDbOpen(false)} />
    </div>
  );
}
```

`useHotkeyConfig` also returns `configOpen` / `openConfig` / `closeConfig`, but the dock keeps its own flag so nothing else has to change in the hook; only `enabled` and `toggleHotkey` are consumed here. The `doc` prop is intentionally unused in this task — tasks 5 and 6 read it. TypeScript will not complain about an unused destructured prop, but if the project's lint setup does, keep it and let tasks 5/6 wire it.

- [ ] **Step 4: Create `src/desktop/desktop.css`**

```css
/* ================================================================
   Larkinor UI — desktop dock
   The game page stays visible in desktop mode, so every selector here
   MUST stay under #lc-dock-root / .lc-dock-*.
   ================================================================ */

#lc-dock-root {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 900;
  font-family: -apple-system, 'Segoe UI', sans-serif;
  font-size: 14px;
  line-height: 1.4;
}

#lc-dock-root *,
#lc-dock-root *::before,
#lc-dock-root *::after {
  box-sizing: border-box;
}

.lc-dock {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 320px;
  padding: 28px 10px 10px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 4px 16px var(--dock-shadow);
  color: var(--text);
}

.lc-dock--collapsed {
  padding: 4px;
  max-width: none;
}

.lc-dock-toggle {
  position: absolute;
  top: 4px;
  right: 6px;
  width: 24px;
  height: 20px;
  padding: 0;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
}

.lc-dock--collapsed .lc-dock-toggle { position: static; }

.lc-dock-toggle:hover { color: var(--accent); border-color: var(--accent); }

.lc-dock-row { display: flex; align-items: center; gap: 6px; }
.lc-dock-row--wrap { flex-wrap: wrap; }

.lc-dock-hotkey {
  width: 36px;
  height: 36px;
  padding: 2px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
}

.lc-dock-hotkey:hover { background: var(--accent-dim); border-color: var(--accent); }

.lc-dock-icon { width: 100%; height: 100%; object-fit: contain; display: block; }

.lc-dock-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
}

.lc-dock-btn:hover { background: var(--accent-dim); border-color: var(--accent); }

.lc-dock-btn--attack { border-color: var(--bad); color: var(--bad); font-weight: bold; }
.lc-dock-btn--attack .lc-dock-icon { width: 20px; height: 20px; }

.lc-dock-db { flex: 1; justify-content: center; }
```

Two `z-index` facts this relies on: `.lc-drawer-backdrop` and `.lc-db-overlay` both sit at `z-index: 1000` in `theme.css`, and the dock is `900` — so modals always cover the dock. Do not raise the dock above 999.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/desktopDock.test.tsx`
Expected: PASS — all 10 cases.

- [ ] **Step 6: Type-check and run the full suite**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; full suite passes.

- [ ] **Step 7: Commit**

```bash
git add src/desktop/DesktopDock.tsx src/desktop/desktop.css tests/desktopDock.test.tsx
git commit -m "feat(desktop): fixed quick-action dock component"
```

---

### Task 5: In-place narration enhancement

**Files:**
- Create: `src/desktop/enhanceNarration.ts`
- Modify: `src/desktop/DesktopDock.tsx` (call it from an effect)
- Create test: `tests/enhanceNarration.test.ts`
- Modify test: `tests/desktopDock.test.tsx` (one case for the wiring)

**Interfaces:**
- Consumes: `findMonsterMentions` + `MonsterMention` from `@/utils/narration`; `MonsterDatabase`, `Monster` from `@/shared/data/monsters`; `.lc-narr-link` from task 2; `DesktopDockProps.doc` from task 4.
- Produces: `enhanceNarration(doc: Document, db: MonsterDatabase, onMonsterClick: (monster: Monster) => void): void`

Behavioural contract:
1. Targets `font[face="Comic sans MS"]`; no-op when absent.
2. No-op when the block already has `data-lc-enhanced` (idempotent).
3. Walks **text nodes only** via `TreeWalker`; never touches `innerHTML`.
4. Skips text nodes already inside an `<a>` — the game's own narration anchors must not gain a nested link.
5. Resolves each captured name via `db.getByName`; unresolved names stay plain text.
6. Sets `data-lc-enhanced` on the block at the end.

- [ ] **Step 1: Write the failing tests**

Create `tests/enhanceNarration.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { enhanceNarration } from '../src/desktop/enhanceNarration';
import { buildMonsterDatabase, type Monster } from '../src/shared/data/monsters';

function makeDoc(bodyHtml: string): Document {
  return new JSDOM(`<html><body>${bodyHtml}</body></html>`).window.document;
}

function monster(name: string, id = 1): Monster {
  return {
    id,
    name,
    image: `/pic/szornyk/${id}_k.gif`,
    level: 3,
    hp: 40,
    mp: 0,
    attackType: 'Szúró/Vágó',
    debuff: '',
    magicWeapon: false,
    location: 'temető',
    drops: [],
  };
}

const DB = buildMonsterDatabase([monster('Sírrabló', 7)]);

/** Wraps the narration text the way the live page does. */
function narrationDoc(inner: string): Document {
  return makeDoc(`<font face="Comic sans MS">${inner}</font>`);
}

describe('enhanceNarration', () => {
  it('wraps a resolved monster mention in a narration link', () => {
    const doc = narrationDoc('Valami Sírrabló csámborog a közelben!');
    enhanceNarration(doc, DB, vi.fn());

    const link = doc.querySelector('a.lc-narr-link');
    expect(link).not.toBeNull();
    expect(link!.textContent).toBe('Sírrabló');
    // Surrounding text survives intact.
    expect(doc.querySelector('font')!.textContent).toBe('Valami Sírrabló csámborog a közelben!');
  });

  it('calls the handler with the resolved monster when the link is clicked', () => {
    const doc = narrationDoc('Valami Sírrabló csámborog a közelben!');
    const onClick = vi.fn();
    enhanceNarration(doc, DB, onClick);

    const link = doc.querySelector<HTMLAnchorElement>('a.lc-narr-link')!;
    link.dispatchEvent(new doc.defaultView!.MouseEvent('click', { bubbles: true }));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0][0].name).toBe('Sírrabló');
  });

  it('leaves an unknown monster name as plain text', () => {
    const doc = narrationDoc('Valami Rettenetes Ismeretlen csámborog a közelben!');
    enhanceNarration(doc, DB, vi.fn());
    expect(doc.querySelector('a.lc-narr-link')).toBeNull();
  });

  it('is a no-op when the narration block is missing', () => {
    const doc = makeDoc('<div>no narration here</div>');
    expect(() => enhanceNarration(doc, DB, vi.fn())).not.toThrow();
    expect(doc.querySelector('a.lc-narr-link')).toBeNull();
  });

  it('is idempotent — a second call adds no further links', () => {
    const doc = narrationDoc('Valami Sírrabló csámborog a közelben!');
    enhanceNarration(doc, DB, vi.fn());
    enhanceNarration(doc, DB, vi.fn());
    expect(doc.querySelectorAll('a.lc-narr-link').length).toBe(1);
  });

  it('marks the block as enhanced', () => {
    const doc = narrationDoc('Valami Sírrabló csámborog a közelben!');
    enhanceNarration(doc, DB, vi.fn());
    expect(doc.querySelector('font')!.getAttribute('data-lc-enhanced')).toBe('true');
  });

  it('preserves the game\'s own anchors and their listeners', () => {
    const doc = narrationDoc('Valami Sírrabló csámborog a közelben! <a href="#" id="game">tovább</a>');
    const gameLink = doc.getElementById('game')!;
    const nativeHandler = vi.fn();
    gameLink.addEventListener('click', nativeHandler);

    enhanceNarration(doc, DB, vi.fn());

    // Same element instance, listener still attached.
    expect(doc.getElementById('game')).toBe(gameLink);
    gameLink.dispatchEvent(new doc.defaultView!.MouseEvent('click', { bubbles: true }));
    expect(nativeHandler).toHaveBeenCalledTimes(1);
  });

  it('does not nest a link inside one of the game\'s own anchors', () => {
    const doc = narrationDoc('<a href="#">Valami Sírrabló csámborog a közelben!</a>');
    enhanceNarration(doc, DB, vi.fn());
    expect(doc.querySelector('a.lc-narr-link')).toBeNull();
  });

  it('enhances a mention inside a nested inline element', () => {
    const doc = narrationDoc('<b>Valami Sírrabló csámborog a közelben!</b>');
    enhanceNarration(doc, DB, vi.fn());
    expect(doc.querySelector('b a.lc-narr-link')?.textContent).toBe('Sírrabló');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/enhanceNarration.test.ts`
Expected: FAIL — cannot resolve `../src/desktop/enhanceNarration`.

- [ ] **Step 3: Create `src/desktop/enhanceNarration.ts`**

```ts
// Desktop-only, in-place enhancement of the game's narration block: monster
// names the database knows become clickable links that open the monster card.
//
// The mobile UI re-renders the narration as Preact and can splice spans freely.
// Desktop must edit the live block, where the game's own <a> elements carry
// inline handlers that drive the shared form — so we mutate text nodes only and
// never reserialise via innerHTML.

import { findMonsterMentions, type MonsterMention } from '@/utils/narration';
import type { MonsterDatabase, Monster } from '@/shared/data/monsters';

/** Marker attribute making a second call a no-op. */
const ENHANCED_ATTR = 'data-lc-enhanced';

interface ResolvedMention {
  mention: MonsterMention;
  monster: Monster;
}

/** Text nodes inside an existing anchor are skipped — no nested links. */
function isInsideAnchor(node: Text, root: Element): boolean {
  let el = node.parentElement;
  while (el && el !== root) {
    if (el.tagName === 'A') return true;
    el = el.parentElement;
  }
  return false;
}

/** Collects the block's text nodes up front, so later mutation is safe. */
function collectTextNodes(doc: Document, root: Element): Text[] {
  const walker = doc.createTreeWalker(root, 0x4 /* NodeFilter.SHOW_TEXT */);
  const nodes: Text[] = [];
  let current: Node | null;
  while ((current = walker.nextNode()) !== null) {
    nodes.push(current as Text);
  }
  return nodes;
}

function buildLink(
  doc: Document,
  label: string,
  monster: Monster,
  onMonsterClick: (monster: Monster) => void
): HTMLAnchorElement {
  const link = doc.createElement('a');
  link.className = 'lc-narr-link';
  link.textContent = label;
  link.title = `${monster.name} — szint ${monster.level}`;
  link.addEventListener('click', (event) => {
    event.preventDefault();
    onMonsterClick(monster);
  });
  return link;
}

/**
 * Replaces one text node with a run of plain text and link elements, one link
 * per resolved mention. Offsets come from findMonsterMentions and index into
 * this node's own text.
 */
function spliceLinks(
  doc: Document,
  node: Text,
  text: string,
  hits: ResolvedMention[],
  onMonsterClick: (monster: Monster) => void
): void {
  const fragment = doc.createDocumentFragment();
  let cursor = 0;

  for (const { mention, monster } of hits) {
    if (mention.index < cursor) continue; // overlaps an emitted link
    if (mention.index > cursor) {
      fragment.appendChild(doc.createTextNode(text.slice(cursor, mention.index)));
    }
    const label = text.slice(mention.index, mention.index + mention.length);
    fragment.appendChild(buildLink(doc, label, monster, onMonsterClick));
    cursor = mention.index + mention.length;
  }

  if (cursor < text.length) {
    fragment.appendChild(doc.createTextNode(text.slice(cursor)));
  }

  node.parentNode?.replaceChild(fragment, node);
}

/**
 * Makes database-known monster names in the live narration clickable.
 *
 * Known limitation: matching runs per text node, so a mention split across a
 * <br> or <b> boundary is not found. The encounter templates are
 * single-sentence and normally arrive in one node; reassembling and re-splitting
 * the whole block is not worth the fragility.
 */
export function enhanceNarration(
  doc: Document,
  db: MonsterDatabase,
  onMonsterClick: (monster: Monster) => void
): void {
  const block = doc.querySelector('font[face="Comic sans MS"]');
  if (!block || block.hasAttribute(ENHANCED_ATTR)) return;

  for (const node of collectTextNodes(doc, block)) {
    if (isInsideAnchor(node, block)) continue;

    const text = node.textContent ?? '';
    if (!text.trim()) continue;

    const hits: ResolvedMention[] = [];
    for (const mention of findMonsterMentions(text)) {
      const monster = db.getByName(mention.name);
      if (monster) hits.push({ mention, monster });
    }
    if (hits.length === 0) continue;

    spliceLinks(doc, node, text, hits, onMonsterClick);
  }

  block.setAttribute(ENHANCED_ATTR, 'true');
}
```

`NodeFilter.SHOW_TEXT` is spelled as the literal `0x4` because the constant is not defined as a global in every jsdom/TS `lib` combination, and `doc.createTreeWalker` accepts the numeric mask directly.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/enhanceNarration.test.ts`
Expected: PASS — all 9 cases.

- [ ] **Step 5: Write the failing wiring test**

Append to `tests/desktopDock.test.tsx` (inside the `describe('DesktopDock', ...)` block). Add these imports at the top of the file:

```tsx
import { JSDOM } from 'jsdom';
import { buildMonsterDatabase, type Monster } from '../src/shared/data/monsters';
```

and the case:

```tsx
  it('enhances the narration in the supplied document once a db is available', () => {
    const gameDoc = new JSDOM(
      '<html><body><font face="Comic sans MS">Valami Sírrabló csámborog a közelben!</font></body></html>'
    ).window.document;

    const sirrablo: Monster = {
      id: 7, name: 'Sírrabló', image: '/pic/szornyk/sirrablo_k.gif', level: 3,
      hp: 40, mp: 0, attackType: 'Szúró/Vágó', debuff: '', magicWeapon: false,
      location: 'temető', drops: [],
    };

    render(
      <DesktopDock doc={gameDoc} state={makeState()} db={buildMonsterDatabase([sirrablo])} />
    );

    expect(gameDoc.querySelector('a.lc-narr-link')?.textContent).toBe('Sírrabló');
  });

  it('does not enhance the narration while the db is still loading', () => {
    const gameDoc = new JSDOM(
      '<html><body><font face="Comic sans MS">Valami Sírrabló csámborog a közelben!</font></body></html>'
    ).window.document;

    render(<DesktopDock doc={gameDoc} state={makeState()} db={null} />);

    expect(gameDoc.querySelector('a.lc-narr-link')).toBeNull();
  });
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run tests/desktopDock.test.tsx`
Expected: FAIL on the first new case — the dock does not call `enhanceNarration` yet, so no link is created.

- [ ] **Step 7: Wire the effect into `DesktopDock`**

In `src/desktop/DesktopDock.tsx`, add to the imports:

```tsx
import { useEffect } from 'preact/hooks';
import { enhanceNarration } from '@/desktop/enhanceNarration';
```

(merge `useEffect` into the existing `preact/hooks` import line).

Then, immediately after the `toggleCollapsed` / `openDatabase` definitions, add:

```tsx
  // The narration lives in the game's own DOM, so this is a side effect on an
  // external document rather than something Preact renders. enhanceNarration is
  // idempotent (data-lc-enhanced), so re-running on a db change is harmless.
  // A failure here must cost only the links, never the game page.
  useEffect(() => {
    if (!db) return;
    try {
      enhanceNarration(doc, db, setSelectedMonster);
    } catch (err) {
      console.warn('[Larkinor UI] Narration enhancement failed:', err);
    }
  }, [doc, db]);
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run tests/desktopDock.test.tsx tests/enhanceNarration.test.ts`
Expected: PASS — all dock cases including the two new ones, plus all 9 enhanceNarration cases.

- [ ] **Step 9: Type-check and run the full suite**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; full suite passes.

- [ ] **Step 10: Commit**

```bash
git add src/desktop/enhanceNarration.ts src/desktop/DesktopDock.tsx tests/enhanceNarration.test.ts tests/desktopDock.test.tsx
git commit -m "feat(desktop): clickable monster names in the live narration"
```

---

### Task 6: Keyboard shortcuts

**Files:**
- Create: `src/desktop/useKeyboardShortcuts.ts`
- Modify: `src/desktop/DesktopDock.tsx` (install the hook)
- Create test: `tests/useKeyboardShortcuts.test.ts`
- Modify test: `tests/desktopDock.test.tsx` (one wiring case)

**Interfaces:**
- Consumes: `DirectionOption`, `BuildingOption`, `Action` from `@/utils/domExtract`; `hotkeyActions` and the modal state from task 4.
- Produces:

```ts
export interface KeyboardShortcutOptions {
  doc: Document;
  directions: DirectionOption[];
  attack: BuildingOption | null;
  hotkeyActions: Action[];
  modalOpen: boolean;
  onOpenDatabase: () => void;
  onCloseModal: () => void;
}
export function useKeyboardShortcuts(options: KeyboardShortcutOptions): void;
export function isEditableTarget(target: EventTarget | null): boolean;
```

Bindings use `KeyboardEvent.code` (layout-independent): `ArrowUp`/`KeyW` → north, `ArrowDown`/`KeyS` → south, `ArrowLeft`/`KeyA` → west, `ArrowRight`/`KeyD` → east, `Space` → attack, `Digit1`–`Digit9` → nth `hotkeyActions` entry, `KeyQ` → open database, `Escape` → close modal.

Guard order (from the spec): modifier held → ignore; editable target → ignore; modal open → only `Escape` acts. `preventDefault()` only on consumed keys.

- [ ] **Step 1: Write the failing tests**

Create `tests/useKeyboardShortcuts.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/preact';
import { h } from 'preact';
import { JSDOM } from 'jsdom';
import { useKeyboardShortcuts, isEditableTarget, type KeyboardShortcutOptions } from '../src/desktop/useKeyboardShortcuts';
import type { DirectionOption, Action } from '../src/utils/domExtract';

function dir(d: DirectionOption['dir']): DirectionOption {
  return { dir: d, label: d, trigger: vi.fn() };
}

function hotkey(actionKey: string): Action {
  return { label: actionKey, actionKey, trigger: vi.fn() };
}

/** Mounts a throwaway component so the hook's effect runs and cleans up. */
function mountHook(options: KeyboardShortcutOptions) {
  const Probe = () => {
    useKeyboardShortcuts(options);
    return null;
  };
  return render(h(Probe, {}));
}

function makeGameDoc(bodyHtml = ''): Document {
  return new JSDOM(`<html><body>${bodyHtml}</body></html>`).window.document;
}

function press(doc: Document, code: string, init: KeyboardEventInit = {}, target?: Element) {
  const view = doc.defaultView!;
  const event = new view.KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...init });
  (target ?? doc.body).dispatchEvent(event);
  return event;
}

function baseOptions(doc: Document, overrides: Partial<KeyboardShortcutOptions> = {}): KeyboardShortcutOptions {
  return {
    doc,
    directions: [],
    attack: null,
    hotkeyActions: [],
    modalOpen: false,
    onOpenDatabase: vi.fn(),
    onCloseModal: vi.fn(),
    ...overrides,
  };
}

describe('isEditableTarget', () => {
  it('recognises the form controls the game types into', () => {
    const doc = makeGameDoc('<input id="i"><textarea id="t"></textarea><select id="s"></select><div id="d"></div>');
    expect(isEditableTarget(doc.getElementById('i'))).toBe(true);
    expect(isEditableTarget(doc.getElementById('t'))).toBe(true);
    expect(isEditableTarget(doc.getElementById('s'))).toBe(true);
    expect(isEditableTarget(doc.getElementById('d'))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

describe('useKeyboardShortcuts', () => {
  it('maps arrow keys to the matching direction trigger', () => {
    const doc = makeGameDoc();
    const north = dir('north');
    const east = dir('east');
    mountHook(baseOptions(doc, { directions: [north, east] }));

    press(doc, 'ArrowUp');
    press(doc, 'ArrowRight');

    expect(north.trigger).toHaveBeenCalledTimes(1);
    expect(east.trigger).toHaveBeenCalledTimes(1);
  });

  it('maps WASD to the same directions', () => {
    const doc = makeGameDoc();
    const west = dir('west');
    mountHook(baseOptions(doc, { directions: [west] }));

    press(doc, 'KeyA');

    expect(west.trigger).toHaveBeenCalledTimes(1);
  });

  it('ignores a direction key that is not available on this tile', () => {
    const doc = makeGameDoc();
    const north = dir('north');
    mountHook(baseOptions(doc, { directions: [north] }));

    const event = press(doc, 'ArrowDown');

    expect(north.trigger).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('fires the attack trigger on Space during an encounter', () => {
    const doc = makeGameDoc();
    const attack = { label: 'Támadás!!!', iconUrl: '', trigger: vi.fn() };
    mountHook(baseOptions(doc, { attack }));

    press(doc, 'Space');

    expect(attack.trigger).toHaveBeenCalledTimes(1);
  });

  it('maps digits to the nth hotkey in dock order', () => {
    const doc = makeGameDoc();
    const first = hotkey('kajal');
    const second = hotkey('imadkozas');
    mountHook(baseOptions(doc, { hotkeyActions: [first, second] }));

    press(doc, 'Digit2');

    expect(second.trigger).toHaveBeenCalledTimes(1);
    expect(first.trigger).not.toHaveBeenCalled();
  });

  it('ignores a digit with no corresponding hotkey', () => {
    const doc = makeGameDoc();
    const only = hotkey('kajal');
    mountHook(baseOptions(doc, { hotkeyActions: [only] }));

    press(doc, 'Digit5');

    expect(only.trigger).not.toHaveBeenCalled();
  });

  it('opens the database on Q', () => {
    const doc = makeGameDoc();
    const onOpenDatabase = vi.fn();
    mountHook(baseOptions(doc, { onOpenDatabase }));

    press(doc, 'KeyQ');

    expect(onOpenDatabase).toHaveBeenCalledTimes(1);
  });

  it('ignores every keystroke typed into a form control', () => {
    const doc = makeGameDoc('<input id="chat">');
    const north = dir('north');
    const onOpenDatabase = vi.fn();
    mountHook(baseOptions(doc, { directions: [north], onOpenDatabase }));

    const input = doc.getElementById('chat')!;
    press(doc, 'KeyW', {}, input);
    press(doc, 'KeyQ', {}, input);

    expect(north.trigger).not.toHaveBeenCalled();
    expect(onOpenDatabase).not.toHaveBeenCalled();
  });

  it('ignores keystrokes with a modifier held', () => {
    const doc = makeGameDoc();
    const north = dir('north');
    mountHook(baseOptions(doc, { directions: [north] }));

    press(doc, 'ArrowUp', { ctrlKey: true });
    press(doc, 'ArrowUp', { altKey: true });
    press(doc, 'ArrowUp', { metaKey: true });

    expect(north.trigger).not.toHaveBeenCalled();
  });

  it('suppresses every binding except Escape while a modal is open', () => {
    const doc = makeGameDoc();
    const north = dir('north');
    const onCloseModal = vi.fn();
    const onOpenDatabase = vi.fn();
    mountHook(baseOptions(doc, { directions: [north], modalOpen: true, onCloseModal, onOpenDatabase }));

    press(doc, 'ArrowUp');
    press(doc, 'KeyQ');
    press(doc, 'Escape');

    expect(north.trigger).not.toHaveBeenCalled();
    expect(onOpenDatabase).not.toHaveBeenCalled();
    expect(onCloseModal).toHaveBeenCalledTimes(1);
  });

  it('does nothing on Escape when no modal is open', () => {
    const doc = makeGameDoc();
    const onCloseModal = vi.fn();
    mountHook(baseOptions(doc, { onCloseModal }));

    press(doc, 'Escape');

    expect(onCloseModal).not.toHaveBeenCalled();
  });

  it('prevents the default only on consumed keys', () => {
    const doc = makeGameDoc();
    mountHook(baseOptions(doc, { directions: [dir('north')] }));

    expect(press(doc, 'ArrowUp').defaultPrevented).toBe(true);
    expect(press(doc, 'KeyZ').defaultPrevented).toBe(false);
  });

  it('removes its listener on unmount', () => {
    const doc = makeGameDoc();
    const north = dir('north');
    const { unmount } = mountHook(baseOptions(doc, { directions: [north] }));

    unmount();
    press(doc, 'ArrowUp');

    expect(north.trigger).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/useKeyboardShortcuts.test.ts`
Expected: FAIL — cannot resolve `../src/desktop/useKeyboardShortcuts`.

- [ ] **Step 3: Create `src/desktop/useKeyboardShortcuts.ts`**

```ts
// Desktop-only keyboard control. The game binds no document-level key handlers
// of its own, but it does have text inputs (chat), so the editable-target guard
// is what actually makes single-letter bindings safe: typing "wasd" into chat
// must never walk the character across the map.

import { useEffect } from 'preact/hooks';
import type { Action, BuildingOption, Direction, DirectionOption } from '@/utils/domExtract';

export interface KeyboardShortcutOptions {
  /** The live game document to listen on. */
  doc: Document;
  directions: DirectionOption[];
  attack: BuildingOption | null;
  /** Enabled hotkeys in the order the dock renders them; bound to 1-9. */
  hotkeyActions: Action[];
  /** True while any desktop modal is open — suppresses all but Escape. */
  modalOpen: boolean;
  onOpenDatabase: () => void;
  onCloseModal: () => void;
}

/**
 * Keyed by KeyboardEvent.code so the bindings are keyboard-layout independent
 * (code reports the physical key, unlike `key`).
 */
const DIRECTION_BY_CODE: Record<string, Direction> = {
  ArrowUp: 'north',
  KeyW: 'north',
  ArrowDown: 'south',
  KeyS: 'south',
  ArrowLeft: 'west',
  KeyA: 'west',
  ArrowRight: 'east',
  KeyD: 'east',
};

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/** True for targets the user types into — those keep every keystroke. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target as Partial<Element>).tagName) return false;
  const el = target as HTMLElement;
  return EDITABLE_TAGS.has(el.tagName) || el.isContentEditable === true;
}

/** Index of the hotkey bound to a Digit1-Digit9 code, or -1. */
function digitIndex(code: string): number {
  const match = /^Digit([1-9])$/.exec(code);
  return match ? Number(match[1]) - 1 : -1;
}

/** Installs the document-level key bindings for the lifetime of the caller. */
export function useKeyboardShortcuts(options: KeyboardShortcutOptions): void {
  const { doc, directions, attack, hotkeyActions, modalOpen, onOpenDatabase, onCloseModal } = options;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      if (isEditableTarget(event.target)) return;

      // With a modal open, Escape is the only binding — it is also the single
      // way to close one, so nothing else may act underneath it.
      if (modalOpen) {
        if (event.code === 'Escape') {
          event.preventDefault();
          onCloseModal();
        }
        return;
      }

      const dir = DIRECTION_BY_CODE[event.code];
      if (dir) {
        const option = directions.find(d => d.dir === dir);
        if (!option) return; // direction not available on this tile
        event.preventDefault();
        option.trigger();
        return;
      }

      if (event.code === 'Space') {
        if (!attack) return;
        event.preventDefault();
        attack.trigger();
        return;
      }

      if (event.code === 'KeyQ') {
        event.preventDefault();
        onOpenDatabase();
        return;
      }

      const index = digitIndex(event.code);
      if (index >= 0) {
        const action = hotkeyActions[index];
        if (!action) return;
        event.preventDefault();
        action.trigger();
      }
    };

    doc.addEventListener('keydown', handleKeyDown);
    return () => doc.removeEventListener('keydown', handleKeyDown);
  }, [doc, directions, attack, hotkeyActions, modalOpen, onOpenDatabase, onCloseModal]);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/useKeyboardShortcuts.test.ts`
Expected: PASS — the `isEditableTarget` block plus all 13 hook cases.

- [ ] **Step 5: Write the failing wiring test**

Append to `tests/desktopDock.test.tsx` inside `describe('DesktopDock', ...)`:

```tsx
  it('moves the character with an arrow key press on the game document', () => {
    const gameDoc = new JSDOM('<html><body></body></html>').window.document;
    const north = { dir: 'north' as const, label: 'északra', trigger: vi.fn() };

    render(<DesktopDock doc={gameDoc} state={makeState({ directions: [north] })} db={null} />);

    const event = new gameDoc.defaultView!.KeyboardEvent('keydown', { code: 'ArrowUp', bubbles: true, cancelable: true });
    gameDoc.body.dispatchEvent(event);

    expect(north.trigger).toHaveBeenCalledTimes(1);
  });

  it('opens the database overlay from the Q shortcut', () => {
    const gameDoc = new JSDOM('<html><body></body></html>').window.document;
    const { container } = render(<DesktopDock doc={gameDoc} state={makeState()} db={null} />);

    gameDoc.body.dispatchEvent(
      new gameDoc.defaultView!.KeyboardEvent('keydown', { code: 'KeyQ', bubbles: true, cancelable: true })
    );

    expect(container.querySelector('.lc-db-overlay')).not.toBeNull();
  });

  it('closes an open modal with Escape', () => {
    const gameDoc = new JSDOM('<html><body></body></html>').window.document;
    const { container } = render(<DesktopDock doc={gameDoc} state={makeState()} db={null} />);

    fireEvent.click(container.querySelector('.lc-dock-config')!);
    expect(container.querySelector('.lc-drawer-backdrop')).not.toBeNull();

    gameDoc.body.dispatchEvent(
      new gameDoc.defaultView!.KeyboardEvent('keydown', { code: 'Escape', bubbles: true, cancelable: true })
    );

    expect(container.querySelector('.lc-drawer-backdrop')).toBeNull();
  });
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run tests/desktopDock.test.tsx`
Expected: FAIL on all three new cases — the dock installs no key bindings yet.

- [ ] **Step 7: Install the hook in `DesktopDock`**

In `src/desktop/DesktopDock.tsx`, add the import:

```tsx
import { useKeyboardShortcuts } from '@/desktop/useKeyboardShortcuts';
```

Add a single close-topmost-modal helper and the hook call after the `useEffect` from task 5:

```tsx
  const modalOpen = selectedMonster !== null || configOpenLocal || dbOpen;

  /** Closes the topmost modal — database over config over the monster card. */
  const closeTopModal = () => {
    if (dbOpen) setDbOpen(false);
    else if (configOpenLocal) setConfigOpenLocal(false);
    else if (selectedMonster) setSelectedMonster(null);
  };

  useKeyboardShortcuts({
    doc,
    directions: state?.directions ?? [],
    attack,
    hotkeyActions,
    modalOpen,
    onOpenDatabase: openDatabase,
    onCloseModal: closeTopModal,
  });
```

Place this **above** the `return`, after the effect. Hooks must not be called conditionally, so it runs in minimal mode too — with empty `directions`/`hotkeyActions` and a null `attack`, only `Q` and `Escape` are live there, which is what the minimal dock offers anyway.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run tests/desktopDock.test.tsx tests/useKeyboardShortcuts.test.ts`
Expected: PASS — every dock case including the three new ones.

- [ ] **Step 9: Type-check and run the full suite**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; full suite passes.

- [ ] **Step 10: Commit**

```bash
git add src/desktop/useKeyboardShortcuts.ts src/desktop/DesktopDock.tsx tests/useKeyboardShortcuts.test.ts tests/desktopDock.test.tsx
git commit -m "feat(desktop): keyboard shortcuts for movement, actions and modals"
```

---

### Task 7: Desktop boot

**Files:**
- Create: `src/desktop/boot.ts`
- Create test: `tests/desktopBoot.test.ts`

**Interfaces:**
- Consumes: `detectPage` / `PageType`; `extractFreeMove`; `createDataLoader` / `gmSource` / `MonsterDatabase`; `DesktopDock` (task 4); `theme.css?raw`; `desktop.css?raw`.
- Produces: `bootDesktop(doc: Document): void`

Contract:
1. **Never** calls `hideOriginalDOM` — `#lc-offscreen` must not exist and the original body children stay put.
2. **Never** injects a viewport meta — the game's ~980px assumption is right on desktop.
3. Injects `theme.css` + `desktop.css` via `GM_addStyle`.
4. Appends a `#lc-dock-root` div to `doc.body` and renders `DesktopDock` into it.
5. `PageType.FreeMove` → `extractFreeMove(doc)` as `state`; every other page type (including `Unknown`) → `state: null, dbButtonOnly: true`.
6. Fetches the monster DB only on FreeMove, then re-renders so the narration effect runs; a fetch failure logs a warning and leaves the dock working.
7. Extraction or mount failure logs a warning and leaves the page untouched.

- [ ] **Step 1: Write the failing tests**

Create `tests/desktopBoot.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { bootDesktop } from '../src/desktop/boot';
import { DOCK_COLLAPSED_KEY, ENABLED_HOTKEYS_KEY } from '../src/utils/config';

function gameDoc(oldalTipus: string, extraHtml = ''): Document {
  return new JSDOM(`<html><body>
    <form name="urlap"><input type="hidden" name="oldalTipus" value="${oldalTipus}"></form>
    <div id="game-content">original</div>
    ${extraHtml}
  </body></html>`).window.document;
}

describe('bootDesktop', () => {
  beforeEach(() => {
    GM_setValue(DOCK_COLLAPSED_KEY, '');
    GM_setValue(ENABLED_HOTKEYS_KEY, '[]');
    vi.mocked(GM_xmlhttpRequest).mockReset();
  });

  it('leaves the original game DOM in place', () => {
    const doc = gameDoc('otVilag');
    bootDesktop(doc);

    expect(doc.getElementById('lc-offscreen')).toBeNull();
    expect(doc.getElementById('game-content')).not.toBeNull();
    expect(doc.getElementById('game-content')!.parentElement).toBe(doc.body);
  });

  it('does not inject a viewport meta on desktop', () => {
    const doc = gameDoc('otVilag');
    bootDesktop(doc);
    expect(doc.querySelector('meta[name="viewport"]')).toBeNull();
  });

  it('mounts the dock into a fixed dock root', () => {
    const doc = gameDoc('otVilag');
    bootDesktop(doc);

    const root = doc.getElementById('lc-dock-root');
    expect(root).not.toBeNull();
    expect(root!.querySelector('.lc-dock')).not.toBeNull();
  });

  it('injects the shared theme and the dock styles', () => {
    const doc = gameDoc('otVilag');
    bootDesktop(doc);
    expect(GM_addStyle).toHaveBeenCalled();
  });

  it('renders the full dock on the free-move page', () => {
    const doc = gameDoc('otVilag', `
      <form name="specTevUrlap">
        <select name="tevFajta"><option value="kajal">kajálsz</option></select>
        <input type="image" src="/ikon/ok.gif">
      </form>
    `);
    bootDesktop(doc);

    const labels = Array.from(doc.querySelectorAll('#lc-dock-root .lc-dock-btn')).map(b => b.textContent);
    expect(labels).toContain('kajálsz');
  });

  it('renders the minimal dock on a page type we do not extract', () => {
    const doc = gameDoc('otVegyesbolt');
    bootDesktop(doc);

    expect(doc.querySelector('#lc-dock-root .lc-dock-db')).not.toBeNull();
    expect(doc.querySelector('#lc-dock-root .lc-dock-hotkey')).toBeNull();
  });

  it('renders the minimal dock on an unrecognised page instead of skipping', () => {
    const doc = gameDoc('otValamiUj');
    bootDesktop(doc);

    expect(doc.querySelector('#lc-dock-root .lc-dock-db')).not.toBeNull();
  });

  it('survives a monster-db fetch failure with a working dock', async () => {
    // gmSource rejects when GM_xmlhttpRequest reports an error.
    vi.mocked(GM_xmlhttpRequest).mockImplementation((opts: { onerror?: (e: unknown) => void }) => {
      opts.onerror?.(new Error('network down'));
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const doc = gameDoc('otVilag');
    bootDesktop(doc);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(doc.querySelector('#lc-dock-root .lc-dock')).not.toBeNull();
    warn.mockRestore();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/desktopBoot.test.ts`
Expected: FAIL — cannot resolve `../src/desktop/boot`.

- [ ] **Step 3: Create `src/desktop/boot.ts`**

```ts
// Desktop boot. The inverse posture of the mobile boot: the game page keeps
// rendering itself and we only add a fixed companion dock plus in-place
// narration links. Nothing here may move, hide or restyle the game's own DOM.

import { h, render } from 'preact';
import { detectPage, PageType } from '@/utils/pageDetector';
import { extractFreeMove, type FreeMoveState } from '@/utils/domExtract';
import { createDataLoader, gmSource, type MonsterDatabase } from '@/shared/data';
import { DesktopDock } from '@/desktop/DesktopDock';
import baseStyles from '@/shared/styles/theme.css?raw';
import dockStyles from '@/desktop/desktop.css?raw';

// Mirrors src/main.ts: the dev server hosts static/db, production serves it
// from the deployment host.
const DATA_BASE_URL = import.meta.env.DEV
  ? new URL('/static/db', import.meta.url).href
  : 'https://example.invalid/larkinor/static/db';

/**
 * Free-move state when we are on the free-move page, otherwise null — every
 * other page type (including one we do not recognise) still gets the minimal
 * dock, because on desktop we are adding to a page that already works.
 */
function extractDockState(doc: Document): FreeMoveState | null {
  if (detectPage(doc) !== PageType.FreeMove) return null;
  try {
    return extractFreeMove(doc);
  } catch (err) {
    console.warn('[Larkinor UI] Free-move extraction failed; dock degraded:', err);
    return null;
  }
}

export function bootDesktop(doc: Document): void {
  const state = extractDockState(doc);

  GM_addStyle(baseStyles);
  GM_addStyle(dockStyles);

  const root = doc.createElement('div');
  root.id = 'lc-dock-root';
  doc.body.appendChild(root);

  let db: MonsterDatabase | null = null;

  const renderDock = () => {
    try {
      render(h(DesktopDock, { doc, state, db, dbButtonOnly: state === null }), root);
    } catch (err) {
      console.warn('[Larkinor UI] Dock render failed:', err);
    }
  };

  renderDock();

  // Only the free-move narration references monsters, so nothing else needs the
  // database up front — the overlay loads its own data on demand.
  if (!state) return;

  createDataLoader(gmSource(), DATA_BASE_URL).loadMonsters()
    .then((loaded) => {
      db = loaded;
      renderDock(); // re-render so the narration effect can run with a db
    })
    .catch((err) => console.warn('[Larkinor UI] Failed to load monsters:', err));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/desktopBoot.test.ts`
Expected: PASS — all 8 cases.

If the last case reports an unhandled rejection rather than a warning, check that `gmSource`'s error path is the `onerror` callback; adjust the mock to whatever `src/shared/data/source.ts` actually calls, keeping the assertion (dock still present) unchanged.

- [ ] **Step 5: Type-check and run the full suite**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; full suite passes.

- [ ] **Step 6: Commit**

```bash
git add src/desktop/boot.ts tests/desktopBoot.test.ts
git commit -m "feat(desktop): boot that augments the game page instead of replacing it"
```

---

### Task 8: Boot split and dispatch

**Files:**
- Create: `src/mobile/boot.ts`
- Modify: `src/main.ts`
- Create test: `tests/mobileBoot.test.ts`

**Interfaces:**
- Consumes: `detectPlatform` (task 1); `bootDesktop` (task 7); everything today's `src/main.ts` imports.
- Produces: `bootMobile(doc: Document): void`

This is a **move, not a rewrite**. Everything currently in `src/main.ts` except the final `boot()` call moves into `src/mobile/boot.ts` unchanged: `DATA_BASE_URL`, the `PageState` union, `ensureMobileViewport`, `extractPageState`, and the `boot()` body — renamed to `bootMobile(doc: Document)` with `document` replaced by the `doc` parameter throughout. The existing mobile test suite passing untouched is the regression signal.

- [ ] **Step 1: Write the failing test for `bootMobile`**

Create `tests/mobileBoot.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { bootMobile } from '../src/mobile/boot';
import { ENABLED_HOTKEYS_KEY } from '../src/utils/config';

function gameDoc(oldalTipus: string): Document {
  return new JSDOM(`<html><head></head><body>
    <form name="urlap"><input type="hidden" name="oldalTipus" value="${oldalTipus}"></form>
    <div id="game-content">original</div>
  </body></html>`).window.document;
}

describe('bootMobile', () => {
  beforeEach(() => {
    GM_setValue(ENABLED_HOTKEYS_KEY, '[]');
    vi.mocked(GM_xmlhttpRequest).mockReset();
  });

  it('moves the original DOM off-screen and mounts the app root', () => {
    const doc = gameDoc('otVilag');
    bootMobile(doc);

    const offscreen = doc.getElementById('lc-offscreen');
    expect(offscreen).not.toBeNull();
    expect(offscreen!.querySelector('#game-content')).not.toBeNull();
    expect(doc.getElementById('lc-root')).not.toBeNull();
  });

  it('injects the mobile viewport meta', () => {
    const doc = gameDoc('otVilag');
    bootMobile(doc);

    const meta = doc.querySelector('meta[name="viewport"]');
    expect(meta?.getAttribute('content')).toContain('width=device-width');
  });

  it('leaves an unrecognised page completely untouched', () => {
    const doc = gameDoc('otValamiUj');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    bootMobile(doc);

    expect(doc.getElementById('lc-offscreen')).toBeNull();
    expect(doc.getElementById('lc-root')).toBeNull();
    expect(doc.getElementById('game-content')!.parentElement).toBe(doc.body);
    warn.mockRestore();
  });

  it('does not create a desktop dock root', () => {
    const doc = gameDoc('otVilag');
    bootMobile(doc);
    expect(doc.getElementById('lc-dock-root')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/mobileBoot.test.ts`
Expected: FAIL — cannot resolve `../src/mobile/boot`.

- [ ] **Step 3: Create `src/mobile/boot.ts`**

Move the entire current contents of `src/main.ts` into this new file, **minus** the trailing `boot();` call, with exactly these changes:

1. Rename `function boot(): void` → `export function bootMobile(doc: Document): void`.
2. Inside it, replace every use of the `document` global with the `doc` parameter — there are five: `extractPageState(detectPage(document), document)`, `ensureMobileViewport(document)`, `hideOriginalDOM(document)`, `document.createElement('div')`, `document.body.appendChild(root)`.
3. Update the header comment so it says this is the mobile (proxy-DOM) boot.

The result:

```ts
import { h, render } from 'preact';
import { detectPage, PageType } from '@/utils/pageDetector';
import { extractFreeMove, extractBattle, extractLogin, extractDungeon, hideOriginalDOM, type FreeMoveState, type BattleState, type LoginState, type DungeonState } from '@/utils/domExtract';
import { extractHome, type HomeState } from '@/utils/homeExtract';
import { createDataLoader, gmSource, type MonsterDatabase } from '@/shared/data';
import { FreeMove } from '@/pages/FreeMove';
import { Battle } from '@/pages/Battle';
import { Login } from '@/pages/Login';
import { Dungeon } from '@/pages/Dungeon';
import { Home } from '@/pages/Home';
import baseStyles from '@/shared/styles/theme.css?raw';

// Mobile boot (proxy-DOM pattern): extract the game state, move the original
// DOM off-screen, and render a full replacement UI. The desktop counterpart in
// src/desktop/boot.ts augments the page instead — see
// docs/superpowers/specs/2026-08-11-desktop-support-design.md.

// Static DB assets live under the relative path `static/db/` in both dev and
// production — only the origin differs. In `npm run dev` the folder is served
// by the Vite dev server (see the lc-static-assets plugin in vite.config.ts),
// so we resolve against this module's own URL; in the production build the
// dead dev branch is stripped and we fetch from the deployment host.
const DATA_BASE_URL = import.meta.env.DEV
  ? new URL('/static/db', import.meta.url).href
  : 'https://example.invalid/larkinor/static/db';

// Discriminated union so the extracted state stays paired with — and
// narrowable by — the page type that produced it, instead of collapsing to
// the unhelpful `FreeMoveState | BattleState` union TypeScript would
// otherwise infer from a plain ternary.
type PageState =
  | { pageType: PageType.FreeMove; state: FreeMoveState }
  | { pageType: PageType.Battle; state: BattleState }
  | { pageType: PageType.Login; state: LoginState }
  | { pageType: PageType.Dungeon; state: DungeonState }
  | { pageType: PageType.Home; state: HomeState };

/**
 * The game page ships no viewport meta, so mobile browsers assume a ~980px
 * layout viewport and shrink the page — leaving our max-width UI floating with
 * empty margins. Set width=device-width so the mobile layout fills the screen.
 * Only called on pages we take over, so untouched pages keep their behaviour.
 */
function ensureMobileViewport(doc: Document): void {
  let meta = doc.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!meta) {
    meta = doc.createElement('meta');
    meta.name = 'viewport';
    doc.head.appendChild(meta);
  }
  meta.setAttribute('content', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

/** Extracts the page state for a page type we render, or null to skip it. */
function extractPageState(pageType: PageType, doc: Document): PageState | null {
  switch (pageType) {
    case PageType.FreeMove:
      return { pageType, state: extractFreeMove(doc) };
    case PageType.Battle:
      return { pageType, state: extractBattle(doc) };
    case PageType.Login:
      return { pageType, state: extractLogin(doc) };
    case PageType.Dungeon:
      return { pageType, state: extractDungeon(doc) };
    case PageType.Home:
      return { pageType, state: extractHome(doc) };
    default:
      return null; // v1 leaves other pages untouched
  }
}

export function bootMobile(doc: Document): void {
  // Extract state from the live game DOM before it gets moved off-screen.
  // The extractors query the document globally, so they would still find the
  // moved nodes even after hideOriginalDOM() — but extracting once up front
  // and reusing the snapshot for both renders avoids any dependency on that
  // ordering and avoids doing the extraction work twice.
  const pageState = extractPageState(detectPage(doc), doc);
  if (!pageState) return;

  ensureMobileViewport(doc);
  GM_addStyle(baseStyles);
  hideOriginalDOM(doc);

  const root = doc.createElement('div');
  root.id = 'lc-root';
  doc.body.appendChild(root);

  let db: MonsterDatabase | null = null;

  const renderPage = () => {
    switch (pageState.pageType) {
      case PageType.FreeMove:
        render(h(FreeMove, { state: pageState.state, db }), root);
        break;
      case PageType.Battle:
        render(h(Battle, { state: pageState.state, db }), root);
        break;
      case PageType.Login:
        render(h(Login, { state: pageState.state }), root);
        break;
      case PageType.Dungeon:
        render(h(Dungeon, { state: pageState.state }), root);
        break;
      case PageType.Home:
        render(h(Home, { state: pageState.state }), root);
        break;
    }
  };

  renderPage(); // immediate render (db=null; login/dungeon never need it)

  // The login and dungeon screens have no monster references, and Home uses
  // the DB overlay's own on-demand loader, so skip the shared monster fetch.
  if (pageState.pageType === PageType.Login || pageState.pageType === PageType.Dungeon || pageState.pageType === PageType.Home) return;

  createDataLoader(gmSource(), DATA_BASE_URL).loadMonsters()
    .then((loaded) => {
      db = loaded;
      renderPage();
    })
    .catch((err) => console.warn('[Larkinor UI] Failed to load monsters:', err));
}
```

- [ ] **Step 4: Replace `src/main.ts` with the dispatcher**

Overwrite `src/main.ts` entirely:

```ts
// Userscript entry point. Picks one of two UIs and hands off:
//   mobile  — replaces the page (proxy-DOM), see src/mobile/boot.ts
//   desktop — augments the page with a dock, see src/desktop/boot.ts
// See docs/superpowers/specs/2026-08-11-desktop-support-design.md.

import { detectPlatform } from '@/utils/platform';
import { bootMobile } from '@/mobile/boot';
import { bootDesktop } from '@/desktop/boot';

if (detectPlatform(window) === 'desktop') {
  bootDesktop(document);
} else {
  bootMobile(document);
}
```

- [ ] **Step 5: Run the new test and the full suite**

Run: `npx vitest run tests/mobileBoot.test.ts && npm test`
Expected: PASS — the 4 new `bootMobile` cases, and **every pre-existing test unchanged**. Any failure in a pre-existing test means the move altered behaviour; diff `src/mobile/boot.ts` against `git show HEAD~1:src/main.ts` and fix the drift rather than adjusting the test.

- [ ] **Step 6: Type-check and build**

Run: `npx tsc --noEmit && npm run build`
Expected: no type errors. The build emits `dist/larkinor-ui.user.js` and the standalone DB into `dist/`.

- [ ] **Step 7: Confirm both boots are present in the bundle**

Run:

```bash
grep -c "lc-dock-root" dist/larkinor-ui.user.js && grep -c "lc-offscreen" dist/larkinor-ui.user.js
```

Expected: a non-zero count for both — proof that neither boot path was tree-shaken away.

- [ ] **Step 8: Commit**

```bash
git add src/main.ts src/mobile/boot.ts tests/mobileBoot.test.ts
git commit -m "feat: dispatch to the mobile or desktop boot by detected platform"
```

---

### Task 9: Documentation and final verification

**Files:**
- Modify: `CLAUDE.md` (the lcenter one, at the repo root)

**Interfaces:**
- Consumes: everything above.
- Produces: no code.

`CLAUDE.md` currently describes the userscript as unconditionally proxy-DOM and mobile-only, which is now wrong in a way that would mislead the next session. Update it.

- [ ] **Step 1: Update the project-structure tree**

In the `lcenter/` tree block in `CLAUDE.md`, change the `src/main.ts` line and add the two boot directories:

```
│   ├── main.ts              # Entry: detect platform → bootMobile | bootDesktop
│   ├── mobile/boot.ts       # Mobile boot: proxy-DOM page replacement
│   ├── desktop/             # Desktop boot: dock + in-place enhancements
│   │   ├── boot.ts · DesktopDock.tsx
│   │   ├── enhanceNarration.ts · useKeyboardShortcuts.ts
│   │   └── desktop.css
```

- [ ] **Step 2: Add a platform-modes section**

Insert this after the "#### In-game userscript" section's bullet list:

```markdown
- **Two platform modes** (`utils/platform.ts`): `detectPlatform(window)` picks
  `mobile` when `(pointer: coarse)` matches or the viewport is under 900px, else
  `desktop`. A stored override (`lc-platform-override`, set from the config
  drawer's *Felület* toggle) wins over auto-detection; it takes effect on the
  next page load.
  - **Mobile** (`src/mobile/boot.ts`) is the proxy-DOM full replacement
    described above.
  - **Desktop** (`src/desktop/boot.ts`) *augments* instead: it never calls
    `hideOriginalDOM` or injects a viewport meta. It mounts a fixed
    `#lc-dock-root` companion dock (quick actions, encounter attack, config,
    database), makes DB-known monster names in the live narration clickable
    (`enhanceNarration` — text-node splicing only, never `innerHTML`), and binds
    keyboard shortcuts (WASD/arrows, Space, 1–9, Q, Esc — all suppressed while
    the target is a form control). The dock renders on every page; only
    free-move gets the full action set.
  - Because the game page stays visible on desktop, **no CSS may use an
    unscoped element selector** — everything stays under `#lc-root`,
    `#lc-dock-root` or a `.lc-*` class.
```

- [ ] **Step 3: Run the whole verification gate**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: no type errors, every test passing, both bundles emitted. Record the actual test count in the commit message rather than asserting a number you did not see.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: describe the mobile/desktop platform split"
```

- [ ] **Step 5: Report what was and was not verified**

Automated verification covers detection, the dock, narration enhancement, shortcuts and both boots in jsdom. **Not covered, and must be stated as such:** nothing here has run against the live game in a real desktop browser. Manual smoke test, for the user to run when they choose:

```bash
./serve.sh    # builds + serves on 9912, prints the loader URL
```

Then on a desktop browser at `https://larkinor.hu`: confirm the game page renders normally, the dock appears bottom-right, a quick action fires, arrow keys move, a monster name in the narration is underlined and opens the card, and the *Felület → Mobil* toggle switches to the phone UI on the next load.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| 1. Platform detection (`detectPlatform`, override, config accessors) | 1 |
| 1. ConfigDrawer three-way toggle + Hungarian copy | 3 |
| 2. Boot split (`main.ts` dispatcher, `mobile/boot.ts` verbatim move) | 8 |
| 2. Desktop boot: no `hideOriginalDOM`, no viewport meta, `#lc-dock-root`, FreeMove vs minimal, `Unknown` not a failure | 7 |
| 3. `DesktopDock`: hotkeys, text actions, conditional attack, `dbButtonOnly`, collapse persistence, modal ownership | 4 |
| 3. `desktop.css` scoping, new CSS var, z-index below modals | 4 |
| 3. Centered-modal variant + `variant` prop on both drawers | 2 |
| 4. `enhanceNarration`: TreeWalker, no `innerHTML`, db resolution, idempotence, `data-lc-enhanced`, documented per-node limitation | 5 |
| 4. `.lc-narr-link` styling | 2 |
| 5. Keyboard shortcuts table + all three guards + selective `preventDefault` | 6 |
| 6. Error handling: dock and narration wrapped separately; empty `actions` degrades; DB failure tolerated | 5 (narration), 7 (boot/dock/DB), 4 (empty actions) |
| 7. Testing: `platform`, `enhanceNarration`, `desktopDock`, `useKeyboardShortcuts` test files; existing suite untouched; tsc/test/build gate | 1, 4, 5, 6, 8, 9 |
| Out of scope (battle dock, shop/home, item inspect) | not implemented, restated in task 9 step 5 |

Two additions beyond the spec, both deliberate: `tests/desktopBoot.test.ts` and `tests/mobileBoot.test.ts` (the spec named four test files; the boots are the riskiest code in the change and were untested), and task 9's `CLAUDE.md` update (the file's current description of `main.ts` becomes wrong).

**Placeholder scan:** no TBD/TODO/"handle edge cases"/"write tests for the above". Every code step carries the actual code; every test step carries the actual assertions.

**Type consistency check:** `Platform` is declared once in `platform.ts` and imported type-only by `config.ts` (task 1) and by `ConfigDrawer` (task 3). `DrawerVariant` is declared once in `drawer.ts` (task 2) and used by both drawer components. `DesktopDockProps` is fixed in task 4 as `{ doc, state, db, dbButtonOnly }` and tasks 5, 6 add no props — every later test constructs it with exactly those four. `KeyboardShortcutOptions` field names in task 6's implementation match the test's `baseOptions` and the dock's call site (`doc`, `directions`, `attack`, `hotkeyActions`, `modalOpen`, `onOpenDatabase`, `onCloseModal`). `bootMobile(doc)` and `bootDesktop(doc)` share one signature, matching both `main.ts` call sites. `MonsterMention` is imported from `@/utils/narration`, where it is already exported.
