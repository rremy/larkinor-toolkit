import { h, type JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { BackpackItem, CharacterPageState, ChoiceSetting, AttributeKey, Gauge } from '@/utils/characterPageExtract';
import { getCharacterTab, setCharacterTab, type CharacterTab } from '@/utils/config';
import { useStoredSort } from '@/hooks/useStoredSort';
import { SLOT_LABEL, SLOT_ORDER, attrOf, type EquippedItem, type Slot } from '@/shared/loadout';
import { matchesSearch } from '@/shared/text';
import { CapacityMeter } from '@/components/CapacityMeter';
import { DatabaseOverlay } from '@/components/DatabaseOverlay';
import { NameLine, NumberField, Toolbar, silver, type ColumnLabels } from '@/components/MarketRows';
import { ControlButton } from '@/components/BuildingControls';
import { DatabaseButton } from '@/components/DatabaseButton';

// The character page ("karakterlap") as a phone page. The game lays it out as a
// 791px collage of boxes; here it is three tabs — who you are, what you carry,
// and what you can change — each remembered across the reload every action
// causes. Equipment changes also refresh the stored loadout, since the boot
// captures it on every visit to this page.

export interface CharacterProps {
  state: CharacterPageState;
  /**
   * Rendered inside the desktop dock's panel rather than as the phone page: the
   * panel carries its own title and close ✕, the dock its database button, and
   * the game page — still visible — its exit (Esc presses it), so the header
   * line is left out.
   */
  embedded?: boolean;
}

function Figure({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div class="lc-bld-figure">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

/** Current first, as the stat bar shows it — the page itself prints the maximum first. */
const gauge = (g: Gauge | null): string => (g ? `${silver(g.current)} / ${silver(g.max)}` : '—');

/** One worn item's headline figures: damage for a weapon, defence for armour. */
function wornSummary(item: EquippedItem): string {
  const parts: string[] = [];
  if (item.maxDamage !== null) parts.push(`max: ${item.maxDamage}`);
  if (item.spread !== null) parts.push(`szórás: ${item.spread}`);
  if (item.defense !== null) parts.push(`védelem: ${item.defense}`);
  if (item.level !== null) parts.push(`szint: ${item.level}`);
  return parts.join(' · ');
}

/** A backpack item's headline figures, from its own detail block. */
function packSummary(item: BackpackItem): string {
  const parts: string[] = [];
  for (const [label, short] of [['Maximum sebzés', 'max'], ['Sebzés szórás', 'szórás'], ['Védelem', 'védelem'], ['Min. szint', 'szint']]) {
    const value = attrOf(item, label);
    if (value !== null) parts.push(`${short}: ${value}`);
  }
  return parts.join(' · ');
}

interface SlotRowProps {
  slot: Slot;
  state: CharacterPageState;
  onOpenDetail: (name: string) => void;
}

/**
 * One equipment slot: what is worn there, and what in the backpack could take
 * its place. The game has no "take off" for a single slot — gear changes by
 * putting something else in — so the candidates are offered right here, where
 * the worn item is, rather than only on the backpack tab.
 */
function SlotRow({ slot, state, onOpenDetail }: SlotRowProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const worn = state.loadout?.slots[slot] ?? null;
  const candidates = state.backpack.filter((i) => i.slots.includes(slot));

  return (
    <div class="lc-char-slot">
      <span class="lc-char-slot-label">{SLOT_LABEL[slot]}</span>
      <div class="lc-mkt-cell">
        {worn ? (
          <div>
            <button class="lc-mkt-name lc-mkt-name--link" onClick={() => onOpenDetail(worn.name)}>{worn.name}</button>
            <div class="lc-mkt-meta"><span>{wornSummary(worn)}</span></div>
          </div>
        ) : (
          <span class="lc-mkt-empty">üres</span>
        )}

        {candidates.length === 0 ? (
          <span class="lc-char-none">Nincs ide való tárgy a hátizsákodban.</span>
        ) : (
          <button class="lc-shop-bulk-all lc-char-swap" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {open ? 'Bezár' : `Csere — ${candidates.length} tárgy a hátizsákban`}
          </button>
        )}

        {open && candidates.map((item) => (
          <div key={item.index} class="lc-char-candidate">
            <div class="lc-mkt-cell">
              <NameLine text={item.name} detailName={item.name} pricePercent={null} onOpenDetail={onOpenDetail} detail={item} />
              <div class="lc-mkt-meta"><span>{packSummary(item)}</span></div>
            </div>
            <button class="lc-mkt-buy-btn" title={`${SLOT_LABEL[slot]} — felveszed`} onClick={() => state.equip(item, slot)}>
              Felvesz
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: JSX.Element | JSX.Element[] | null }): JSX.Element | null {
  return (
    <section class="lc-bld-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Overview({ state, onOpenDetail }: { state: CharacterPageState; onOpenDetail: (name: string) => void }): JSX.Element {
  return (
    <div>
      <div class="lc-bld-figures lc-bld-figures--inline">
        <Figure label="Szint" value={state.level === null ? '—' : String(state.level)} />
        <Figure label="Tapasztalat" value={state.xp === null ? '—' : silver(state.xp)} />
        <Figure label="Védettség" value={state.defense === null ? '—' : String(state.defense)} />
        <Figure label="Életpont" value={gauge(state.hp)} />
        <Figure label="Varázspont" value={gauge(state.mp)} />
      </div>
      {state.load && <CapacityMeter label="Terhelés" icon="🎒" used={state.load.used} max={state.load.max} />}

      <Section title="Felszerelés">
        <div class="lc-mkt-list">
          {SLOT_ORDER.map((slot) => (
            <SlotRow key={slot} slot={slot} state={state} onOpenDetail={onOpenDetail} />
          ))}
        </div>
        <div class="lc-mkt-actions">
          <ControlButton option={state.stowWorn} wide label="Minden viselt tárgy a hátizsákba" />
        </div>
      </Section>

      {state.curses.length > 0 && (
        <Section title="Rontások">
          <div class="lc-char-pairs">
            {state.curses.map((c) => (
              <div key={c.name} class="lc-char-curse">
                <span>{c.iconUrl && <img src={c.iconUrl} alt="" />}{c.name}</span>
                {c.count !== null && <b>{c.count}</b>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {state.skills.length > 0 && (
        <Section title="Képzettségek">
          <div class="lc-char-pairs">
            {state.skills.map((s) => <div key={s.name}><span>{s.name}</span><b>{s.value}</b></div>)}
          </div>
        </Section>
      )}

      {state.attackSpells.length > 0 && (
        <Section title="Támadó varázslatok">
          <div class="lc-char-pairs">
            {state.attackSpells.map((s) => <div key={s.name}><span>{s.name}</span><b>{s.stats}</b></div>)}
          </div>
        </Section>
      )}

      {state.otherSpells.length > 0 && (
        <Section title="Egyéb varázslatok">
          {state.otherSpells.map((line) => <p key={line} class="lc-bld-text">{line}</p>)}
        </Section>
      )}
    </div>
  );
}

type BackpackSortKey = 'name' | 'amount' | 'weight' | 'totalWeight' | 'price' | 'value' | 'market' | 'marketValue';

const BACKPACK_SORT_OPTIONS: ReadonlyArray<readonly [BackpackSortKey, string]> = [
  ['name', 'Név'],
  ['amount', 'Mennyiség'],
  ['weight', 'Súly'],
  ['totalWeight', 'Összsúly'],
  ['price', 'Ár'],
  ['value', 'Érték'],
  ['market', 'Piaci ár'],
  ['marketValue', 'Piaci érték'],
];

const BACKPACK_LABELS: ColumnLabels = {
  search: 'Keresés a hátizsákban',
  sort: 'A hátizsák rendezése',
  direction: 'A hátizsák sorrendje',
};

/** What the whole stack is worth at its Ár, or null for an item with none. */
function stackValue(item: BackpackItem): number | null {
  return item.price === null ? null : item.price * item.amount;
}

/** What the whole stack fetches at the market, or null when its rate is unknown. */
function stackMarketValue(item: BackpackItem): number | null {
  return item.marketPrice === null ? null : item.marketPrice * item.amount;
}

function backpackNumber(item: BackpackItem, key: Exclude<BackpackSortKey, 'name'>): number | null {
  switch (key) {
    case 'amount': return item.amount;
    case 'weight': return item.weight;
    case 'totalWeight': return item.totalWeight;
    case 'price': return item.price;
    case 'value': return stackValue(item);
    case 'market': return item.marketPrice;
    case 'marketValue': return stackMarketValue(item);
  }
}

/**
 * Sorts a copy: names by Hungarian collation, numbers with a missing figure
 * counting as 0 — the market lists' rules. Weights can be negative (the
 * antiballaszt weighs −20 kg), which sorts as the number it is.
 */
function sortBackpack(items: BackpackItem[], key: BackpackSortKey, asc: boolean): BackpackItem[] {
  const dir = asc ? 1 : -1;
  return [...items].sort((a, b) => (
    key === 'name'
      ? a.name.localeCompare(b.name, 'hu') * dir
      : ((backpackNumber(a, key) ?? 0) - (backpackNumber(b, key) ?? 0)) * dir
  ));
}

/** Kilograms to at most three decimals, Hungarian grouping. */
const kg = (n: number): string => silver(Math.round(n * 1000) / 1000);

interface BackpackRowProps {
  item: BackpackItem;
  picked: boolean;
  onPick: (item: BackpackItem) => void;
  onEquip: (item: BackpackItem, slot: Slot) => void;
  onDrop: (item: BackpackItem, qty: number) => void;
  onOpenDetail: (name: string) => void;
}

/**
 * One backpack item: its figures, a button per slot it fits, and a drop. The
 * drop takes two presses — what is dropped is gone — and starts at one unit.
 */
function BackpackRow({ item, picked, onPick, onEquip, onDrop, onOpenDetail }: BackpackRowProps): JSX.Element {
  const [qty, setQty] = useState(1);
  const [armed, setArmed] = useState(false);

  return (
    <div class={`lc-mkt-row lc-shop-row lc-shop-row--sell lc-char-row${picked ? ' lc-shop-row--picked' : ''}`}>
      {item.bulkIndex !== null ? (
        <input
          class="lc-shop-pick"
          type="checkbox"
          checked={picked}
          aria-label={`${item.name} kijelölése eldobásra`}
          onChange={() => onPick(item)}
        />
      ) : (
        <span class="lc-shop-pick lc-shop-pick--none" />
      )}

      <div class="lc-mkt-cell">
        <NameLine text={item.name} detailName={item.name} pricePercent={null} onOpenDetail={onOpenDetail} detail={item} />
        <div class="lc-mkt-meta">
          <span>{silver(item.amount)} db</span>
          <span>{kg(item.weight)} kg/db</span>
          {item.amount > 1 && <span>összsúly: {kg(item.totalWeight)} kg</span>}
          {item.price !== null && <span>ár: {silver(item.price)}</span>}
          {item.price !== null && item.amount > 1 && <span>érték: {silver(stackValue(item)!)}</span>}
          {item.marketPrice !== null && <span class="lc-shop-market">piaci ár: {silver(item.marketPrice)}</span>}
          {item.marketPrice !== null && item.amount > 1 && (
            <span class="lc-shop-market">piaci érték: {silver(stackMarketValue(item)!)}</span>
          )}
        </div>
        {item.slots.length > 0 && (
          <div class="lc-char-equip">
            {item.slots.map((slot) => (
              <button key={slot} class="lc-mkt-buy-btn" title={`${SLOT_LABEL[slot]} — felveszed`} onClick={() => onEquip(item, slot)}>
                {SLOT_LABEL[slot]}
              </button>
            ))}
          </div>
        )}
      </div>

      <NumberField
        label="Db"
        value={qty}
        min={1}
        max={item.amount}
        onInput={(n) => { setQty(Math.max(1, Math.min(Number.isFinite(n) ? Math.floor(n) : 1, item.amount))); setArmed(false); }}
      />

      <button
        class={`lc-mkt-revoke-btn${armed ? ' lc-shop-bulk-sell--armed' : ''}`}
        title="Eldobod — ami eldobott, elveszett"
        onClick={() => { if (armed) onDrop(item, qty); else setArmed(true); }}
      >
        {armed ? 'Biztos?' : 'Eldob'}
      </button>
    </div>
  );
}

function Backpack({ state, onOpenDetail }: { state: CharacterPageState; onOpenDetail: (name: string) => void }): JSX.Element {
  const [search, setSearch] = useState('');
  const { sortKey, setSortKey, asc, flip } = useStoredSort('character-backpack', BACKPACK_SORT_OPTIONS.map(([k]) => k), { key: 'name', asc: true });
  const [picked, setPicked] = useState<ReadonlySet<number>>(new Set());
  const [armed, setArmed] = useState(false);

  const shown = sortBackpack(state.backpack.filter((i) => matchesSearch(i.name, search)), sortKey, asc);
  const chosen = state.backpack.filter((i) => i.bulkIndex !== null && picked.has(i.bulkIndex));
  // The mass drop takes whole stacks, so what it frees is each stack's total.
  const chosenWeight = chosen.reduce((sum, i) => sum + i.totalWeight, 0);
  const loadAfter = state.load ? ` · terhelés: ${kg(state.load.used - chosenWeight)} / ${kg(state.load.max)} kg` : '';

  // From the previous selection, so taps landing before a re-render all count.
  const toggle = (item: BackpackItem): void => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(item.bulkIndex!)) next.delete(item.bulkIndex!);
      else next.add(item.bulkIndex!);
      return next;
    });
    setArmed(false);
  };

  return (
    <div class="lc-mkt-column">
      <div class="lc-mkt-actions">
        <ControlButton option={state.stowWorn} wide label="Viselt tárgyak a hátizsákba" />
      </div>
      <Toolbar
        labels={BACKPACK_LABELS}
        search={search}
        onSearch={setSearch}
        sortKey={sortKey}
        onSortKey={setSortKey}
        asc={asc}
        onFlip={flip}
        options={BACKPACK_SORT_OPTIONS}
      />
      <div class="lc-mkt-list">
        {shown.map((item) => (
          <BackpackRow
            key={item.index}
            item={item}
            picked={item.bulkIndex !== null && picked.has(item.bulkIndex)}
            onPick={toggle}
            onEquip={state.equip}
            onDrop={state.drop}
            onOpenDetail={onOpenDetail}
          />
        ))}
        {shown.length === 0 && (
          <p class="lc-mkt-empty">{state.backpack.length === 0 ? 'Üres a hátizsák.' : 'Nincs találat.'}</p>
        )}
      </div>

      {state.backpack.some((i) => i.bulkIndex !== null) && (
        <div class="lc-shop-bulk">
          <span class="lc-shop-bulk-sum">
            {chosen.length === 0
              ? 'Jelöld ki, amit egészben eldobnál'
              : `${chosen.length} tétel kijelölve — ${kg(chosenWeight)} kg${loadAfter}`}
          </span>
          <button
            class={`lc-mkt-revoke-btn${armed ? ' lc-shop-bulk-sell--armed' : ''}`}
            disabled={chosen.length === 0}
            onClick={() => { if (armed) state.dropMany(chosen); else setArmed(true); }}
          >
            {armed ? 'Biztosan eldobod?' : 'Kijelöltek eldobása'}
          </button>
        </div>
      )}
    </div>
  );
}

function Choice({ title, setting }: { title: string; setting: ChoiceSetting | null }): JSX.Element | null {
  const [value, setValue] = useState(setting?.selected ?? '');
  if (!setting) return null;
  return (
    <div class="lc-bld-amount">
      <label class="lc-mkt-field">
        <span>{title}</span>
        <select class="lc-inv-sort" value={value} onChange={(e) => setValue((e.target as HTMLSelectElement).value)}>
          {setting.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <button class="lc-mkt-offer-btn" disabled={value === setting.selected} onClick={() => setting.save(value)}>
        Mentés
      </button>
    </div>
  );
}

function Settings({ state }: { state: CharacterPageState }): JSX.Element {
  const [added, setAdded] = useState<Partial<Record<AttributeKey, number>>>({});
  const spent = Object.values(added).reduce((sum, n) => sum + (n ?? 0), 0);
  const left = state.freePoints - spent;

  const change = (key: AttributeKey, delta: number): void => {
    setAdded((prev) => {
      const next = Math.max(0, (prev[key] ?? 0) + delta);
      const total = Object.entries(prev).reduce((sum, [k, n]) => sum + (k === key ? 0 : n ?? 0), 0) + next;
      return total > state.freePoints ? prev : { ...prev, [key]: next };
    });
  };

  return (
    <div>
      <Section title="Tulajdonságok">
        <div class="lc-char-attrs">
          {state.attributes.map(({ key, label, value }) => (
            <div key={key} class="lc-char-attr">
              <span>{label}</span>
              <b>{value + (added[key] ?? 0)}</b>
              {state.freePoints > 0 && (
                <span class="lc-char-steps">
                  <button class="lc-shop-bulk-all" aria-label={`${label} csökkentése`} disabled={!added[key]} onClick={() => change(key, -1)}>−</button>
                  <button class="lc-shop-bulk-all" aria-label={`${label} növelése`} disabled={left <= 0} onClick={() => change(key, 1)}>+</button>
                </span>
              )}
            </div>
          ))}
        </div>
        <div class="lc-bld-amount">
          <span class="lc-shop-bulk-sum">Elosztható: {left}</span>
          <button class="lc-mkt-offer-btn" disabled={spent === 0} onClick={() => state.saveAttributes(added)}>
            Pontok mentése
          </button>
        </div>
      </Section>

      <Section title="Beállítások">
        <Choice title="Fokozatod" setting={state.stance} />
        <Choice title="Gyorsgombod" setting={state.quickKey} />
      </Section>

      <div class="lc-mkt-actions">
        <ControlButton option={state.emailPrivacy} wide />
      </div>
    </div>
  );
}

export function Character({ state, embedded = false }: CharacterProps): JSX.Element {
  const [tab, setTab] = useState<CharacterTab>(() => getCharacterTab() ?? 'overview');
  const [dbName, setDbName] = useState<string | undefined>(undefined);

  const select = (id: CharacterTab): void => {
    setTab(id);
    setCharacterTab(id);
  };

  const tabs: Array<{ id: CharacterTab; label: string; count?: number }> = [
    { id: 'overview', label: 'Karakter' },
    { id: 'backpack', label: 'Hátizsák', count: state.backpack.length },
    { id: 'settings', label: 'Fejlődés', count: state.freePoints > 0 ? state.freePoints : undefined },
  ];

  return (
    <div class={`lc-page${embedded ? ' lc-page--wide' : ''}`}>
      {!embedded && <div class="lc-mkt-stats">
        <span class="lc-shop-title">{state.name || 'Karakterlap'}</span>
        {state.level !== null && <span class="lc-mkt-gold">{state.level}. szint</span>}
        {/* '' opens the database plainly: no item name to land on. */}
        <DatabaseButton onClick={() => setDbName('')} />
        {/* Leaving the page, in the corner where a closable view keeps its ✕ —
            the game's own control, still clicked rather than reconstructed. */}
        {state.exit && (
          <button
            class="lc-statbar-btn lc-exit-btn"
            aria-label={state.exit.label}
            title={state.exit.label}
            onClick={() => state.exit!.trigger()}
          >
            ✕
          </button>
        )}
      </div>}

      <div class="lc-home-tabs">
        {tabs.map(({ id, label, count }) => (
          <button
            key={id}
            class={`lc-home-tab${tab === id ? ' lc-home-tab--active' : ''}`}
            onClick={() => select(id)}
          >
            {label}
            {count !== undefined && <span class="lc-home-count">{count}</span>}
          </button>
        ))}
      </div>

      <div class="lc-mkt-body">
        {tab === 'overview' && <Overview state={state} onOpenDetail={setDbName} />}
        {tab === 'backpack' && <Backpack state={state} onOpenDetail={setDbName} />}
        {tab === 'settings' && <Settings state={state} />}
      </div>

      <DatabaseOverlay open={dbName !== undefined} initialItemName={dbName} onClose={() => setDbName(undefined)} />
    </div>
  );
}
