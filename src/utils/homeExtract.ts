// Extraction for the Larkinor "Otthon" (own-house) page. The per-item detail
// (name/weight/amount/price/type) is NOT in the DOM controls — it lives in the
// page's inline `hazbanCucc[i]="..."` / `hatizsakCucc[i]="..."` <script>. We read
// that script's textContent and parse it (never execute it), so it works from
// the ViolentMonkey sandbox. Indices match the <select> option position, which
// is exactly the index the move form expects (see the reference spec).
//
// See docs/superpowers/specs/2026-07-06-larkinor-real-dom-reference.md.

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
