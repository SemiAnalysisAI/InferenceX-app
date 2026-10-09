import type { IconName } from './mc-atlas';
import { BLOCKS, type ToolKind } from './mc-blocks';

export interface ToolStats {
  kind: ToolKind;
  /** 1 wood, 2 stone, 3 iron, 4 diamond; gold mines like wood but fast. */
  tier: number;
  speed: number;
  durability: number;
}
export interface ItemDef {
  key: string;
  en: string;
  zh: string;
  icon: IconName;
  stack: number;
  /** Block placed by this item. */
  block?: number;
  tool?: ToolStats;
  /** Melee damage in half-hearts. */
  damage?: number;
  food?: { hunger: number; saturation: number };
  /** Furnace burn time in seconds. */
  fuel?: number;
}

export interface Stack {
  id: string;
  count: number;
  /** Uses consumed for tools. */
  wear?: number;
}

export const ITEMS: Record<string, ItemDef> = {};

function add(def: Omit<ItemDef, 'stack' | 'icon'> & { stack?: number; icon?: IconName }) {
  ITEMS[def.key] = { stack: 64, icon: def.key as IconName, ...def };
}

// Every placeable block (except internal ones) is an item.
const NOT_ITEMS = new Set([
  'air',
  'water',
  'lava',
  'wheat_crop',
  'farmland',
  'snowy_grass',
  'nether_portal',
  'end_portal',
]);
const BLOCK_FUEL: Record<string, number> = {
  oak_log: 15,
  birch_log: 15,
  spruce_log: 15,
  oak_planks: 15,
  birch_planks: 15,
  spruce_planks: 15,
  crafting_table: 15,
  bookshelf: 15,
  chest: 15,
  coal_block: 800,
  oak_sapling: 5,
  birch_sapling: 5,
  spruce_sapling: 5,
  ladder: 15,
};
for (const b of BLOCKS) {
  if (!b || NOT_ITEMS.has(b.key)) continue;
  add({ key: b.key, en: b.en, zh: b.zh, icon: b.icon, block: b.id, fuel: BLOCK_FUEL[b.key] });
}
ITEMS.oak_door.stack = 64;

const TIERS = [
  { key: 'wooden', en: 'Wooden', zh: '木', tier: 1, speed: 2, durability: 59, dmg: 0, fuel: 10 },
  { key: 'stone', en: 'Stone', zh: '石', tier: 2, speed: 4, durability: 131, dmg: 1, fuel: 0 },
  { key: 'iron', en: 'Iron', zh: '铁', tier: 3, speed: 6, durability: 250, dmg: 2, fuel: 0 },
  { key: 'golden', en: 'Golden', zh: '金', tier: 1, speed: 12, durability: 32, dmg: 0, fuel: 0 },
  {
    key: 'diamond',
    en: 'Diamond',
    zh: '钻石',
    tier: 4,
    speed: 8,
    durability: 1561,
    dmg: 3,
    fuel: 0,
  },
] as const;
const KINDS = [
  { key: 'pickaxe', en: 'Pickaxe', zh: '镐', dmg: 2 },
  { key: 'axe', en: 'Axe', zh: '斧', dmg: 4 },
  { key: 'shovel', en: 'Shovel', zh: '锹', dmg: 1.5 },
  { key: 'sword', en: 'Sword', zh: '剑', dmg: 4 },
  { key: 'hoe', en: 'Hoe', zh: '锄', dmg: 0 },
] as const;
for (const t of TIERS) {
  for (const k of KINDS) {
    add({
      key: `${t.key}_${k.key}`,
      en: `${t.en} ${k.en}`,
      zh: `${t.zh}${k.zh}`,
      stack: 1,
      tool: { kind: k.key, tier: t.tier, speed: t.speed, durability: t.durability },
      damage: 1 + k.dmg + t.dmg,
      fuel: t.fuel || undefined,
    });
  }
}

