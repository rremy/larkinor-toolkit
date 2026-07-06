export type Direction = 'north' | 'south' | 'east' | 'west';

export interface Action {
  label: string;
  trigger: () => void;
}

export interface FreeMoveState {
  playerName: string;
  level: number;
  maxLevel: number;
  gold: number;
  hp: number;
  hpMax: number;
  mp: number;
  mpMax: number;
  locationImageUrl: string;
  availableDirections: Direction[];
  actions: Action[];
  narration: string;
}

export interface BattleState {
  monsterName: string;
  monsterImageUrl: string;
  narration: string;
  actions: Action[];
  hp: number;
  hpMax: number;
  mp: number;
  mpMax: number;
}

function parseStatLine(text: string, label: string): [number, number] {
  const m = text.match(new RegExp(`${label}[:\\s]+(\\d+)\\s*/\\s*(\\d+)`));
  return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : [0, 0];
}

function parseGold(text: string): number {
  const m = text.match(/Pénz[:\s]+(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

function parsePlayerName(text: string): { name: string; level: number; maxLevel: number } {
  // Format: "Remy [3/5/300]" — name [currentXP/level/maxXP] (approximate)
  // Note: no `^` anchor — `doc.body.textContent` concatenates all text nodes,
  // so the name is typically preceded by whitespace/newlines from HTML indentation,
  // not positioned at the very start of the string.
  const m = text.match(/([A-Za-záéíóöőúüűÁÉÍÓÖŐÚÜŰ][\w ]+?)\s*\[/);
  return { name: m?.[1]?.trim() ?? 'Unknown', level: 1, maxLevel: 100 };
}

export function extractFreeMove(doc: Document): FreeMoveState {
  const allText = doc.body.textContent ?? '';

  const { name, level, maxLevel } = parsePlayerName(allText);
  const gold = parseGold(allText);
  const [hp, hpMax] = parseStatLine(allText, 'Életpont');
  const [mp, mpMax] = parseStatLine(allText, 'Varázspont');

  // Location image: first img pointing to l2.larkinor.hu or /tajk/
  const locImg = doc.querySelector<HTMLImageElement>('img[src*="l2.larkinor.hu"], img[src*="/tajk/"]');
  const locationImageUrl = locImg?.src ?? '';

  // Directions: look for links with dir= parameter
  const dirMap: Record<string, Direction> = {
    north: 'north', south: 'south', east: 'east', west: 'west',
    'É': 'north', 'D': 'south', 'K': 'east', 'Ny': 'west',
  };
  const availableDirections: Direction[] = [];
  doc.querySelectorAll<HTMLAnchorElement>('a[href*="dir="]').forEach(a => {
    const m = a.href.match(/dir=(\w+)/);
    if (m) {
      const dir = dirMap[m[1]];
      if (dir && !availableDirections.includes(dir)) availableDirections.push(dir);
    }
  });
  // Also check by link text (É/D/K/Ny)
  doc.querySelectorAll<HTMLAnchorElement>('table.irany a').forEach(a => {
    const dir = dirMap[a.textContent?.trim() ?? ''];
    if (dir && !availableDirections.includes(dir)) availableDirections.push(dir);
  });

  // Actions: from <select name="action"> or similar
  const actions: Action[] = [];
  const select = doc.querySelector<HTMLSelectElement>('select[name="action"]');
  if (select) {
    Array.from(select.options).forEach(opt => {
      if (opt.value) {
        actions.push({
          label: opt.text.trim(),
          trigger: () => {
            select.value = opt.value;
            const form = select.closest('form');
            form ? form.submit() : select.form?.submit();
          },
        });
      }
    });
  }

  // Narration: look for .stext or the text area below the game panel
  const narrationEl = doc.querySelector('.stext, textarea[name="stext"], .szoveg');
  const narration = narrationEl?.textContent?.trim() ?? '';

  return { playerName: name, level, maxLevel, gold, hp, hpMax, mp, mpMax, locationImageUrl, availableDirections, actions, narration };
}

export function extractBattle(doc: Document): BattleState {
  const allText = doc.body.textContent ?? '';

  const [hp, hpMax] = parseStatLine(allText, 'Életpont');
  const [mp, mpMax] = parseStatLine(allText, 'Varázspont');

  // Monster image
  const monsterImg = doc.querySelector<HTMLImageElement>('img[src*="/pic/szornyk/"]');
  const monsterImageUrl = monsterImg
    ? (monsterImg.src.startsWith('http') ? monsterImg.src : `https://l2.larkinor.hu${monsterImg.getAttribute('src')}`)
    : '';

  // Monster name: the text node near the monster image (often in a sibling table
  // cell, or a sibling div right after the image within the same container).
  const monsterName = monsterImg?.closest('td')?.nextElementSibling?.textContent?.trim()
    ?? monsterImg?.nextElementSibling?.textContent?.trim()
    ?? monsterImg?.alt
    ?? 'Ismeretlen szörny';

  // Narration
  const narrationEl = doc.querySelector('.stext, textarea[name="stext"], .szoveg');
  const narration = narrationEl?.textContent?.trim() ?? '';

  // Actions: combat action links
  const actions: Action[] = [];
  doc.querySelectorAll<HTMLAnchorElement>('a[href*="action="]').forEach(a => {
    const label = a.textContent?.trim() ?? '';
    if (label) {
      actions.push({ label, trigger: () => a.click() });
    }
  });
  // Also check submit buttons
  doc.querySelectorAll<HTMLInputElement>('input[type="submit"]').forEach(btn => {
    const label = btn.value?.trim() ?? '';
    if (label) {
      actions.push({ label, trigger: () => btn.click() });
    }
  });

  return { monsterName, monsterImageUrl, narration, actions, hp, hpMax, mp, mpMax };
}

export function hideOriginalDOM(doc: Document): void {
  const offscreen = doc.createElement('div');
  offscreen.id = 'lc-offscreen';
  // Move all existing body children into the offscreen container
  while (doc.body.firstChild) {
    offscreen.appendChild(doc.body.firstChild);
  }
  doc.body.appendChild(offscreen);
}
