/**
 * Takeout-counter artwork shared by the chart markers, the banner and the game. Every piece is
 * drawn on a 16 x 16 grid centred on the origin so the same path strings paint a canvas
 * (Path2D) and an SVG (PNG export) identically.
 */
import type { PointShape } from '@/components/effects/canvas-point-paint';

export type Food = 'chicken' | 'box' | 'dumpling' | 'cookie';

export interface ArtStroke {
  d: string;
  fill?: string;
  stroke?: string;
  width?: number;
}

export const INK = '#4a1e0a';
export const GLAZE = '#e8731a';
export const GLAZE_DEEP = '#b9400c';
export const SESAME = '#fff1c4';
export const LACQUER = '#a82a14';
export const JADE = '#2f7d4f';
export const GOLD = '#f6b93b';
export const RICE = '#fff8ed';

/** What each chart point shape becomes, so the shape encoding survives. */
export const FOOD_OF_SHAPE: Record<PointShape, Food> = {
  circle: 'chicken',
  square: 'box',
  triangle: 'dumpling',
  diamond: 'cookie',
};

/** The saucer under each item. It takes the series colour, so colour and shape stay readable. */
export const SAUCER: Record<PointShape, string> = {
  circle: 'M0 -8.8A8.8 8.8 0 1 1 0 8.8A8.8 8.8 0 1 1 0 -8.8Z',
  square:
    'M-5.6 -7.6H5.6Q7.6 -7.6 7.6 -5.6V5.6Q7.6 7.6 5.6 7.6H-5.6Q-7.6 7.6 -7.6 5.6V-5.6Q-7.6 -7.6 -5.6 -7.6Z',
  triangle: 'M0 -9.6L9.4 6.6Q9.9 8 8.4 8H-8.4Q-9.9 8 -9.4 6.6Z',
  diamond: 'M0 -10L10 0L0 10L-10 0Z',
};

/** Where the item sits on its saucer (the triangle's centre of mass is low). */
export const FOOD_OFFSET: Record<PointShape, number> = {
  circle: 0,
  square: 0,
  triangle: 1.6,
  diamond: 0,
};

export const FOOD_SCALE: Record<PointShape, number> = {
  circle: 0.7,
  square: 0.66,
  triangle: 0.58,
  diamond: 0.6,
};

const SESAME_DOTS = (cx: number, cy: number, r = 0.7): string =>
  `M${cx - r} ${cy}a${r} ${r * 1.6} 0 1 0 ${r * 2} 0a${r} ${r * 1.6} 0 1 0 ${-r * 2} 0Z`;

export const FOODS: Record<Food, ArtStroke[]> = {
  chicken: [
    {
      d: 'M-6.4 -1.2C-7.4 -5 -3.4 -7.2 0 -6.3C3.2 -8 7 -5.2 6.6 -1.2C8.2 2 5.2 6.6 1 6.1C-2.2 8 -7.2 5.2 -6.4 -1.2Z',
      fill: GLAZE,
      stroke: INK,
      width: 1,
    },
    { d: 'M-4.6 -3C-3.4 -5 -1 -5.2 0.6 -4.6', stroke: '#ffd27a', width: 1.2 },
    { d: 'M2 4.2C4 4.4 5.2 3 5.6 1.2', stroke: GLAZE_DEEP, width: 1.1 },
    { d: SESAME_DOTS(-1.6, -1.6), fill: SESAME },
    { d: SESAME_DOTS(2.6, -2.2), fill: SESAME },
    { d: SESAME_DOTS(0.4, 2.2), fill: SESAME },
    { d: SESAME_DOTS(-3.6, 2.2, 0.55), fill: SESAME },
  ],
  box: [
    { d: 'M-6 -2.6H6L4.6 6.6H-4.6Z', fill: LACQUER, stroke: INK, width: 1 },
    { d: 'M-6 -2.6L-4.2 -6H4.2L6 -2.6Z', fill: '#d9442a', stroke: INK, width: 1 },
    { d: 'M-3.6 -6Q0 -10.2 3.6 -6', stroke: INK, width: 0.9 },
    { d: 'M-4.4 1.6H4.4', stroke: RICE, width: 1.2 },
    { d: 'M-0.6 -1.6L0.6 -1.6L0.4 5.4L-0.4 5.4Z', fill: GOLD },
  ],
  dumpling: [
    {
      d: 'M-7 3.6Q-7.6 -3.6 0 -4.8Q7.6 -3.6 7 3.6Q0 6.8 -7 3.6Z',
      fill: '#fff6e2',
      stroke: INK,
      width: 1,
    },
    {
      d: 'M-4.6 -3.4L-3.8 3.8M-1.6 -4.4L-1.2 4.8M1.4 -4.4L1.4 4.8M4.4 -3.4L3.8 3.8',
      stroke: '#c9a77a',
      width: 0.8,
    },
    { d: 'M-6 2.4Q0 5 6 2.4', stroke: '#e1c493', width: 0.9 },
  ],
  cookie: [
    {
      d: 'M-7.4 0.8Q-5.2 -6 2.4 -5Q8 -3.6 6.4 2.6Q3.4 5 0.4 1.8Q-3.6 5.6 -7.4 0.8Z',
      fill: '#f0b24a',
      stroke: INK,
      width: 1,
    },
    { d: 'M-5.6 0Q-3.6 -4 1.6 -3.4', stroke: '#ffe0a0', width: 1 },
    { d: 'M5.4 3.2L8.4 6.4', stroke: RICE, width: 1.6 },
    { d: 'M5.4 3.2L8.4 6.4', stroke: INK, width: 0.5 },
  ],
};

