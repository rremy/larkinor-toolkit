// Extraction for the city buildings with a job of their own but no list to
// trade from: the bank, the arena and the palace's quest room. Each page is a
// handful of titled image controls driving the shared `urlap` form, a field or
// two in a small form of its own, and figures printed as plain text.
//
// As everywhere, the controls are clicked, never reconstructed; a field the
// handler reads (`Banktev.penzbe`, `sajatklon.feltettpenz`) is filled first.
//
// See docs/superpowers/specs/2026-10-28-shops-and-buildings-design.md.

import {
  absolutizeGameUrl,
  extractBuildingNarration,
  extractImageControl,
  extractStats,
  parseGold,
  type BuildingOption,
} from '@/utils/domExtract';

const EXIT_BUTTON = 'vissza';

/** An image control whose handler reads one text field, filled before the click. */
export interface AmountAction {
  label: string;
  iconUrl: string;
  run: (amount: number) => void;
}

function field(doc: Document, form: string, name: string): HTMLInputElement | null {
  return (doc.forms.namedItem(form)?.elements.namedItem(name) as HTMLInputElement | null) ?? null;
}

/** The image control inside `form`, wrapped to fill `fieldName` first. */
function amountAction(doc: Document, form: string, fieldName: string): AmountAction | null {
  const formEl = doc.forms.namedItem(form);
  const input = formEl?.querySelector<HTMLInputElement>('input[type="image"]');
  if (!formEl || !input) return null;
  const control = { label: input.getAttribute('title')?.trim() ?? '', iconUrl: absolutizeGameUrl(input.getAttribute('src') ?? '') };
  return {
    ...control,
    run: (amount: number) => {
      const target = field(doc, form, fieldName);
      if (!target) return;
      target.value = String(Math.max(0, Math.floor(amount)));
      input.click();
    },
  };
}

/** Digits after `label`, skipping markup-born whitespace, or null when absent. */
function figureAfter(text: string, label: RegExp): number | null {
  const m = text.match(new RegExp(`${label.source}\\s*(\\d[\\d \\t\\u00a0]*)`));
  if (!m) return null;
  const digits = m[1].replace(/\D/g, '');
  return digits ? parseInt(digits, 10) : null;
}

// --- Bank ------------------------------------------------------------------

export interface BankState {
  gold: number;
  /** "Bankban levő pénzed". */
  balance: number | null;
  /** "Királynak törlesztett összeg" — what has been repaid to the king so far. */
  repaid: number | null;
  narration: string;
  deposit: AmountAction | null;
  withdraw: AmountAction | null;
  /** "Minden pénz a hátizsákból" — deposits every coin carried. */
  depositAll: BuildingOption | null;
  /** The fixed 50 000 repayment to the king. */
  repay: BuildingOption | null;
  exit: BuildingOption | null;
}

/**
 * The bank's two money buttons share an image (`elad.gif`) with every other
 * button on the page, so they are told apart by the form holding them (deposit,
 * withdraw, repay) or, for the one outside any form, by its title.
 */
function titledControl(doc: Document, title: RegExp): BuildingOption | null {
  const input = Array.from(doc.querySelectorAll<HTMLInputElement>('input[type="image"]'))
    .find((i) => title.test(i.getAttribute('title') ?? ''));
  if (!input) return null;
  return {
    label: input.getAttribute('title')?.trim() ?? '',
    iconUrl: absolutizeGameUrl(input.getAttribute('src') ?? ''),
    trigger: () => input.click(),
  };
}

export function extractBank(doc: Document): BankState {
  const text = doc.body.textContent ?? '';
  return {
    gold: parseGold(text),
    balance: figureAfter(text, /Bankban levő pénzed:/),
    repaid: figureAfter(text, /Királynak törlesztett összeg:/),
    narration: extractBuildingNarration(doc),
    deposit: amountAction(doc, 'Banktev', 'penzbe'),
    withdraw: amountAction(doc, 'Bankkiv', 'penzki'),
    depositAll: titledControl(doc, /^Minden pénz/),
    repay: titledControl(doc, /törlesztesz a királynak/),
    exit: extractImageControl(doc, EXIT_BUTTON),
  };
}

// --- Arena -----------------------------------------------------------------

