import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/preact';
import type { JSX } from 'preact';
import { Shop } from '../src/pages/Shop';
import { Market } from '../src/pages/Market';
import { Bank } from '../src/pages/Bank';
import { Arena } from '../src/pages/Arena';
import { PalaceQuest } from '../src/pages/PalaceQuest';
import { BuildingLobby } from '../src/pages/BuildingLobby';
import { Home } from '../src/pages/Home';
import { Character } from '../src/pages/Character';
import { DB_OPEN_KEY } from '../src/utils/config';
import { makeShopState } from './support/shopState';
import { makeMarketState } from './support/marketState';
import type { CharacterPageState } from '../src/utils/characterPageExtract';
import type { HomeState } from '../src/utils/homeExtract';

// Every page mobile takes over offers the database plainly, not only through
// an item's name — the character page was the one that prompted this.

const control = (label: string) => ({ label, iconUrl: '', trigger: vi.fn() });

const character = (): CharacterPageState => ({
  name: 'Remy', level: 34, xp: null, hp: null, mp: null, defense: null, load: null, loadout: null,
  backpack: [], equip: vi.fn(), drop: vi.fn(), dropMany: vi.fn(), stowWorn: null,
  attributes: [], freePoints: 0, saveAttributes: vi.fn(), stance: null, quickKey: null,
  curses: [], attackSpells: [], skills: [], otherSpells: [], emailPrivacy: null, exit: null,
});

const home = (): HomeState => ({
  house: { items: [], used: 0, max: 0, move: vi.fn() },
  backpack: { items: [], used: 0, max: 0, move: vi.fn() },
} as unknown as HomeState);

const pages: Array<[string, () => JSX.Element]> = [
  ['shop', () => <Shop state={makeShopState()} />],
  ['market', () => <Market state={makeMarketState()} />],
  ['bank', () => <Bank state={{ gold: 1, balance: 2, repaid: null, narration: '', deposit: null, withdraw: null, depositAll: null, repay: null, exit: null }} />],
  ['arena', () => <Arena state={{ gold: 1, hp: 1, hpMax: 1, mp: 1, mpMax: 1, narration: '', fight: null, rest: null, exit: null, clone: { status: null, bet: null, winnings: null, note: null, enter: null, collect: null } }} />],
  ['palace quest', () => <PalaceQuest state={{ gold: 1, narration: '', offer: null, accept: null, claimReward: null, exit: null }} />],
  ['lobby', () => <BuildingLobby state={{ title: 'Palota', gold: 1, narration: '', controls: [control('Küldetést vállalsz')], exit: null }} />],
  ['home', () => <Home state={home()} showGeneral={false} />],
  ['character', () => <Character state={character()} />],
];

describe('the database button', () => {
  it.each(pages)('is on the %s page and opens the database', (_name, page) => {
    GM_setValue(DB_OPEN_KEY, '');
    const { container } = render(page());
    const button = container.querySelector<HTMLButtonElement>('button[aria-label="Adatbázis"]');
    expect(button).not.toBeNull();

    fireEvent.click(button!);

    expect(document.querySelector('.lc-db-overlay')).not.toBeNull();
  });
});
