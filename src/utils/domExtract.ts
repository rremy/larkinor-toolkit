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

/** Battle actions are classed so the UI can group them (e.g. attacks in a row). */
export type BattleActionKind = 'attack' | 'flee' | 'spell';

export interface Action {
  label: string;
  trigger: () => void;
  /** Set for battle actions; groups weapon attacks / flee / spells in the UI. */
  kind?: BattleActionKind;
  /** Original game icon for the control (absolute URL); set for battle actions. */
  iconUrl?: string;
  /** The tevFajta <option> value; set for free-move actions (hotkey matching). */
  actionKey?: string;
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

/** A clickable link embedded in the narration (e.g. a quest/action anchor). */
export interface NarrationLink {
  /** The anchor's visible text (used to locate it inline in the narration). */
  text: string;
  /** Clicks the original anchor so its native (javascript:) handler runs. */
  trigger: () => void;
}

/** A player status indicator shown next to the money (insurance, curse, ...). */
export interface StatusIcon {
  iconUrl: string;
  label: string;
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
  /** The "engage the nearby monster" button, shown only during an encounter. */
  attack: BuildingOption | null;
  /** Game settings (klap) icon — rendered in the NavPad top-left corner. */
  settingsButton: BuildingOption | null;
  /** Rest (pihen) icon — rendered in the NavPad top-right corner. */
  restButton: BuildingOption | null;
  /** Player status indicators (insurance, curse, magic shield, ...). */
  statusIcons: StatusIcon[];
  actions: Action[];
  narration: string;
  narrationLinks: NarrationLink[];
}

export interface LoginState {
  /** Previously-saved username (GM storage), used to pre-fill the field. */
  savedUsername: string;
  /**
   * Login status/error message the game prints on a failed attempt (e.g.
   * "Hiányzik a karakter, vagy rossz adatokat adtál meg!"), or '' if none.
   */
  error: string;
  /**
   * Fills the original hidden login inputs, persists the username, and submits
   * by clicking the game's native "Belépés" button so its own POST fires.
   */
  submit: (username: string, password: string) => void;
}

export interface BattleState {
  monsterName: string;
  monsterHp: number | null;
  monsterImageUrl: string;
  narration: string;
  narrationLinks: NarrationLink[];
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

/** Image basename of the free-move "engage the monster" button. */
const ATTACK_BASENAME = 'tamadas';

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
export function basename(src: string): string {
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
export function absolutizeGameUrl(src: string): string {
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

export function parsePlayerName(doc: Document): string {
  const nameEl = doc.querySelector('a[title="karakterlap"]') ?? doc.querySelector('font[color="blue"]');
  return nameEl?.textContent?.trim() ?? '';
}

/**
 * Player status indicators (insurance, curse, magic shield, ...) — the small
 * images that sit inside the stat block next to the money. Read from the <b>
 * that wraps the character-sheet link.
 */
function extractStatusIcons(doc: Document): StatusIcon[] {
  const block = doc.querySelector('a[title="karakterlap"]')?.closest('b');
  if (!block) return [];
  return Array.from(block.querySelectorAll<HTMLImageElement>('img')).map(img => ({
    iconUrl: absolutizeGameUrl(img.getAttribute('src') ?? ''),
    label: img.getAttribute('title')?.trim() ?? '',
  }));
}

/**
 * The narration block as plain text, `<br>`s converted to newlines.
 *
 * Exported because the desktop boot reads it on the pub page to recognise a
 * tavern quest offer (see `questOffer`), which needs the same flattening the
 * mobile extraction does — matching per text node finds nothing, since the
 * game splits sentences across nodes.
 */
export function extractNarration(doc: Document): string {
  const el = doc.querySelector('font[face="Comic sans MS"]');
  if (!el) return '';
  // The narration uses <br> for line breaks; textContent would drop them, so
  // convert <br> to newlines first, then read the text (stripping <b> etc.).
  const tmp = doc.createElement('div');
  tmp.innerHTML = el.innerHTML.replace(/<br\s*\/?>/gi, '\n');
  return (tmp.textContent ?? '')
    .replace(/[ \t]+\n/g, '\n')   // trim trailing spaces before a break
    .replace(/\n{3,}/g, '\n\n')   // collapse runs of blank lines
    .trim();
}

/**
 * Clickable anchors inside the narration block. Their href is typically a
 * `javascript:` that drives the shared game form; rather than reproduce it we
 * click the original anchor so its native handler runs (proxy-DOM pattern).
 * The visible text lets the renderer splice the link back inline.
 */
function extractNarrationLinks(doc: Document): NarrationLink[] {
  const block = doc.querySelector('font[face="Comic sans MS"]');
  if (!block) return [];
  return Array.from(block.querySelectorAll<HTMLAnchorElement>('a'))
    .map(a => ({ anchor: a, text: (a.textContent ?? '').trim() }))
    .filter(({ text }) => text.length > 0)
    .map(({ anchor, text }) => ({ text, trigger: () => anchor.click() }));
}

function extractStats(doc: Document): { gold: number; hp: number; hpMax: number; mp: number; mpMax: number } {
  const text = doc.body.textContent ?? '';
  const gold = parseGold(text);
  // The game prints these as "max / current" (e.g. "Életpont: 303 / 214") on
  // both the free-move and battle screens, so the first number is the max.
  const [hpMax, hp] = parseStatPair(text, 'Életpont');
  const [mpMax, mp] = parseStatPair(text, 'Varázspont');
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
/** Image basename of the game settings icon (rendered in a NavPad corner). */
const SETTINGS_BASENAME = 'klap';
/** Image basename of the rest icon (rendered in a NavPad corner). */
const REST_BASENAME = 'pihen';

/** Controls that are never "place" buildings on any screen. */
function isBaseNonBuilding(name: string): boolean {
  return name === 'ok' || name === ATTACK_BASENAME || name in DIRECTION_BY_BASENAME;
}

/**
 * Controls lifted out of the buildings row on screens with a NavPad (free-move
 * and dungeon): settings/rest go to the NavPad corners, and `sc_*` are the
 * game's own hotkey shortcut buttons (superseded by our local hotkey config).
 */
function isCornerOrShortcut(name: string): boolean {
  return name === SETTINGS_BASENAME || name === REST_BASENAME || name.startsWith('sc_');
}

function extractBuildings(doc: Document, excludeExtra: (name: string) => boolean = () => false): BuildingOption[] {
  const buildings: BuildingOption[] = [];
  doc.querySelectorAll<HTMLInputElement>('input[type="image"]').forEach(input => {
    const src = input.getAttribute('src') ?? '';
    const name = basename(src);
    if (isBaseNonBuilding(name) || excludeExtra(name)) return;

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

/** Finds a titled image input by basename and returns it as a BuildingOption. */
export function extractImageControl(doc: Document, wantName: string): BuildingOption | null {
  for (const input of Array.from(doc.querySelectorAll<HTMLInputElement>('input[type="image"]'))) {
    const src = input.getAttribute('src') ?? '';
    if (basename(src) !== wantName) continue;
    return {
      label: input.getAttribute('title')?.trim() || wantName,
      iconUrl: absolutizeGameUrl(src),
      trigger: () => input.click(),
    };
  }
  return null;
}

/**
 * The "engage the nearby monster" button (tamadas.gif), present only when a
 * monster is on the current tile. Returns null when there is no encounter.
 */
function extractAttack(doc: Document): BuildingOption | null {
  const input = doc.querySelector<HTMLInputElement>(`input[type="image"][src*="${ATTACK_BASENAME}.gif"]`);
  if (!input) return null;
  return {
    label: input.getAttribute('title')?.trim() || 'Támadás',
    iconUrl: absolutizeGameUrl(input.getAttribute('src') ?? ''),
    trigger: () => input.click(),
  };
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
      actionKey: opt.value,
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
    buildings: extractBuildings(doc, isCornerOrShortcut),
    attack: extractAttack(doc),
    settingsButton: extractImageControl(doc, SETTINGS_BASENAME),
    restButton: extractImageControl(doc, REST_BASENAME),
    statusIcons: extractStatusIcons(doc),
    actions: extractFreeMoveActions(doc),
    narration: extractNarration(doc),
    narrationLinks: extractNarrationLinks(doc),
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

/** Classes a battle control by its image basename. */
function battleActionKind(name: string): BattleActionKind {
  if (name === 'balk' || name === 'jobbk') return 'attack';
  if (name === 'menekul') return 'flee';
  return 'spell';
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
      kind: battleActionKind(name),
      iconUrl: absolutizeGameUrl(input.getAttribute('src') ?? ''),
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
    narrationLinks: extractNarrationLinks(doc),
    actions: extractBattleActions(doc),
    hp,
    hpMax,
    mp,
    mpMax,
  };
}

/** GM storage key under which the last-used login name is remembered. */
export const LOGIN_USERNAME_KEY = 'lc-login-username';

/**
 * The login page uses an unnamed <form> (not name="urlap") holding a text
 * `loginname`, a password `loginpassw`, and an image `Submit` button. We never
 * reconstruct the POST: submit() fills the original inputs and clicks the
 * native button so the game's own form handling runs unchanged. The username
 * (only) is remembered via GM storage to pre-fill on the next visit.
 */
export function extractLogin(doc: Document): LoginState {
  const savedUsername = GM_getValue(LOGIN_USERNAME_KEY, '') ?? '';

  // On a failed attempt the game re-serves the login page with a status
  // message in a Comic Sans font coloured #003366 (the "Login:/Jelszó:" label
  // row uses colour 000000). Absent on a clean page.
  const error =
    doc.querySelector('font[face="Comic sans MS"][color="#003366"]')?.textContent?.trim() ?? '';

  const submit = (username: string, password: string): void => {
    const nameInput = doc.querySelector<HTMLInputElement>('input[name="loginname"]');
    const passwInput = doc.querySelector<HTMLInputElement>('input[name="loginpassw"]');
    if (nameInput) nameInput.value = username;
    if (passwInput) passwInput.value = password;

    GM_setValue(LOGIN_USERNAME_KEY, username);

    const submitBtn = doc.querySelector<HTMLInputElement>('input[name="Submit"]');
    if (submitBtn) {
      submitBtn.click();
    } else {
      // Fall back to submitting the enclosing form if the button is missing.
      (nameInput?.form ?? doc.querySelector('form'))?.submit();
    }
  };

  return { savedUsername, error, submit };
}

/** A single layered image in the dungeon's composed cell picture. */
export interface DungeonTile {
  imageUrl: string;
  left: number;
  top: number;
  width: number;
  height: number;
  z: number;
}

/** One selectable answer of a dungeon question. */
export interface DungeonAnswer {
  label: string;
  /** Clicks the original radio, firing its onclick (sets urlap.par1). */
  select: () => void;
}

/** A movement-blocking multiple-choice question shown in some dungeon cells. */
export interface DungeonQuestion {
  prompt: string;
  answers: DungeonAnswer[];
  /** Clicks the original "Válasz" button (native submit). */
  submit: () => void;
}

export interface DungeonState {
  playerName: string;
  gold: number;
  hp: number;
  hpMax: number;
  mp: number;
  mpMax: number;
  statusIcons: StatusIcon[];
  /** Layered tiles of the composed cell image (floor, doors, walls, corridors, figure, enemy). */
  tiles: DungeonTile[];
  directions: DirectionOption[];
  buildings: BuildingOption[];
  /** Game settings (klap) icon — rendered in the NavPad top-left corner. */
  settingsButton: BuildingOption | null;
  /** Rest (pihen) icon — rendered in the NavPad top-right corner. */
  restButton: BuildingOption | null;
  actions: Action[];
  narration: string;
  narrationLinks: NarrationLink[];
  question: DungeonQuestion | null;
}

/** Composed-cell tile images, matched by their src path segment. */
const DUNGEON_TILE_RE = /\/(talaj|ajto|fal|folyoso|labirintus|ellenfel)\//;

/** Reads a numeric CSS property (px or unit-less) from an inline style string. */
function parseStyleNumber(style: string, prop: string): number {
  const m = style.match(new RegExp(`${prop}\\s*:\\s*(-?\\d+)`));
  return m ? parseInt(m[1], 10) : 0;
}

function extractDungeonTiles(doc: Document): DungeonTile[] {
  const raw = Array.from(doc.querySelectorAll<HTMLImageElement>('img'))
    .filter(img => DUNGEON_TILE_RE.test(img.getAttribute('src') ?? ''))
    .map(img => {
      const style = img.parentElement?.getAttribute('style') ?? '';
      return {
        imageUrl: absolutizeGameUrl(img.getAttribute('src') ?? ''),
        left: parseStyleNumber(style, 'left'),
        top: parseStyleNumber(style, 'top'),
        width: parseStyleNumber(style, 'width'),
        height: parseStyleNumber(style, 'height'),
        z: parseStyleNumber(style, 'z-index'),
      };
    });

  if (raw.length === 0) return [];

  // Normalise offsets so the composite box starts at (0, 0).
  const minLeft = Math.min(...raw.map(t => t.left));
  const minTop = Math.min(...raw.map(t => t.top));
  return raw.map(t => ({ ...t, left: t.left - minLeft, top: t.top - minTop }));
}

/** Text following a radio up to the next <br>/input — its answer label. */
function answerLabelAfter(radio: Element): string {
  let text = '';
  let node = radio.nextSibling;
  while (node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = (node as Element).tagName;
      if (tag === 'BR' || tag === 'INPUT') break;
    }
    if (node.nodeType === Node.TEXT_NODE) text += node.textContent ?? '';
    node = node.nextSibling;
  }
  return text.replace(/\s+/g, ' ').trim();
}

/** Text of the question block up to the first answer radio — the prompt. */
function questionPromptBefore(block: Element, firstRadio: Element): string {
  let text = '';
  for (const node of Array.from(block.childNodes)) {
    if (node === firstRadio) break;
    if (node.nodeType === Node.ELEMENT_NODE && (node as Element).contains(firstRadio)) break;
    text += `${node.textContent ?? ''} `;
  }
  return text.replace(/\s+/g, ' ').trim();
}

function extractDungeonQuestion(doc: Document): DungeonQuestion | null {
  const radios = Array.from(doc.querySelectorAll<HTMLInputElement>('input[name="valasz"]'));
  if (radios.length === 0) return null;

  const block = radios[0].closest('font[face="Comic sans MS"]') ?? radios[0].parentElement;
  const prompt = block ? questionPromptBefore(block, radios[0]) : '';

  const answers: DungeonAnswer[] = radios.map(radio => ({
    label: answerLabelAfter(radio),
    trigger: radio,
  })).map(({ label, trigger }) => ({ label, select: () => trigger.click() }));

  const valaszButton = Array.from(doc.querySelectorAll<HTMLInputElement>('input[type="button"]'))
    .find(b => (b.value ?? '').trim() === 'Válasz');

  return { prompt, answers, submit: () => valaszButton?.click() };
}

export function extractDungeon(doc: Document): DungeonState {
  const { gold, hp, hpMax, mp, mpMax } = extractStats(doc);
  const question = extractDungeonQuestion(doc);

  return {
    playerName: parsePlayerName(doc),
    gold,
    hp,
    hpMax,
    mp,
    mpMax,
    statusIcons: extractStatusIcons(doc),
    tiles: extractDungeonTiles(doc),
    directions: extractDirections(doc),
    buildings: extractBuildings(doc, isCornerOrShortcut),
    settingsButton: extractImageControl(doc, SETTINGS_BASENAME),
    restButton: extractImageControl(doc, REST_BASENAME),
    actions: extractFreeMoveActions(doc),
    // The prompt already carries the movement/question text, so suppress the
    // duplicate narration while a question is active.
    narration: question ? '' : extractNarration(doc),
    narrationLinks: question ? [] : extractNarrationLinks(doc),
    question,
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
