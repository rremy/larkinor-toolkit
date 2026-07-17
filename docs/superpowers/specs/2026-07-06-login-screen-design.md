# Login screen support — lc-userscript

**Date:** 2026-07-06
**Status:** Approved (ready for implementation plan)

## Goal

Extend the lc-userscript mobile UI to take over Larkinor's **login page**
(`oldalTipus=otLogin`), replacing the classic 980px table layout with a
focused, mobile-friendly login card in the existing dark-medieval theme.

## Real login DOM — facts

Captured live from `https://l2.larkinor.hu/cgi-bin/larkinor` (charset
ISO-8859-2), consistent with the real-DOM reference doc:

- Hidden discriminator present: `input[name="oldalTipus"]` with value `otLogin`.
- The login form is **unnamed** — `<form method="post" action="/../cgi-bin/larkinor">`
  — *not* `name="urlap"` like the in-game pages. Page detection is unaffected
  because it only reads the hidden `oldalTipus` input.
- Fields (inside a `<td>` with labels "Login:" / "Jelszó:"):
  - `input[type="text"][name="loginname"]`, `maxlength=18`
  - `input[type="password"][name="loginpassw"]`, `maxlength=18`
  - `input[type="image"][name="Submit"]`, `src=…/belepek.gif`, `title="Belépés"`
- The rest of the page is a left menu (Regisztráció `otNewPlayer`, Aktiváció
  `otAktivacio`, Hírek, guest-browse "Barangolás… látogató" `otVisitor`, …) and
  a long news feed — **all out of scope** for v1.

## Scope

**In scope**
- Detect the login page and render a mobile login card.
- Username + password fields and the "Belépés" submit action.
- Remember the **username only** (pre-fill on return via `GM_setValue`).
- Surface the game's login error/status message on a failed attempt.

**Out of scope (v1)**
- News feed, menu links, registration/activation/guest-browse.
- Password persistence (rely on the browser's own password manager).

## Design

Reuses the established **proxy-DOM pattern**: extract state from the live DOM,
move the original DOM off-screen (`hideOriginalDOM`), mount a Preact app, and
drive the *original* hidden controls so the game's native form logic runs
unchanged. No form reconstruction, no manual POST.

### 1. Page detection — `src/utils/pageDetector.ts`

Add `Login = 'Login'` to `PageType` and a case to `detectPage`:

```ts
case 'otLogin':
  return PageType.Login;
```

### 2. Extraction — `src/utils/domExtract.ts`

New `LoginState` and `extractLogin`:

```ts
export interface LoginState {
  /** Previously-saved username (GM storage), used to pre-fill the field. */
  savedUsername: string;
  /** Login error/status message on a failed attempt, or '' if none. */
  error: string;
  /** Fills the original hidden inputs, persists the username, submits. */
  submit: (username: string, password: string) => void;
}

export function extractLogin(doc: Document): LoginState;
```

**Login error message.** On a failed attempt the game re-serves the login page
(`otLogin`) with a status message in a `font[face="Comic sans MS"]` coloured
`#003366` (the "Login:/Jelszó:" label row uses colour `000000`; the news feed
does not use that font). Observed text:
`"Hiányzik a karakter, vagy rossz adatokat adtál meg!"`. `extractLogin` reads
that element's text into `error` (`''` when absent), and `Login.tsx` renders it
as a `role="alert"` banner above the fields.

Behaviour of `submit(username, password)`:
1. Set `input[name="loginname"].value = username` and
   `input[name="loginpassw"].value = password` on the original controls.
2. `GM_setValue(LOGIN_USERNAME_KEY, username)` to remember the username.
3. `.click()` the original `input[name="Submit"]` image button so the game's
   native POST fires. If the button is missing, fall back to submitting the
   input's enclosing `form`.

`savedUsername` is read from `GM_getValue(LOGIN_USERNAME_KEY, '')`.

`GM_getValue` / `GM_setValue` are already `@grant`-ed in the loader and mocked
in `tests/setup.ts`.

### 3. Component — `src/pages/Login.tsx`

A centered card matching the dark-medieval theme:
- Heading (game title).
- Username input: `maxlength=18`, pre-filled from `savedUsername`, `autofocus`.
- Password input: `type="password"`, `maxlength=18`.
- "Belépés" primary button (`lc-btn`).
- Local `useState` for both fields; submitting (button click **or** Enter/"go"
  on the mobile keyboard) calls `state.submit(username, password)`.

```ts
export interface LoginProps { state: LoginState; }
export function Login({ state }: LoginProps): JSX.Element;
```

### 4. Wiring — `src/main.ts`

Extend the `PageState` discriminated union with the Login case and handle it in
`boot()`. The login screen needs no monster DB, so its branch renders once and
skips the `loadMonsters` call entirely. `ensureMobileViewport` and
`hideOriginalDOM` are reused unchanged.

```ts
type PageState =
  | { pageType: PageType.FreeMove; state: FreeMoveState }
  | { pageType: PageType.Battle; state: BattleState }
  | { pageType: PageType.Login; state: LoginState };
```

`boot()` continues to return early for `Unknown`/`Shop`/`Church`.

### 5. Styling — `src/styles/base.css`

Add `lc-login-*` classes (centered card, labeled full-width inputs, spacing)
using the existing CSS custom properties — **no new colors**.

## Testing (Vitest + @testing-library/preact, jsdom)

Follow the existing fixture-DOM style; GM_* are mocked in `tests/setup.ts`.

- `pageDetector.test.ts`: a fixture with `oldalTipus=otLogin` → `PageType.Login`.
- `domExtract.test.ts`:
  - `extractLogin` returns the saved username from `GM_getValue`.
  - `submit()` writes both values onto the original inputs, calls `GM_setValue`
    with the username, and clicks the original `Submit` button (assert via a
    click spy on the fixture button).
- `Login.test.tsx`:
  - Renders username/password fields and the Belépés button.
  - Pre-fills the username field from `state.savedUsername`.
  - Typing into both fields and submitting calls `state.submit` with the entered
    values.

## Acceptance criteria

- On the real login page, the classic layout is hidden and the mobile login card
  is shown.
- Entering credentials and pressing Belépés logs in exactly as the native form
  would (same POST).
- On a later visit, the username field is pre-filled with the last-used value;
  the password is always empty.
- All existing tests still pass; new tests cover detection, extraction, and the
  component.
- `npx tsc --noEmit` is clean.
