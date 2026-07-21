# Home Inventory View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-game "Otthon" (Home) page to the userscript that lets the player browse the house and backpack inventories, see weights/amounts/capacities, search & sort, open item details in the DB overlay, and move items between house and backpack.

**Architecture:** New page follows the existing proxy-DOM pattern — extract state from the live DOM into a `HomeState`, move the original DOM off-screen, mount a Preact `Home` page. The per-item detail (name, weight, amount, price, type) is parsed out of the page's inline `hazbanCucc` / `hatizsakCucc` array-defining `<script>` (read from `.textContent`, never executed — sandbox-safe). Moving an item drives the game's own `form[name="hazUrlap"]` (set the `<select>` `selectedIndex` + the quantity field, then `.click()` the hidden image button), so the game reloads and we re-extract — one submit per move.

**Tech Stack:** Vite + Preact + TypeScript, Vitest + @testing-library/preact (jsdom), existing shared data layer + `theme.css`.

## Global Constraints

- All comments and identifiers in English; UI copy in Hungarian (game is Hungarian).
- Never add hardcoded hex/rgba in CSS rule bodies — use `:root` variables and `lc-*` scopes from `src/shared/styles/theme.css`.
- Never parse/reconstruct a control's `onclick`; locate the control and `.click()` it (proxy-DOM pattern).
- DB components must use the `DataSource`/`DataLoader` abstraction, never call `GM_*` directly.
- Quality gates must pass before completion: `npx tsc --noEmit`, `npm test`. (There is no lint script in this repo; type-check + tests are the gates.)
- Mobile-first: the real target is Firefox for Android; do not rely on `field-sizing: content` (unsupported there).
- `hazbanCucc[i]` / `hatizsakCucc[i]` are indexed by the `<select>` **option position** (`selectedIndex`), which is exactly the move-form index. The option's `value` attribute is the game's internal slot id and is set automatically when `selectedIndex` is set — do not use it directly.

---

### Task 1: Detect the Home page

**Files:**
- Modify: `src/utils/pageDetector.ts`
- Test: `tests/pageDetector.test.ts`

**Interfaces:**
- Produces: `PageType.Home` enum member; `detectPage` returns it for `oldalTipus === 'otSajathaz'`.

- [ ] **Step 1: Write the failing test**

Add to `tests/pageDetector.test.ts` (inside the existing `describe`):

```ts
it('detects the home page from otSajathaz', () => {
  const doc = new JSDOM(
    '<form name="urlap"><input name="oldalTipus" value="otSajathaz"></form>'
  ).window.document;
  expect(detectPage(doc)).toBe(PageType.Home);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pageDetector.test.ts`
Expected: FAIL — `PageType.Home` is `undefined` / value mismatch.

- [ ] **Step 3: Add the enum member and case**

In `src/utils/pageDetector.ts`, add to the `PageType` enum:

```ts
  Home = 'Home',
```

And add a case in the `switch` (before `default`):

```ts
    case 'otSajathaz':
      return PageType.Home;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pageDetector.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/pageDetector.ts tests/pageDetector.test.ts
git commit -m "feat(home): detect otSajathaz as Home page"
```

---

### Task 2: Parse a single inventory detail string

**Files:**
- Create: `src/utils/homeExtract.ts`
- Test: `tests/homeExtract.test.ts`

**Interfaces:**
- Produces:
  - `type HomeItemType = 'fegyver' | 'vért' | 'tárgy'`
  - `interface ParsedDetail { name: string; type: HomeItemType; weight: number; amount: number; totalWeight: number; price: number | null; magical: boolean; attrs: Array<[string, string]> }`
  - `function parseCuccDetail(raw: string): ParsedDetail`

- [ ] **Step 1: Write the failing test**

Create `tests/homeExtract.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseCuccDetail } from '../src/utils/homeExtract';

describe('parseCuccDetail', () => {
  it('parses a stacked plain item', () => {
    const d = parseCuccDetail(
      'Név: opál\nSúly: 0.05 kg.\nÁr: 20 ezüst\nMennyiség: 20\nÖsszár: 400 ezüst\nÖsszsúly: 1 kg.\n'
    );
    expect(d.name).toBe('opál');
    expect(d.type).toBe('tárgy');
    expect(d.weight).toBe(0.05);
    expect(d.amount).toBe(20);
    expect(d.totalWeight).toBe(1);
    expect(d.price).toBe(20);
    expect(d.magical).toBe(false);
  });

  it('parses a magical weapon with no Mennyiség (defaults amount to 1)', () => {
    const d = parseCuccDetail(
      'Típus: fegyver\nNév: mágikus fejsze\nSúly: 1.8 kg.\nÁr: 1000 ezüst\nMin. szint: 15\nMaximum sebzés: 64\nMágikus!!!\n'
    );
    expect(d.type).toBe('fegyver');
    expect(d.amount).toBe(1);
    expect(d.totalWeight).toBeCloseTo(1.8);
    expect(d.magical).toBe(true);
    expect(d.attrs).toContainEqual(['Maximum sebzés', '64']);
  });

  it('parses armor and leaves price null when absent', () => {
    const d = parseCuccDetail('Név: bronzkulcs\nSúly: 0.3 kg.\nExtra: kulcs\n');
    expect(d.type).toBe('tárgy');
    expect(d.price).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/homeExtract.test.ts`
Expected: FAIL — cannot import `parseCuccDetail`.

- [ ] **Step 3: Write the parser**

Create `src/utils/homeExtract.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/homeExtract.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/homeExtract.ts tests/homeExtract.test.ts
git commit -m "feat(home): parse inventory item detail strings"
```

---