/** Fill value meaning "the series colour": the container of each chart mark takes it. */
export const SERIES = 'series';

const NUGGET_A =
  'M-6 -1.4C-6.4 -4.4 -3.4 -5.6 -1 -4.8C1 -5.4 2.4 -3.4 2 -1C2.8 1.2 0.8 3 -1.4 2.6C-3.8 3.4 -6.4 1.6 -6 -1.4Z';
const NUGGET_B =
  'M0.4 1.6C-0.2 -0.6 2.2 -1.8 4 -1.2C6.2 -1.4 7.2 0.8 6.4 2.6C6.8 4.6 4.8 6 3 5.4C1 6.2 -0.4 4 0.4 1.6Z';

/**
 * Chart marks, one dish per point shape, so the precision encoding survives and the four shapes
 * read as four different things on the menu at 1x: circle = a plate of orange chicken, square =
 * a takeout pail, triangle = a fortune cookie on a folded napkin, diamond = a bowl of chow mein
 * with chopsticks. The container of each takes the series colour (fill: SERIES); everything
 * else keeps the dish's own colours. Parts are listed back to front.
 */
export const MARKS: Record<PointShape, ArtStroke[]> = {
  circle: [
    {
      d: 'M0 -8.2A8.2 8.2 0 1 1 0 8.2A8.2 8.2 0 1 1 0 -8.2Z',
      fill: SERIES,
      stroke: INK,
      width: 1,
    },
    {
      d: 'M0 -5A5 5 0 1 1 0 5A5 5 0 1 1 0 -5Z',
      fill: RICE,
      stroke: 'rgba(74,30,10,0.55)',
      width: 0.5,
    },
    { d: NUGGET_A, fill: GLAZE, stroke: INK, width: 0.7 },
    { d: NUGGET_B, fill: GLAZE, stroke: INK, width: 0.7 },
    { d: 'M-4.6 -2.8C-3.6 -3.8 -2.2 -3.8 -1.4 -3.4', stroke: '#ffd27a', width: 0.9 },
    { d: 'M2.4 0.6C3.4 -0.2 4.8 0 5.4 0.8', stroke: '#ffd27a', width: 0.9 },
    { d: SESAME_DOTS(-2.6, -0.8, 0.5), fill: SESAME },
    { d: SESAME_DOTS(3.8, 3.2, 0.5), fill: SESAME },
    { d: SESAME_DOTS(-1, 3.4, 0.5), fill: SESAME },
  ],
  square: [
    { d: 'M-3.4 -3.6Q0 -10.2 3.4 -3.6', stroke: INK, width: 0.9 },
    { d: 'M-7.4 -3.4H7.4L5.2 7.8H-5.2Z', fill: SERIES, stroke: INK, width: 1 },
    { d: 'M-7.4 -3.4L-5.4 -6.2H5.4L7.4 -3.4Z', fill: RICE, stroke: INK, width: 0.9 },
    { d: 'M-4.4 -0.4H4.4V4H-4.4Z', fill: RICE, stroke: INK, width: 0.5 },
    { d: 'M0 0.6A1.4 1.4 0 1 1 0 3.4A1.4 1.4 0 1 1 0 0.6Z', fill: LACQUER },
    { d: 'M-5.4 -3.4V7.2M5.4 -3.4V7.2', stroke: 'rgba(74,30,10,0.35)', width: 0.5 },
  ],
  triangle: [
    {
      d: 'M0 -8.4L8.2 6.6Q8.7 7.9 7.3 7.9H-7.3Q-8.7 7.9 -8.2 6.6Z',
      fill: SERIES,
      stroke: INK,
      width: 1,
    },
    {
      d: 'M-5.2 4.8Q-4.8 -0.4 0.2 -0.6Q5.2 -0.4 5.2 4.6Q2.4 6.6 0.2 4.2Q-2.6 6.8 -5.2 4.8Z',
      fill: '#f0b24a',
      stroke: INK,
      width: 0.8,
    },
    { d: 'M-3.6 3.4Q-2.8 0.8 0 0.8', stroke: '#ffe0a0', width: 0.8 },
    { d: 'M3.6 3.6L7 1.8L7.6 3.2L4.2 5Z', fill: RICE, stroke: INK, width: 0.5 },
  ],
  diamond: [
    {
      d: 'M-6.2 1.6Q-6.6 -3.4 0 -4.4Q6.6 -3.4 6.2 1.6Z',
      fill: '#f1cf7c',
      stroke: INK,
      width: 0.7,
    },
    { d: 'M-4 -1Q-2 -3 0 -1T4 -1M-4.4 1Q-2 -1 0.4 1T4.6 1', stroke: '#c8943a', width: 0.7 },
    { d: 'M-1.4 -1.2L-5.6 -7.6', stroke: '#7a3a14', width: 1.1 },
    { d: 'M1.2 -1.4L4.8 -7.8', stroke: '#7a3a14', width: 1.1 },
    {
      d: 'M-8 1H8Q7.8 8.4 0 8.8Q-7.8 8.4 -8 1Z',
      fill: SERIES,
      stroke: INK,
      width: 1,
    },
    { d: 'M-8 1H8', stroke: INK, width: 1.2 },
    { d: 'M-5 4.4Q0 6 5 4.4', stroke: 'rgba(255,248,237,0.8)', width: 0.7 },
  ],
};

