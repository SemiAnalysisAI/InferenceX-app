import { TILE, type IconName, type TileName } from './mc-atlas';

/**
 * Block registry. Numeric ids are stored in chunk arrays, so never renumber an
 * existing block (saved worlds reference them). Face order everywhere is
 * +X (east), -X (west), +Y (top), -Y (bottom), +Z (south), -Z (north).
 */
export type ToolKind = 'pickaxe' | 'axe' | 'shovel' | 'hoe' | 'sword' | 'shears';
export type SoundGroup =
  | 'grass'
  | 'stone'
  | 'wood'
  | 'gravel'
  | 'sand'
  | 'cloth'
  | 'snow'
  | 'glass';
export type RenderKind =
  | 'none'
  | 'cube'
  | 'cross'
  | 'liquid'
  | 'torch'
  | 'box'
  | 'crop'
  | 'door'
  | 'ladder';

/** Axis-aligned box in 1/16 block units: x0 y0 z0 x1 y1 z1. */
export type Box = readonly [number, number, number, number, number, number];

export interface BlockDef {
  id: number;
  key: string;
  en: string;
  zh: string;
  /** Six face tiles: +X -X +Y -Y +Z -Z. */
  tiles: readonly number[];
  render: RenderKind;
  /** Collides with entities. */
  solid: boolean;
  /** Fully occludes neighbours and blocks light. */
  opaque: boolean;
  /** Rendered in the alpha-blended pass (water, ice). */
  translucent?: boolean;
  hardness: number;
  tool?: ToolKind;
  /** Minimum harvest tier (1 wood, 2 stone, 3 iron, 4 diamond). */
  tier?: number;
  sound: SoundGroup;
  light?: number;
  /** Extra light attenuation for non-opaque blocks (leaves, water). */
  filter?: number;
  gravity?: boolean;
  replaceable?: boolean;
  /** Needs a solid block below to exist. */
  needsSupport?: boolean;
  /** Breaks instantly by hand regardless of hardness. */
  instant?: boolean;
  icon: IconName;
  /** Default dropped item key; '' drops nothing. */
  drop?: string;
  boxes?: readonly Box[];
  flammable?: boolean;
  climbable?: boolean;
  /** Blocks with a facing in meta bits 0-1. */
  facing?: boolean;
}

const all = (t: TileName) => [TILE[t], TILE[t], TILE[t], TILE[t], TILE[t], TILE[t]];
const column = (side: TileName, top: TileName, bottom: TileName = top) => [
  TILE[side],
  TILE[side],
  TILE[top],
  TILE[bottom],
  TILE[side],
  TILE[side],
];
/** Front on +Z for meta facing 0; the mesher rotates by facing. */
const fronted = (front: TileName, side: TileName, top: TileName, bottom: TileName = top) => [
  TILE[side],
  TILE[side],
  TILE[top],
  TILE[bottom],
  TILE[front],
  TILE[side],
];

