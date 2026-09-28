import { h, type JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { DataLoader } from '@/shared/data';
import { craftableIn, planCraft, sharedRecipe, type Craftable, type CraftableKind } from '@/shared/crafting';
import { craftSelectedKey } from '@/shared/prefKeys';
import { matchesSearch } from '@/shared/text';
import { getPref, setPref } from '@/utils/config';
import type { CraftingHallState } from '@/utils/craftingExtract';

// Search what this hall makes, see the recipe against what is carried, and have
// the game's own form filled in. Shared by the mobile hall page and the desktop
// docked panel. What is carried comes from the page (state.owned); what can be
// made comes from the database, filtered to this hall.

/** Fewer letters than this match too much to be worth listing. */
const MIN_QUERY = 2;
/** Results listed at once; more asks for a narrower search. */
const MAX_MATCHES = 30;

const KIND_LABEL: Record<CraftableKind, string> = { weapon: 'fegyver', armor: 'vért', item: 'tárgy' };

export interface CraftingPanelProps {
  state: CraftingHallState;
  loader: DataLoader;
}

/** A typed count, as an integer in 1…max (1 when max is 0: the button is disabled then anyway). */
export function clampCount(raw: string, max: number): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, Math.max(max, 1));
}

function useCraftables(state: CraftingHallState, loader: DataLoader): { list: Craftable[] | null; failed: boolean } {
  const [list, setList] = useState<Craftable[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    Promise.all([loader.loadWeapons(), loader.loadArmors(), loader.loadItems()])
      .then(([weapons, armors, items]) => {
        if (!live) return;
        const all = craftableIn(state.hall, weapons, armors, items);
        all.sort((a, b) => a.name.localeCompare(b.name, 'hu'));
        setList(all);
      })
      .catch((err) => {
        console.warn('[Larkinor UI] Crafting data failed to load:', err);
        if (live) setFailed(true);
      });
    return () => { live = false; };
  }, [loader, state.hall]);
  return { list, failed };
}

interface DetailProps {
  item: Craftable;
  all: Craftable[];
  state: CraftingHallState;
}

function CraftDetail({ item, all, state }: DetailProps): JSX.Element {
  const plan = planCraft(item.recipe, state.owned);
  // The field's text, not a number: it must be able to sit empty while the
  // player retypes it. Clearing it to "1" on every keystroke turned a
  // backspace-then-3 into 13.
  const [count, setCount] = useState('1');
  const [error, setError] = useState<string | null>(null);
  const alternatives = sharedRecipe(item, all);
  const disabled = plan.max === 0;
  // An empty field is not "one": nothing is crafted until a number is shown.
  const blocked = disabled || count === '';

  // A new item or fresh counts start again from one piece.
  useEffect(() => { setCount('1'); setError(null); }, [item.key, plan.max]);

  const craft = (): void => {
    if (blocked) return;
    try {
      state.craft(item.recipe, clampCount(count, plan.max));
    } catch (err) {
      console.warn('[Larkinor UI] Crafting form could not be filled:', err);
      setError('A készítési űrlapot nem sikerült kitölteni.');
    }
  };

  return (
    <section class="lc-craft-detail">
      <h3>{item.name}</h3>
      <p class="lc-craft-meta">
        {KIND_LABEL[item.kind]}{item.level !== null && ` · ${item.level}. szint`}
      </p>
      <ul class="lc-craft-lines">
        {plan.lines.map((line) => (
          <li key={line.id} class={`lc-craft-line ${line.ok ? 'lc-craft-line--ok' : 'lc-craft-line--short'}`}>
            <span class="lc-craft-line-name">{line.name}</span>
            {/* needed per piece / carried */}
            <span class="lc-craft-line-qty">{line.needed} / {line.owned} db</span>
          </li>
        ))}
      </ul>
      {alternatives.length > 0 && (
        <p class="lc-craft-note">
          Ugyanez a recept készíti ezeket is: {alternatives.map((a) => a.name).join(', ')}. Hogy melyik lesz belőle, azt a játék dönti el.
        </p>
      )}
      <div class="lc-craft-go">
        <label class="lc-craft-count-label" for="lc-craft-count">Darabszám</label>
        <input
          id="lc-craft-count"
          class="lc-craft-count"
          type="number"
          min={1}
          max={Math.max(plan.max, 1)}
          value={count}
          disabled={disabled}
          onInput={(e) => {
            const input = e.target as HTMLInputElement;
            if (input.value === '') {
              setCount('');
              return;
            }
            // Write back immediately: an out-of-range value must not stay on screen.
            const next = String(clampCount(input.value, plan.max));
            if (input.value !== next) input.value = next;
            setCount(next);
          }}
          onBlur={(e) => {
            if (count !== '') return;
            (e.target as HTMLInputElement).value = '1';
            setCount('1');
          }}
        />
        <span class="lc-craft-of">/ {plan.max}</span>
        <button class="lc-craft-btn" disabled={blocked} onClick={craft}>
          🔨 Elkészít
        </button>
      </div>
      {disabled && <p class="lc-craft-empty">Nincs elég alapanyagod egy darabhoz sem.</p>}
      {error && <p class="lc-craft-error">{error}</p>}
    </section>
  );
}

