import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildItemIndex, mayMentionItems, findItemMentions } from '@/shared/itemMentions';
import type { Armor, Item, Weapon } from '@/shared/data';

const load = <T>(file: string): T[] => JSON.parse(readFileSync(resolve(__dirname, '../static/db', file), 'utf8')) as T[];
const index = buildItemIndex(load<Weapon>('weapons.json'), load<Armor>('armors.json'), load<Item>('items.json'));

/** The mentions as `[matched text, resolved name or null, quantity]`. */
function mentions(text: string): Array<[string, string | null, number]> {
  return findItemMentions(text, index).map((m) => [
    text.slice(m.index, m.index + m.length), m.item?.name ?? null, m.quantity,
  ]);
}

describe('findItemMentions', () => {
  it('highlights a dig result and names the item it found', () => {
    expect(mentions('Kiástál 16 darab aranyat!')).toEqual([['16 darab aranyat', 'arany', 16]]);
  });

  // Every phrase below was printed by the game in a recorded session.
  it.each([
    ['Kiástál 3 darab rézércet!', 'rézérc'],
    ['Kiástál 2 darab vasércet!', 'vasérc'],
    ['Kiástál 4 darab óngolyót!', 'óngolyó'],
    ['Kiástál 1 darab opált!', 'opál'],
    ['Kiástál 1 darab jáspist!', 'jáspis'],
    ['Kiástál 1 darab gyöngyöt!', 'gyöngy'],
    ['Kiástál 1 darab gyémántot!', 'gyémánt'],
    ['Kiástál 1 darab smaragdot!', 'smaragd'],
    ['Kiástál 1 darab rubint!', 'rubin'],
    ['Előveszel a hátizsákodból 2 darab teknőspáncélt.', 'teknőspáncél'],
    ['Előveszel a hátizsákodból 5 darab ezüstfullánkot.', 'ezüstfullánk'],
    ['Előveszel a hátizsákodból 3 darab acélrugót.', 'acélrugó'],
    ['Előveszel a hátizsákodból 1 darab törpe csákányt.', 'törpe csákány'],
    ['Előveszel a hátizsákodból 9 darab madártollat.', 'madártoll'],
    ['Sikerült venned 1 darab imamalmot.', 'imamalom'],
    ['Mondod Szaivának, hogy szeretnél venni 2 darab ásót.', 'ásó'],
    ['Mondod Szaivának, hogy szeretnél venni 3 darab kaját.', 'kaja'],
    ['Mondod Thorgardnak, hogy szeretnél venni 1 darab törpe surranót.', 'törpe surranó'],
    ['Mondod Nyúvadt Gregnek, hogy szeretnél venni 1 darab bronzsisakot.', 'bronzsisak'],
    ['Mondod Thorgardnak, hogy szeretnél venni 4 darab dobótőrt.', 'dobótőr'],
    ['Mondod Nyúvadt Gregnek, hogy szeretnél venni 1 darab kaszát.', 'kasza'],
    ['Mondod Shorgo-Kempnek, hogy szeretnél venni 1 darab bőrcsizmát.', 'bőrcsizma'],
    ['Mondod Hajas Zolónak, hogy szeretnél venni 1 darab dobófejszét.', 'dobófejsze'],
    ['Mondod Szaivának, hogy szeretnél venni 2 darab 1 hetes kenyeret.', '1 hetes kenyér'],
  ])('%s', (text, name) => {
    expect(mentions(text).map(([, resolved]) => resolved)).toEqual([name]);
  });

  it('reads a corpse’s loot list, which names items as they are', () => {
    expect(mentions('A holttestnél a következőket találod:\n2 db kaja\n1 db vaskulcs\n12 tapasztalati pontot kapsz a győzelemért.'))
      .toEqual([['2 db kaja', 'kaja', 2], ['1 db vaskulcs', 'vaskulcs', 1]]);
  });

  it('still highlights an item it cannot name, without a link', () => {
    expect(mentions('Kiástál 2 darab zümmögőt!')).toEqual([['2 darab zümmögőt', null, 2]]);
  });

  it('highlights silver gained', () => {
    expect(mentions('Eladtad a kijelölt tárgyakat, összesen 1 250 ezüstöt kaptál.'))
      .toEqual([['1 250 ezüstöt', null, 1250]]);
    expect(mentions('Kiástál néhány ezüstpénzt! (+ 37 ezüst)')).toEqual([['+ 37 ezüst', null, 37]]);
  });

  it('leaves a sentence that only counts something alone', () => {
    expect(mentions('Nincs elég alapanyagod egy darabhoz sem.')).toEqual([]);
    expect(mentions('Gregor Man: unikornisszarvat keresek kb 5 darabot.')).toEqual([]);
    expect(mentions('Még 1200 tapasztalati pont kell a következő szinthez!')).toEqual([]);
  });
});

describe('mayMentionItems', () => {
  it('is a cheap test for whether loading the item names is worth it', () => {
    expect(mayMentionItems('Kiástál 16 darab aranyat!')).toBe(true);
    expect(mayMentionItems('2 db kaja')).toBe(true);
    expect(mayMentionItems('Továbbjöttél északra.')).toBe(false);
  });
});
