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
