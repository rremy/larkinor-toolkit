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

export interface Weapon {
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

export interface Armor {
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

export interface Item {
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