/** Steam curls drawn above a lifted (hovered or pinned) mark. */
export const STEAM: string[] = [
  'M-2.8 -5.4Q-4 -6.6 -2.8 -7.8',
  'M0.2 -5.8Q-1 -7 0.2 -8.2',
  'M3 -5.4Q1.8 -6.6 3 -7.8',
];

/** Standalone SVG of one item, for the banner, the game and the journal. */
export function foodSvg(food: Food, size = 32): string {
  const parts = FOODS[food]
    .map((s) => {
      const fill = s.fill ?? 'none';
      const stroke = s.stroke ?? 'none';
      return `<path d="${s.d}" fill="${fill}" stroke="${stroke}" stroke-width="${s.width ?? 0}" stroke-linecap="round" stroke-linejoin="round"/>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 20 20" width="${size}" height="${size}">${parts}</svg>`;
}

export function foodDataUri(food: Food): string {
  return `data:image/svg+xml,${encodeURIComponent(foodSvg(food, 64))}`;
}

/** Bamboo-steamer weave laid over the bars: a diagonal lattice of slats. */
export const STEAMER_PATTERN = {
  size: 14,
  paths: [
    { d: 'M0 7H14M7 0V14', stroke: 'rgba(92, 52, 16, 0.26)', width: 1.4 },
    { d: 'M0 3.5H14M0 10.5H14', stroke: 'rgba(255, 244, 214, 0.2)', width: 0.8 },
  ],
};

/** Pei Pei the panda as a standalone drawing (original art), for the blind-box shelf. */
export const PEI_PEI_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 124" width="64" height="80">' +
  '<g stroke="#4a1e0a" stroke-width="2.6" stroke-linejoin="round">' +
  '<ellipse cx="34" cy="108" rx="12" ry="9" fill="#2b1f1a"/><ellipse cx="66" cy="108" rx="12" ry="9" fill="#2b1f1a"/>' +
  '<ellipse cx="50" cy="82" rx="28" ry="28" fill="#fffdf6"/>' +
  '<path d="M29 70Q17 84 23 98" fill="none" stroke="#2b1f1a" stroke-width="11" stroke-linecap="round"/>' +
  '<path d="M31 62Q50 70 69 62L72 70Q50 80 28 70Z" fill="#c8321c"/>' +
  '<path d="M71 70Q86 76 84 94" fill="none" stroke="#2b1f1a" stroke-width="11" stroke-linecap="round"/>' +
  '<circle cx="27" cy="19" r="10" fill="#2b1f1a"/><circle cx="73" cy="19" r="10" fill="#2b1f1a"/>' +
  '<ellipse cx="50" cy="40" rx="28" ry="25" fill="#fffdf6"/>' +
  '<ellipse cx="37" cy="38" rx="7.5" ry="10" fill="#2b1f1a" stroke="none" transform="rotate(18 37 38)"/>' +
  '<ellipse cx="63" cy="38" rx="7.5" ry="10" fill="#2b1f1a" stroke="none" transform="rotate(-18 63 38)"/>' +
  '<circle cx="37" cy="37" r="3" fill="#fff" stroke="none"/><circle cx="63" cy="37" r="3" fill="#fff" stroke="none"/>' +
  '<circle cx="37.6" cy="37.4" r="1.5" fill="#4a1e0a" stroke="none"/><circle cx="62.4" cy="37.4" r="1.5" fill="#4a1e0a" stroke="none"/>' +
  '<ellipse cx="50" cy="47" rx="4.5" ry="3.2" fill="#2b1f1a" stroke="none"/>' +
  '<path d="M44 52Q50 58 56 52" fill="none" stroke-linecap="round"/>' +
  '</g></svg>';

export const PEI_PEI_URI = `data:image/svg+xml,${encodeURIComponent(PEI_PEI_SVG)}`;
