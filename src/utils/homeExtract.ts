// Extraction for the Larkinor "Otthon" (own-house) page. The per-item detail
// (name/weight/amount/price/type) is NOT in the DOM controls — it lives in the
// page's inline `hazbanCucc[i]="..."` / `hatizsakCucc[i]="..."` <script>. We read
// that script's textContent and parse it (never execute it), so it works from
// the ViolentMonkey sandbox. Indices match the <select> option position, which
// is exactly the index the move form expects (see the reference spec).
//
// See docs/superpowers/specs/2026-07-06-larkinor-real-dom-reference.md.

import type { BuildingOption } from '@/utils/domExtract';
import { basename, extractImageControl, parsePlayerName } from '@/utils/domExtract';

export type HomeItemType = 'fegyver' | 'vért' | 'tárgy';

export interface ParsedDetail {
  name: string;
  type: HomeItemType;
  /** Unit weight in kg. */
  weight: number;
  /** Stack count (1 when the game prints no "Mennyiség"). */
  amount: number;
  /** Total stack weight in kg ("Összsúly", or weight*amount when absent). */
  totalWeight: number;
  /** Unit price in ezüst, or null when the item has no price. */
  price: number | null;
  magical: boolean;
  /** All parsed "label: value" pairs, in source order, for the detail sheet. */
  attrs: Array<[string, string]>;
}

export function parseCuccDetail(raw: string): ParsedDetail {
  const attrs: Array<[string, string]> = [];
  let magical = false;
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    if (t === 'Mágikus!!!') { magical = true; continue; }
    const m = t.match(/^([^:]+):\s*(.*)$/);
    if (m) attrs.push([m[1].trim(), m[2].trim()]);
  }
  const get = (k: string): string | undefined => attrs.find(([kk]) => kk === k)?.[1];

  const name = get('Név') ?? '?';
  const typeRaw = get('Típus');
  const type: HomeItemType = typeRaw === 'fegyver' ? 'fegyver' : typeRaw === 'vért' ? 'vért' : 'tárgy';
  const weight = parseFloat(get('Súly') ?? '') || 0;
  const amount = parseInt(get('Mennyiség') ?? '', 10) || 1;
  const totalWeight = parseFloat(get('Összsúly') ?? '') || weight * amount;
  const priceStr = get('Ár');
  const price = priceStr ? (parseInt(priceStr.replace(/\D/g, ''), 10) || null) : null;

  return { name, type, weight, amount, totalWeight, price, magical, attrs };
}

export interface HomeItem extends ParsedDetail {
  /** Position in the container's <select> — the move-form index (selectedIndex). */
  index: number;
}

export interface HomeContainer {
  used: number;
  max: number;
  items: HomeItem[];
  /** Moves `qty` of `item` to the other container by driving the game form. */
  move: (item: HomeItem, qty: number) => void;
}

export interface HomeTrap {
  label: string;
  strength: number | null;
  leszerel: () => void;
}

export interface HomeActions {
  everythingToBackpack: BuildingOption | null;
  magicChair: BuildingOption | null;
  recoverLost: BuildingOption | null;
  settings: BuildingOption | null;
  exit: BuildingOption | null;
}

export interface HomeState {
  playerName: string;
  house: HomeContainer;
  backpack: HomeContainer;
  traps: HomeTrap[];
  actions: HomeActions;
}

/** Decodes a JS double-quoted string body (the bit between the quotes). */
function decodeJsString(body: string): string {
  try {
    return JSON.parse(`"${body}"`) as string;
  } catch {
    return body.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
}

/** Reads `varName[i]="..."` entries out of the inventory <script> text, by index. */
export function parseCuccArray(scriptText: string, varName: 'hazbanCucc' | 'hatizsakCucc'): string[] {
  const out: string[] = [];
  const re = new RegExp(`${varName}\\[(\\d+)\\]\\s*=\\s*"((?:\\\\.|[^"\\\\])*)"`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(scriptText)) !== null) {
    out[parseInt(m[1], 10)] = decodeJsString(m[2]);
  }
  return out;
}

