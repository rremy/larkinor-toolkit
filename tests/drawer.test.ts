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
