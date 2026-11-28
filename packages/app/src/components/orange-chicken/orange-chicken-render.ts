/**
 * Canvas drawing for the Wok Kitchen: the kitchen floor, the actors, and the HUD panels
 * (route bar, ticket rail, Pareto plot, counter memory). Everything is drawn in code from the
 * same dish paths as the chart markers.
 */
import { FOODS, GOLD, INK, JADE, LACQUER, RICE, type Food } from './orange-chicken-art';
import {
  WORLD_H,
  WORLD_W,
  type Actor,
  type Game,
  type Order,
  type Wok,
} from './orange-chicken-engine';
import { BATCHES, PREC, ZONES, curve, type Precision } from './orange-chicken-model';

export interface Layout {
  w: number;
  h: number;
  wide: boolean;
  topH: number;
  world: { x: number; y: number; w: number; h: number; s: number };
  panel: { x: number; y: number; w: number; h: number };
}

export interface Labels {
  zones: string[];
  time: string;
  tips: string;
  reputation: string;
  combo: string;
  orders: string;
  counter: string;
  userAxis: string;
  thrAxis: string;
  target: string;
  audit: string;
  rush: string;
  rail: string;
  fire: string;
  pass: string;
  empty: string;
  hint: string;
  wok: string;
  sous: string;
  inspector: string;
  oil: string;
  full: string;
  /** Bowl, Plate, Bigger Plate: the size tag on each ticket. */
  sizes: [string, string, string];
  /** The red sign over the serving line. */
  line: string;
}

const PANEL_W = 252;

export function computeLayout(w: number, h: number): Layout {
  const wide = w >= 720;
  if (wide) {
    const topH = 46;
    const aw = w - PANEL_W;
    const ah = h - topH;
    const s = Math.min(aw / WORLD_W, ah / WORLD_H);
    return {
      w,
      h,
      wide,
      topH,
      world: {
        x: (aw - WORLD_W * s) / 2,
        y: topH + (ah - WORLD_H * s) / 2,
        w: WORLD_W * s,
        h: WORLD_H * s,
        s,
      },
      panel: { x: w - PANEL_W, y: topH, w: PANEL_W, h: ah },
    };
  }
  const topH = 40;
  const s = w / WORLD_W;
  const wh = WORLD_H * s;
  return {
    w,
    h,
    wide,
    topH,
    world: { x: 0, y: topH, w, h: wh, s },
    panel: { x: 0, y: topH + wh, w, h: Math.max(0, h - topH - wh) },
  };
}

export function toWorld(layout: Layout, px: number, py: number): { x: number; y: number } {
  const { world } = layout;
  return { x: (px - world.x) / world.s, y: (py - world.y) / world.s };
}

const pathCache = new Map<string, Path2D>();
function path(d: string): Path2D {
  let p = pathCache.get(d);
  if (!p) {
    p = new Path2D(d);
    pathCache.set(d, p);
  }
  return p;
}

export function drawFood(
  ctx: CanvasRenderingContext2D,
  food: Food,
  x: number,
  y: number,
  size: number,
) {
  ctx.save();
  ctx.translate(x, y);
  const k = size / 16;
  ctx.scale(k, k);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const part of FOODS[food]) {
    const p = path(part.d);
    if (part.fill) {
      ctx.fillStyle = part.fill;
      ctx.fill(p);
    }
    if (part.stroke) {
      ctx.lineWidth = part.width ?? 1;
      ctx.strokeStyle = part.stroke;
      ctx.stroke(p);
    }
  }
  ctx.restore();
}

const PREC_COLOR: Record<Precision, string> = { FP4: '#2f7d4f', FP8: '#e8731a', BF16: '#a82a14' };
const FONT = "'OrangeChickenBody', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif";
const DISPLAY = "'OrangeChickenDisplay', 'OrangeChickenBody', 'PingFang SC', system-ui, sans-serif";