export interface ArenaState {
  gold: number;
  hp: number;
  hpMax: number;
  mp: number;
  mpMax: number;
  narration: string;
  /** "Elkezded a dicsőséges csatát!" — the arena fight. */
  fight: BuildingOption | null;
  rest: BuildingOption | null;
  clone: {
    /** "Klón állapota", e.g. "aktív". */
    status: string | null;
    /** What the bet field holds as the page arrived. */
    bet: number | null;
    /** "A klónod eddig N ezüstöt nyert". */
    winnings: number | null;
    /** The line the page prints about available opponents, when it prints one. */
    note: string | null;
    /** Enters the clone, betting the given amount. */
    enter: AmountAction | null;
    /** Collects the clone's winnings (the handler also reads the bet field). */
    collect: AmountAction | null;
  };
  exit: BuildingOption | null;
}

/** An image control by basename whose handler reads the clone's bet field. */
function cloneAction(doc: Document, name: string): AmountAction | null {
  const control = extractImageControl(doc, name);
  if (!control) return null;
  return {
    label: control.label,
    iconUrl: control.iconUrl,
    run: (amount: number) => {
      const bet = field(doc, 'sajatklon', 'feltettpenz');
      if (bet) bet.value = String(Math.max(0, Math.floor(amount)));
      control.trigger();
    },
  };
}

export function extractArena(doc: Document): ArenaState {
  const { gold, hp, hpMax, mp, mpMax } = extractStats(doc);
  const form = doc.forms.namedItem('sajatklon');
  const formText = form?.textContent ?? '';
  const status = formText.match(/Klón állapota:\s*([\s\S]*?)\s*Klónra/)?.[1].trim() || null;
  const betField = field(doc, 'sajatklon', 'feltettpenz');
  const bet = betField ? parseInt(betField.value, 10) : NaN;
  // The note sits in the div after the form's own, not inside the form.
  const note = Array.from(doc.querySelectorAll('div'))
    .map((d) => (d.childElementCount === 0 ? d.textContent?.trim() ?? '' : ''))
    .find((t) => /klón/i.test(t)) ?? null;

  return {
    gold,
    hp,
    hpMax,
    mp,
    mpMax,
    narration: extractBuildingNarration(doc),
    fight: extractImageControl(doc, 'tamadas'),
    rest: extractImageControl(doc, 'pihen'),
    clone: {
      status,
      bet: Number.isFinite(bet) ? bet : null,
      winnings: figureAfter(formText, /A klónod eddig/),
      note,
      enter: cloneAction(doc, 'klonoz'),
      collect: cloneAction(doc, 'penztkap'),
    },
    exit: extractImageControl(doc, EXIT_BUTTON),
  };
}

// --- Palace quest room -----------------------------------------------------

export interface PalaceQuestOffer {
  /** The royal quest's number, as printed "(47)" — a royal `Quest.id`. */
  questId: string | null;
  /** The king's brief, one paragraph per printed line. */
  brief: string;
  /** "Jutalmad" — what the quest pays, as printed. */
  reward: string | null;
}

export interface PalaceQuestState {
  gold: number;
  narration: string;
  /** Null when the room offers nothing (or words it in a way not yet seen). */
  offer: PalaceQuestOffer | null;
  accept: BuildingOption | null;
  claimReward: BuildingOption | null;
  exit: BuildingOption | null;
}

/** Reads the offer block: "A munka, amit vállalhatsz, a következő: (47)" … "Jutalmad" …. */
function readQuestOffer(doc: Document): PalaceQuestOffer | null {
  const block = Array.from(doc.querySelectorAll('font[face="Comic sans MS"]'))
    .find((el) => /amit vállalhatsz/.test(el.textContent ?? ''));
  if (!block) return null;
  const tmp = doc.createElement('div');
  tmp.innerHTML = block.innerHTML.replace(/<br\s*\/?>/gi, '\n');
  const lines = (tmp.textContent ?? '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);

  const questId = lines[0]?.match(/\((\d+)\)/)?.[1] ?? null;
  // "Jutalmad" closes the brief wherever it falls — on a line of its own on the
  // page seen, but nothing in the markup promises the break before it.
  const [brief, rewardText] = lines.slice(1).join('\n').split(/\s*\bJutalmad\b:?\s*/);
  const reward = rewardText?.replace(/\n/g, ' ').replace(/,\s*$/, '').trim() || null;
  return { questId, brief: brief.trim(), reward };
}

export function extractPalaceQuest(doc: Document): PalaceQuestState {
  return {
    gold: parseGold(doc.body.textContent ?? ''),
    narration: extractBuildingNarration(doc),
    offer: readQuestOffer(doc),
    accept: extractImageControl(doc, 'vallkuld'),
    claimReward: extractImageControl(doc, 'jeljut'),
    exit: extractImageControl(doc, EXIT_BUTTON),
  };
}