const simple: [string, string, string, Partial<ItemDef>?][] = [
  ['ender_pearl', 'Ender Pearl', '末影珍珠', { stack: 16 }],
  ['ender_eye', 'Eye of Ender', '末影之眼'],
  ['blaze_rod', 'Blaze Rod', '烈焰棒', { fuel: 120 }],
  ['blaze_powder', 'Blaze Powder', '烈焰粉'],
  ['bow', 'Bow', '弓', { stack: 1 }],
  ['arrow', 'Arrow', '箭'],
  ['stick', 'Stick', '木棍', { fuel: 5 }],
  ['coal', 'Coal', '煤炭', { fuel: 80 }],
  ['charcoal', 'Charcoal', '木炭', { fuel: 80 }],
  ['iron_ingot', 'Iron Ingot', '铁锭'],
  ['gold_ingot', 'Gold Ingot', '金锭'],
  ['diamond', 'Diamond', '钻石'],
  ['redstone', 'Redstone Dust', '红石粉'],
  ['lapis_lazuli', 'Lapis Lazuli', '青金石'],
  ['emerald', 'Emerald', '绿宝石'],
  ['raw_iron', 'Raw Iron', '粗铁'],
  ['raw_gold', 'Raw Gold', '粗金'],
  ['apple', 'Apple', '苹果', { food: { hunger: 4, saturation: 2.4 } }],
  ['bread', 'Bread', '面包', { food: { hunger: 5, saturation: 6 } }],
  ['wheat', 'Wheat', '小麦'],
  ['wheat_seeds', 'Wheat Seeds', '小麦种子'],
  ['porkchop', 'Raw Porkchop', '生猪排', { food: { hunger: 3, saturation: 1.8 } }],
  ['cooked_porkchop', 'Cooked Porkchop', '熟猪排', { food: { hunger: 8, saturation: 12.8 } }],
  ['beef', 'Raw Beef', '生牛肉', { food: { hunger: 3, saturation: 1.8 } }],
  ['cooked_beef', 'Steak', '牛排', { food: { hunger: 8, saturation: 12.8 } }],
  ['chicken', 'Raw Chicken', '生鸡肉', { food: { hunger: 2, saturation: 1.2 } }],
  ['cooked_chicken', 'Cooked Chicken', '熟鸡肉', { food: { hunger: 6, saturation: 7.2 } }],
  ['mutton', 'Raw Mutton', '生羊肉', { food: { hunger: 2, saturation: 1.2 } }],
  ['cooked_mutton', 'Cooked Mutton', '熟羊肉', { food: { hunger: 6, saturation: 9.6 } }],
  ['rotten_flesh', 'Rotten Flesh', '腐肉', { food: { hunger: 4, saturation: 0.8 } }],
  ['gunpowder', 'Gunpowder', '火药'],
  ['feather', 'Feather', '羽毛'],
  ['leather', 'Leather', '皮革'],
  ['flint', 'Flint', '燧石'],
  ['flint_and_steel', 'Flint and Steel', '打火石', { stack: 1 }],
  ['bucket', 'Bucket', '桶', { stack: 16 }],
  ['water_bucket', 'Water Bucket', '水桶', { stack: 1 }],
  ['lava_bucket', 'Lava Bucket', '熔岩桶', { stack: 1, fuel: 1000 }],
  ['bone', 'Bone', '骨头'],
  ['string', 'String', '线'],
  ['egg', 'Egg', '鸡蛋', { stack: 16 }],
  ['golden_apple', 'Golden Apple', '金苹果', { food: { hunger: 4, saturation: 9.6 } }],
  ['melon_slice', 'Melon Slice', '西瓜片', { food: { hunger: 2, saturation: 1.2 } }],
  ['shears', 'Shears', '剪刀', { stack: 1 }],
  ['brick', 'Brick', '红砖'],
  ['clay_ball', 'Clay Ball', '黏土球'],
  ['sugar', 'Sugar', '糖'],
  ['paper', 'Paper', '纸'],
  ['book', 'Book', '书'],
  ['bowl', 'Bowl', '碗'],
  ['mushroom_stew', 'Mushroom Stew', '蘑菇煲', { stack: 1, food: { hunger: 6, saturation: 7.2 } }],
];
for (const [key, en, zh, extra] of simple) add({ key, en, zh, ...extra });
ITEMS.shears.tool = { kind: 'shears', tier: 1, speed: 15, durability: 238 };