function round(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size: number,
  color = INK,
  align: CanvasTextAlign = 'left',
  display = false,
) {
  ctx.font = `${display ? '' : '700 '}${size}px ${display ? DISPLAY : FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(value, x, y);
}

// --------------------------------------------------------------------- world
function drawFloor(ctx: CanvasRenderingContext2D, game: Game, labels: Labels) {
  const { palette } = game.zone;
  ctx.fillStyle = palette.floor;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  ctx.fillStyle = palette.floor2;
  const tile = 47;
  for (let y = 0; y < WORLD_H; y += tile) {
    for (let x = 0; x < WORLD_W; x += tile) {
      if (Math.trunc(x / tile) % 2 === Math.trunc(y / tile) % 2) ctx.fillRect(x, y, tile, tile);
    }
  }
  drawDressing(ctx, game, labels);
}

/** The glass-fronted serving line on the front counter: five steel pans heaped with the menu. */
function drawServingLine(ctx: CanvasRenderingContext2D, game: Game, cy: number) {
  const dishes = [
    { heap: '#e8731a', dots: '#f6b93b', card: '#e8731a' },
    { heap: '#7a2a14', dots: '#c8321c', card: '#7a2a14' },
    { heap: '#3f8a3a', dots: '#7fb85a', card: '#3f8a3a' },
    { heap: '#e7b565', dots: '#c8321c', card: '#c98a12' },
    { heap: '#fff4d6', dots: '#e7b92a', card: '#d9a653' },
  ];
  const steam = game.cfg.calm ? 0 : Math.sin(game.time * 2);
  ctx.save();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = INK;
  dishes.forEach((dish, index) => {
    const px = 424 + index * 46;
    const top = cy - 14;
    // Steel pan.
    ctx.fillStyle = '#c9cdd0';
    ctx.beginPath();
    ctx.moveTo(px, top);
    ctx.lineTo(px + 42, top);
    ctx.lineTo(px + 39, cy - 1);
    ctx.lineTo(px + 3, cy - 1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Heap of food.
    ctx.fillStyle = dish.heap;
    ctx.beginPath();
    ctx.moveTo(px + 3, top);
    ctx.quadraticCurveTo(px + 21, top - 24, px + 39, top);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = dish.dots;
    for (let bit = 0; bit < 6; bit += 1) {
      ctx.beginPath();
      ctx.arc(
        px + 9 + ((bit * 7 + index * 3) % 24),
        top - 3 - ((bit * 5 + index) % 9),
        2,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    // Name card.
    ctx.fillStyle = dish.card;
    ctx.fillRect(px + 12, cy - 9, 18, 5);
    // Steam.
    ctx.strokeStyle = 'rgb(255 255 255 / 0.7)';
    ctx.beginPath();
    ctx.moveTo(px + 21, top - 24);
    ctx.quadraticCurveTo(px + 21 + steam * 3, top - 30, px + 21, top - 36);
    ctx.stroke();
    ctx.strokeStyle = INK;
  });
  // Sneeze guard: a thin glass edge over the pans.
  ctx.strokeStyle = 'rgb(255 255 255 / 0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(420, cy - 44);
  ctx.lineTo(420 + 5 * 46, cy - 44);
  ctx.stroke();
  ctx.restore();
}

/** Set dressing: wall shelf, hanging menu, chilli rope, lucky cat, doormat and a prep counter. */
function drawDressing(ctx: CanvasRenderingContext2D, game: Game, labels: Labels) {
  const { palette } = game.zone;
  const sway = game.cfg.calm ? 0 : Math.sin(game.time * 1.6);
  // Back wall with a plaster band and a trim line.
  ctx.fillStyle = palette.wall;
  ctx.fillRect(0, 0, WORLD_W, 8);
  ctx.fillStyle = 'rgb(74 30 10 / 0.1)';
  ctx.fillRect(0, 8, WORLD_W, 14);
  ctx.fillStyle = 'rgb(74 30 10 / 0.18)';
  ctx.fillRect(0, 22, WORLD_W, 2);
  // Hanging menu board.
  ctx.save();
  ctx.translate(300, 0);
  ctx.rotate(sway * 0.02);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.lineTo(10, 6);
  ctx.moveTo(70, 0);
  ctx.lineTo(70, 6);
  ctx.stroke();
  ctx.fillStyle = '#fff4cf';
  round(ctx, 0, 6, 80, 26, 3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = LACQUER;
  ctx.fillRect(6, 12, 40, 3);
  ctx.fillStyle = palette.accent;
  ctx.fillRect(6, 19, 58, 2.5);
  ctx.fillRect(6, 25, 30, 2.5);
  ctx.restore();
  // Chilli rope.
  ctx.strokeStyle = '#7a4a2a';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(210, 0);
  ctx.quadraticCurveTo(232, 20, 254, 0);
  ctx.stroke();
  for (let index = 0; index < 5; index += 1) {
    const t = (index + 0.5) / 5;
    const cx = 210 + 44 * t;
    const cy = 2 * 20 * t * (1 - t) * 1 + 0;
    ctx.save();
    ctx.translate(cx, cy + 2);
    ctx.rotate(sway * 0.06);
    ctx.fillStyle = '#c8321c';
    ctx.beginPath();
    ctx.ellipse(0, 7, 3, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2f7d4f';
    ctx.fillRect(-1, 0, 2, 2);
    ctx.restore();
  }
  // Lucky cat by the pass.
  ctx.save();
  ctx.translate(648, 40);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.fillStyle = '#fff8ed';
  ctx.beginPath();
  ctx.ellipse(0, 6, 11, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -10, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-8, -16);
  ctx.lineTo(-6, -23);
  ctx.lineTo(-1, -18);
  ctx.moveTo(8, -16);
  ctx.lineTo(6, -23);
  ctx.lineTo(1, -18);
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.fillRect(-4, -11, 2, 2);
  ctx.fillRect(2, -11, 2, 2);
  ctx.fillStyle = LACQUER;
  ctx.fillRect(-7, -2, 14, 3);
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.arc(0, 3, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(9, -2);
  ctx.rotate(-0.5 + sway * 0.35);
  ctx.fillStyle = '#fff8ed';
  round(ctx, -2.5, -13, 6, 14, 3);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  ctx.restore();
  // Doormat under the pass, and a drain grate in the middle of the floor.
  ctx.fillStyle = 'rgb(168 42 20 / 0.28)';
  round(ctx, 612, 316, 78, 20, 4);
  ctx.fill();
  ctx.strokeStyle = 'rgb(74 30 10 / 0.35)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgb(74 30 10 / 0.16)';
  round(ctx, 330, 330, 40, 18, 3);
  ctx.fill();
  ctx.strokeStyle = 'rgb(74 30 10 / 0.3)';
  for (let gx = 336; gx < 368; gx += 6) {
    ctx.beginPath();
    ctx.moveTo(gx, 332);
    ctx.lineTo(gx, 346);
    ctx.stroke();
  }
  // Front prep counter: the chef cannot walk past it.
  const cy = WORLD_H - 26;
  ctx.fillStyle = '#b9400c';
  ctx.fillRect(0, cy, WORLD_W, 26);
  ctx.fillStyle = '#e2b365';
  ctx.fillRect(0, cy - 4, WORLD_W, 6);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, cy - 4);
  ctx.lineTo(WORLD_W, cy - 4);
  ctx.stroke();
  for (let px = 0; px < WORLD_W; px += 70) {
    ctx.fillStyle = 'rgb(74 30 10 / 0.25)';
    ctx.fillRect(px + 34, cy + 4, 2, 18);
  }
  // Steamer stack, cutting board with cleaver, bowls and a cabbage on the counter.
  for (let tier = 0; tier < 3; tier += 1) {
    ctx.fillStyle = tier % 2 === 0 ? '#e2b365' : '#d9a653';
    round(ctx, 40, cy - 18 - tier * 10, 40, 10, 3);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = '#c98a12';
  ctx.beginPath();
  ctx.moveTo(44, cy - 48);
  ctx.quadraticCurveTo(60, cy - 60, 76, cy - 48);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#e8c58a';
  round(ctx, 260, cy - 10, 70, 8, 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#d9d4cc';
  ctx.fillRect(276, cy - 16, 28, 6);
  ctx.strokeRect(276, cy - 16, 28, 6);
  ctx.fillStyle = '#7a4a2a';
  ctx.fillRect(304, cy - 15, 14, 4);
  drawServingLine(ctx, game, cy);
  if (game.zone.id !== 5) {
    // The red Panda Express sign on the back wall.
    ctx.save();
    ctx.fillStyle = '#c4161f';
    ctx.beginPath();
    ctx.roundRect(420, 3, 150, 26, 7);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '800 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(labels.line, 508, 17);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(437, 16, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(437, 16.5, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(433.5, 15, 2.6, 2.4);
    ctx.fillRect(438, 15, 2.6, 2.4);
    ctx.restore();
  }
  if (game.zone.id === 5) {
    // Glendale Galleria food court: the red sign over the counter.
    ctx.save();
    ctx.fillStyle = '#c4161f';
    ctx.beginPath();
    ctx.roundRect(WORLD_W / 2 - 120, 8, 240, 34, 8);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '800 17px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PANDA EXPRESS  1983', WORLD_W / 2, 26);
    ctx.restore();
  }
  if (game.zone.id === 3) {
    // Night market: strings of lanterns.
    for (let x = 30; x < WORLD_W; x += 90) {
      ctx.fillStyle = '#f6b93b';
      ctx.beginPath();
      ctx.arc(x, 14, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawWok(ctx: CanvasRenderingContext2D, game: Game, wok: Wok, labels: Labels) {
  const { x, y } = wok;
  const busy = wok.seqs.length > 0;
  // Burner and flame.
  ctx.fillStyle = '#3a2a22';
  ctx.beginPath();
  ctx.arc(x, y, 38, 0, Math.PI * 2);
  ctx.fill();
  if (busy || wok.fire > 0) {
    ctx.fillStyle = wok.fire > 0 ? '#ff5a1a' : '#f6803a';
    const flick = 4 * Math.sin(game.time * 14 + wok.id);
    for (let index = 0; index < 8; index++) {
      const a = (index / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * 36, y + Math.sin(a) * 36, 4 + flick * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Pan.
  const color = PREC_COLOR[wok.prec];
  ctx.fillStyle = '#4a4440';
  ctx.beginPath();
  ctx.arc(x, y, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#6b625c';
  ctx.beginPath();
  ctx.arc(x, y, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(x, y, 30, 0, Math.PI * 2);
  ctx.stroke();
  // Handle.
  ctx.strokeStyle = '#7a4a2a';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + 30, y);
  ctx.lineTo(x + 54, y - 6);
  ctx.stroke();
  // Orders in the pan, as little dishes arranged in a ring.
  wok.seqs.forEach((order, index) => {
    const a = (index / Math.max(1, Math.min(wok.seqs.length, 8))) * Math.PI * 2 + game.time * 0.8;
    const r = wok.seqs.length > 1 ? 12 : 0;
    drawFood(ctx, order.dish, x + Math.cos(a) * r, y + Math.sin(a) * r, 14);
  });
  // Progress ring: the mean progress of what is cooking.
  if (busy) {
    const mean = wok.seqs.reduce((s, o) => s + o.progress / o.tokens, 0) / wok.seqs.length;
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 34, -Math.PI / 2, -Math.PI / 2 + mean * Math.PI * 2);
    ctx.stroke();
  }
  if (wok.prefill > 0) text(ctx, '…', x, y - 2, 18, '#fff', 'center');
  if (wok.fire > 0) {
    ctx.fillStyle = 'rgb(255 90 20 / 0.55)';
    ctx.beginPath();
    ctx.arc(x, y - 6, 44 + 3 * Math.sin(game.time * 20), 0, Math.PI * 2);
    ctx.fill();
    text(ctx, labels.fire, x, y - 52, 12, '#a82a14', 'center');
    if (wok.extinguish > 0) {
      ctx.fillStyle = '#2f7d4f';
      ctx.fillRect(x - 24, y + 40, 48 * (wok.extinguish / 1.2), 5);
    }
  }
  // Label: precision and batch slots, and live occupancy.
  round(ctx, x - 40, y + 38, 80, 16, 8);
  ctx.fillStyle = color;
  ctx.fill();
  text(ctx, `${wok.prec} ×${wok.slots}`, x, y + 46.5, 11, '#fff', 'center');
  // Shelf with ready dishes.
  round(ctx, x - 36, y + 58, 72, 24, 6);
  ctx.fillStyle = 'rgb(255 248 237 / 0.85)';
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  wok.shelf.forEach((order, index) => {
    ctx.globalAlpha = order.quality < 0.7 ? 0.55 : 1;
    drawFood(ctx, order.dish, x - 28 + index * 12, y + 70, 12);
    ctx.globalAlpha = 1;
  });
  if (wok.reconf > 0) text(ctx, '⟳', x, y, 16, '#fff', 'center');
}

/**
 * A cook seen from above-front: clogs, a jacket with an apron, hands, a face that looks where the
 * cook walks, and a pleated toque. The chef wears a lacquer-red apron, the sous chef jade green.
 */
function drawCook(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  bob: number,
  face: number,
  chef: boolean,
  walking: boolean,
) {
  const step = walking ? Math.sin(bob * 9) * 3 : 0;
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  // Clogs.
  ctx.fillStyle = '#6b3a1c';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.roundRect(x + side * 6 - 4.5, y + 8 + side * step * 0.5, 9, 6, 3);
    ctx.fill();
    ctx.stroke();
  }
  // Jacket and apron.
  ctx.fillStyle = '#fffdf6';
  ctx.beginPath();
  ctx.roundRect(x - 12, y - 10 + bob, 24, 22, 7);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = chef ? LACQUER : JADE;
  ctx.beginPath();
  ctx.moveTo(x - 7, y - 2 + bob);
  ctx.lineTo(x + 7, y - 2 + bob);
  ctx.lineTo(x + 8.5, y + 11 + bob);
  ctx.lineTo(x - 8.5, y + 11 + bob);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.arc(x - 3, y - 6 + bob, 1.4, 0, Math.PI * 2);
  ctx.arc(x + 3, y - 6 + bob, 1.4, 0, Math.PI * 2);
  ctx.fill();
  // Hands, one holding a spatula.
  ctx.fillStyle = '#f2c79b';
  ctx.beginPath();
  ctx.arc(x - 14, y + 1 + bob - step * 0.4, 3.6, 0, Math.PI * 2);
  ctx.arc(x + 14, y + 1 + bob + step * 0.4, 3.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#8a5a2b';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(x + 14, y + 1 + bob);
  ctx.lineTo(x + 20, y - 9 + bob);
  ctx.stroke();
  ctx.fillStyle = '#d9d2c6';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.roundRect(x + 17, y - 16 + bob, 7, 8, 2);
  ctx.fill();
  ctx.stroke();
  // Head.
  ctx.lineWidth = 2;
  ctx.fillStyle = '#f2c79b';
  ctx.beginPath();
  ctx.arc(x, y - 16 + bob, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  const lx = Math.cos(face) * 3;
  const ly = Math.sin(face) * 2;
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(x - 3.2 + lx, y - 16 + ly + bob, 1.5, 0, Math.PI * 2);
  ctx.arc(x + 3.2 + lx, y - 16 + ly + bob, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgb(232 115 26 / 0.45)';
  ctx.beginPath();
  ctx.arc(x - 6 + lx, y - 12 + ly + bob, 1.8, 0, Math.PI * 2);
  ctx.arc(x + 6 + lx, y - 12 + ly + bob, 1.8, 0, Math.PI * 2);
  ctx.fill();
  // Toque: a band and three puffs.
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x - 6, y - 31 + bob, 5.5, 0, Math.PI * 2);
  ctx.arc(x + 6, y - 31 + bob, 5.5, 0, Math.PI * 2);
  ctx.arc(x, y - 35 + bob, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(x - 9, y - 30 + bob, 18, 7, 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#d9cfbf';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - 3, y - 29 + bob);
  ctx.lineTo(x - 3, y - 24 + bob);
  ctx.moveTo(x + 3, y - 29 + bob);
  ctx.lineTo(x + 3, y - 24 + bob);
  ctx.stroke();
}

/** The server who spills oil: a vest, a tray, an amber bottle that drips. */
function drawServer(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
  const sway = Math.sin(time * 5) * 1.5;
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  ctx.fillStyle = '#2d2a3a';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.roundRect(x + side * 5 - 4, y + 8, 8, 6, 3);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = '#fffdf6';
  ctx.beginPath();
  ctx.roundRect(x - 11, y - 10 + sway, 22, 21, 7);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#3f6e9c';
  ctx.beginPath();
  ctx.moveTo(x - 9, y - 9 + sway);
  ctx.lineTo(x - 2, y - 9 + sway);
  ctx.lineTo(x - 4, y + 10 + sway);
  ctx.lineTo(x - 9, y + 10 + sway);
  ctx.closePath();
  ctx.moveTo(x + 9, y - 9 + sway);
  ctx.lineTo(x + 2, y - 9 + sway);
  ctx.lineTo(x + 4, y + 10 + sway);
  ctx.lineTo(x + 9, y + 10 + sway);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Tray and bottle held out to the right.
  ctx.fillStyle = '#d9d2c6';
  ctx.beginPath();
  ctx.roundRect(x + 8, y - 6 + sway, 20, 4, 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#e0a21b';
  ctx.beginPath();
  ctx.roundRect(x + 14, y - 20 + sway, 8, 14, 3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = LACQUER;
  ctx.fillRect(x + 15.5, y - 24 + sway, 5, 4);
  ctx.strokeRect(x + 15.5, y - 24 + sway, 5, 4);
  const drip = (time * 1.6) % 1;
  ctx.fillStyle = '#e0a21b';
  ctx.beginPath();
  ctx.ellipse(x + 18, y + 2 + drip * 12 + sway, 2, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  // Head with a server's cap.
  ctx.fillStyle = '#f2c79b';
  ctx.beginPath();
  ctx.arc(x, y - 16 + sway, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(x - 3.2, y - 16 + sway, 1.5, 0, Math.PI * 2);
  ctx.arc(x + 3.2, y - 16 + sway, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3f6e9c';
  ctx.beginPath();
  ctx.arc(x, y - 20 + sway, 9.5, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillRect(x - 3, y - 29 + sway, 6, 3);
}

function drawActor(ctx: CanvasRenderingContext2D, actor: Actor, game: Game, labels: Labels) {
  const { x, y } = actor;
  const flicker = actor.hurt > 0 && Math.floor(game.time * 16) % 2 === 0;
  if (flicker) return;
  ctx.fillStyle = 'rgb(74 30 10 / 0.18)';
  ctx.beginPath();
  ctx.ellipse(x, y + 12, 14, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  const bob = Math.sin(actor.bob * 6) * 1.5;
  drawCook(ctx, x, y, bob, actor.face, actor.kind === 'chef', Math.hypot(actor.vx, actor.vy) > 8);
  if (actor.dash > 0) {
    ctx.strokeStyle = 'rgb(246 185 59 / 0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - actor.vx * 0.05, y - actor.vy * 0.05);
    ctx.lineTo(x - actor.vx * 0.14, y - actor.vy * 0.14);
    ctx.stroke();
  }
  // Carried items stack above the hat.
  actor.carry.forEach((order, index) => {
    const ox = x + (index - (actor.carry.length - 1) / 2) * 16;
    if (order.state === 'carried') {
      ctx.fillStyle = '#fff4cf';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5;
      round(ctx, ox - 7, y - 62, 14, 16, 3);
      ctx.fill();
      ctx.stroke();
      drawFood(ctx, order.dish, ox, y - 54, 10);
    } else drawFood(ctx, order.dish, ox, y - 54, 17);
  });
  if (actor.kind === 'sous') text(ctx, labels.sous, x, y + 24, 10, INK, 'center');
}

function drawInspector(ctx: CanvasRenderingContext2D, game: Game, labels: Labels) {
  const a = game.audit;
  if (a.index < 0) return;
  const x = WORLD_W / 2 + 6 * Math.sin(game.time * 2);
  const y = 392;
  ctx.fillStyle = 'rgb(74 30 10 / 0.2)';
  ctx.beginPath();
  ctx.ellipse(x, y + 30, 22, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2b2b3a';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  round(ctx, x - 20, y - 14, 40, 44, 12);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffd9b0';
  ctx.beginPath();
  ctx.arc(x, y - 24, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#2b2b3a';
  ctx.beginPath();
  ctx.arc(x, y - 30, 15, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.fillRect(x - 8, y - 26, 6, 2);
  ctx.fillRect(x + 2, y - 26, 6, 2);
  ctx.fillStyle = '#fff8ed';
  round(ctx, x + 14, y - 6, 22, 28, 3);
  ctx.fill();
  ctx.stroke();
  text(ctx, labels.inspector, x, y + 44, 12, LACQUER, 'center');
  // Audit progress.
  const w = 120;
  ctx.fillStyle = 'rgb(74 30 10 / 0.25)';
  ctx.fillRect(x - w / 2, y + 56, w, 6);
  ctx.fillStyle = a.progress >= 12 ? '#2f7d4f' : GOLD;
  ctx.fillRect(x - w / 2, y + 56, (w * Math.min(12, a.progress)) / 12, 6);
}

export function drawWorld(
  ctx: CanvasRenderingContext2D,
  game: Game,
  layout: Layout,
  labels: Labels,
) {
  const { world } = layout;
  ctx.save();
  ctx.beginPath();
  ctx.rect(world.x, world.y, world.w, world.h);
  ctx.clip();
  const shake = game.shake > 0 ? (Math.random() - 0.5) * 8 * game.shake : 0;
  ctx.translate(world.x + shake, world.y + shake);
  ctx.scale(world.s, world.s);
  drawFloor(ctx, game, labels);
  // Oil.
  for (const puddle of game.puddles) {
    ctx.fillStyle = `rgb(60 30 10 / ${Math.min(0.45, puddle.life / 8)})`;
    ctx.beginPath();
    ctx.ellipse(puddle.x, puddle.y, 28, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgb(255 214 120 / 0.35)';
    ctx.beginPath();
    ctx.ellipse(puddle.x - 8, puddle.y - 4, 8, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Order rail: the ticket window.
  const rb = game.railBox;
  round(ctx, rb.x, rb.y, rb.w, rb.h, 8);
  ctx.fillStyle = LACQUER;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.stroke();
  game.rail.slice(0, 7).forEach((order, index) => {
    const tx = rb.x + 10 + index * 21;
    ctx.fillStyle = '#fff4cf';
    round(ctx, tx, rb.y + 6, 18, 26, 3);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    drawFood(ctx, order.dish, tx + 9, rb.y + 16, 11);
    const left = 1 - (game.time - order.arrival) / order.patience;
    ctx.fillStyle = left < 0.3 ? '#c8321c' : '#2f7d4f';
    ctx.fillRect(tx + 2, rb.y + 27, 14 * Math.max(0, left), 3);
  });
  text(ctx, labels.rail, rb.x + rb.w / 2, rb.y + rb.h + 12, 11, INK, 'center');
  // Pass window.
  const ps = game.pass;
  round(ctx, ps.x, ps.y, ps.w, ps.h, 8);
  ctx.fillStyle = game.zone.id === 3 ? '#f6b93b' : '#2f7d4f';
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.save();
  ctx.translate(ps.x + ps.w / 2, ps.y + ps.h / 2);
  ctx.rotate(-Math.PI / 2);
  text(ctx, labels.pass, 0, 1, 12, '#fff', 'center');
  ctx.restore();
  for (const wok of game.woks) drawWok(ctx, game, wok, labels);
  drawInspector(ctx, game, labels);
  if (game.waiter) {
    const w = game.waiter;
    drawServer(ctx, w.x, w.y, game.time);
    text(ctx, labels.oil, w.x, w.y + 26, 10, INK, 'center');
  }
  for (const actor of [game.sous, game.chef]) if (actor) drawActor(ctx, actor, game, labels);
  for (const pigeon of game.pigeons) {
    ctx.fillStyle = '#9aa3ad';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(pigeon.x, pigeon.y, 10, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pigeon.x, pigeon.y);
    ctx.lineTo(pigeon.x - 9, pigeon.y - 12 * Math.abs(Math.sin(pigeon.wing)));
    ctx.lineTo(pigeon.x + 4, pigeon.y - 3);
    ctx.fill();
    ctx.fillStyle = '#f6b93b';
    ctx.fillRect(pigeon.x + (pigeon.vx >= 0 ? 8 : -12), pigeon.y - 2, 4, 3);
  }
  for (const p of game.particles) {
    const fade = Math.max(0, p.life / p.max);
    if (p.kind === 'steam') {
      ctx.fillStyle = `rgb(255 255 255 / ${0.5 * fade})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4 + (1 - fade) * 6, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'spark') {
      ctx.fillStyle = p.color ?? GOLD;
      ctx.globalAlpha = fade;
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
      ctx.globalAlpha = 1;
    } else if (p.kind === 'text' && p.text) {
      ctx.globalAlpha = fade;
      text(ctx, p.text, p.x, p.y, 16, p.color ?? GOLD, 'center', true);
      ctx.globalAlpha = 1;
    }
  }
  // A wind streak overlay on the street stall.
  if (game.wind !== 0 && !game.cfg.calm) {
    ctx.strokeStyle = 'rgb(255 255 255 / 0.25)';
    ctx.lineWidth = 2;
    for (let index = 0; index < 6; index++) {
      const y = Math.trunc((index * 83 + game.time * 40) % WORLD_H);
      const x = (((index * 131 + game.time * game.wind * 2) % WORLD_W) + WORLD_W) % WORLD_W;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.sign(game.wind) * 40, y);
      ctx.stroke();
    }
  }
  ctx.restore();
  if (game.audit.index >= 0) {
    text(
      ctx,
      `${labels.audit} ${game.audit.index + 1}/3 · ${Math.ceil(game.audit.left)}s`,
      world.x + world.w / 2,
      world.y + 16,
      14,
      LACQUER,
      'center',
      true,
    );
  }
  // World frame.
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.strokeRect(world.x, world.y, world.w, world.h);
}

