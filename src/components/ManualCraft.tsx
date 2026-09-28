import { h, type JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { RecipeRef } from '@/shared/data/types';
import type { CraftingHallState } from '@/utils/craftingExtract';

// The game's own three-slot form, by hand. Mobile only: the phone page replaces
// the game page, and without this whatever the database has no recipe for (97
// Erőd entries), or everything when the database fails to load, could no
// longer be crafted there. Desktop keeps the game's form on screen instead.

const SLOTS = [1, 2, 3] as const;

interface Slot {
  id: string;
  qty: string;
}

export interface ManualCraftProps {
  state: CraftingHallState;
}

/** A positive whole number, or null for anything the form must not submit. */
function positive(text: string): number | null {
  const n = Number(text);
  return text !== '' && Number.isInteger(n) && n >= 1 ? n : null;
}

export function ManualCraft({ state }: ManualCraftProps): JSX.Element {
  const [slots, setSlots] = useState<Slot[]>(() => SLOTS.map(() => ({ id: '', qty: '' })));
  const [count, setCount] = useState('1');
  const [error, setError] = useState<string | null>(null);

  const update = (i: number, patch: Partial<Slot>): void => {
    setSlots((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));
    setError(null);
  };

  // A slot counts once an ingredient is chosen; a chosen ingredient without a
  // valid per-piece amount blocks the craft rather than being dropped silently.
  const chosen = slots.filter((s) => s.id !== '');
  const recipe: RecipeRef[] | null = chosen.every((s) => positive(s.qty) !== null)
    ? chosen.map((s) => ({
      id: s.id,
      name: state.options.find((o) => o.id === s.id)?.name ?? s.id,
      qty: positive(s.qty)!,
    }))
    : null;
  const pieces = positive(count);
  const ready = recipe !== null && recipe.length > 0 && pieces !== null;

  const craft = (): void => {
    if (!ready) return;
    try {
      state.craft(recipe!, pieces!);
    } catch (err) {
      console.warn('[Larkinor UI] Manual crafting form could not be filled:', err);
      setError('A készítési űrlapot nem sikerült kitölteni.');
    }
  };

  return (
    <details class="lc-hall-side">
      <summary>Kézi kitöltés</summary>
      <div class="lc-hall-side-body">
        <p class="lc-craft-note">Alapanyagok darabonként, mint a játék saját űrlapján.</p>
        {SLOTS.map((n, i) => (
          <div key={n} class="lc-hall-side-row">
            <select
              id={`lc-manual-item-${n}`}
              aria-label={`${n}. alapanyag`}
              class="lc-hall-side-input lc-manual-item"
              value={slots[i].id}
              onChange={(e) => update(i, { id: (e.target as HTMLSelectElement).value })}
            >
              <option value="">—</option>
              {state.options.map((o) => (
                <option key={o.id} value={o.id}>{o.count} {o.name}</option>
              ))}
            </select>
            <input
              aria-label={`${n}. mennyiség`}
              class="lc-hall-side-input lc-manual-qty"
              type="number"
              min={1}
              value={slots[i].qty}
              onInput={(e) => update(i, { qty: (e.target as HTMLInputElement).value })}
            />
          </div>
        ))}
        <div class="lc-hall-side-row">
          <label class="lc-hall-side-label" for="lc-manual-count">Darabszám</label>
          <input
            id="lc-manual-count"
            aria-label="Kézi darabszám"
            class="lc-hall-side-input lc-manual-qty"
            type="number"
            min={1}
            value={count}
            onInput={(e) => { setCount((e.target as HTMLInputElement).value); setError(null); }}
          />
          <button class="lc-home-act" disabled={!ready} onClick={craft}>Kitöltés és készítés</button>
        </div>
        {error && <p class="lc-craft-error">{error}</p>}
      </div>
    </details>
  );
}