### Task 3: Extract full HomeState from the live DOM

**Files:**
- Modify: `src/utils/domExtract.ts` (export existing private helpers)
- Modify: `src/utils/homeExtract.ts`
- Test: `tests/homeExtract.test.ts`

**Interfaces:**
- Consumes: from `@/utils/domExtract` — `type BuildingOption`, and (newly exported) `basename`, `absolutizeGameUrl`, `extractImageControl`, `parsePlayerName`.
- Produces:
  - `interface HomeItem extends ParsedDetail { index: number }`
  - `interface HomeContainer { used: number; max: number; items: HomeItem[]; move: (item: HomeItem, qty: number) => void }`
  - `interface HomeTrap { label: string; strength: number | null; leszerel: () => void }`
  - `interface HomeActions { everythingToBackpack: BuildingOption | null; magicChair: BuildingOption | null; recoverLost: BuildingOption | null; settings: BuildingOption | null; exit: BuildingOption | null }`
  - `interface HomeState { playerName: string; house: HomeContainer; backpack: HomeContainer; traps: HomeTrap[]; actions: HomeActions }`
  - `function parseCuccArray(scriptText: string, varName: 'hazbanCucc' | 'hatizsakCucc'): string[]`
  - `function extractHome(doc: Document): HomeState`

- [ ] **Step 1: Export the reusable helpers from domExtract**

In `src/utils/domExtract.ts`, add the `export` keyword to these four existing declarations (do not change their bodies):

- `function basename(src: string): string` → `export function basename(...)`
- `function absolutizeGameUrl(src: string): string` → `export function absolutizeGameUrl(...)`
- `function parsePlayerName(doc: Document): string` → `export function parsePlayerName(...)`
- `function extractImageControl(doc: Document, wantName: string): BuildingOption | null` → `export function extractImageControl(...)`

- [ ] **Step 2: Write the failing test**

Append to `tests/homeExtract.test.ts`:

```ts
import { JSDOM } from 'jsdom';
import { vi } from 'vitest';
import { parseCuccArray, extractHome } from '../src/utils/homeExtract';

const HOME_HTML = `
  <form name="urlap" action="/../cgi-bin/larkinor">
    <input type="hidden" name="oldalTipus" value="otSajathaz">
    <input type="hidden" name="Submit" value="semmi">
    <input type="hidden" name="par1" value="">
    <input type="hidden" name="par2" value="">
  </form>
  <b><a title="karakterlap"><font color="blue">Remy</font></a></b>
  <div>Ház telítettsége: 130.3601/140</div>
  <div>Remy hátizsákjában és testén 105.7586/107 kg tömegű tárgy van.</div>
  <input type="image" src="/2/ikon/hatizsakba.gif" title="Hátizsákba mindent">
  <input type="image" src="/2/ikon/varazsszek.gif" title="Beülsz a varázsszékedbe.">
  <input type="image" src="/2/ikon/ab.gif" title="Ha elveszett az antiballasztod...">
  <input type="image" src="/2/ikon/klap.gif" title="Beállítások">
  <input type="image" src="/2/ikon/vissza.gif" title="Kilépés az epületből">
  <input type="image" src="/2/ikon/leszerel.gif" title="Leszereled a csapdát.">
  <form name="hazUrlap">
    <select name="hazTargy">
      <option value="0">51031 ezüst</option>
      <option value="7">1 mágikus fejsze</option>
    </select>
    <input type="image" src="/2/ikon/hazbolvesz.gif" title="Magadhoz teszed.">
    <input type="text" name="htMennyiseg" value="1">
    <select name="hatizsakTargy">
      <option value="0">2686 ezüst</option>
    </select>
    <input type="image" src="/2/ikon/hazbatesz.gif" title="Kirakod">
    <input type="text" name="hzsMennyiseg" value="1">
  </form>
  <div>Házban lévő csapdák
    <input type="radio" name="radiobutton" value="on" checked> zuhanórács, erőssége: 7<br>
  </div>
  <script>
    var hazbanCucc = new Array();
    hazbanCucc[0]="Név: ezüst\\nSúly: 0.0001 kg.\\nMennyiség: 51031\\nÖsszsúly: 5.1031 kg.\\n";
    hazbanCucc[1]="Típus: fegyver\\nNév: mágikus fejsze\\nSúly: 1.8 kg.\\nMágikus!!!\\n";
    var hatizsakCucc = new Array();
    hatizsakCucc[0]="Név: ezüst\\nSúly: 0.0001 kg.\\nMennyiség: 2686\\nÖsszsúly: 0.2686 kg.\\n";
  </script>