export function CraftingPanel({ state, loader }: CraftingPanelProps): JSX.Element {
  const { list, failed } = useCraftables(state, loader);
  const [query, setQuery] = useState('');
  // Behaves like a select: typing opens the list, a pick closes it and puts the
  // chosen name in the field. Starts closed when a remembered item will fill it.
  const [listOpen, setListOpen] = useState(() => !getPref(craftSelectedKey(state.hall)));
  const [selectedKey, setSelectedKey] = useState<string | null>(() => getPref(craftSelectedKey(state.hall)));

  const selected = useMemo(
    () => (list && selectedKey ? list.find((c) => c.key === selectedKey) ?? null : null),
    [list, selectedKey],
  );

  if (failed) return <p class="lc-craft-error">Nem sikerült betölteni a tárgyadatbázist.</p>;
  if (!list) return <p class="lc-craft-empty">Receptek betöltése…</p>;

  // With nothing selected (none yet, or a remembered key that no longer
  // matches) there is nothing to show closed, so the list counts as open.
  const open = listOpen || selected === null;
  const narrowed = open && query.trim().length >= MIN_QUERY;
  const matches = narrowed ? list.filter((c) => matchesSearch(c.name, query)) : [];
  const shown = matches.slice(0, MAX_MATCHES);

  const pick = (item: Craftable): void => {
    setQuery(item.name);
    setListOpen(false);
    setSelectedKey(item.key);
    setPref(craftSelectedKey(state.hall), item.key);
  };

  return (
    <div class="lc-craft">
      <input
        class="lc-craft-search"
        type="search"
        placeholder="mit készítenél?"
        aria-label="Keresés a készíthető tárgyak között"
        value={open ? query : selected.name}
        onInput={(e) => {
          setQuery((e.target as HTMLInputElement).value);
          setListOpen(true);
        }}
        // Selecting the text on focus lets a new search replace the chosen
        // name in one go, as retyping into a select would.
        onFocus={(e) => (e.target as HTMLInputElement).select()}
      />
      {open && !narrowed && <p class="lc-craft-empty">Írj be legalább 2 betűt a kereséshez.</p>}
      {narrowed && matches.length === 0 && <p class="lc-craft-empty">Itt nem készíthető ilyen tárgy.</p>}
      {shown.length > 0 && (
        <div class="lc-craft-list">
          {shown.map((item) => {
            const max = planCraft(item.recipe, state.owned).max;
            return (
              <button
                key={item.key}
                class={`lc-craft-row${max === 0 ? ' lc-craft-row--none' : ''}${item.key === selectedKey ? ' lc-craft-row--active' : ''}`}
                onClick={() => pick(item)}
              >
                <span class="lc-craft-name">{item.name}</span>
                <span class="lc-craft-kind">{KIND_LABEL[item.kind]}{item.level !== null && ` · ${item.level}`}</span>
                <span class="lc-craft-max">max {max}</span>
              </button>
            );
          })}
        </div>
      )}
      {matches.length > shown.length && (
        <p class="lc-craft-more">még {matches.length - shown.length} találat — pontosítsd a keresést</p>
      )}
      {selected && <CraftDetail item={selected} all={list} state={state} />}
    </div>
  );
}
