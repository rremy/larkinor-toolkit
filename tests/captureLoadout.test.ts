import { describe, expect, it, vi } from 'vitest';
import { captureLoadout } from '../src/utils/captureLoadout';
import { LOADOUT_PREF_KEY, parseLoadout } from '../src/shared/loadout';

const page = (inner: string) => new DOMParser().parseFromString(
  `<html><body><table><tr><td>Név: Remy Szint: 23</td></tr><tr><td>${inner}Terhelés: <b>1kg. / 2kg.</b></td></tr></table></body></html>`,
  'text/html',
);

const HEAD = 'Típus: vért\\nNév: ent sisak\\nMin. szint: 20\\nVédelem: 16\\nFajta: fejre\\n';

describe('captureLoadout', () => {
  it('writes the extracted loadout under the loadout key', () => {
    const write = vi.fn();
    const doc = page(`Fej: <b><a href="#" onclick="alert('${HEAD}');return false;">ent sisak</a></b><br>`);

    expect(captureLoadout(doc, write)).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    const [key, value] = write.mock.calls[0];
    expect(key).toBe(LOADOUT_PREF_KEY);
    expect(parseLoadout(value)!.slots.head!.name).toBe('ent sisak');
  });

  it('writes nothing when the page has no equipment block', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const write = vi.fn();
    const doc = new DOMParser().parseFromString('<html><body><td>Semmi</td></body></html>', 'text/html');

    expect(captureLoadout(doc, write)).toBe(false);
    expect(write).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