`;

function homeDoc(): Document {
  return new JSDOM(`<html><body>${HOME_HTML}</body></html>`).window.document;
}

describe('parseCuccArray', () => {
  it('reads indexed entries and unescapes newlines', () => {
    const doc = homeDoc();
    const scriptText = doc.querySelector('script')!.textContent!;
    const arr = parseCuccArray(scriptText, 'hazbanCucc');
    expect(arr).toHaveLength(2);
    expect(arr[0]).toContain('Név: ezüst');
    expect(arr[0]).toContain('\n');
  });
});

describe('extractHome', () => {
  it('extracts capacities and both containers', () => {
    const s = extractHome(homeDoc());
    expect(s.playerName).toBe('Remy');
    expect(s.house.used).toBeCloseTo(130.3601);
    expect(s.house.max).toBe(140);
    expect(s.backpack.used).toBeCloseTo(105.7586);
    expect(s.house.items).toHaveLength(2);
    expect(s.house.items[1].name).toBe('mágikus fejsze');
    expect(s.house.items[1].index).toBe(1);
    expect(s.backpack.items[0].name).toBe('ezüst');
  });

  it('extracts the trap and its actions', () => {
    const s = extractHome(homeDoc());
    expect(s.traps).toHaveLength(1);
    expect(s.traps[0].label).toBe('zuhanórács');
    expect(s.traps[0].strength).toBe(7);
    expect(s.actions.everythingToBackpack).not.toBeNull();
    expect(s.actions.exit).not.toBeNull();
  });

  it('move() sets the select index + quantity and clicks the move button', () => {
    const doc = homeDoc();
    const s = extractHome(doc);
    const btn = doc.querySelector<HTMLInputElement>('input[src*="hazbolvesz.gif"]')!;
    const clickSpy = vi.spyOn(btn, 'click').mockImplementation(() => {});
    const sel = doc.querySelector<HTMLSelectElement>('select[name="hazTargy"]')!;
    const qty = doc.querySelector<HTMLInputElement>('input[name="htMennyiseg"]')!;

    s.house.move(s.house.items[1], 1);

    expect(sel.selectedIndex).toBe(1);
    expect(qty.value).toBe('1');
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/homeExtract.test.ts`
Expected: FAIL — cannot import `parseCuccArray` / `extractHome`.

- [ ] **Step 4: Implement extraction**

Append to `src/utils/homeExtract.ts`:

