export interface DropRef {
  monsterId: number;
  qty: number;
}

export interface RecipeRef {
  name: string;
  qty: number;
  id: string;
}

export interface ShopRef {
  cellId: string;
  owner: string;
  price: number;
}

/**
 * What the player owns of an item, laid over the database rows in-game by
 * `withInventory` (src/shared/inventory.ts). Absent on every row when nothing
 * has been recorded — always, on the standalone site.
 */
export interface Ownership {
  /** Total across every location, or null when none is owned. */
  owned?: number | null;
  /** Where it is, one entry per location holding any. */
  holdings?: Holding[];
}

/** Where an owned item is: worn, in the backpack, in the house, on offer at the market. */
export type HoldingLocation = 'worn' | 'backpack' | 'house' | 'market';

export interface Holding {
  location: HoldingLocation;
  quantity: number;
  /** When that location was last read off a page. */
  capturedAt: number;
}

export interface Weapon extends Ownership {
  id: number;
  name: string;
  weight: number;
  price: number;
  marketPrice: number | null;
  special: string;
  magical: boolean;
  craftableAt: string;
  minLevel: number | null;
  recipe: RecipeRef[];
  droppedBy: DropRef[];
  type: string;
  maxDamage: number;
  spread: number;
  avgDamage: number;
  vampiric: boolean;
  level: number;
  availability: RecipeRef[];
  shops: ShopRef[];
}

export interface Armor extends Ownership {
  id: number;
  name: string;
  weight: number;
  price: number;
  marketPrice: number | null;
  special: string;
  magical: boolean;
  craftableAt: string;
  minLevel: number | null;
  recipe: RecipeRef[];
  droppedBy: DropRef[];
  type: string;
  defense: number;
  level: number;
  shops?: ShopRef[];
}

export interface Item extends Ownership {
  id: number;
  name: string;
  weight: number;
  price: number;
  marketPrice: number | null;
  special: string;
  magical: boolean;
  craftableAt: string;
  minLevel: number | null;
  recipe: RecipeRef[];
  droppedBy: DropRef[];
  defense: number | null;
  shops: ShopRef[];
}

export interface Building {
  name: string;
  icon: string;
}

export interface MapCell {
  imageId: string;
  imageSrc: string;
  district: string;
  buildings: Building[];
  clanHouses: Building[];
  exits: Record<string, string>;
  blockers: Record<string, { icon: string; title: string }>;
  firstCoords: [number, number];
}

export interface MapData {
  cells: MapCell[];
  /**
   * Recorded moves, keyed `<cellId>:<side>` → the cell reached, or `blocked`.
   * The only reliable source of a cell's position: tile ids mostly encode
   * `<row><col>`, but not all of them do (see `layoutCells`).
   */
  edges: Record<string, string>;
}

/**
 * What a sea-chart square holds when it is not open sea. `unknown` marks the
 * squares nobody has seen from a ship, which every side check skips.
 */
export type SeaSquareKind = 'land' | 'unexplored' | 'unknown';

/** One square of the archipelago chart, in the city map's grid coordinates. */
export interface SeaSquare {
  row: number;
  col: number;
  kind: SeaSquareKind;
  /** The district as the city map names it (`harcos-negyed`); approximate inside islands. */
  district?: string;
  harbour?: true;
}

/** The archipelago chart: every square that is not open sea (an absent square is sea). */
export interface SeaChart {
  rows: { min: number; max: number };
  cols: { min: number; max: number };
  squares: SeaSquare[];
}

export interface IslandBuilding {
  name: string;
  /** Finished; an unfinished building says what it still needs in `note`. */
  ready: boolean;
  note?: string;
}

/** An island tile, keyed by the picture the game draws for it under `/tajk/`. */
export interface IslandTile {
  /** The picture path below `/tajk/`, without `.gif`: `nagysziget/szig_2-10`. */
  image: string;
  row: number;
  col: number;
  island: string;
  name?: string;
  district?: string;
  buildings?: IslandBuilding[];
}

