import { describe, expect, it } from 'vitest';
import { alertPayload, decodeSingleQuoted, extractCharacter } from '../src/utils/characterExtract';

const slot = (label: string, name: string, detail: string) =>
  `${label}: <b><a href="#" onclick="alert('${detail}');return false;">${name}</a></b><br>`;

// The four stat blocks below are the real page's, verbatim (see .tmp/karakterlap.html).
const WEAPON = 'Típus: fegyver\\nNév: Kaltenekker íj\\nSúly: 2.6 kg.\\nÁr: 7560 ezüst\\nExtra: vámpirizál\\nMin. szint: 21\\nMaximum sebzés: 133\\nSebzés szórás: 7\\nFajta: távolsági\\nMágikus!!!\\n';
const SHIELD = 'Típus: vért\\nNév: bőrpajzs\\nSúly: 2 kg.\\nÁr: 8 ezüst\\nVédelem: 1\\nFajta: kézbe\\n';
const BODY = 'Típus: vért\\nNév: Zamárdi felsője\\nSúly: 4.5 kg.\\nÁr: 1310 ezüst\\nMin. szint: 19\\nVédelem: 21\\nFajta: testre\\n';
const HEAD = 'Típus: vért\\nNév: ent sisak\\nSúly: 1.4 kg.\\nÁr: 1457 ezüst\\nMin. szint: 20\\nVédelem: 16\\nFajta: fejre\\n';

function pageWith(inner: string): Document {
  return new DOMParser().parseFromString(
    `<html><body><table><tr><td>Név: Remy Szint: 23 Tapasztalati pont: 3912013</td></tr>
     <tr><td>${inner}Terhelés: <b>23.3229kg. / 111.2kg.</b></td></tr></table></body></html>`,
    'text/html',
  );
}

const FULL = pageWith(
  slot('Bal kéz', 'Kaltenekker íj', WEAPON) +
  slot('Jobb kéz', 'bőrpajzs', SHIELD) +
  slot('Test', 'Zamárdi felsője', BODY) +
  slot('Fej', 'ent sisak', HEAD) +
  'Láb: <br>',
);

describe('decodeSingleQuoted', () => {
  it('decodes the escapes a JS single-quoted literal can carry', () => {
    expect(decodeSingleQuoted('a\\nb')).toBe('a\nb');
    expect(decodeSingleQuoted("Sam\\'s")).toBe("Sam's");
    expect(decodeSingleQuoted('back\\\\slash')).toBe('back\\slash');
    expect(decodeSingleQuoted('tab\\there')).toBe('tab\there');
  });
});

describe('alertPayload', () => {
  it('takes the argument of the alert call', () => {
    expect(alertPayload("alert('Név: ásó\\n');return false;")).toBe('Név: ásó\\n');
  });

  it('stops at the closing quote, not at an escaped one', () => {
    expect(alertPayload("alert('Sam\\'s hat');return false;")).toBe("Sam\\'s hat");
  });

  it('is null for an onclick that is not an alert', () => {
    expect(alertPayload('svEngageCreature();return false;')).toBeNull();
  });
});

describe('extractCharacter', () => {
  it("reads every occupied slot, keyed by the page's own labels", () => {
    const loadout = extractCharacter(FULL)!;
    expect(loadout.slots.leftHand).toEqual({
      name: 'Kaltenekker íj', kind: 'fegyver', type: 'távolsági', level: 21,
      maxDamage: 133, spread: 7, defense: null, magical: true, vampiric: true,
    });
    expect(loadout.slots.body?.defense).toBe(21);
    expect(loadout.slots.head?.name).toBe('ent sisak');
  });

  it('reads a shield in a hand, level and all', () => {
    const shield = extractCharacter(FULL)!.slots.rightHand!;
    expect(shield).toMatchObject({ name: 'bőrpajzs', kind: 'vért', defense: 1, level: null });
  });

  it('leaves an empty slot null', () => {
    expect(extractCharacter(FULL)!.slots.legs).toBeNull();
  });

  it('captures the player level and a timestamp', () => {
    const loadout = extractCharacter(FULL)!;
    expect(loadout.playerLevel).toBe(23);
    expect(loadout.version).toBe(2);
    expect(loadout.capturedAt).toBeGreaterThan(0);
  });

  it('is null when the page carries no equipment block', () => {
    const doc = new DOMParser().parseFromString('<html><body><td>Semmi</td></body></html>', 'text/html');
    expect(extractCharacter(doc)).toBeNull();
  });
});