// ----------------------------------------------------------------------- HUD
export function drawTop(
  ctx: CanvasRenderingContext2D,
  game: Game,
  layout: Layout,
  labels: Labels,
  zoneIndex: number,
  cleared: number,
) {
  const { w, topH } = layout;
  ctx.fillStyle = '#fff0d8';
  ctx.fillRect(0, 0, w, topH);
  ctx.fillStyle = INK;
  ctx.fillRect(0, topH - 3, w, 3);
  // Route bar: four stops joined by a dotted road.
  const campaign = game.cfg.mode === 'campaign';
  const stops = ZONES.length;
  const x0 = 18;
  const gap = layout.wide ? 54 : 40;
  ctx.setLineDash([3, 5]);
  ctx.strokeStyle = '#a58b6e';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x0, topH / 2 - 1);
  ctx.lineTo(x0 + gap * (stops - 1), topH / 2 - 1);
  ctx.stroke();
  ctx.setLineDash([]);
  for (let index = 0; index < stops; index++) {
    const cx = x0 + index * gap;
    const cy = topH / 2 - 1;
    const here = campaign ? index === zoneIndex : index === game.zone.id - 1;
    ctx.fillStyle = index < cleared ? '#2f7d4f' : here ? GOLD : RICE;
    ctx.strokeStyle = INK;
    ctx.lineWidth = here ? 3 : 2;
    ctx.beginPath();
    ctx.arc(cx, cy, here ? 11 : 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    text(
      ctx,
      index < cleared ? '✓' : String(index + 1),
      cx,
      cy + 0.5,
      11,
      index < cleared ? '#fff' : INK,
      'center',
    );
  }
  const zoneName = labels.zones[game.zone.id - 1] ?? '';
  const sx = x0 + gap * (stops - 1) + 22;
  if (layout.wide) text(ctx, zoneName, sx, topH / 2 - 1, 14, INK, 'left', true);
  // Right side: time, tips, reputation.
  const parts: string[] = [];
  if (Number.isFinite(game.timeLeft)) parts.push(`${labels.time} ${Math.ceil(game.timeLeft)}s`);
  parts.push(`${labels.tips} ${game.tips}`);
  if (game.combo > 1) parts.push(`×${game.combo.toFixed(1)}`);
  const quota =
    game.cfg.mode === 'campaign'
      ? `${game.served}/${game.quota} ${labels.orders}`
      : `${game.served} ${labels.orders}`;
  parts.push(quota);
  text(ctx, parts.join('  ·  '), w - 10, topH / 2 - 8, layout.wide ? 13 : 11, INK, 'right');
  if (game.cfg.mode !== 'sandbox' && game.cfg.mode !== 'challenge') {
    const bw = layout.wide ? 130 : 90;
    ctx.fillStyle = 'rgb(74 30 10 / 0.2)';
    round(ctx, w - 10 - bw, topH / 2 + 3, bw, 8, 4);
    ctx.fill();
    ctx.fillStyle = game.reputation < 30 ? '#c8321c' : '#2f7d4f';
    round(ctx, w - 10 - bw, topH / 2 + 3, (bw * game.reputation) / 100, 8, 4);
    ctx.fill();
    text(ctx, labels.reputation, w - 16 - bw, topH / 2 + 7, 10, INK, 'right');
  }
  if (game.rushActive) {
    text(
      ctx,
      labels.rush,
      layout.world.x + layout.world.w / 2,
      layout.world.y + 18,
      18,
      '#fff',
      'center',
      true,
    );
  }
}

