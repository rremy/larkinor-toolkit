// Extraction utilities for the real Larkinor DOM. The game renders as
// absolutely-positioned <div>s driven by a single shared
// `<form name="urlap">`; every on-screen control is an
// `<input type="image">` (or the tevFajta select + ok.gif button) whose
// inline onclick sets hidden fields and calls `document.urlap.submit()`.
//
// Extraction strategy: never reconstruct/parse those onclick strings —
// locate the original control (by image basename or title) and invoke
// `element.click()`, letting the game's own onclick fire natively.
//
// See docs/superpowers/specs/2026-07-06-larkinor-real-dom-reference.md.

export type Direction = 'north' | 'south' | 'east' | 'west';

export interface Action {
  label: string;
  trigger: () => void;
}

export interface DirectionOption {
  dir: Direction;
  label: string;
  trigger: () => void;
}

/** A building entrance or utility icon (shop, church, rest, settings, ...). */
export interface BuildingOption {
  label: string;
  iconUrl: string;
  trigger: () => void;
}

export interface FreeMoveState {
  playerName: string;
  gold: number;
  hp: number;
  hpMax: number;
  mp: number;
  mpMax: number;
  locationImageUrl: string;
  locationName: string;
  directions: DirectionOption[];
  buildings: BuildingOption[];
  actions: Action[];
  narration: string;
}

export interface BattleState {
  monsterName: string;
  monsterHp: number | null;
  monsterImageUrl: string;
  narration: string;
  actions: Action[];
  hp: number;
  hpMax: number;
  mp: number;
  mpMax: number;
}

const GAME_ORIGIN = 'https://l2.larkinor.hu';

const DIRECTION_BY_BASENAME: Record<string, Direction> = {
  eszak: 'north',
  del: 'south',
  kelet: 'east',
  nyugat: 'west',
};

const BATTLE_ACTION_BASENAMES = ['balk', 'jobbk', 'menekul', 'fold', 'lev', 'viz', 'tuz'] as const;

const BATTLE_ACTION_FALLBACK_LABELS: Record<string, string> = {
  balk: 'Bal kezes támadás',
  jobbk: 'Jobb kezes támadás',
  menekul: 'Menekülés',
  fold: 'Föld varázslat',
  lev: 'Levegő varázslat',
  viz: 'Víz varázslat',
  tuz: 'Tűz varázslat',
};

/** Filename (without extension, lowercased) of an image `src` attribute. */
function basename(src: string): string {
  const file = src.split('/').pop() ?? src;
  return file.replace(/\.gif$/i, '').toLowerCase();
}

/**
 * Resolves a possibly-relative game asset URL to an absolute one.
 * Already-absolute URLs are returned as-is; root-relative paths (`/tajk/...`
 * location images, `/pic/szornyk/...` monster images, `/ikon/...` building
 * icons) are prefixed with the game origin. Offline-saved pages rewrite srcs
 * to `./Something_files/...`; for those we fall back to matching a known
 * marker substring. Anything else is returned unchanged (best-effort).
 */
function absolutizeGameUrl(src: string): string {
  if (!src) return '';
  if (src.startsWith('http')) return src;
  if (src.startsWith('/')) return `${GAME_ORIGIN}${src}`;
  for (const marker of ['/tajk/', '/pic/szornyk/', '/ikon/']) {
    const idx = src.indexOf(marker);
    if (idx !== -1) return `${GAME_ORIGIN}${src.slice(idx)}`;
  }
  return src;
}

function parseStatPair(text: string, label: string): [number, number] {
  const m = text.match(new RegExp(`${label}[:\\s]+(\\d+)\\s*/\\s*(\\d+)`));
  return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : [0, 0];
}

function parseGold(text: string): number {
  const m = text.match(/Pénz:\s*([\d\s]+)/);
  if (!m) return 0;
  const digits = m[1].replace(/\D/g, '');
  return digits ? parseInt(digits, 10) : 0;
}

function parsePlayerName(doc: Document): string {
  const nameEl = doc.querySelector('a[title="karakterlap"]') ?? doc.querySelector('font[color="blue"]');
  return nameEl?.textContent?.trim() ?? '';
}

function extractNarration(doc: Document): string {
  return doc.querySelector('font[face="Comic sans MS"]')?.textContent?.trim() ?? '';
}

function extractStats(doc: Document): { gold: number; hp: number; hpMax: number; mp: number; mpMax: number } {
  const text = doc.body.textContent ?? '';
  const gold = parseGold(text);
  const [hp, hpMax] = parseStatPair(text, 'Életpont');
  const [mp, mpMax] = parseStatPair(text, 'Varázspont');
  return { gold, hp, hpMax, mp, mpMax };
}