export function itemDef(id: string): ItemDef {
  const def = ITEMS[id];
  if (!def) throw new Error(`Unknown item ${id}`);
  return def;
}
export const maxStack = (id: string) => ITEMS[id]?.stack ?? 64;
export const itemName = (id: string, locale: 'en' | 'zh') => {
  const def = ITEMS[id];
  return def ? def[locale] : id;
};

// ---------------------------------------------------------------------------
// Crafting
// ---------------------------------------------------------------------------
/** Ingredient matchers: '#planks' and '#log' accept any wood type. */
const TAGS: Record<string, string[]> = {
  '#planks': ['oak_planks', 'birch_planks', 'spruce_planks'],
  '#log': ['oak_log', 'birch_log', 'spruce_log'],
  '#coal': ['coal', 'charcoal'],
  '#wool': ['white_wool', 'red_wool', 'blue_wool', 'black_wool', 'yellow_wool', 'lime_wool'],
  '#stone_tool': ['cobblestone', 'cobbled_deepslate'],
};
const matches = (ingredient: string, id: string | undefined) =>
  ingredient.startsWith('#')
    ? id !== undefined && TAGS[ingredient].includes(id)
    : ingredient === id;

export interface Recipe {
  /** Rows of single-character keys, ' ' for empty. Absent for shapeless. */
  pattern?: string[];
  keys?: Record<string, string>;
  shapeless?: string[];
  result: Stack;
}

const tool = (shape: string[], material: string, result: string): Recipe => ({
  pattern: shape,
  keys: { M: material, S: 'stick' },
  result: { id: result, count: 1 },
});
const TOOL_SHAPES = {
  pickaxe: ['MMM', ' S ', ' S '],
  axe: ['MM', 'MS', ' S'],
  shovel: ['M', 'S', 'S'],
  sword: ['M', 'M', 'S'],
  hoe: ['MM', ' S', ' S'],
};
const TOOL_MATERIALS: [string, string][] = [
  ['wooden', '#planks'],
  ['stone', '#stone_tool'],
  ['iron', 'iron_ingot'],
  ['golden', 'gold_ingot'],
  ['diamond', 'diamond'],
];

const storage = (block: string, item: string): Recipe[] => [
  { pattern: ['###', '###', '###'], keys: { '#': item }, result: { id: block, count: 1 } },
  { shapeless: [block], result: { id: item, count: 9 } },
];