function drawTickets(
  ctx: CanvasRenderingContext2D,
  game: Game,
  x: number,
  y: number,
  w: number,
  rows: number,
  labels: Labels,
) {
  const queue: Order[] = [...game.rail];
  for (const wok of game.woks) queue.push(...wok.seqs);
  for (let index = 0; index < rows; index++) {
    const order = queue[index];
    const ry = y + index * 22;
    ctx.fillStyle = order ? '#fff4cf' : 'rgb(255 248 237 / 0.6)';
    round(ctx, x, ry, w, 19, 5);
    ctx.fill();
    ctx.strokeStyle = order ? INK : '#d9c3a2';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (!order) continue;
    drawFood(ctx, order.dish, x + 12, ry + 9.5, 14);
    const size = labels.sizes[order.tokens <= 12 ? 0 : order.tokens <= 18 ? 1 : 2];
    text(ctx, size, x + 26, ry + 10, 10, INK);
    text(
      ctx,
      `${order.tokens}t`,
      x + 26 + Math.max(30, size.length * 6.2 + 4),
      ry + 10,
      10,
      '#7a4a2a',
    );
    const waited = order.state === 'cooking' ? 0 : (game.time - order.arrival) / order.patience;
    const bar = w - 118;
    ctx.fillStyle = 'rgb(74 30 10 / 0.18)';
    ctx.fillRect(x + w - bar - 6, ry + 7, bar, 5);
    ctx.fillStyle = order.state === 'cooking' ? '#2f7d4f' : waited > 0.7 ? '#c8321c' : GOLD;
    ctx.fillRect(
      x + w - bar - 6,
      ry + 7,
      order.state === 'cooking'
        ? (bar * order.progress) / order.tokens
        : bar * Math.max(0, 1 - waited),
      5,
    );
  }
}