```ts
import type { BuildingOption } from '@/utils/domExtract';
import { basename, extractImageControl, parsePlayerName } from '@/utils/domExtract';

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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/homeExtract.test.ts`
Expected: PASS (all describes).

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/utils/domExtract.ts src/utils/homeExtract.ts tests/homeExtract.test.ts
git commit -m "feat(home): extract HomeState (capacities, containers, traps, actions)"
```

---

### Task 4: Open the DB overlay by item name

**Files:**
- Modify: `src/database/DatabaseApp.tsx`
- Modify: `src/components/DatabaseOverlay.tsx`
- Test: `tests/DatabaseOverlay.test.tsx`

**Interfaces:**
- Consumes: `DataLoader.loadWeapons/loadArmors/loadItems` (existing).
- Produces: `initialItemName?: string` prop on both `DatabaseAppProps` and `DatabaseOverlayProps`; when set, the app resolves the name to a `{ tab, id }` and navigates there on mount.

- [ ] **Step 1: Write the failing test**

Append to `tests/DatabaseOverlay.test.tsx` a test that the prop is accepted and forwarded (resolution itself needs network data, so assert the overlay renders with the prop without throwing):

```ts
it('accepts initialItemName without throwing', () => {
  const onClose = vi.fn();
  render(<DatabaseOverlay open onClose={onClose} initialItemName="opál" />);
  expect(document.querySelector('.lc-db-overlay .lc-db')).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/DatabaseOverlay.test.tsx`
Expected: FAIL — TypeScript rejects the unknown `initialItemName` prop (test file won't compile).

- [ ] **Step 3: Add the prop + resolution to DatabaseApp**

In `src/database/DatabaseApp.tsx`, add to `DatabaseAppProps`:

```ts
  /** Entity name to open on mount — resolved to its tab+id. Used from the Home page. */
  initialItemName?: string;
```

Destructure it: change `const { loader, routing = 'hash', initialItemId } = props;` to include `initialItemName`.

Add this resolver next to `resolveEntityTab`:

```ts
  /** Resolve an entity by (case-insensitive) name across the three item datasets. */
  async function resolveEntityByName(name: string): Promise<{ tab: EntityTab; id: number } | null> {
    const norm = name.trim().toLowerCase();
    const [weapons, armors, items] = await Promise.all([
      loader.loadWeapons(), loader.loadArmors(), loader.loadItems(),
    ]);
    const w = weapons.find((x) => x.name.toLowerCase() === norm);
    if (w) return { tab: 'weapons', id: w.id };
    const a = armors.find((x) => x.name.toLowerCase() === norm);
    if (a) return { tab: 'armors', id: a.id };
    const it = items.find((x) => x.name.toLowerCase() === norm);
    if (it) return { tab: 'items', id: it.id };
    return null;
  }
```

Add this effect right after the existing `initialItemId` effect:

```ts
  // Opened on a specific item by name (Home page item link): resolve + jump.
  useEffect(() => {
    if (!initialItemName) return;
    let cancelled = false;
    resolveEntityByName(initialItemName).then((hit) => {
      if (!cancelled && hit) navigate(hit.tab, String(hit.id));
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialItemName]);
```

- [ ] **Step 4: Forward the prop from DatabaseOverlay**

In `src/components/DatabaseOverlay.tsx`, add `initialItemName?: string;` to `DatabaseOverlayProps`, destructure it, and pass it through:

```tsx
export function DatabaseOverlay({ open, onClose, initialItemId, initialItemName }: DatabaseOverlayProps) {
```

```tsx
        <DatabaseApp loader={loader} routing="memory" initialItemId={initialItemId} initialItemName={initialItemName} />
```

- [ ] **Step 5: Run test + type-check**

Run: `npx vitest run tests/DatabaseOverlay.test.tsx && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/database/DatabaseApp.tsx src/components/DatabaseOverlay.tsx tests/DatabaseOverlay.test.tsx
git commit -m "feat(db): open overlay by item name (initialItemName)"
```

---

### Task 5: CapacityMeter component + styles

**Files:**
- Create: `src/components/CapacityMeter.tsx`
- Modify: `src/shared/styles/theme.css` (append a Home section)
- Test: `tests/CapacityMeter.test.tsx`

**Interfaces:**
- Produces: `interface CapacityMeterProps { label: string; used: number; max: number; icon?: string }` and `function CapacityMeter(props): JSX.Element`. Fill element carries a level class `lc-cap-fill--ok | --warn | --crit` (crit > 95%, warn > 80%).

- [ ] **Step 1: Write the failing test**

Create `tests/CapacityMeter.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/preact';
import { CapacityMeter } from '../src/components/CapacityMeter';

describe('CapacityMeter', () => {
  it('renders used/max and a proportional fill', () => {
    const { container, getByText } = render(<CapacityMeter label="Ház" used={70} max={140} />);
    const fill = container.querySelector<HTMLElement>('.lc-cap-fill')!;
    expect(fill.style.width).toBe('50%');
    expect(getByText(/140/)).toBeTruthy();
    expect(fill.className).toContain('lc-cap-fill--ok');
  });

  it('flags a nearly-full container as critical', () => {
    const { container } = render(<CapacityMeter label="Hátizsák" used={106} max={107} />);
    expect(container.querySelector('.lc-cap-fill--crit')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/CapacityMeter.test.tsx`
Expected: FAIL — cannot import `CapacityMeter`.

- [ ] **Step 3: Implement the component**

Create `src/components/CapacityMeter.tsx`:

```tsx
import { h, type JSX } from 'preact';

export interface CapacityMeterProps {
  label: string;
  /** Weight currently used, in kg. */
  used: number;
  /** Capacity, in kg. */
  max: number;
  /** Optional leading glyph (e.g. "⌂" or "🎒"). */
  icon?: string;
}

/** Rounds to 2 decimals and formats with Hungarian grouping. */
function kg(n: number): string {
  return (Math.round(n * 100) / 100).toLocaleString('hu-HU');
}

export function CapacityMeter({ label, used, max, icon }: CapacityMeterProps): JSX.Element {
  const pct = max > 0 ? Math.min(100, (used / max) * 100) : 0;
  const level = pct > 95 ? 'crit' : pct > 80 ? 'warn' : 'ok';
  return (
    <div class="lc-cap">
      <div class="lc-cap-head">
        <span class="lc-cap-label">{icon && <span class="lc-cap-icon">{icon}</span>}{label}</span>
        <span class="lc-cap-val"><b>{kg(used)}</b> / {kg(max)} kg</span>
      </div>
      <div class="lc-cap-track">
        <div class={`lc-cap-fill lc-cap-fill--${level}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Append the Home styles to theme.css**

Append to the end of `src/shared/styles/theme.css`:

```css
/* ================================================================
   Home / inventory page (Otthon)
   ================================================================ */
.lc-cap { padding: 0 12px 8px; }
.lc-cap-head { display: flex; justify-content: space-between; align-items: baseline; font-size: 12.5px; margin-bottom: 5px; }
.lc-cap-label { color: var(--muted); text-transform: uppercase; letter-spacing: .6px; font-size: 10.5px; }
.lc-cap-icon { color: var(--accent); margin-right: 6px; }
.lc-cap-val { font-variant-numeric: tabular-nums; }
.lc-cap-val b { color: var(--text); }
.lc-cap-track { height: 8px; border-radius: 5px; background: var(--bg); overflow: hidden; border: 1px solid var(--row-border); }
.lc-cap-fill { height: 100%; border-radius: 5px; transition: width .3s ease; }
.lc-cap-fill--ok { background: linear-gradient(90deg, var(--good), var(--accent)); }
.lc-cap-fill--warn { background: var(--accent); }
.lc-cap-fill--crit { background: var(--bad); }

/* Tabs */
.lc-home-tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--border); }
.lc-home-tab { flex: 1; text-align: center; padding: 9px 4px 10px; font-size: 14.5px; color: var(--muted); background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer; }
.lc-home-tab .lc-home-count { font-size: 11px; color: var(--muted); background: var(--panel-2); border-radius: 10px; padding: 0 6px; margin-left: 5px; font-variant-numeric: tabular-nums; }
.lc-home-tab--active { color: var(--accent); border-bottom-color: var(--accent); }
.lc-home-tab--active .lc-home-count { background: var(--accent-dim); color: var(--accent); }

/* Toolbar */
.lc-inv-toolbar { display: flex; gap: 8px; padding: 10px 12px; align-items: center; }
.lc-inv-search { flex: 1; display: flex; align-items: center; gap: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 6px 9px; }
.lc-inv-search input { flex: 1; background: none; border: none; color: var(--text); font-size: 14px; outline: none; }
.lc-inv-sort, .lc-inv-dir { background: var(--bg); border: 1px solid var(--border); color: var(--text); border-radius: 8px; padding: 7px 8px; font-size: 13px; cursor: pointer; }

/* Rows */
.lc-inv-list { display: flex; flex-direction: column; }
.lc-inv-row { display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: center; padding: 9px 12px; border-bottom: 1px solid var(--row-border); }
.lc-inv-name-line { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
.lc-inv-name { color: var(--text); font-size: 15px; background: none; border: none; padding: 0; cursor: pointer; border-bottom: 1px dotted var(--accent-dim); }
.lc-inv-name:hover { color: var(--accent); }
.lc-inv-badge { font-size: 9.5px; text-transform: uppercase; letter-spacing: .5px; padding: 1px 6px; border-radius: 4px; border: 1px solid var(--border); color: var(--muted); }
.lc-inv-meta { font-size: 12px; color: var(--muted); margin-top: 3px; font-variant-numeric: tabular-nums; display: flex; gap: 12px; }
.lc-inv-meta b { color: var(--text); }
.lc-inv-move { display: flex; align-items: center; gap: 5px; }
.lc-inv-qty { display: flex; align-items: center; background: var(--bg); border: 1px solid var(--border); border-radius: 7px; overflow: hidden; }
.lc-inv-qty button { background: none; border: none; color: var(--muted); width: 24px; height: 30px; font-size: 16px; cursor: pointer; }
.lc-inv-qty input { min-width: 3ch; height: 30px; text-align: center; background: none; border: none; color: var(--text); font-size: 13px; font-variant-numeric: tabular-nums; outline: none; padding: 0 4px; border-left: 1px solid var(--border); border-right: 1px solid var(--border); }
.lc-inv-move-btn { background: var(--accent-dim); border: 1px solid var(--accent); color: var(--accent); border-radius: 7px; height: 32px; padding: 0 10px; cursor: pointer; font-size: 15px; white-space: nowrap; }

/* General tab */
.lc-home-general { padding: 12px; display: flex; flex-direction: column; gap: 14px; }
.lc-home-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.lc-home-act { background: var(--panel); border: 1px solid var(--border); border-radius: 9px; padding: 11px 12px; text-align: left; color: var(--text); cursor: pointer; font-size: 13.5px; }
.lc-home-act--wide { grid-column: 1 / -1; }
.lc-home-act:hover { border-color: var(--accent); background: var(--panel-2); }
.lc-home-trap { display: flex; align-items: center; gap: 9px; font-size: 13.5px; background: var(--panel); border: 1px solid var(--border); border-radius: 9px; padding: 11px 12px; }
.lc-home-trap-str { margin-left: auto; color: var(--muted); font-size: 12px; }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/CapacityMeter.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/CapacityMeter.tsx src/shared/styles/theme.css tests/CapacityMeter.test.tsx
git commit -m "feat(home): CapacityMeter component + inventory styles"
```

---

### Task 6: InventoryList + InventoryRow components

**Files:**
- Create: `src/components/InventoryRow.tsx`
- Create: `src/components/InventoryList.tsx`
- Test: `tests/InventoryList.test.tsx`

**Interfaces:**
- Consumes: `HomeItem` from `@/utils/homeExtract`.
- Produces:
  - `interface InventoryRowProps { item: HomeItem; moveGlyph: string; moveTitle: string; onMove: (qty: number) => void; onOpenDetail: () => void }`, `function InventoryRow(props): JSX.Element`.
  - `interface InventoryListProps { items: HomeItem[]; moveGlyph: string; moveTitle: string; onMove: (item: HomeItem, qty: number) => void; onOpenDetail: (item: HomeItem) => void }`, `function InventoryList(props): JSX.Element`.

- [ ] **Step 1: Write the failing test**

Create `tests/InventoryList.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, within } from '@testing-library/preact';
import { InventoryList } from '../src/components/InventoryList';
import type { HomeItem } from '../src/utils/homeExtract';

function item(over: Partial<HomeItem>): HomeItem {
  return {
    index: 0, name: 'x', type: 'tárgy', weight: 1, amount: 1,
    totalWeight: 1, price: null, magical: false, attrs: [], ...over,
  };
}

const ITEMS: HomeItem[] = [
  item({ index: 0, name: 'halcsont', weight: 0.2, amount: 89, totalWeight: 17.8 }),
  item({ index: 1, name: 'agyar', weight: 4, amount: 6, totalWeight: 24 }),
  item({ index: 2, name: 'ezüst', weight: 0.0001, amount: 2686, totalWeight: 0.2686 }),
];

describe('InventoryList', () => {
  it('filters by name (case-insensitive)', () => {
    const { getByPlaceholderText, container } = render(
      <InventoryList items={ITEMS} moveGlyph="🎒" moveTitle="Hátizsákba" onMove={vi.fn()} onOpenDetail={vi.fn()} />,
    );
    fireEvent.input(getByPlaceholderText(/Keresés/), { target: { value: 'AGY' } });
    const rows = container.querySelectorAll('.lc-inv-row');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('agyar');
  });

  it('sorts by total weight descending', () => {
    const { getByLabelText, getByText, container } = render(
      <InventoryList items={ITEMS} moveGlyph="🎒" moveTitle="Hátizsákba" onMove={vi.fn()} onOpenDetail={vi.fn()} />,
    );
    fireEvent.change(getByLabelText('Rendezés'), { target: { value: 'totalWeight' } });
    fireEvent.click(getByText('↓')); // toggle to descending
    const first = container.querySelector('.lc-inv-row')!;
    expect(first.textContent).toContain('agyar'); // 24 kg is highest
  });

  it('move defaults to the full amount and passes the chosen qty', () => {
    const onMove = vi.fn();
    const { container } = render(
      <InventoryList items={[ITEMS[0]]} moveGlyph="🎒" moveTitle="Hátizsákba" onMove={onMove} onOpenDetail={vi.fn()} />,
    );
    const row = container.querySelector('.lc-inv-row')!;
    within(row as HTMLElement).getByTitle('Hátizsákba').click();
    expect(onMove).toHaveBeenCalledWith(ITEMS[0], 89);
  });

  it('opens the detail when the name is clicked', () => {
    const onOpenDetail = vi.fn();
    const { getByText } = render(
      <InventoryList items={[ITEMS[1]]} moveGlyph="🎒" moveTitle="Hátizsákba" onMove={vi.fn()} onOpenDetail={onOpenDetail} />,
    );
    fireEvent.click(getByText('agyar'));
    expect(onOpenDetail).toHaveBeenCalledWith(ITEMS[1]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/InventoryList.test.tsx`
Expected: FAIL — cannot import `InventoryList`.

- [ ] **Step 3: Implement InventoryRow**

Create `src/components/InventoryRow.tsx`:

```tsx
import { h, type JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { HomeItem } from '@/utils/homeExtract';

export interface InventoryRowProps {
  item: HomeItem;
  /** Glyph on the move button (e.g. "🎒" or "⌂"). */
  moveGlyph: string;
  /** Accessible title / tooltip for the move button. */
  moveTitle: string;
  onMove: (qty: number) => void;
  onOpenDetail: () => void;
}

function kg(n: number): string {
  return (Math.round(n * 10000) / 10000).toLocaleString('hu-HU');
}

const TYPE_LABEL: Record<string, string> = { fegyver: 'fegyver', vért: 'vért' };

export function InventoryRow({ item, moveGlyph, moveTitle, onMove, onOpenDetail }: InventoryRowProps): JSX.Element {
  const [qty, setQty] = useState<number>(item.amount);
  const single = item.amount <= 1;
  const clamp = (n: number): number => Math.max(1, Math.min(item.amount, n));

  return (
    <div class="lc-inv-row">
      <div class="lc-inv-cell">
        <div class="lc-inv-name-line">
          <button class="lc-inv-name" onClick={onOpenDetail}>{item.name}</button>
          {TYPE_LABEL[item.type] && <span class="lc-inv-badge">{TYPE_LABEL[item.type]}</span>}
          {item.magical && <span class="lc-inv-badge">mágikus</span>}
        </div>
        <div class="lc-inv-meta">
          <span>×<b>{item.amount.toLocaleString('hu-HU')}</b></span>
          <span>{kg(item.weight)} kg/db</span>
          <span>Σ <b>{kg(item.totalWeight)}</b> kg</span>
        </div>
      </div>
      <div class="lc-inv-move">
        {!single && (
          <div class="lc-inv-qty">
            <button aria-label="Kevesebb" onClick={() => setQty((q) => clamp(q - 1))}>−</button>
            <input
              value={String(qty)}
              inputMode="numeric"
              style={{ width: `${Math.max(3, String(qty).length + 1)}ch` }}
              onInput={(e) => setQty(clamp(parseInt((e.target as HTMLInputElement).value, 10) || 1))}
            />
            <button aria-label="Több" onClick={() => setQty((q) => clamp(q + 1))}>+</button>
          </div>
        )}
        <button class="lc-inv-move-btn" title={moveTitle} onClick={() => onMove(single ? 1 : qty)}>
          {moveGlyph}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement InventoryList**

Create `src/components/InventoryList.tsx`:

```tsx
import { h, type JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { HomeItem } from '@/utils/homeExtract';
import { InventoryRow } from '@/components/InventoryRow';

export interface InventoryListProps {
  items: HomeItem[];
  moveGlyph: string;
  moveTitle: string;
  onMove: (item: HomeItem, qty: number) => void;
  onOpenDetail: (item: HomeItem) => void;
}

type SortKey = 'name' | 'weight' | 'totalWeight' | 'amount' | 'price';

const SORT_OPTIONS: Array<[SortKey, string]> = [
  ['name', 'Név'],
  ['weight', 'Súly'],
  ['totalWeight', 'Összsúly'],
  ['amount', 'Mennyiség'],
  ['price', 'Ár'],
];

export function InventoryList({ items, moveGlyph, moveTitle, onMove, onOpenDetail }: InventoryListProps): JSX.Element {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [asc, setAsc] = useState(true);

  const q = query.trim().toLowerCase();
  const dir = asc ? 1 : -1;
  const visible = items
    .filter((it) => it.name.toLowerCase().includes(q))
    .sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name, 'hu') * dir;
      return ((a[sortKey] ?? 0) - (b[sortKey] ?? 0)) * dir;
    });

  return (
    <div>
      <div class="lc-inv-toolbar">
        <label class="lc-inv-search">
          <span aria-hidden="true">⌕</span>
          <input
            placeholder="Keresés név szerint…"
            value={query}
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          />
        </label>
        <select
          class="lc-inv-sort"
          aria-label="Rendezés"
          value={sortKey}
          onChange={(e) => setSortKey((e.target as HTMLSelectElement).value as SortKey)}
        >
          {SORT_OPTIONS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <button class="lc-inv-dir" aria-label="Sorrend" onClick={() => setAsc((v) => !v)}>{asc ? '↓' : '↑'}</button>
      </div>
      <div class="lc-inv-list">
        {visible.map((it) => (
          <InventoryRow
            key={it.index}
            item={it}
            moveGlyph={moveGlyph}
            moveTitle={moveTitle}
            onMove={(qty) => onMove(it, qty)}
            onOpenDetail={() => onOpenDetail(it)}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/InventoryList.test.tsx`
Expected: PASS (all four cases).

Note on the sort test: the default sort is ascending; the test clicks `↓` once to flip to descending. If the arrow glyph assertion is brittle, assert on row order only.

- [ ] **Step 6: Commit**

```bash
git add src/components/InventoryRow.tsx src/components/InventoryList.tsx tests/InventoryList.test.tsx
git commit -m "feat(home): InventoryList + InventoryRow (search/sort/move/detail)"
```

---

### Task 7: Home page

**Files:**
- Create: `src/pages/Home.tsx`
- Test: `tests/Home.test.tsx`

**Interfaces:**
- Consumes: `HomeState` from `@/utils/homeExtract`; `CapacityMeter`, `InventoryList`, `DatabaseOverlay`.
- Produces: `interface HomeProps { state: HomeState }`, `function Home(props): JSX.Element`.

- [ ] **Step 1: Write the failing test**

Create `tests/Home.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/preact';
import { Home } from '../src/pages/Home';
import type { HomeState, HomeItem } from '../src/utils/homeExtract';

function item(over: Partial<HomeItem>): HomeItem {
  return { index: 0, name: 'x', type: 'tárgy', weight: 1, amount: 1, totalWeight: 1, price: null, magical: false, attrs: [], ...over };
}

function state(over: Partial<HomeState> = {}): HomeState {
  return {
    playerName: 'Remy',
    house: { used: 130, max: 140, items: [item({ index: 0, name: 'agyar', amount: 6, weight: 4, totalWeight: 24 })], move: vi.fn() },
    backpack: { used: 105, max: 107, items: [item({ index: 0, name: 'halcsont', amount: 89, weight: 0.2, totalWeight: 17.8 })], move: vi.fn() },
    traps: [{ label: 'zuhanórács', strength: 7, leszerel: vi.fn() }],
    actions: {
      everythingToBackpack: { label: 'mind', iconUrl: '', trigger: vi.fn() },
      magicChair: null, recoverLost: null, settings: null,
      exit: { label: 'kilép', iconUrl: '', trigger: vi.fn() },
    },
    ...over,
  };
}

describe('Home', () => {
  it('shows the house inventory by default', () => {
    render(<Home state={state()} />);
    expect(screen.getByText('agyar')).toBeTruthy();
  });

  it('switches to the backpack tab', () => {
    render(<Home state={state()} />);
    fireEvent.click(screen.getByText(/Hátizsák/));
    expect(screen.getByText('halcsont')).toBeTruthy();
  });

  it('house move button drives the house container move()', () => {
    const s = state();
    render(<Home state={s} />);
    // Single row with amount 6 → qty defaults to 6.
    screen.getByTitle('Hátizsákba').click();
    expect(s.house.move).toHaveBeenCalledWith(s.house.items[0], 6);
  });

  it('general tab fires an action trigger', () => {
    const s = state();
    render(<Home state={s} />);
    fireEvent.click(screen.getByText(/Általános/));
    fireEvent.click(screen.getByText('Mindent a hátizsákba'));
    expect(s.actions.everythingToBackpack!.trigger).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/Home.test.tsx`
Expected: FAIL — cannot import `Home`.

- [ ] **Step 3: Implement the Home page**

Create `src/pages/Home.tsx`:

```tsx
import { h, type JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { HomeState, HomeItem } from '@/utils/homeExtract';
import { CapacityMeter } from '@/components/CapacityMeter';
import { InventoryList } from '@/components/InventoryList';
import { DatabaseOverlay } from '@/components/DatabaseOverlay';

export interface HomeProps {
  state: HomeState;
}

type Tab = 'haz' | 'bag' | 'gen';

export function Home({ state }: HomeProps): JSX.Element {
  const [tab, setTab] = useState<Tab>('haz');
  const [dbOpen, setDbOpen] = useState(false);
  const [dbName, setDbName] = useState<string | undefined>(undefined);

  const openDetail = (it: HomeItem): void => { setDbName(it.name); setDbOpen(true); };
  const active = tab === 'bag' ? state.backpack : state.house;

  return (
    <div class="lc-page">
      <div class="lc-home-tabs">
        <button class={`lc-home-tab${tab === 'haz' ? ' lc-home-tab--active' : ''}`} onClick={() => setTab('haz')}>
          Otthon <span class="lc-home-count">{state.house.items.length}</span>
        </button>
        <button class={`lc-home-tab${tab === 'bag' ? ' lc-home-tab--active' : ''}`} onClick={() => setTab('bag')}>
          Hátizsák <span class="lc-home-count">{state.backpack.items.length}</span>
        </button>
        <button class={`lc-home-tab${tab === 'gen' ? ' lc-home-tab--active' : ''}`} onClick={() => setTab('gen')}>
          Általános
        </button>
      </div>

      {tab !== 'gen' && (
        <CapacityMeter
          label={tab === 'bag' ? 'Hátizsák & test' : 'Ház telítettsége'}
          icon={tab === 'bag' ? '🎒' : '⌂'}
          used={active.used}
          max={active.max}
        />
      )}

      {tab === 'haz' && (
        <InventoryList
          items={state.house.items}
          moveGlyph="🎒"
          moveTitle="Hátizsákba"
          onMove={(it, qty) => state.house.move(it, qty)}
          onOpenDetail={openDetail}
        />
      )}

      {tab === 'bag' && (
        <InventoryList
          items={state.backpack.items}
          moveGlyph="⌂"
          moveTitle="Házba"
          onMove={(it, qty) => state.backpack.move(it, qty)}
          onOpenDetail={openDetail}
        />
      )}

      {tab === 'gen' && (
        <div class="lc-home-general">
          <CapacityMeter label="Ház" icon="⌂" used={state.house.used} max={state.house.max} />
          <CapacityMeter label="Hátizsák & test" icon="🎒" used={state.backpack.used} max={state.backpack.max} />

          <div class="lc-home-actions">
            {state.actions.everythingToBackpack && (
              <button class="lc-home-act lc-home-act--wide" onClick={() => state.actions.everythingToBackpack!.trigger()}>
                Mindent a hátizsákba
              </button>
            )}
            {state.actions.magicChair && (
              <button class="lc-home-act" onClick={() => state.actions.magicChair!.trigger()}>Varázsszék</button>
            )}
            {state.actions.recoverLost && (
              <button class="lc-home-act" onClick={() => state.actions.recoverLost!.trigger()}>Elveszett tárgyak</button>
            )}
            {state.actions.settings && (
              <button class="lc-home-act" onClick={() => state.actions.settings!.trigger()}>Beállítások</button>
            )}
            {state.actions.exit && (
              <button class="lc-home-act lc-home-act--wide" onClick={() => state.actions.exit!.trigger()}>
                Kilépés az épületből
              </button>
            )}
          </div>

          {state.traps.map((trap, i) => (
            <div key={i} class="lc-home-trap">
              <span>{trap.label}</span>
              {trap.strength != null && <span class="lc-home-trap-str">erősség: {trap.strength}</span>}
              <button class="lc-inv-move-btn" onClick={() => trap.leszerel()}>Leszerel</button>
            </div>
          ))}
        </div>
      )}

      <DatabaseOverlay open={dbOpen} initialItemName={dbName} onClose={() => setDbOpen(false)} />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/Home.test.tsx`
Expected: PASS (all four cases).

- [ ] **Step 5: Commit**

```bash
git add src/pages/Home.tsx tests/Home.test.tsx
git commit -m "feat(home): Home page with tabs, capacity meters, general tab"
```

---

### Task 8: Wire the Home page into the userscript

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `PageType.Home`, `extractHome`, `HomeState`, `Home`.
- Produces: the userscript renders `Home` on `otSajathaz` pages.

- [ ] **Step 1: Add imports**

In `src/main.ts`, extend the domExtract import to include the home extractor + type, and import the page:

```ts
import { extractFreeMove, extractBattle, extractLogin, extractDungeon, extractHome, hideOriginalDOM, type FreeMoveState, type BattleState, type LoginState, type DungeonState, type HomeState } from '@/utils/domExtract';
```

Wait — `extractHome` lives in `@/utils/homeExtract`, not `@/utils/domExtract`. Use a separate import line instead:

```ts
import { extractHome, type HomeState } from '@/utils/homeExtract';
import { Home } from '@/pages/Home';
```

(Leave the existing `domExtract` import for the other extractors unchanged.)

- [ ] **Step 2: Extend the PageState union**

Add a variant to the `PageState` type:

```ts
  | { pageType: PageType.Home; state: HomeState };
```

- [ ] **Step 3: Extend extractPageState**

Add a case in `extractPageState`, before `default`:

```ts
    case PageType.Home:
      return { pageType, state: extractHome(doc) };
```

- [ ] **Step 4: Render Home and skip the monster fetch**

Add a case in `renderPage`'s switch:

```ts
      case PageType.Home:
        render(h(Home, { state: pageState.state }), root);
        break;
```

And add Home to the fetch-skip guard (Home never uses the monster DB — its overlay loads its own data on demand):

```ts
  if (pageState.pageType === PageType.Login || pageState.pageType === PageType.Dungeon || pageState.pageType === PageType.Home) return;
```

- [ ] **Step 5: Type-check + full test run**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts
git commit -m "feat(home): route otSajathaz to the Home page"
```

---

### Task 9: Build + live verification

**Files:** none (verification only)

- [ ] **Step 1: Production build**

Run: `npm run build`
Expected: builds `dist/larkinor-ui.user.js` and the DB with no errors.

- [ ] **Step 2: Serve for device/console testing**

Run: `./serve.sh` (or `PORT=9000 ./serve.sh`).
Expected: prints the loader URL and serves the fresh build.

- [ ] **Step 3: Verify on the live game**

Using the Playwright browser already open on the Home page (`oldalTipus = otSajathaz`), inject/run the built userscript (per the console-injection notes in CLAUDE.md) and confirm:
- Otthon tab lists the 45 house items with weight/amount/Σ; Hátizsák tab lists 29 items.
- Capacity meters read 130.36/140 and 105.76/107 and colour correctly.
- Search filters; each sort key + direction reorders.
- Tapping an item name opens the DB overlay on that entity (where it exists in the DB).
- Setting a quantity and tapping the move button submits and the page reloads with the item moved (verify one house→backpack and one backpack→house).
- Általános tab: both meters, the action buttons, and the trap Leszerel are present and fire.

- [ ] **Step 4: Final gate**

Run: `npx tsc --noEmit && npm test`
Expected: clean.

- [ ] **Step 5: Commit any fixes discovered during verification, then finish the branch**

Use the superpowers:finishing-a-development-branch skill to decide merge/PR.

---

## Self-Review

**Spec coverage:**
- Move items house↔backpack, defined amount or all → Task 3 (`move`), Task 6 (qty stepper, default full), Task 7 (wiring). ✓
- Display weight, amount, total weight → Task 2 (parse), Task 6 (row meta). ✓
- Search by name; order by name/weight/etc. → Task 6 (`InventoryList`). ✓
- Clickable name → detail overlay (in-game DB) → Task 4 (`initialItemName`), Task 7 (wiring). ✓
- Tabbed layout Otthon / Hátizsák / Általános → Task 7. ✓
- Általános = capacity overview + house actions + trap management → Task 3 (extract), Task 7 (render). ✓
- Currency no special handling → Tasks 2/6 treat ezüst/arany as `tárgy` with no special casing. ✓
- Immediate per-move (one submit per move) → Task 3 `move` clicks the game button. ✓

**Placeholder scan:** No TBD/TODO; every code step contains full code. ✓

**Type consistency:** `HomeItem`, `HomeContainer.move(item, qty)`, `HomeState`, `parseCuccDetail`/`parseCuccArray`, `initialItemName`, `InventoryListProps`/`InventoryRowProps`, `CapacityMeterProps`, `HomeProps` are used identically across the tasks that define and consume them. Move button located by basenames `hazbolvesz`/`hazbatesz`; action controls by `hatizsakba`/`varazsszek`/`ab`/`klap`/`vissza`; trap by `leszerel` — all verified against the live DOM. ✓
