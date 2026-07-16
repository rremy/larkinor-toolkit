import { describe, it, expect } from 'vitest';
import { getEnabledHotkeys, setEnabledHotkeys, ENABLED_HOTKEYS_KEY } from '../src/utils/config';

describe('enabled-hotkeys config', () => {
  it('returns an empty list when nothing is stored', () => {
    GM_setValue(ENABLED_HOTKEYS_KEY, '');
    expect(getEnabledHotkeys()).toEqual([]);
  });

  it('round-trips the enabled set through GM storage', () => {
    setEnabledHotkeys(['kajal', 'vargyogy']);
    expect(getEnabledHotkeys()).toEqual(['kajal', 'vargyogy']);
  });

  it('returns an empty list when storage is corrupt', () => {
    GM_setValue(ENABLED_HOTKEYS_KEY, 'not json');
    expect(getEnabledHotkeys()).toEqual([]);
  });
});