export const RECIPES: Recipe[] = [
  { shapeless: ['blaze_rod'], result: { id: 'blaze_powder', count: 2 } },
  { shapeless: ['blaze_powder', 'ender_pearl'], result: { id: 'ender_eye', count: 1 } },
  {
    pattern: [' SF', 'S F', ' SF'],
    keys: { S: 'stick', F: 'string' },
    result: { id: 'bow', count: 1 },
  },
  {
    pattern: ['F', 'S', 'P'],
    keys: { F: 'flint', S: 'stick', P: 'feather' },
    result: { id: 'arrow', count: 4 },
  },
  // Wool supplies string until spiders are implemented.
  { shapeless: ['white_wool'], result: { id: 'string', count: 4 } },
  { shapeless: ['oak_log'], result: { id: 'oak_planks', count: 4 } },
  { shapeless: ['birch_log'], result: { id: 'birch_planks', count: 4 } },
  { shapeless: ['spruce_log'], result: { id: 'spruce_planks', count: 4 } },
  { pattern: ['#', '#'], keys: { '#': '#planks' }, result: { id: 'stick', count: 4 } },
  { pattern: ['##', '##'], keys: { '#': '#planks' }, result: { id: 'crafting_table', count: 1 } },
  { pattern: ['C', 'S'], keys: { C: '#coal', S: 'stick' }, result: { id: 'torch', count: 4 } },
  {
    pattern: ['###', '# #', '###'],
    keys: { '#': '#stone_tool' },
    result: { id: 'furnace', count: 1 },
  },
  { pattern: ['###', '# #', '###'], keys: { '#': '#planks' }, result: { id: 'chest', count: 1 } },
  { pattern: ['##', '##'], keys: { '#': 'sand' }, result: { id: 'sandstone', count: 1 } },
  { pattern: ['##', '##'], keys: { '#': 'brick' }, result: { id: 'bricks', count: 1 } },
  { pattern: ['##', '##'], keys: { '#': 'stone' }, result: { id: 'stone_bricks', count: 4 } },
  { pattern: ['##', '##'], keys: { '#': 'clay_ball' }, result: { id: 'clay', count: 1 } },
  { pattern: ['##', '##'], keys: { '#': 'string' }, result: { id: 'white_wool', count: 1 } },
  { pattern: ['##', '##'], keys: { '#': 'snow' }, result: { id: 'snow', count: 1 } },
  {
    pattern: ['GSG', 'SGS', 'GSG'],
    keys: { G: 'gunpowder', S: 'sand' },
    result: { id: 'tnt', count: 1 },
  },
  {
    pattern: ['###', 'BBB', '###'],
    keys: { '#': '#planks', B: 'book' },
    result: { id: 'bookshelf', count: 1 },
  },
  { pattern: ['##', '##', '##'], keys: { '#': '#planks' }, result: { id: 'oak_door', count: 3 } },
  { pattern: ['S S', 'SSS', 'S S'], keys: { S: 'stick' }, result: { id: 'ladder', count: 3 } },
  { pattern: ['I I', ' I '], keys: { I: 'iron_ingot' }, result: { id: 'bucket', count: 1 } },
  { shapeless: ['iron_ingot', 'flint'], result: { id: 'flint_and_steel', count: 1 } },
  { pattern: [' I', 'I '], keys: { I: 'iron_ingot' }, result: { id: 'shears', count: 1 } },
  { pattern: ['###'], keys: { '#': 'wheat' }, result: { id: 'bread', count: 1 } },
  { pattern: ['###'], keys: { '#': 'sugar_cane' }, result: { id: 'paper', count: 3 } },
  { shapeless: ['paper', 'paper', 'paper', 'leather'], result: { id: 'book', count: 1 } },
  { shapeless: ['sugar_cane'], result: { id: 'sugar', count: 1 } },
  { pattern: ['# #', ' # '], keys: { '#': '#planks' }, result: { id: 'bowl', count: 4 } },
  {
    pattern: ['GGG', 'GAG', 'GGG'],
    keys: { G: 'gold_ingot', A: 'apple' },
    result: { id: 'golden_apple', count: 1 },
  },
  {
    pattern: ['MMM', 'MMM', 'MMM'],
    keys: { M: 'melon_slice' },
    result: { id: 'melon', count: 1 },
  },
  { shapeless: ['wheat'], result: { id: 'wheat_seeds', count: 1 } },
  { shapeless: ['white_wool', 'poppy'], result: { id: 'red_wool', count: 1 } },
  { shapeless: ['white_wool', 'dandelion'], result: { id: 'yellow_wool', count: 1 } },
  { shapeless: ['white_wool', 'lapis_lazuli'], result: { id: 'blue_wool', count: 1 } },
  { shapeless: ['white_wool', 'coal'], result: { id: 'black_wool', count: 1 } },
  { shapeless: ['white_wool', 'cactus'], result: { id: 'lime_wool', count: 1 } },
  { shapeless: ['cobblestone', 'short_grass'], result: { id: 'mossy_cobblestone', count: 1 } },
  ...storage('iron_block', 'iron_ingot'),
  ...storage('gold_block', 'gold_ingot'),
  ...storage('diamond_block', 'diamond'),
  ...storage('emerald_block', 'emerald'),
  ...storage('lapis_block', 'lapis_lazuli'),
  ...storage('redstone_block', 'redstone'),
  ...storage('coal_block', 'coal'),
];
for (const [tier, material] of TOOL_MATERIALS) {
  for (const [kind, shape] of Object.entries(TOOL_SHAPES)) {
    RECIPES.push(tool(shape, material, `${tier}_${kind}`));
  }
}

/** Crop a crafting grid to its bounding box. */
function trim(grid: (string | undefined)[], size: number) {
  let minX = size;
  let minY = size;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!grid[y * size + x]) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < 0) return null;
  const rows: (string | undefined)[][] = [];
  for (let y = minY; y <= maxY; y++) rows.push(grid.slice(y * size + minX, y * size + maxX + 1));
  return rows;
}