function drawPareto(
  ctx: CanvasRenderingContext2D,
  game: Game,
  x: number,
  y: number,
  w: number,
  h: number,
  labels: Labels,
) {
  round(ctx, x, y, w, h, 8);
  ctx.fillStyle = '#fffcf6';
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.stroke();
  const pad = { l: 30, r: 8, t: 8, b: 20 };
  const px = x + pad.l;
  const py = y + pad.t;
  const pw = w - pad.l - pad.r;
  const ph = h - pad.t - pad.b;
  const frontier = game.zone.precisions.flatMap((p) =>
    curve(p, game.hw * (game.cfg.sandbox?.hw ?? 1)).filter((q) => q.batch <= game.zone.maxBatch),
  );
  const maxU = Math.max(40, game.target.user * 1.5, ...frontier.map((q) => q.user)) * 1.05;
  const maxT = Math.max(200, game.target.thr * 1.5, ...frontier.map((q) => q.thr)) * 1.05;
  const sx = (u: number) => px + (Math.min(u, maxU) / maxU) * pw;
  const sy = (t: number) => py + ph - (Math.min(t, maxT) / maxT) * ph;
  // Target box.
  const t = game.target;
  ctx.fillStyle = game.op.inBox ? 'rgb(47 125 79 / 0.3)' : 'rgb(246 185 59 / 0.3)';
  ctx.fillRect(sx(t.user), py, sx(maxU) - sx(t.user), sy(t.thr) - py);
  ctx.strokeStyle = game.op.inBox ? '#2f7d4f' : GOLD;
  ctx.setLineDash([4, 3]);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(sx(t.user), py, sx(maxU) - sx(t.user), sy(t.thr) - py);
  ctx.setLineDash([]);
  text(ctx, `${labels.target} ≥${t.user} · ≥${t.thr}`, px + 4, py + 7, 9, '#2f5d3f', 'left');
  // Axes.
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(px, py + ph);
  ctx.lineTo(px + pw, py + ph);
  ctx.stroke();
  text(ctx, labels.userAxis, px + pw / 2, y + h - 8, 9, INK, 'center');
  ctx.save();
  ctx.translate(x + 9, py + ph / 2);
  ctx.rotate(-Math.PI / 2);
  text(ctx, labels.thrAxis, 0, 0, 9, INK, 'center');
  ctx.restore();
  // Frontier curves, one per precision the zone allows.
  const hw = game.hw * (game.cfg.sandbox?.hw ?? 1);
  for (const prec of game.zone.precisions) {
    const points = curve(prec, hw).filter((p) => p.batch <= game.zone.maxBatch);
    ctx.strokeStyle = PREC_COLOR[prec];
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((p, index) => {
      if (index === 0) ctx.moveTo(sx(p.user), sy(p.thr));
      else ctx.lineTo(sx(p.user), sy(p.thr));
    });
    ctx.stroke();
    for (const p of points) {
      ctx.fillStyle = PREC_COLOR[prec];
      ctx.beginPath();
      ctx.arc(sx(p.user), sy(p.thr), 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Each wok's own operating point.
  for (const wok of game.woks) {
    const n = wok.seqs.length;
    if (n === 0) continue;
    const u = 50 / ((PREC[wok.prec].a + PREC[wok.prec].b * n) * hw);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(sx(u), sy(n * u), 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  // The kitchen as a whole.
  if (game.op.active > 0) {
    drawFood(ctx, 'chicken', sx(game.op.user), sy(game.op.thr), 18);
  }
  text(
    ctx,
    BATCHES.filter((b) => b <= game.zone.maxBatch).join('·'),
    px + pw,
    py + ph - 6,
    8,
    '#7a4a2a',
    'right',
  );
}

function drawMemory(
  ctx: CanvasRenderingContext2D,
  game: Game,
  x: number,
  y: number,
  w: number,
  labels: Labels,
) {
  const used = game.memoryUsed();
  const share = Math.min(1, used / game.memory);
  ctx.fillStyle = 'rgb(74 30 10 / 0.18)';
  round(ctx, x, y, w, 12, 6);
  ctx.fill();
  ctx.fillStyle = share > 0.9 ? '#c8321c' : share > 0.7 ? GOLD : '#2f7d4f';
  round(ctx, x, y, Math.max(8, w * share), 12, 6);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  round(ctx, x, y, w, 12, 6);
  ctx.stroke();
  text(
    ctx,
    `${labels.counter} ${Math.round(used)}/${game.memory}${share > 0.9 ? ` · ${labels.full}` : ''}`,
    x + w / 2,
    y + 6.5,
    9.5,
    share > 0.55 ? '#fff' : INK,
    'center',
  );
}

export function drawPanel(
  ctx: CanvasRenderingContext2D,
  game: Game,
  layout: Layout,
  labels: Labels,
) {
  const { panel, wide } = layout;
  ctx.fillStyle = '#fff0d8';
  ctx.fillRect(panel.x, panel.y, panel.w, panel.h);
  if (wide) {
    ctx.fillStyle = INK;
    ctx.fillRect(panel.x, panel.y, 3, panel.h);
    const x = panel.x + 10;
    const w = panel.w - 20;
    text(ctx, labels.rail, x, panel.y + 14, 13, LACQUER, 'left', true);
    drawTickets(ctx, game, x, panel.y + 26, w, 5, labels);
    const py = panel.y + 26 + 5 * 22 + 8;
    drawMemory(ctx, game, x, py, w, labels);
    drawPareto(ctx, game, x, py + 20, w, panel.h - (py - panel.y) - 28, labels);
    return;
  }
  const x = 8;
  const w = panel.w - 16;
  drawTickets(ctx, game, x, panel.y + 6, w / 2 - 4, 4, labels);
  drawMemory(ctx, game, x, panel.y + 98, w / 2 - 4, labels);
  drawPareto(ctx, game, x + w / 2 + 4, panel.y + 6, w / 2 - 4, Math.min(panel.h - 12, 170), labels);
}

export function drawHint(
  ctx: CanvasRenderingContext2D,
  game: Game,
  layout: Layout,
  labels: Labels,
) {
  if (game.time > 12) return;
  const { world } = layout;
  round(ctx, world.x + 12, world.y + world.h - 30, world.w - 24, 22, 11);
  ctx.fillStyle = 'rgb(74 30 10 / 0.78)';
  ctx.fill();
  text(
    ctx,
    labels.hint,
    world.x + world.w / 2,
    world.y + world.h - 19,
    layout.wide ? 12 : 10,
    '#fff8ed',
    'center',
  );
}