type Def = Omit<BlockDef, 'id' | 'icon'> & { icon?: IconName };
const DEFS: [number, Def][] = [
  [
    0,
    {
      key: 'air',
      en: 'Air',
      zh: '空气',
      tiles: all('stone'),
      render: 'none',
      solid: false,
      opaque: false,
      hardness: 0,
      sound: 'stone',
      replaceable: true,
      drop: '',
    },
  ],
  [
    1,
    {
      key: 'grass_block',
      en: 'Grass Block',
      zh: '草方块',
      tiles: column('grass_block_side', 'grass_block_top', 'dirt'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 0.6,
      tool: 'shovel',
      sound: 'grass',
      drop: 'dirt',
    },
  ],
  [
    2,
    {
      key: 'dirt',
      en: 'Dirt',
      zh: '泥土',
      tiles: all('dirt'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 0.5,
      tool: 'shovel',
      sound: 'gravel',
    },
  ],
  [
    3,
    {
      key: 'stone',
      en: 'Stone',
      zh: '石头',
      tiles: all('stone'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 1.5,
      tool: 'pickaxe',
      tier: 1,
      sound: 'stone',
      drop: 'cobblestone',
    },
  ],
  [
    4,
    {
      key: 'cobblestone',
      en: 'Cobblestone',
      zh: '圆石',
      tiles: all('cobblestone'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 2,
      tool: 'pickaxe',
      tier: 1,
      sound: 'stone',
    },
  ],
  [
    5,
    {
      key: 'bedrock',
      en: 'Bedrock',
      zh: '基岩',
      tiles: all('bedrock'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: -1,
      sound: 'stone',
      drop: '',
    },
  ],
  [
    6,
    {
      key: 'sand',
      en: 'Sand',
      zh: '沙子',
      tiles: all('sand'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 0.5,
      tool: 'shovel',
      sound: 'sand',
      gravity: true,
    },
  ],
  [
    7,
    {
      key: 'gravel',
      en: 'Gravel',
      zh: '沙砾',
      tiles: all('gravel'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 0.6,
      tool: 'shovel',
      sound: 'gravel',
      gravity: true,
    },
  ],
  [
    8,
    {
      key: 'oak_log',
      en: 'Oak Log',
      zh: '橡木原木',
      tiles: column('oak_log', 'oak_log_top'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 2,
      tool: 'axe',
      sound: 'wood',
      flammable: true,
    },
  ],
  [
    9,
    {
      key: 'oak_leaves',
      en: 'Oak Leaves',
      zh: '橡树树叶',
      tiles: all('oak_leaves'),
      render: 'cube',
      solid: true,
      opaque: false,
      filter: 1,
      hardness: 0.2,
      tool: 'shears',
      sound: 'grass',
      drop: '',
      flammable: true,
    },
  ],
  [
    10,
    {
      key: 'oak_planks',
      en: 'Oak Planks',
      zh: '橡木木板',
      tiles: all('oak_planks'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 2,
      tool: 'axe',
      sound: 'wood',
      flammable: true,
    },
  ],
  [
    11,
    {
      key: 'birch_log',
      en: 'Birch Log',
      zh: '白桦原木',
      tiles: column('birch_log', 'birch_log_top'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 2,
      tool: 'axe',
      sound: 'wood',
      flammable: true,
    },
  ],
  [
    12,
    {
      key: 'birch_leaves',
      en: 'Birch Leaves',
      zh: '白桦树叶',
      tiles: all('birch_leaves'),
      render: 'cube',
      solid: true,
      opaque: false,
      filter: 1,
      hardness: 0.2,
      tool: 'shears',
      sound: 'grass',
      drop: '',
      flammable: true,
    },
  ],
  [
    13,
    {
      key: 'birch_planks',
      en: 'Birch Planks',
      zh: '白桦木板',
      tiles: all('birch_planks'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 2,
      tool: 'axe',
      sound: 'wood',
      flammable: true,
    },
  ],
  [
    14,
    {
      key: 'spruce_log',
      en: 'Spruce Log',
      zh: '云杉原木',
      tiles: column('spruce_log', 'spruce_log_top'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 2,
      tool: 'axe',
      sound: 'wood',
      flammable: true,
    },
  ],
  [
    15,
    {
      key: 'spruce_leaves',
      en: 'Spruce Leaves',
      zh: '云杉树叶',
      tiles: all('spruce_leaves'),
      render: 'cube',
      solid: true,
      opaque: false,
      filter: 1,
      hardness: 0.2,
      tool: 'shears',
      sound: 'grass',
      drop: '',
      flammable: true,
    },
  ],
  [
    16,
    {
      key: 'spruce_planks',
      en: 'Spruce Planks',
      zh: '云杉木板',
      tiles: all('spruce_planks'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 2,
      tool: 'axe',
      sound: 'wood',
      flammable: true,
    },
  ],
  [
    17,
    {
      key: 'water',
      en: 'Water',
      zh: '水',
      tiles: all('water_still'),
      render: 'liquid',
      solid: false,
      opaque: false,
      translucent: true,
      filter: 2,
      hardness: 100,
      sound: 'stone',
      replaceable: true,
      drop: '',
    },
  ],
  [
    18,
    {
      key: 'lava',
      en: 'Lava',
      zh: '熔岩',
      tiles: all('lava_still'),
      render: 'liquid',
      solid: false,
      opaque: false,
      light: 15,
      hardness: 100,
      sound: 'stone',
      replaceable: true,
      drop: '',
    },
  ],
  [
    19,
    {
      key: 'coal_ore',
      en: 'Coal Ore',
      zh: '煤矿石',
      tiles: all('coal_ore'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 3,
      tool: 'pickaxe',
      tier: 1,
      sound: 'stone',
      drop: 'coal',
    },
  ],
  [
    20,
    {
      key: 'iron_ore',
      en: 'Iron Ore',
      zh: '铁矿石',
      tiles: all('iron_ore'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 3,
      tool: 'pickaxe',
      tier: 2,
      sound: 'stone',
      drop: 'raw_iron',
    },
  ],
  [
    21,
    {
      key: 'gold_ore',
      en: 'Gold Ore',
      zh: '金矿石',
      tiles: all('gold_ore'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 3,
      tool: 'pickaxe',
      tier: 3,
      sound: 'stone',
      drop: 'raw_gold',
    },
  ],
  [
    22,
    {
      key: 'diamond_ore',
      en: 'Diamond Ore',
      zh: '钻石矿石',
      tiles: all('diamond_ore'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 3,
      tool: 'pickaxe',
      tier: 3,
      sound: 'stone',
      drop: 'diamond',
    },
  ],
  [
    23,
    {
      key: 'redstone_ore',
      en: 'Redstone Ore',
      zh: '红石矿石',
      tiles: all('redstone_ore'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 3,
      tool: 'pickaxe',
      tier: 3,
      sound: 'stone',
      drop: 'redstone',
    },
  ],
  [
    24,
    {
      key: 'lapis_ore',
      en: 'Lapis Lazuli Ore',
      zh: '青金石矿石',
      tiles: all('lapis_ore'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 3,
      tool: 'pickaxe',
      tier: 2,
      sound: 'stone',
      drop: 'lapis_lazuli',
    },
  ],
  [
    25,
    {
      key: 'emerald_ore',
      en: 'Emerald Ore',
      zh: '绿宝石矿石',
      tiles: all('emerald_ore'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 3,
      tool: 'pickaxe',
      tier: 3,
      sound: 'stone',
      drop: 'emerald',
    },
  ],
  [
    26,
    {
      key: 'glass',
      en: 'Glass',
      zh: '玻璃',
      tiles: all('glass'),
      render: 'cube',
      solid: true,
      opaque: false,
      hardness: 0.3,
      sound: 'glass',
      drop: '',
    },
  ],
  [
    27,
    {
      key: 'crafting_table',
      en: 'Crafting Table',
      zh: '工作台',
      tiles: [
        TILE.crafting_table_side,
        TILE.crafting_table_front,
        TILE.crafting_table_top,
        TILE.oak_planks,
        TILE.crafting_table_front,
        TILE.crafting_table_side,
      ],
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 2.5,
      tool: 'axe',
      sound: 'wood',
      flammable: true,
    },
  ],
  [
    28,
    {
      key: 'furnace',
      en: 'Furnace',
      zh: '熔炉',
      tiles: fronted('furnace_front', 'furnace_side', 'furnace_top'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 3.5,
      tool: 'pickaxe',
      tier: 1,
      sound: 'stone',
      facing: true,
    },
  ],
  [
    29,
    {
      key: 'torch',
      en: 'Torch',
      zh: '火把',
      tiles: all('torch'),
      render: 'torch',
      solid: false,
      opaque: false,
      light: 14,
      hardness: 0,
      instant: true,
      sound: 'wood',
      needsSupport: true,
      boxes: [[6, 0, 6, 10, 10, 10]],
    },
  ],
  [
    30,
    {
      key: 'snowy_grass',
      en: 'Grass Block',
      zh: '草方块',
      tiles: column('grass_block_snow', 'snow', 'dirt'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 0.6,
      tool: 'shovel',
      sound: 'grass',
      drop: 'dirt',
    },
  ],
  [
    31,
    {
      key: 'snow',
      en: 'Snow Block',
      zh: '雪块',
      tiles: all('snow'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 0.2,
      tool: 'shovel',
      sound: 'snow',
    },
  ],
  [
    32,
    {
      key: 'ice',
      en: 'Ice',
      zh: '冰',
      tiles: all('ice'),
      render: 'cube',
      solid: true,
      opaque: false,
      translucent: true,
      filter: 1,
      hardness: 0.5,
      tool: 'pickaxe',
      sound: 'glass',
      drop: '',
    },
  ],
  [
    33,
    {
      key: 'cactus',
      en: 'Cactus',
      zh: '仙人掌',
      tiles: column('cactus_side', 'cactus_top', 'cactus_bottom'),
      render: 'box',
      solid: true,
      opaque: false,
      hardness: 0.4,
      sound: 'cloth',
      needsSupport: true,
      boxes: [[1, 0, 1, 15, 16, 15]],
    },
  ],
  [
    34,
    {
      key: 'sandstone',
      en: 'Sandstone',
      zh: '砂岩',
      tiles: column('sandstone', 'sandstone_top', 'sandstone_bottom'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 0.8,
      tool: 'pickaxe',
      tier: 1,
      sound: 'stone',
    },
  ],
  [
    35,
    {
      key: 'bricks',
      en: 'Bricks',
      zh: '红砖块',
      tiles: all('bricks'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 2,
      tool: 'pickaxe',
      tier: 1,
      sound: 'stone',
    },
  ],
  [
    36,
    {
      key: 'tnt',
      en: 'TNT',
      zh: 'TNT',
      tiles: column('tnt_side', 'tnt_top', 'tnt_bottom'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 0,
      instant: true,
      sound: 'grass',
      flammable: true,
    },
  ],
  [
    37,
    {
      key: 'obsidian',
      en: 'Obsidian',
      zh: '黑曜石',
      tiles: all('obsidian'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 50,
      tool: 'pickaxe',
      tier: 4,
      sound: 'stone',
    },
  ],
  [
    38,
    {
      key: 'glowstone',
      en: 'Glowstone',
      zh: '荧石',
      tiles: all('glowstone'),
      render: 'cube',
      solid: true,
      opaque: true,
      light: 15,
      hardness: 0.3,
      sound: 'glass',
    },
  ],
  [
    39,
    {
      key: 'short_grass',
      en: 'Short Grass',
      zh: '矮草丛',
      tiles: all('short_grass'),
      render: 'cross',
      solid: false,
      opaque: false,
      hardness: 0,
      instant: true,
      sound: 'grass',
      replaceable: true,
      needsSupport: true,
      drop: '',
    },
  ],
  [
    40,
    {
      key: 'dandelion',
      en: 'Dandelion',
      zh: '蒲公英',
      tiles: all('dandelion'),
      render: 'cross',
      solid: false,
      opaque: false,
      hardness: 0,
      instant: true,
      sound: 'grass',
      needsSupport: true,
    },
  ],
  [
    41,
    {
      key: 'poppy',
      en: 'Poppy',
      zh: '虞美人',
      tiles: all('poppy'),
      render: 'cross',
      solid: false,
      opaque: false,
      hardness: 0,
      instant: true,
      sound: 'grass',
      needsSupport: true,
    },
  ],
  [
    42,
    {
      key: 'dead_bush',
      en: 'Dead Bush',
      zh: '枯萎的灌木',
      tiles: all('dead_bush'),
      render: 'cross',
      solid: false,
      opaque: false,
      hardness: 0,
      instant: true,
      sound: 'grass',
      replaceable: true,
      needsSupport: true,
      drop: 'stick',
    },
  ],
  [
    43,
    {
      key: 'sugar_cane',
      en: 'Sugar Cane',
      zh: '甘蔗',
      tiles: all('sugar_cane'),
      render: 'cross',
      solid: false,
      opaque: false,
      hardness: 0,
      instant: true,
      sound: 'grass',
      needsSupport: true,
    },
  ],
  [
    44,
    {
      key: 'white_wool',
      en: 'White Wool',
      zh: '白色羊毛',
      tiles: all('white_wool'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 0.8,
      tool: 'shears',
      sound: 'cloth',
      flammable: true,
    },
  ],
  [
    45,
    {
      key: 'iron_block',
      en: 'Block of Iron',
      zh: '铁块',
      tiles: all('iron_block'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 5,
      tool: 'pickaxe',
      tier: 2,
      sound: 'stone',
    },
  ],
  [
    46,
    {
      key: 'gold_block',
      en: 'Block of Gold',
      zh: '金块',
      tiles: all('gold_block'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 3,
      tool: 'pickaxe',
      tier: 3,
      sound: 'stone',
    },
  ],
  [
    47,
    {
      key: 'diamond_block',
      en: 'Block of Diamond',
      zh: '钻石块',
      tiles: all('diamond_block'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 5,
      tool: 'pickaxe',
      tier: 3,
      sound: 'stone',
    },
  ],
  [
    48,
    {
      key: 'stone_bricks',
      en: 'Stone Bricks',
      zh: '石砖',
      tiles: all('stone_bricks'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 1.5,
      tool: 'pickaxe',
      tier: 1,
      sound: 'stone',
    },
  ],
  [
    49,
    {
      key: 'bookshelf',
      en: 'Bookshelf',
      zh: '书架',
      tiles: column('bookshelf', 'oak_planks'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 1.5,
      tool: 'axe',
      sound: 'wood',
      drop: 'book',
      flammable: true,
    },
  ],
  [
    50,
    {
      key: 'clay',
      en: 'Clay',
      zh: '黏土块',
      tiles: all('clay'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 0.6,
      tool: 'shovel',
      sound: 'gravel',
      drop: 'clay_ball',
    },
  ],
  [
    51,
    {
      key: 'pumpkin',
      en: 'Pumpkin',
      zh: '南瓜',
      tiles: column('pumpkin_side', 'pumpkin_top'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 1,
      tool: 'axe',
      sound: 'wood',
    },
  ],
  [
    52,
    {
      key: 'oak_sapling',
      en: 'Oak Sapling',
      zh: '橡树树苗',
      tiles: all('oak_sapling'),
      render: 'cross',
      solid: false,
      opaque: false,
      hardness: 0,
      instant: true,
      sound: 'grass',
      needsSupport: true,
    },
  ],
  [
    53,
    {
      key: 'birch_sapling',
      en: 'Birch Sapling',
      zh: '白桦树苗',
      tiles: all('birch_sapling'),
      render: 'cross',
      solid: false,
      opaque: false,
      hardness: 0,
      instant: true,
      sound: 'grass',
      needsSupport: true,
    },
  ],
  [
    54,
    {
      key: 'spruce_sapling',
      en: 'Spruce Sapling',
      zh: '云杉树苗',
      tiles: all('spruce_sapling'),
      render: 'cross',
      solid: false,
      opaque: false,
      hardness: 0,
      instant: true,
      sound: 'grass',
      needsSupport: true,
    },
  ],
  [
    55,
    {
      key: 'wheat_crop',
      en: 'Wheat Crops',
      zh: '小麦',
      tiles: all('wheat_stage0'),
      render: 'crop',
      solid: false,
      opaque: false,
      hardness: 0,
      instant: true,
      sound: 'grass',
      needsSupport: true,
      icon: 'wheat_crop',
      drop: 'wheat_seeds',
    },
  ],
  [
    56,
    {
      key: 'farmland',
      en: 'Farmland',
      zh: '耕地',
      tiles: column('dirt', 'farmland', 'dirt'),
      render: 'box',
      solid: true,
      opaque: false,
      hardness: 0.6,
      tool: 'shovel',
      sound: 'gravel',
      drop: 'dirt',
      boxes: [[0, 0, 0, 16, 15, 16]],
    },
  ],
  [
    57,
    {
      key: 'mossy_cobblestone',
      en: 'Mossy Cobblestone',
      zh: '苔石',
      tiles: all('mossy_cobblestone'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 2,
      tool: 'pickaxe',
      tier: 1,
      sound: 'stone',
    },
  ],
  [
    58,
    {
      key: 'coal_block',
      en: 'Block of Coal',
      zh: '煤炭块',
      tiles: all('coal_block'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 5,
      tool: 'pickaxe',
      tier: 1,
      sound: 'stone',
    },
  ],
  [
    59,
    {
      key: 'redstone_block',
      en: 'Block of Redstone',
      zh: '红石块',
      tiles: all('redstone_block'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 5,
      tool: 'pickaxe',
      tier: 1,
      sound: 'stone',
    },
  ],
  [
    60,
    {
      key: 'lapis_block',
      en: 'Block of Lapis Lazuli',
      zh: '青金石块',
      tiles: all('lapis_block'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 3,
      tool: 'pickaxe',
      tier: 2,
      sound: 'stone',
    },
  ],
  [
    61,
    {
      key: 'emerald_block',
      en: 'Block of Emerald',
      zh: '绿宝石块',
      tiles: all('emerald_block'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 5,
      tool: 'pickaxe',
      tier: 3,
      sound: 'stone',
    },
  ],
  [
    62,
    {
      key: 'smooth_stone',
      en: 'Smooth Stone',
      zh: '平滑石头',
      tiles: all('smooth_stone'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 2,
      tool: 'pickaxe',
      tier: 1,
      sound: 'stone',
    },
  ],
  [
    63,
    {
      key: 'andesite',
      en: 'Andesite',
      zh: '安山岩',
      tiles: all('andesite'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 1.5,
      tool: 'pickaxe',
      tier: 1,
      sound: 'stone',
    },
  ],
  [
    64,
    {
      key: 'diorite',
      en: 'Diorite',
      zh: '闪长岩',
      tiles: all('diorite'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 1.5,
      tool: 'pickaxe',
      tier: 1,
      sound: 'stone',
    },
  ],
  [
    65,
    {
      key: 'granite',
      en: 'Granite',
      zh: '花岗岩',
      tiles: all('granite'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 1.5,
      tool: 'pickaxe',
      tier: 1,
      sound: 'stone',
    },
  ],
  [
    66,
    {
      key: 'deepslate',
      en: 'Deepslate',
      zh: '深板岩',
      tiles: column('deepslate', 'deepslate_top'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 3,
      tool: 'pickaxe',
      tier: 1,
      sound: 'stone',
      drop: 'cobbled_deepslate',
    },
  ],
  [
    67,
    {
      key: 'cobbled_deepslate',
      en: 'Cobbled Deepslate',
      zh: '深板岩圆石',
      tiles: all('cobbled_deepslate'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 3.5,
      tool: 'pickaxe',
      tier: 1,
      sound: 'stone',
    },
  ],
  [
    68,
    {
      key: 'deepslate_coal_ore',
      en: 'Deepslate Coal Ore',
      zh: '深层煤矿石',
      tiles: all('deepslate_coal_ore'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 4.5,
      tool: 'pickaxe',
      tier: 1,
      sound: 'stone',
      drop: 'coal',
    },
  ],
  [
    69,
    {
      key: 'deepslate_iron_ore',
      en: 'Deepslate Iron Ore',
      zh: '深层铁矿石',
      tiles: all('deepslate_iron_ore'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 4.5,
      tool: 'pickaxe',
      tier: 2,
      sound: 'stone',
      drop: 'raw_iron',
    },
  ],
  [
    70,
    {
      key: 'deepslate_gold_ore',
      en: 'Deepslate Gold Ore',
      zh: '深层金矿石',
      tiles: all('deepslate_gold_ore'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 4.5,
      tool: 'pickaxe',
      tier: 3,
      sound: 'stone',
      drop: 'raw_gold',
    },
  ],
  [
    71,
    {
      key: 'deepslate_diamond_ore',
      en: 'Deepslate Diamond Ore',
      zh: '深层钻石矿石',
      tiles: all('deepslate_diamond_ore'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 4.5,
      tool: 'pickaxe',
      tier: 3,
      sound: 'stone',
      drop: 'diamond',
    },
  ],
  [
    72,
    {
      key: 'deepslate_redstone_ore',
      en: 'Deepslate Redstone Ore',
      zh: '深层红石矿石',
      tiles: all('deepslate_redstone_ore'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 4.5,
      tool: 'pickaxe',
      tier: 3,
      sound: 'stone',
      drop: 'redstone',
    },
  ],
  [
    73,
    {
      key: 'deepslate_lapis_ore',
      en: 'Deepslate Lapis Lazuli Ore',
      zh: '深层青金石矿石',
      tiles: all('deepslate_lapis_ore'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 4.5,
      tool: 'pickaxe',
      tier: 2,
      sound: 'stone',
      drop: 'lapis_lazuli',
    },
  ],
  [
    74,
    {
      key: 'melon',
      en: 'Melon',
      zh: '西瓜',
      tiles: column('melon_side', 'melon_top'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 1,
      tool: 'axe',
      sound: 'wood',
      drop: 'melon_slice',
    },
  ],
  [
    75,
    {
      key: 'oak_door',
      en: 'Oak Door',
      zh: '橡木门',
      tiles: [
        TILE.oak_door_bottom,
        TILE.oak_door_bottom,
        TILE.oak_planks,
        TILE.oak_planks,
        TILE.oak_door_bottom,
        TILE.oak_door_bottom,
      ],
      render: 'door',
      solid: true,
      opaque: false,
      hardness: 3,
      tool: 'axe',
      sound: 'wood',
      facing: true,
      needsSupport: true,
    },
  ],
  [
    76,
    {
      key: 'ladder',
      en: 'Ladder',
      zh: '梯子',
      tiles: all('ladder'),
      render: 'ladder',
      solid: false,
      opaque: false,
      hardness: 0.4,
      tool: 'axe',
      sound: 'wood',
      facing: true,
      climbable: true,
    },
  ],
  [
    77,
    {
      key: 'red_wool',
      en: 'Red Wool',
      zh: '红色羊毛',
      tiles: all('red_wool'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 0.8,
      tool: 'shears',
      sound: 'cloth',
      flammable: true,
    },
  ],
  [
    78,
    {
      key: 'blue_wool',
      en: 'Blue Wool',
      zh: '蓝色羊毛',
      tiles: all('blue_wool'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 0.8,
      tool: 'shears',
      sound: 'cloth',
      flammable: true,
    },
  ],
  [
    79,
    {
      key: 'black_wool',
      en: 'Black Wool',
      zh: '黑色羊毛',
      tiles: all('black_wool'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 0.8,
      tool: 'shears',
      sound: 'cloth',
      flammable: true,
    },
  ],
  [
    80,
    {
      key: 'yellow_wool',
      en: 'Yellow Wool',
      zh: '黄色羊毛',
      tiles: all('yellow_wool'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 0.8,
      tool: 'shears',
      sound: 'cloth',
      flammable: true,
    },
  ],
  [
    81,
    {
      key: 'lime_wool',
      en: 'Lime Wool',
      zh: '黄绿色羊毛',
      tiles: all('lime_wool'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 0.8,
      tool: 'shears',
      sound: 'cloth',
      flammable: true,
    },
  ],
  [
    82,
    {
      key: 'terracotta',
      en: 'Terracotta',
      zh: '陶瓦',
      tiles: all('terracotta'),
      render: 'cube',
      solid: true,
      opaque: true,
      hardness: 1.25,
      tool: 'pickaxe',
      tier: 1,
      sound: 'stone',
    },
  ],
  [
    83,
    {
      key: 'chest',
      en: 'Chest',
      zh: '箱子',
      tiles: fronted('chest_front', 'chest_side', 'chest_top'),
      render: 'box',
      solid: true,
      opaque: false,
      hardness: 2.5,
      tool: 'axe',
      sound: 'wood',
      facing: true,
      boxes: [[1, 0, 1, 15, 14, 15]],
      flammable: true,
    },
  ],
  [
    84,
    {
      key: 'fern',
      en: 'Fern',
      zh: '蕨',
      tiles: all('fern'),
      render: 'cross',
      solid: false,
      opaque: false,
      hardness: 0,
      instant: true,
      sound: 'grass',
      replaceable: true,
      needsSupport: true,
      drop: '',
    },
  ],
];

export const BLOCKS: BlockDef[] = [];
export const BLOCK_BY_KEY: Record<string, BlockDef> = {};
for (const [id, def] of DEFS) {
  const block: BlockDef = { ...def, id, icon: (def.icon ?? def.key) as IconName };
  BLOCKS[id] = block;
  BLOCK_BY_KEY[block.key] = block;
}

/** Block id by key, throwing on typos so tests catch them. */
export function blockId(key: string): number {
  const b = BLOCK_BY_KEY[key];
  if (!b) throw new Error(`Unknown block ${key}`);
  return b.id;
}

export const B = {
  air: 0,
  grass: 1,
  dirt: 2,
  stone: 3,
  cobblestone: 4,
  bedrock: 5,
  sand: 6,
  gravel: 7,
  oakLog: 8,
  oakLeaves: 9,
  oakPlanks: 10,
  birchLog: 11,
  birchLeaves: 12,
  spruceLog: 14,
  spruceLeaves: 15,
  water: 17,
  lava: 18,
  coalOre: 19,
  ironOre: 20,
  goldOre: 21,
  diamondOre: 22,
  redstoneOre: 23,
  lapisOre: 24,
  emeraldOre: 25,
  glass: 26,
  craftingTable: 27,
  furnace: 28,
  torch: 29,
  snowyGrass: 30,
  snow: 31,
  ice: 32,
  cactus: 33,
  sandstone: 34,
  tnt: 36,
  obsidian: 37,
  shortGrass: 39,
  dandelion: 40,
  poppy: 41,
  deadBush: 42,
  sugarCane: 43,
  pumpkin: 51,
  oakSapling: 52,
  birchSapling: 53,
  spruceSapling: 54,
  wheat: 55,
  farmland: 56,
  mossyCobblestone: 57,
  andesite: 63,
  diorite: 64,
  granite: 65,
  deepslate: 66,
  deepslateCoal: 68,
  deepslateIron: 69,
  deepslateGold: 70,
  deepslateDiamond: 71,
  deepslateRedstone: 72,
  deepslateLapis: 73,
  melon: 74,
  door: 75,
  ladder: 76,
  clay: 50,
  chest: 83,
  fern: 84,
} as const;

export const isLiquid = (id: number) => id === B.water || id === B.lava;

/** Light emitted by a block, taking furnace lit state (meta bit 2) into account. */
export function emission(id: number, meta: number): number {
  if (id === B.furnace) return meta & 4 ? 13 : 0;
  return BLOCKS[id]?.light ?? 0;
}

/** Collision boxes in block-local 0..1 units, or null when the block has no collision. */
export function collisionBoxes(id: number, meta: number): readonly Box[] | null {
  const b = BLOCKS[id];
  if (!b || !b.solid) return null;
  if (b.render === 'door') return [doorBox(meta)];
  return b.boxes ?? FULL;
}
const FULL: readonly Box[] = [[0, 0, 0, 16, 16, 16]];

/**
 * Door meta: bits 0-1 facing (0 +Z, 1 -X, 2 -Z, 3 +X: the side the door is
 * hinged against when closed), bit 2 open, bit 3 upper half.
 */
export function doorBox(meta: number): Box {
  const facing = (meta & 3) as 0 | 1 | 2 | 3;
  const open = (meta & 4) !== 0;
  const side = open ? (facing + 1) % 4 : facing;
  switch (side) {
    case 0: {
      return [0, 0, 13, 16, 16, 16];
    }
    case 1: {
      return [0, 0, 0, 3, 16, 16];
    }
    case 2: {
      return [0, 0, 0, 16, 16, 3];
    }
    default: {
      return [13, 0, 0, 16, 16, 16];
    }
  }
}

/** Ladder meta 0-3 uses the same facing convention: the wall it is attached to. */
export function ladderBox(meta: number): Box {
  switch (meta & 3) {
    case 0: {
      return [0, 0, 15, 16, 16, 16];
    }
    case 1: {
      return [0, 0, 0, 1, 16, 16];
    }
    case 2: {
      return [0, 0, 0, 16, 16, 1];
    }
    default: {
      return [15, 0, 0, 16, 16, 16];
    }
  }
}
