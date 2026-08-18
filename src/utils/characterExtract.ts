// Extraction for the Larkinor character page ("karakterlap",
// oldalTipus=otPlayerSettings) — the only page that prints the worn equipment
// set, and the only place equipment can be changed.
//
// Each slot's item carries its whole stat block inside its link's
// `onclick="alert('…')"`, in the same `label: value` per-line grammar the Home
// page's inventory uses — so `parseCuccDetail` is reused rather than
// reimplemented. The payload is a JS single-quoted string literal, so it is
// decoded (never executed) first.
//
// See docs/superpowers/specs/2026-08-18-equipment-compare-design.md.

import { parseCuccDetail } from '@/utils/homeExtract';
import {
  emptySlots, equippedFromDetail, LABEL_TO_SLOT, SLOT_LABEL,
  type EquippedItem, type Loadout, type Slot,
} from '@/shared/loadout';

/** Decodes the escapes a JS single-quoted string literal body can carry. */
export function decodeSingleQuoted(body: string): string {
  let out = '';
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] !== '\\') { out += body[i]; continue; }
    i += 1;
    switch (body[i]) {
      case 'n': out += '\n'; break;
      case 't': out += '\t'; break;
      case 'r': out += '\r'; break;
      case undefined: break;
      default: out += body[i];
    }
  }
  return out;
}

/**
 * The still-escaped argument of `alert('…')`, or null when the handler is
 * something else. Scans for the closing quote rather than matching lazily, so
 * an apostrophe inside the payload cannot truncate it.
 */
export function alertPayload(onclick: string): string | null {
  const start = onclick.indexOf("alert('");
  if (start === -1) return null;
  const from = start + "alert('".length;
  for (let i = from; i < onclick.length; i += 1) {
    if (onclick[i] === '\\') { i += 1; continue; }
    if (onclick[i] === "'") return onclick.slice(from, i);
  }
  return null;
}

/** The `<td>` holding the equipment slots: the smallest one that lists them. */
function equipmentBlock(doc: Document): Element | null {
  const marker = `${SLOT_LABEL.leftHand}:`; // "Bal kéz:"
  const candidates = Array.from(doc.querySelectorAll('td')).filter(
    (td) => (td.textContent ?? '').includes(marker),
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((best, td) =>
    (td.textContent ?? '').length < (best.textContent ?? '').length ? td : best);
}

/** The stat block behind a slot's link, mapped to an EquippedItem. */
function itemFrom(anchor: Element): EquippedItem | null {
  const payload = alertPayload(anchor.getAttribute('onclick') ?? '');
  if (payload === null) return null;
  return equippedFromDetail(parseCuccDetail(decodeSingleQuoted(payload)));
}

/**
 * Reads the five equipment slots. Walks the block's child nodes in order,
 * tracking the label the most recent text node ended with and attaching the
 * next link to that slot — rather than splitting on `<br>`, so incidental
 * whitespace and markup changes around the separators do not matter.
 *
 * Returns null when the block is absent: a page whose shape has drifted fails
 * visibly instead of overwriting a good loadout with five empty slots.
 */
export function extractCharacter(doc: Document): Loadout | null {
  const block = equipmentBlock(doc);
  if (!block) return null;

  const slots = emptySlots();
  let pending: Slot | null = null;

  for (const node of Array.from(block.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const label = (node.textContent ?? '').match(/([^:<>\n]+):\s*$/)?.[1]?.trim();
      pending = label !== undefined && label in LABEL_TO_SLOT ? LABEL_TO_SLOT[label] : pending;
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE || pending === null) continue;
    const el = node as Element;
    const anchor = el.matches('a[onclick]') ? el : el.querySelector('a[onclick]');
    if (!anchor) continue;
    slots[pending] = itemFrom(anchor);
    pending = null;
  }

  const levelMatch = (doc.body.textContent ?? '').match(/(?:^|\s)Szint:\s*(\d+)/);

  return {
    version: 1,
    playerLevel: levelMatch ? parseInt(levelMatch[1], 10) : null,
    capturedAt: Date.now(),
    slots,
  };
}
