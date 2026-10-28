import { describe, it, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { extractArena, extractBank, extractPalaceQuest } from '../src/utils/buildingExtract';
import { extractBuildingNarration } from '../src/utils/domExtract';

// Cleaned-up reconstructions of the live pages (2026-10-28), keeping the markup
// each figure is read from. Every button but the exit is the same `elad.gif` on
// the bank, so they are told apart by their forms and titles.

const page = (html: string) => new JSDOM(`<html><body>${html}</body></html>`).window.document;

const NARRATION = (text: string) =>
  `<div style="position:absolute; width:600px; height:80px; left: 10px; top: 460px"><font face="Comic sans MS">${text}</font></div>`;

const BANK_HTML = `
  <form name="urlap"><input type="hidden" name="oldalTipus" value="otEkszeresz"></form>
  <div style="position:absolute; width:180px"><font face="Comic sans MS">Számlád</font></div>
  <div> Bankban levő pénzed:<br><b>4364570</b><hr>Királynak törlesztett összeg:<br><b>1000000</b></div>
  <div> Pénz: 3116 </div>
  <input type="image" src="/ikon/vissza.gif" title="Kilepes az epuletbol">
  <input type="image" src="/ikon/elad.gif" title="Minden pénz a hátizsákból">
  <form name="Banktev"><b>Betét:</b><input type="text" name="penzbe"><input type="image" src="/ikon/elad.gif" title="Beteszel némi pénzt a bankba."></form>
  <form name="Bankkiv"><b>Pénz kivétel:</b><input type="text" name="penzki"><input type="image" src="/ikon/elad.gif" title="Kiveszel némi pénzt a bankból."></form>
  <form name="Bankkir"><input type="image" src="/ikon/elad.gif" title="50000 ezüstöt törlesztesz a királynak."></form>
  ${NARRATION('Belépsz Sóher Fanó bankjába...')}
`;

const ARENA_HTML = `
  <form name="urlap"><input type="hidden" name="oldalTipus" value="otArena"></form>
  <b><a title="karakterlap">Remy</a><br>Pénz: 3&nbsp;116<br>Életpont: 573 / 500 <br>Varázspont: 416 / 265 </b>
  <input type="image" src="/ikon/vissza.gif" title="Kilepes az epuletbol">
  <input type="image" src="/ikon/pihen.gif" title="Pihensz">
  <input type="image" src="/ikon/tamadas.gif" title="Elkezded a dicsőséges csatát!">
  <input type="image" src="/ikon/penztkap.gif" title="Felveszed a nyereményt">
  <input type="image" src="/ikon/klonoz.gif" title="Benevezed a klónod az arénába!">
  <div><form name="sajatklon"><center> Klón állapota:<br> aktív <br> Klónra tett pénz:<br>
    <input type="text" name="feltettpenz" size="8" value="1000"> <br> A klónod eddig<br> 250 ezüstöt nyert.</center></form></div>
  <div> Nincs a szintednek és pénzednek megfelelő aktív klón </div>
  ${NARRATION('Belépsz az arénába...')}
`;

const QUEST_HTML = `
  <form name="urlap"><input type="hidden" name="oldalTipus" value="otPalotaKuldetes"></form>
  <div> Pénz: 3116 </div>
  <div style="position:absolute; width:450px"><font face="Comic sans MS" size="2.5">
    A munka, amit vállalhatsz, a következő: (47)<br>Most egy fontos feladatra kérnélek meg.<br>
    Hozd el az orvosi könyvüket. Jutalmad <br>100000 db ezüst, 1 db manógomba, <br>
    <input type="image" src="/ikon/vallkuld.gif" title="Vállalod a küldetést">
    <input type="image" src="/ikon/jeljut.gif" title="Jelentkezel jutalomért"><br>
  </font></div>
  <input type="image" src="/ikon/vissza.gif" title="Elhagyod">
  ${NARRATION('Belépsz Lakoon herceg szobájába...')}
`;

describe('extractBuildingNarration', () => {
  it('reads the 600px narration box, not a heading printed first in the same font', () => {
    expect(extractBuildingNarration(page(BANK_HTML))).toBe('Belépsz Sóher Fanó bankjába...');
  });

  it('falls back to the first narration block when there is no such box', () => {
    expect(extractBuildingNarration(page('<font face="Comic sans MS">Csak ez</font>'))).toBe('Csak ez');
  });
});

describe('extractBank', () => {
  it('reads the money on hand, the balance and the repaid sum', () => {
    const bank = extractBank(page(BANK_HTML));
    expect([bank.gold, bank.balance, bank.repaid]).toEqual([3116, 4364570, 1000000]);
  });

  it('tells the identical buttons apart by form and title', () => {
    const bank = extractBank(page(BANK_HTML));
    expect(bank.deposit!.label).toBe('Beteszel némi pénzt a bankba.');
    expect(bank.withdraw!.label).toBe('Kiveszel némi pénzt a bankból.');
    expect(bank.depositAll!.label).toBe('Minden pénz a hátizsákból');
    expect(bank.repay!.label).toBe('50000 ezüstöt törlesztesz a királynak.');
  });

  it('deposits by filling the field its handler reads, then clicking', () => {
    const doc = page(BANK_HTML);
    const bank = extractBank(doc);
    const form = doc.forms.namedItem('Banktev')!;
    const click = vi.spyOn(form.querySelector<HTMLInputElement>('input[type="image"]')!, 'click').mockImplementation(() => {});

    bank.deposit!.run(2500);

    expect((form.elements.namedItem('penzbe') as HTMLInputElement).value).toBe('2500');
    expect(click).toHaveBeenCalledTimes(1);
  });
});

describe('extractArena', () => {
  it('reads the stats the way the game prints them, max first', () => {
    const arena = extractArena(page(ARENA_HTML));
    expect([arena.gold, arena.hp, arena.hpMax, arena.mp, arena.mpMax]).toEqual([3116, 500, 573, 265, 416]);
  });

  it('reads the clone block', () => {
    const { clone } = extractArena(page(ARENA_HTML));
    expect([clone.status, clone.bet, clone.winnings]).toEqual(['aktív', 1000, 250]);
    expect(clone.note).toBe('Nincs a szintednek és pénzednek megfelelő aktív klón');
  });

  it('enters the clone with the bet written into the field its handler reads', () => {
    const doc = page(ARENA_HTML);
    const arena = extractArena(doc);
    const button = doc.querySelector<HTMLInputElement>('input[src*="klonoz"]')!;
    const click = vi.spyOn(button, 'click').mockImplementation(() => {});

    arena.clone.enter!.run(5000);

    expect((doc.forms.namedItem('sajatklon')!.elements.namedItem('feltettpenz') as HTMLInputElement).value).toBe('5000');
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('finds the fight and rest controls', () => {
    const arena = extractArena(page(ARENA_HTML));
    expect(arena.fight!.label).toBe('Elkezded a dicsőséges csatát!');
    expect(arena.rest!.label).toBe('Pihensz');
  });
});

describe('extractPalaceQuest', () => {
  it('reads the offered quest: its number, brief and reward', () => {
    const { offer } = extractPalaceQuest(page(QUEST_HTML));
    expect(offer!.questId).toBe('47');
    expect(offer!.brief).toBe('Most egy fontos feladatra kérnélek meg.\nHozd el az orvosi könyvüket.');
    expect(offer!.reward).toBe('100000 db ezüst, 1 db manógomba');
  });

  it('reads the narration from its box, not the quest brief printed first', () => {
    expect(extractPalaceQuest(page(QUEST_HTML)).narration).toBe('Belépsz Lakoon herceg szobájába...');
  });

  it('has no offer when the room prints none', () => {
    expect(extractPalaceQuest(page(NARRATION('Nincs munka.'))).offer).toBeNull();
  });
});