export interface ShopLine {
  id: string;
  qty: number;
  name: string;
  price: number;
}

export interface ItemShop {
  cellId: string;
  owner: string;
  itemCount: number;
  items: ShopLine[];
}

export interface ShopData {
  shops: ItemShop[];
}

/**
 * The lock types a quest door can carry: the eight both larkinorcenter.hu
 * sources use, plus `varazs` (magic), which only the archived quests 46–63
 * have.
 */
export type LockType =
  | 'vas' | 'rez' | 'bronz' | 'ezust'
  | 'arany' | 'platina' | 'tolvaj' | 'cso' | 'varazs';

export type Side = 'N' | 'E' | 'S' | 'W';

/**
 * One side of a quest maze cell. `szel` is a distinct kind on purpose: the
 * source site declares the class but ships no CSS rule for it. Investigation
 * (see the design doc's "Resolved during implementation" section) found every one
 * of its 182 occurrences borders either off-grid space or an empty `nop`
 * filler cell, never a real navigable neighbour — so it marks the edge of the
 * drawn (often irregular) maze shape inside its rectangular grid, not a
 * traversable barrier. It stays a distinct kind rather than collapsing into
 * `wall` so the UI can label it accurately.
 */
export type Edge =
  | { kind: 'open' }
  | { kind: 'wall' }
  | { kind: 'door'; lock: LockType }
  | { kind: 'szel' };

export interface QuestChoice {
  /** The number the source prints in parentheses, e.g. `(2)`. */
  index: number;
  text: string;
  outcome: string;
}

export interface QuestQuestion {
  prompt: string;
  choices: QuestChoice[];
}

export interface QuestCell {
  row: number;
  col: number;
  edges: Record<Side, Edge>;
  /** Resolved against monsters.json; null when the cell holds no monster. */
  monsterId: number | null;
  /** Raw sprite base, kept when resolution fails so the UI can still label it. */
  monsterName: string | null;
  boss: boolean;
  /** The lock whose key this cell yields. */
  key: LockType | null;
  /**
   * Further keys, for the few cells that yield several (archived quests only,
   * e.g. 57's Csontváz). Absent everywhere else; read both through `cellKeys`.
   */
  extraKeys?: LockType[];
  questItem: boolean;
  portal: 'entrance' | 'exit' | null;
  trap: boolean;
  death: boolean;
  narration: string;
  drops: string | null;
  /**
   * Whether the source image marks this tile as a question, independent of
   * `question` below. The title text's Q&A block frequently fails to parse
   * (prose-only question, missing `KÉRDÉS:` token, ...), and when that
   * happens the tile must still show a question marker — the marker comes
   * from the artwork, not from parse success. Never derive this from
   * `question !== null`; that conflated the two concerns and is the root
   * cause of quest cells silently losing their question marker.
   */
  hasQuestion: boolean;
  /** Null when the title could not be split into a prompt and choices. */
  question: QuestQuestion | null;
  /** Provenance, for diagnosing source drift. */
  rawImage: string;
}

/** Which body of quests a `Quest` belongs to. */
export type QuestSet = 'royal' | 'tavern';

export interface Quest {
  /**
   * Royal quests use their number as a string (`'1'`…`'45'`); tavern quests
   * use the source page's slug (`'GOMB'`, `'alapito_okirat'`, `'GY.I.K'`).
   * One string type rather than a `number | string` union: every consumer
   * compares and routes on it, and a union would push a discriminant check
   * into each of those sites for no benefit.
   */
  id: string;
  set: QuestSet;
  /**
   * Chip and header label. Royal holds the bare number (the header renders
   * `12. küldetés` from it); tavern holds the display title.
   */
  title: string;
  description: string;
  reward: string;
  rows: number;
  cols: number;
  cells: QuestCell[];
  /**
   * Which floor of a multi-floor quest this maze is — `F` for the ground floor,
   * `−1`… below it. Only royal quest 59 has floors; each is its own `Quest`,
   * sharing the title, and the ground floor keeps the plain id.
   */
  floor?: string;
}
