import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/preact';
import { Bank } from '../src/pages/Bank';
import { Arena } from '../src/pages/Arena';
import { PalaceQuest } from '../src/pages/PalaceQuest';
import type { ArenaState, BankState, PalaceQuestState } from '../src/utils/buildingExtract';

const control = (label: string) => ({ label, iconUrl: '', trigger: vi.fn() });
const amount = (label: string) => ({ label, iconUrl: '', run: vi.fn() });

function buttonByText(container: Element, text: RegExp): HTMLButtonElement {
  const found = [...container.querySelectorAll<HTMLButtonElement>('button')].find((b) => text.test(b.textContent ?? ''));
  if (!found) throw new Error(`no button matching ${text}`);
  return found;
}

describe('Bank', () => {
  const state = (): BankState => ({
    gold: 3116,
    balance: 4364570,
    repaid: 1000000,
    narration: 'Belépsz Sóher Fanó bankjába...',
    deposit: amount('Beteszel némi pénzt a bankba.'),
    withdraw: amount('Kiveszel némi pénzt a bankból.'),
    depositAll: control('Minden pénz a hátizsákból'),
    repay: control('50000 ezüstöt törlesztesz a királynak.'),
    exit: control('Kilepes az epuletbol'),
  });

  it('shows the money on hand and in the account', () => {
    const { container } = render(<Bank state={state()} />);
    const figures = container.querySelector('.lc-bld-figures')!.textContent!;
    expect(figures).toMatch(/3\s?116/);
    expect(figures).toMatch(/4\s?364\s?570/);
  });

  it('deposits the typed amount, or everything carried with one tap', () => {
    const s = state();
    const { container } = render(<Bank state={s} />);
    const [deposit] = container.querySelectorAll('.lc-bld-amount');

    fireEvent.click(buttonByText(deposit, /^mind$/));
    fireEvent.click(buttonByText(deposit, /Beteszed/));

    expect(s.deposit!.run).toHaveBeenCalledWith(3116);
  });

  it('withdraws nothing until an amount is typed', () => {
    const s = state();
    const { container } = render(<Bank state={s} />);
    const withdraw = container.querySelectorAll('.lc-bld-amount')[1];

    expect(buttonByText(withdraw, /Kiveszed/).disabled).toBe(true);
    fireEvent.input(withdraw.querySelector('input')!, { target: { value: '500' } });
    fireEvent.click(buttonByText(withdraw, /Kiveszed/));

    expect(s.withdraw!.run).toHaveBeenCalledWith(500);
  });
});

describe('Arena', () => {
  const state = (): ArenaState => ({
    gold: 3116, hp: 500, hpMax: 573, mp: 265, mpMax: 416,
    narration: 'Belépsz az arénába...',
    fight: control('Elkezded a dicsőséges csatát!'),
    rest: control('Pihensz'),
    clone: {
      status: 'aktív', bet: 1000, winnings: 250, note: 'Nincs megfelelő klón',
      enter: amount('Benevezed a klónod az arénába!'),
      collect: amount('Felveszed a nyereményt'),
    },
    exit: control('Kilepes az epuletbol'),
  });

  it('starts the fight from its own button', () => {
    const s = state();
    const { container } = render(<Arena state={s} />);
    fireEvent.click(buttonByText(container, /Harc/));
    expect(s.fight!.trigger).toHaveBeenCalled();
  });

  it('enters the clone with the bet in the field, which starts at the page\'s own', () => {
    const s = state();
    const { container } = render(<Arena state={s} />);
    fireEvent.click(buttonByText(container, /Benevezed/));
    expect(s.clone.enter!.run).toHaveBeenCalledWith(1000);
    expect(container.textContent).toContain('Nincs megfelelő klón');
  });
});

describe('PalaceQuest', () => {
  const state = (): PalaceQuestState => ({
    gold: 3116,
    narration: 'Belépsz Lakoon herceg szobájába...',
    offer: { questId: '47', brief: 'Most egy fontos feladatra kérnélek meg.\nHozd el a könyvet.', reward: '100000 db ezüst' },
    accept: control('Vállalod a küldetést'),
    claimReward: control('Jelentkezel jutalomért'),
    exit: control('Elhagyod'),
  });

  it('shows the offered quest with its number, brief and reward', () => {
    const { container } = render(<PalaceQuest state={state()} />);
    const section = container.querySelector('.lc-bld-section')!;
    expect(section.querySelector('h3')!.textContent).toBe('Küldetés #47');
    expect(section.querySelectorAll('.lc-bld-text')).toHaveLength(2);
    expect(section.textContent).toContain('100000 db ezüst');
  });

  it('accepts the quest through the page\'s own control', () => {
    const s = state();
    const { container } = render(<PalaceQuest state={s} />);
    fireEvent.click(buttonByText(container, /Vállalod/));
    expect(s.accept!.trigger).toHaveBeenCalled();
  });

  it('offers no database link without a quest number', () => {
    const { container } = render(<PalaceQuest state={{ ...state(), offer: null }} />);
    expect(container.textContent).not.toContain('Labirintus');
  });
});