function shapedMatch(recipe: Recipe, rows: (string | undefined)[][], mirror: boolean) {
  const pattern = recipe.pattern!;
  if (pattern.length !== rows.length) return false;
  const width = Math.max(...pattern.map((r) => r.length));
  if (rows[0].length !== width) return false;
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < width; x++) {
      const ch = pattern[y][mirror ? width - 1 - x : x] ?? ' ';
      const cell = rows[y][x];
      if (ch === ' ') {
        if (cell) return false;
      } else if (!matches(recipe.keys![ch], cell)) return false;
    }
  }
  return true;
}

/** Result of a 2x2 (size 2) or 3x3 (size 3) crafting grid, or null. */
export function craft(grid: (Stack | null)[], size: 2 | 3): Stack | null {
  const ids = grid.map((s) => (s && s.count > 0 ? s.id : undefined));
  const rows = trim(ids, size);
  if (!rows) return null;
  const present = ids.filter((id): id is string => Boolean(id));
  for (const recipe of RECIPES) {
    if (recipe.shapeless) {
      if (recipe.shapeless.length !== present.length) continue;
      const remaining = [...present];
      const ok = recipe.shapeless.every((ingredient) => {
        const i = remaining.findIndex((id) => matches(ingredient, id));
        if (i === -1) return false;
        remaining.splice(i, 1);
        return true;
      });
      if (ok) return { ...recipe.result };
    } else if (shapedMatch(recipe, rows, false) || shapedMatch(recipe, rows, true)) {
      return { ...recipe.result };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Smelting
// ---------------------------------------------------------------------------
export const SMELTING: Record<string, string> = {
  raw_iron: 'iron_ingot',
  raw_gold: 'gold_ingot',
  iron_ore: 'iron_ingot',
  gold_ore: 'gold_ingot',
  sand: 'glass',
  cobblestone: 'stone',
  stone: 'smooth_stone',
  cobbled_deepslate: 'deepslate',
  clay_ball: 'brick',
  clay: 'terracotta',
  oak_log: 'charcoal',
  birch_log: 'charcoal',
  spruce_log: 'charcoal',
  porkchop: 'cooked_porkchop',
  beef: 'cooked_beef',
  chicken: 'cooked_chicken',
  mutton: 'cooked_mutton',
  cactus: 'lime_wool',
  diamond_ore: 'diamond',
  coal_ore: 'coal',
};
/** Seconds to smelt one item, as in the original (200 ticks). */
export const SMELT_TIME = 10;

/** Mining time in seconds for a block with the held item, or Infinity. */
export function breakTime(
  blockId: number,
  held: string | undefined,
  onGround: boolean,
  inWater: boolean,
) {
  const block = BLOCKS[blockId];
  if (!block || block.hardness < 0) return Infinity;
  if (block.instant || block.hardness === 0) return 0;
  const toolStats = held ? ITEMS[held]?.tool : undefined;
  const right = toolStats !== undefined && toolStats.kind === block.tool;
  const harvest = !block.tier || (right && toolStats!.tier >= block.tier);
  let speed = right ? toolStats!.speed : 1;
  if (toolStats?.kind === 'sword' && block.key.includes('leaves')) speed = 1.5;
  if (toolStats?.kind === 'shears' && (block.key.includes('leaves') || block.key.includes('wool')))
    speed = block.key.includes('wool') ? 5 : 15;
  if (inWater) speed /= 5;
  if (!onGround) speed /= 5;
  const damage = speed / block.hardness / (harvest ? 30 : 100);
  if (damage >= 1) return 0;
  return Math.ceil(1 / damage) / 20;
}

/** Whether breaking yields the block's drop with this tool. */
export function canHarvest(blockId: number, held: string | undefined) {
  const block = BLOCKS[blockId];
  if (!block?.tier) return true;
  const toolStats = held ? ITEMS[held]?.tool : undefined;
  return toolStats !== undefined && toolStats.kind === block.tool && toolStats.tier >= block.tier;
}
