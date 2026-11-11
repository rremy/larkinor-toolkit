// Userscript entry point. Picks one of two UIs and hands off:
//   mobile  — replaces the page (proxy-DOM), see src/mobile/boot.ts
//   desktop — augments the page with a dock, see src/desktop/boot.ts
// See docs/superpowers/specs/2026-08-11-desktop-support-design.md.

import { detectPlatform } from '@/utils/platform';
import { setCharacter } from '@/utils/config';
import { readLoginName } from '@/utils/domExtract';
import { bootMobile } from '@/mobile/boot';
import { bootDesktop } from '@/desktop/boot';
import { installActionLock } from '@/utils/actionLock';

// First, so its capture listener runs before any the boots attach: once an
// action has started reloading the page, a second one could log the player out.
installActionLock(window);

// Before anything reads storage: per-character keys are stored under the
// character this page belongs to (see "Per-character storage" in config.ts).
setCharacter(readLoginName(document));

if (detectPlatform(window) === 'desktop') {
  bootDesktop(document);
} else {
  bootMobile(document);
}