function extractLocation(doc: Document): { locationImageUrl: string; locationName: string } {
  const img =
    doc.querySelector<HTMLImageElement>('img[src*="/tajk/"]') ??
    Array.from(doc.querySelectorAll<HTMLImageElement>('img[width="145"]')).find(i => i.hasAttribute('title')) ??
    null;

  const src = img?.getAttribute('src') ?? '';
  const locationName = img?.getAttribute('title') ?? '';
  return { locationImageUrl: absolutizeGameUrl(src), locationName };
}

function extractDirections(doc: Document): DirectionOption[] {
  const directions: DirectionOption[] = [];
  doc.querySelectorAll<HTMLInputElement>('input[type="image"]').forEach(input => {
    const dir = DIRECTION_BY_BASENAME[basename(input.getAttribute('src') ?? '')];
    if (!dir) return;
    directions.push({
      dir,
      label: input.getAttribute('title') ?? '',
      trigger: () => input.click(),
    });
  });
  return directions;
}

/**
 * Building-entrance and utility icons on the free-move screen. These are the
 * `<input type="image">` controls that are neither the D-pad directions
 * (eszak/del/kelet/nyugat) nor the tevFajta submit button (ok.gif). Each keeps
 * its game icon so the row stays visually recognisable; the trigger clicks the
 * original control so the game's own onclick (svEnterBuilding / svRest / ...)
 * fires natively.
 */
function extractBuildings(doc: Document): BuildingOption[] {
  const buildings: BuildingOption[] = [];
  doc.querySelectorAll<HTMLInputElement>('input[type="image"]').forEach(input => {
    const src = input.getAttribute('src') ?? '';
    const name = basename(src);
    if (name === 'ok' || name in DIRECTION_BY_BASENAME) return;

    const label = input.getAttribute('title')?.trim();
    if (!label) return; // skip decorative / unlabelled icons

    buildings.push({
      label,
      iconUrl: absolutizeGameUrl(src),
      trigger: () => input.click(),
    });
  });
  return buildings;
}

function extractFreeMoveActions(doc: Document): Action[] {
  const select = doc.querySelector<HTMLSelectElement>('select[name="tevFajta"]');
  const okButton =
    doc.querySelector<HTMLInputElement>('form[name="specTevUrlap"] input[type="image"][src*="ok.gif"]') ??
    doc.querySelector<HTMLInputElement>('input[type="image"][src*="ok.gif"]');
  if (!select || !okButton) return [];

  return Array.from(select.options)
    .filter(opt => opt.value)
    .map(opt => ({
      label: opt.text.trim(),
      trigger: () => {
        select.value = opt.value;
        okButton.click();
      },
    }));
}

export function extractFreeMove(doc: Document): FreeMoveState {
  const { gold, hp, hpMax, mp, mpMax } = extractStats(doc);
  const { locationImageUrl, locationName } = extractLocation(doc);

  return {
    playerName: parsePlayerName(doc),
    gold,
    hp,
    hpMax,
    mp,
    mpMax,
    locationImageUrl,
    locationName,
    directions: extractDirections(doc),
    buildings: extractBuildings(doc),
    actions: extractFreeMoveActions(doc),
    narration: extractNarration(doc),
  };
}

function extractMonster(doc: Document): { monsterName: string; monsterHp: number | null; monsterImageUrl: string } {
  const img = doc.querySelector<HTMLImageElement>('img[title*="letpontja"]');
  const title = img?.getAttribute('title') ?? '';

  const monsterName = title.split(',')[0]?.trim() ?? '';
  const hpMatch = title.match(/letpontja:\s*(\d+)/);
  const monsterHp = hpMatch ? parseInt(hpMatch[1], 10) : null;
  const monsterImageUrl = absolutizeGameUrl(img?.getAttribute('src') ?? '');

  return { monsterName, monsterHp, monsterImageUrl };
}

function extractBattleActions(doc: Document): Action[] {
  const actions: Action[] = [];
  doc.querySelectorAll<HTMLInputElement>('input[type="image"]').forEach(input => {
    const name = basename(input.getAttribute('src') ?? '');
    if (!(BATTLE_ACTION_BASENAMES as readonly string[]).includes(name)) return;

    const title = input.getAttribute('title')?.trim();
    actions.push({
      label: title || BATTLE_ACTION_FALLBACK_LABELS[name] || name,
      trigger: () => input.click(),
    });
  });
  return actions;
}

export function extractBattle(doc: Document): BattleState {
  const { hp, hpMax, mp, mpMax } = extractStats(doc);
  const { monsterName, monsterHp, monsterImageUrl } = extractMonster(doc);

  return {
    monsterName,
    monsterHp,
    monsterImageUrl,
    narration: extractNarration(doc),
    actions: extractBattleActions(doc),
    hp,
    hpMax,
    mp,
    mpMax,
  };
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