/** The inline <script> that defines the two inventory arrays (or ''). */
function inventoryScriptText(doc: Document): string {
  const scripts = Array.from(doc.querySelectorAll('script:not([src])'));
  return scripts.find((s) => /hazbanCucc|hatizsakCucc/.test(s.textContent ?? ''))?.textContent ?? '';
}

/** Finds a titled `<input type="image">` by its image basename. */
function imageButtonByBasename(doc: Document, name: string): HTMLInputElement | null {
  return (
    Array.from(doc.querySelectorAll<HTMLInputElement>('input[type="image"]')).find(
      (i) => basename(i.getAttribute('src') ?? '') === name,
    ) ?? null
  );
}

function parseCapacityPair(text: string, re: RegExp): { used: number; max: number } {
  const m = text.match(re);
  return { used: m ? parseFloat(m[1]) : 0, max: m ? parseFloat(m[2]) : 0 };
}

function buildContainer(
  doc: Document,
  scriptText: string,
  varName: 'hazbanCucc' | 'hatizsakCucc',
  selectName: string,
  qtyName: string,
  moveButtonBasename: string,
  cap: { used: number; max: number },
): HomeContainer {
  const items: HomeItem[] = [];
  parseCuccArray(scriptText, varName).forEach((raw, index) => {
    if (raw === undefined) return; // skip array holes
    items.push({ index, ...parseCuccDetail(raw) });
  });

  const move = (item: HomeItem, qty: number): void => {
    const form = doc.forms.namedItem('hazUrlap');
    const sel = form?.elements.namedItem(selectName) as HTMLSelectElement | null;
    const qtyInput = form?.elements.namedItem(qtyName) as HTMLInputElement | null;
    const btn = imageButtonByBasename(doc, moveButtonBasename);
    if (!sel || !qtyInput || !btn) return;
    sel.selectedIndex = item.index;
    qtyInput.value = String(Math.max(1, Math.min(qty, item.amount)));
    btn.click();
  };

  return { used: cap.used, max: cap.max, items, move };
}

/** Reads text nodes following `el` up to the next <br>/<input>. */
function textAfter(el: Element): string {
  let text = '';
  let node: ChildNode | null = el.nextSibling;
  while (node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = (node as Element).tagName;
      if (tag === 'BR' || tag === 'INPUT') break;
    }
    if (node.nodeType === Node.TEXT_NODE) text += node.textContent ?? '';
    node = node.nextSibling;
  }
  return text.replace(/\s+/g, ' ').trim();
}

function extractTraps(doc: Document): HomeTrap[] {
  const leszerel = imageButtonByBasename(doc, 'leszerel');
  if (!leszerel) return [];
  return Array.from(doc.querySelectorAll<HTMLInputElement>('input[type="radio"][name="radiobutton"]')).map(
    (radio) => {
      const label = textAfter(radio);
      const name = label.split(',')[0].trim();
      const sm = label.match(/erőssége:\s*(\d+)/);
      return { label: name, strength: sm ? parseInt(sm[1], 10) : null, leszerel: () => leszerel.click() };
    },
  );
}

export function extractHome(doc: Document): HomeState {
  const scriptText = inventoryScriptText(doc);
  const bodyText = doc.body.textContent ?? '';
  const houseCap = parseCapacityPair(bodyText, /Ház telítettsége:\s*([\d.]+)\s*\/\s*([\d.]+)/);
  const backpackCap = parseCapacityPair(bodyText, /hátizsákjában és testén\s*([\d.]+)\s*\/\s*([\d.]+)/);

  return {
    playerName: parsePlayerName(doc),
    house: buildContainer(doc, scriptText, 'hazbanCucc', 'hazTargy', 'htMennyiseg', 'hazbolvesz', houseCap),
    backpack: buildContainer(doc, scriptText, 'hatizsakCucc', 'hatizsakTargy', 'hzsMennyiseg', 'hazbatesz', backpackCap),
    traps: extractTraps(doc),
    actions: {
      everythingToBackpack: extractImageControl(doc, 'hatizsakba'),
      magicChair: extractImageControl(doc, 'varazsszek'),
      recoverLost: extractImageControl(doc, 'ab'),
      settings: extractImageControl(doc, 'klap'),
      exit: extractImageControl(doc, 'vissza'),
    },
  };
}
