import { h, type JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { HallSideForm } from '@/utils/craftingExtract';

// The hall's second form — trap ordering in the Erőd, spell learning in the
// Mágustorony. Mobile only: the phone page replaces the game page, so a form we
// do not render is a form the player cannot reach. Desktop leaves the game's
// own form on screen and needs none of this.

export interface HallSideSectionProps {
  side: HallSideForm;
}

function TrapOrder({ side }: { side: Extract<HallSideForm, { kind: 'trap' }> }): JSX.Element {
  const [index, setIndex] = useState(0);
  // The field's text: it must be able to sit empty while being retyped, and an
  // empty or invalid strength must never be ordered as some default the screen
  // does not show.
  const [strengthText, setStrengthText] = useState('1');
  const parsed = Math.floor(Number(strengthText));
  const strength = strengthText !== '' && Number.isFinite(parsed) && parsed >= 1 ? parsed : null;
  const [price, setPrice] = useState<string | null>(null);
  return (
    <div class="lc-hall-side-body">
      <label class="lc-hall-side-label" for="lc-trap-kind">Csapda fajtája</label>
      <select id="lc-trap-kind" class="lc-hall-side-input" value={String(index)}
        onChange={(e) => { setIndex(Number((e.target as HTMLSelectElement).value)); setPrice(null); }}>
        {side.traps.map((t) => <option key={t.index} value={String(t.index)}>{t.label}</option>)}
      </select>
      <label class="lc-hall-side-label" for="lc-trap-strength">Erősség</label>
      <input id="lc-trap-strength" class="lc-hall-side-input" type="number" min={1} value={strengthText}
        onInput={(e) => { setStrengthText((e.target as HTMLInputElement).value); setPrice(null); }} />
      <div class="lc-hall-side-row">
        <button class="lc-home-act" disabled={strength === null}
          onClick={() => { if (strength !== null) setPrice(side.price(index, strength)); }}>Mennyi?</button>
        {price !== null && <span class="lc-hall-side-price">Ár: {price} ezüst</span>}
        <button class="lc-home-act" disabled={strength === null}
          onClick={() => { if (strength !== null) side.order(index, strength); }}>Megrendel</button>
      </div>
    </div>
  );
}

function SpellLearn({ side }: { side: Extract<HallSideForm, { kind: 'spell' }> }): JSX.Element {
  const [value, setValue] = useState(side.spells[0]?.value ?? '');
  return (
    <div class="lc-hall-side-body">
      <label class="lc-hall-side-label" for="lc-spell">Varázslat</label>
      <select id="lc-spell" class="lc-hall-side-input" value={value}
        onChange={(e) => setValue((e.target as HTMLSelectElement).value)}>
        {side.spells.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
      <button class="lc-home-act" onClick={() => side.learn(value)}>{side.learnLabel}</button>
    </div>
  );
}

export function HallSideSection({ side }: HallSideSectionProps): JSX.Element {
  return (
    <details class="lc-hall-side">
      <summary>{side.kind === 'trap' ? 'Csapda' : 'Varázslatok'}</summary>
      {side.kind === 'trap' ? <TrapOrder side={side} /> : <SpellLearn side={side} />}
    </details>
  );
}
