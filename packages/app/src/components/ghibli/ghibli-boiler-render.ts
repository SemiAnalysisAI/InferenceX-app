/**
 * Painting for Kamaji's Boiler. A watercolour backdrop for each station is painted once into
 * an offscreen canvas (washes, the film still, wooden chutes, the brick hearth, paper grain);
 * each frame then only draws moving pieces over it. Characters are the theme's existing
 * cutouts from official stills; nothing here draws a character.
 */
import {
  BATCH_STEPS,
  CHUTE_TOP,
  DOOR_Y,
  FIELD_H,
  FIELD_W,
  HEARTH,
  type BoilerEngine,
  type Lump,
} from './ghibli-boiler-engine';
import { KINDS, type Chapter } from './ghibli-boiler-levels';
import { asset } from './ghibli-prefs';

export const SPRITES = {
  calcifer: 'sprites/calcifer.webp',
  flame: 'sprites/calcifer-flame.webp',
  soot: 'sprites/soot-3.webp',
  sootCarry: 'sprites/soot-2.webp',
  sootStar: 'sprites/soot-konpeito.webp',
  noface: 'sprites/noface-offer.webp',
  nofacePeek: 'sprites/noface-peek.webp',
  parakeets: 'sprites/parakeets.webp',
  warawara1: 'sprites/warawara-1.webp',
  warawara2: 'sprites/warawara-2.webp',
  wave: 'sprites/ponyo-wave.webp',
  jelly: 'sprites/ponyo-jelly.webp',
  haku: 'sprites/haku.webp',
  castle: 'sprites/castle-walk.webp',
  kodama: 'sprites/kodama-1.webp',
  kodama2: 'sprites/kodama-2.webp',
  heron: 'sprites/heron-head.webp',
  turnip: 'sprites/turnip.webp',
} as const;
export type SpriteName = keyof typeof SPRITES;

export const STILLS: Record<Chapter['film'], string> = {
  spirited: 'stills/still-chihiro043.webp',
  howl: 'stills/still-howl048.webp',
  mononoke: 'stills/still-mononoke010.webp',
  ponyo: 'stills/still-ponyo005.webp',
  heron: 'stills/still-kimitachi044.webp',
  totoro: 'stills/still-chihiro043.webp',
};

export const DOOR_COLOURS = ['#b8402f', '#2f6f9a', '#3f7a4c', '#2b2a33'] as const;
const DOOR_LIGHT = ['#e7a08e', '#9cc6e0', '#a8d2a2', '#8d8a99'] as const;

export type Images = Partial<Record<SpriteName | string, HTMLImageElement>>;

export function loadImage(path: string, onLoad: () => void): HTMLImageElement {
  const image = new Image();
  image.decoding = 'async';
  image.addEventListener('load', onLoad, { once: true });
  image.src = asset(path);
  return image;
}

export function ready(image: HTMLImageElement | undefined): image is HTMLImageElement {
  return Boolean(image && image.complete && image.naturalWidth > 0);
}

/** Small seeded random so a station's backdrop is painted the same every time. */
export function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function drawSprite(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | undefined,
  x: number,
  y: number,
  width: number,
  flip = false,
  alpha = 1,
) {
  if (!ready(image)) return;
  const height = (width * image.naturalHeight) / image.naturalWidth;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(image, -width / 2, -height / 2, width, height);
  ctx.restore();
}

export function wash(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  colour: string,
  alpha: number,
) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
  gradient.addColorStop(0, colour);
  gradient.addColorStop(1, 'transparent');
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = gradient;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

/** A wobbly hand-drawn blob path. */
function blob(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, seed: number) {
  ctx.beginPath();
  for (let index = 0; index <= 10; index++) {
    const angle = (index / 10) * Math.PI * 2;
    const wobble =
      1 + 0.13 * Math.sin(seed * 1.7 + index * 2.3) + 0.06 * Math.cos(seed + index * 5.1);
    const px = x + Math.cos(angle) * r * wobble;
    const py = y + Math.sin(angle) * r * wobble * 0.86;
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string) {
  ctx.beginPath();
  for (let index = 0; index < 10; index++) {
    const radius = index % 2 ? r * 0.5 : r;
    const angle = (index / 10) * Math.PI * 2 - Math.PI / 2;
    ctx.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = 'rgba(80, 40, 30, 0.5)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
}

export interface PaintOptions {
  reduced: boolean;
  assist: boolean;
  labels: { kinds: Record<string, string>; doors: readonly string[] };
}

export class BoilerPainter {
  private readonly canvas: HTMLCanvasElement;
  private options: PaintOptions;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly images: Images = {};
  private backdrop: HTMLCanvasElement | null = null;
  private backdropKey = '';
  private scale = 1;

  constructor(canvas: HTMLCanvasElement, options: PaintOptions) {
    this.canvas = canvas;
    this.options = options;
    this.ctx = canvas.getContext('2d');
    const invalidate = () => {
      this.backdropKey = '';
    };
    for (const [name, path] of Object.entries(SPRITES))
      this.images[name] = loadImage(path, () => {});
    for (const film of Object.keys(STILLS) as Chapter['film'][])
      this.images[`still-${film}`] = loadImage(STILLS[film], invalidate);
  }

  setOptions(options: PaintOptions) {
    this.options = options;
  }

  /** Match the canvas backing store to its CSS size. Returns field units per CSS pixel. */
  resize(): number {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round((rect.width * FIELD_H) / FIELD_W) * dpr);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.backdropKey = '';
    }
    this.scale = width / FIELD_W;
    return FIELD_W / Math.max(1, rect.width);
  }

  private ensureBackdrop(engine: BoilerEngine) {
    const key = `${engine.chapter.id}-${engine.mode}-${engine.lanes}-${this.canvas.width}`;
    if (key === this.backdropKey && this.backdrop) return;
    this.backdropKey = key;
    const canvas = this.backdrop ?? document.createElement('canvas');
    canvas.width = this.canvas.width;
    canvas.height = this.canvas.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    const tint =
      engine.mode === 'campaign'
        ? engine.chapter.tint
        : (['#33261f', '#6b4a2e', '#e6b46c'] as const);
    const random = seeded(engine.chapterIndex * 97 + 13);

    const ground = ctx.createLinearGradient(0, 0, 0, FIELD_H);
    ground.addColorStop(0, tint[0]);
    ground.addColorStop(1, tint[1]);
    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, FIELD_W, FIELD_H);

    const still =
      this.images[`still-${engine.mode === 'campaign' ? engine.chapter.film : 'spirited'}`];
    if (ready(still)) {
      const height = 340;
      const width = (still.naturalWidth / still.naturalHeight) * height;
      ctx.save();
      ctx.globalAlpha = 0.32;
      ctx.drawImage(still, (FIELD_W - width) / 2, 0, width, height);
      ctx.restore();
      const fade = ctx.createLinearGradient(0, 160, 0, 340);
      fade.addColorStop(0, 'rgba(0,0,0,0)');
      fade.addColorStop(1, tint[1]);
      ctx.fillStyle = fade;
      ctx.fillRect(0, 160, FIELD_W, 180);
    }
    for (let index = 0; index < 34; index++)
      wash(
        ctx,
        random() * FIELD_W,
        random() * FIELD_H,
        40 + random() * 90,
        tint[2],
        0.05 + random() * 0.06,
      );

    // Ceiling pipes with rivets.
    for (const y of [28, 52]) {
      ctx.fillStyle = 'rgba(60, 40, 28, 0.85)';
      ctx.fillRect(0, y - 6, FIELD_W, 12);
      ctx.fillStyle = 'rgba(230, 190, 120, 0.25)';
      ctx.fillRect(0, y - 5, FIELD_W, 3);
      for (let x = 12; x < FIELD_W; x += 46) {
        ctx.beginPath();
        ctx.arc(x, y, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(30, 20, 14, 0.8)';
        ctx.fill();
      }
    }

    // Brick back wall around the hearth, brushed rather than ruled.
    ctx.save();
    ctx.globalAlpha = 0.5;
    for (let row = 0; row < 8; row++) {
      const y = 448 + row * 20;
      for (let column = -1; column < 12; column++) {
        const x = column * 44 + (row % 2 ? 22 : 0) + (random() - 0.5) * 3;
        ctx.fillStyle = `rgba(${120 + random() * 40}, ${58 + random() * 20}, ${40 + random() * 14}, 0.55)`;
        ctx.fillRect(x + 2, y + 2, 40, 16);
      }
    }
    ctx.restore();

    // Wooden chutes.
    for (let lane = 0; lane < engine.lanes; lane++) {
      const x = engine.laneX(lane);
      const top = CHUTE_TOP - 34;
      const bottom = DOOR_Y + 24;
      const wood = ctx.createLinearGradient(x - 40, 0, x + 40, 0);
      wood.addColorStop(0, '#4a3020');
      wood.addColorStop(0.2, '#7a5434');
      wood.addColorStop(0.8, '#80593a');
      wood.addColorStop(1, '#4a3020');
      ctx.fillStyle = wood;
      ctx.beginPath();
      ctx.roundRect(x - 39, top, 78, bottom - top, 10);
      ctx.fill();
      ctx.fillStyle = 'rgba(30, 18, 10, 0.45)';
      ctx.fillRect(x - 31, top + 6, 62, bottom - top - 6);
      ctx.strokeStyle = 'rgba(240, 200, 140, 0.16)';
      ctx.lineWidth = 1;
      for (let y = top + 40; y < bottom; y += 38) {
        ctx.beginPath();
        ctx.moveTo(x - 31, y + (random() - 0.5) * 2);
        ctx.lineTo(x + 31, y + (random() - 0.5) * 2);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(20, 12, 8, 0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x - 39, top, 78, bottom - top, 10);
      ctx.stroke();
      // The soot hole at the top of the chute.
      ctx.fillStyle = '#140d0a';
      ctx.beginPath();
      ctx.ellipse(x, top + 8, 26, 9, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Hearth arch.
    ctx.save();
    ctx.translate(HEARTH.x, HEARTH.y + 40);
    ctx.fillStyle = '#5a2c1c';
    ctx.beginPath();
    ctx.arc(0, 0, 96, Math.PI, 0);
    ctx.lineTo(96, 40);
    ctx.lineTo(-96, 40);
    ctx.closePath();
    ctx.fill();
    for (let index = 0; index < 13; index++) {
      const angle = Math.PI + (index / 12) * Math.PI;
      ctx.save();
      ctx.rotate(angle);
      ctx.fillStyle = index % 2 ? '#8a4630' : '#9c5238';
      ctx.fillRect(80, -7, 18, 14);
      ctx.restore();
    }
    ctx.fillStyle = '#160b08';
    ctx.beginPath();
    ctx.arc(0, 0, 78, Math.PI, 0);
    ctx.lineTo(78, 40);
    ctx.lineTo(-78, 40);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Paper grain.
    for (let index = 0; index < 2400; index++) {
      ctx.fillStyle = random() < 0.5 ? 'rgba(255, 246, 220, 0.05)' : 'rgba(40, 24, 10, 0.06)';
      ctx.fillRect(random() * FIELD_W, random() * FIELD_H, 1.2, 1.2);
    }
    // Soft vignette like a painted cel.
    const vignette = ctx.createRadialGradient(
      FIELD_W / 2,
      FIELD_H / 2,
      200,
      FIELD_W / 2,
      FIELD_H / 2,
      420,
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(20, 10, 4, 0.42)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, FIELD_W, FIELD_H);
    this.backdrop = canvas;
  }

  draw(engine: BoilerEngine, time: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    this.ensureBackdrop(engine);
    const { reduced } = this.options;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.backdrop) ctx.drawImage(this.backdrop, 0, 0);
    else {
      ctx.fillStyle = '#3a2618';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);

    if (engine.night > 0) {
      ctx.fillStyle = `rgba(12, 18, 40, ${0.42 * engine.night})`;
      ctx.fillRect(0, 0, FIELD_W, FIELD_H);
    }
    this.drawTide(ctx, engine, time);
    this.drawDoorGlow(ctx, engine, time);
    for (const lump of engine.lumps) if (lump.state === 'walk') this.drawCarried(ctx, lump, time);
    this.drawDoors(ctx, engine);
    for (const lump of engine.lumps)
      if (lump.state === 'enter') this.drawLump(ctx, lump, 1 - Math.min(1, lump.enterT) * 0.5);
    this.drawHearth(ctx, engine, time);
    if (!reduced) this.drawParticles(ctx, engine);
    this.drawVisitors(ctx, engine, time);
    this.drawQueueCounts(ctx, engine);
    this.drawDial(ctx, engine);
    this.drawLever(ctx, engine);
    this.drawFlash(ctx, engine);
  }

  private drawTide(ctx: CanvasRenderingContext2D, engine: BoilerEngine, time: number) {
    if (engine.tide < 0.02) return;
    const level = engine.queueTop - 12;
    const gradient = ctx.createLinearGradient(0, 0, 0, level);
    gradient.addColorStop(0, 'rgba(40, 110, 160, 0.25)');
    gradient.addColorStop(1, 'rgba(70, 150, 190, 0.62)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(FIELD_W, 0);
    for (let x = FIELD_W; x >= 0; x -= 16) {
      const wave = this.options.reduced ? 0 : Math.sin(x / 30 + time * 1.6) * 4;
      ctx.lineTo(x, level + wave);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(230, 248, 255, 0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  private drawDoorGlow(ctx: CanvasRenderingContext2D, engine: BoilerEngine, time: number) {
    const x = engine.laneX(engine.door);
    const flicker = this.options.reduced ? 1 : 0.9 + 0.1 * Math.sin(time * 7);
    wash(ctx, x, DOOR_Y + 20, 70, '#ffd27a', 0.35 * flicker);
    // Lantern hanging above the open chute.
    ctx.fillStyle = '#c8452f';
    ctx.beginPath();
    ctx.ellipse(x, CHUTE_TOP - 50, 9, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 220, 150, 0.8)';
    ctx.fillRect(x - 5, CHUTE_TOP - 52, 10, 3);
    wash(ctx, x, CHUTE_TOP - 50, 26, '#ffcf7a', 0.5 * flicker);
  }

  private drawCarried(ctx: CanvasRenderingContext2D, lump: Lump, time: number) {
    const bob = this.options.reduced ? 0 : Math.sin(time * 9 + lump.id) * 1.5;
    const alpha = lump.washed > 0 ? Math.max(0, lump.washed / 0.6) : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (lump.kind !== 'gold' && lump.kind !== 'ash')
      drawSprite(
        ctx,
        this.images[lump.carrier === 0 ? 'sootCarry' : 'soot'],
        lump.x + 14,
        lump.y + 10 + bob,
        22,
      );
    this.drawLump(ctx, lump, 1);
    ctx.restore();
    if (lump.washed > 0) {
      // Bath water bubbles rinsing the lump away.
      ctx.save();
      ctx.globalAlpha = 0.7 * alpha;
      ctx.strokeStyle = '#d8f0f4';
      for (let index = 0; index < 4; index++) {
        ctx.beginPath();
        ctx.arc(
          lump.x - 10 + index * 7,
          lump.y - 6 - (1 - alpha) * 18 - index * 3,
          3 + index,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private drawLump(ctx: CanvasRenderingContext2D, lump: Lump, size: number) {
    const spec = KINDS[lump.kind];
    const radius = (lump.kind === 'longkv' ? 17 : 14) * size;
    blob(ctx, lump.x, lump.y, radius, lump.id);
    const fill = ctx.createRadialGradient(lump.x - 4, lump.y - 5, 2, lump.x, lump.y, radius);
    fill.addColorStop(0, lump.kind === 'gold' ? '#f7e3a0' : '#6a625a');
    fill.addColorStop(1, spec.colour);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = spec.rim;
    ctx.lineWidth = 2;
    ctx.stroke();
    if (lump.kind === 'curse') {
      ctx.strokeStyle = '#c0506a';
      ctx.lineWidth = 1.4;
      for (let index = 0; index < 3; index++) {
        ctx.beginPath();
        const x = lump.x - 8 + index * 8;
        ctx.moveTo(x, lump.y + radius * 0.6);
        ctx.quadraticCurveTo(x + 5, lump.y + radius + 6, x - 2, lump.y + radius + 10);
        ctx.stroke();
      }
    }
    if (size < 0.8) return;
    const assist = this.options.assist;
    ctx.fillStyle = lump.kind === 'gold' ? '#4a3208' : '#fbf1dc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${assist ? 11 : 9}px ui-sans-serif, system-ui, sans-serif`;
    ctx.fillText(this.options.labels.kinds[lump.kind] ?? '', lump.x, lump.y - 3);
    if (lump.kind !== 'gold' && lump.kind !== 'ash') {
      ctx.font = `700 ${assist ? 11 : 10}px ui-sans-serif, system-ui, sans-serif`;
      ctx.fillText(`×${lump.users}`, lump.x, lump.y + 8);
    }
    if (lump.star) star(ctx, lump.x - radius + 2, lump.y - radius + 3, 5, '#f4a6b8');
  }

  private drawDoors(ctx: CanvasRenderingContext2D, engine: BoilerEngine) {
    for (let lane = 0; lane < engine.lanes; lane++) {
      const x = engine.laneX(lane);
      const y = DOOR_Y + 26;
      const colour = DOOR_COLOURS[lane];
      const open = lane === engine.door;
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = '#2a1a10';
      ctx.fillRect(-38, -12, 76, 26);
      if (open) {
        const light = ctx.createLinearGradient(0, -12, 0, 14);
        light.addColorStop(0, '#ffe1a0');
        light.addColorStop(1, '#f08a3a');
        ctx.fillStyle = light;
        ctx.fillRect(-34, -9, 68, 20);
        // The door panel swung aside.
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.moveTo(-34, -10);
        ctx.lineTo(-24, -14);
        ctx.lineTo(-24, 14);
        ctx.lineTo(-34, 12);
        ctx.closePath();
        ctx.fill();
        if (engine.doorBlocked) {
          ctx.fillStyle = 'rgba(20, 10, 10, 0.55)';
          ctx.fillRect(-34, -9, 68, 20);
        }
      } else {
        ctx.fillStyle = colour;
        ctx.fillRect(-34, -9, 68, 20);
        ctx.fillStyle = DOOR_LIGHT[lane];
        ctx.globalAlpha = 0.35;
        ctx.fillRect(-34, -9, 68, 4);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#e8c070';
        ctx.beginPath();
        ctx.arc(24, 1, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
      if (this.options.assist) this.doorPattern(ctx, lane, open);
      ctx.restore();
      ctx.fillStyle = open ? '#ffe9b8' : 'rgba(250, 236, 210, 0.85)';
      ctx.font = `700 ${this.options.assist ? 12 : 10}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(String(lane + 1), x, y + 26);
    }
  }

  private doorPattern(ctx: CanvasRenderingContext2D, lane: number, open: boolean) {
    ctx.save();
    ctx.globalAlpha = open ? 0.5 : 0.8;
    ctx.strokeStyle = '#fff6e0';
    ctx.fillStyle = '#fff6e0';
    ctx.lineWidth = 1.6;
    if (lane === 0) {
      for (let x = -28; x < 34; x += 10) {
        ctx.beginPath();
        ctx.moveTo(x, -8);
        ctx.lineTo(x + 8, 10);
        ctx.stroke();
      }
    } else if (lane === 1) {
      for (let x = -26; x < 34; x += 12)
        for (const y of [-3, 6]) {
          ctx.beginPath();
          ctx.arc(x, y, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
    } else if (lane === 2) {
      for (const y of [-4, 2, 8]) ctx.fillRect(-32, y, 64, 1.5);
    } else {
      ctx.strokeRect(-26, -6, 52, 14);
    }
    ctx.restore();
  }

  private drawHearth(ctx: CanvasRenderingContext2D, engine: BoilerEngine, time: number) {
    const heat = engine.heat / 100;
    const flicker = this.options.reduced
      ? 1
      : 0.92 + 0.08 * Math.sin(time * 11) + 0.04 * Math.sin(time * 23);
    const out = engine.sputter > 0;
    wash(
      ctx,
      HEARTH.x,
      HEARTH.y + 10,
      70 + heat * 70,
      engine.curse > 0 ? '#b0507a' : '#ff9a3a',
      (out ? 0.15 : 0.55) * flicker,
    );
    // A heap of coal on the grate, taller with a bigger batch.
    const heap = Math.min(1, engine.batch / 48);
    for (let index = 0; index < 5 + Math.round(heap * 8); index++) {
      const angle = index * 2.4;
      blob(
        ctx,
        HEARTH.x + Math.cos(angle) * (10 + index * 4),
        HEARTH.y + 56 - (index % 3) * 6 * heap,
        9,
        index + 3,
      );
      ctx.fillStyle = index % 2 ? '#2b2420' : '#3a302a';
      ctx.fill();
    }
    const width = out ? 46 : (90 + heat * 70) * flicker;
    drawSprite(
      ctx,
      this.images[out ? 'flame' : 'calcifer'],
      HEARTH.x,
      HEARTH.y + (out ? 40 : 30 - heat * 12),
      width,
      false,
      out ? 0.55 : 1,
    );
  }

  private drawParticles(ctx: CanvasRenderingContext2D, engine: BoilerEngine) {
    for (const ember of engine.embers) {
      ctx.fillStyle = `rgba(255, ${160 + Math.round(ember.life * 80)}, 80, ${1 - ember.life / ember.max})`;
      ctx.fillRect(ember.x, ember.y, 2.4, 2.4);
    }
    for (const sprite of engine.warawara) {
      const fade = Math.min(1, (sprite.max - sprite.life) / 1.2, sprite.life * 3);
      drawSprite(
        ctx,
        this.images[sprite.variant ? 'warawara2' : 'warawara1'],
        sprite.x,
        sprite.y,
        13,
        false,
        fade * 0.9,
      );
    }
  }

  private drawVisitors(ctx: CanvasRenderingContext2D, engine: BoilerEngine, time: number) {
    const reduced = this.options.reduced;
    if (engine.noface.active) {
      const size = 58 * (engine.boss?.size ?? 1);
      const sway = reduced ? 0 : Math.sin(time * 1.3) * 2;
      drawSprite(
        ctx,
        this.images.noface,
        engine.noface.x,
        CHUTE_TOP - 22 + sway + (engine.boss ? (engine.boss.size - 1) * 10 : 0),
        size,
      );
      if (engine.boss && engine.boss.phase === 3 && engine.doorBlocked)
        wash(ctx, engine.noface.x, DOOR_Y + 20, 46, '#40101a', 0.45);
    }
    if (engine.riverT > 0) {
      const progress = 1 - engine.riverT / 3;
      drawSprite(
        ctx,
        this.images.haku,
        reduced ? FIELD_W / 2 : -80 + progress * (FIELD_W + 160),
        80,
        150,
        false,
        reduced ? 0.8 : 1,
      );
    }
    if (engine.hazards.castle) {
      const x = 40 + (engine.walk / 100) * (FIELD_W - 80);
      drawSprite(
        ctx,
        this.images.castle,
        x,
        72,
        64,
        false,
        engine.heat >= engine.heatLine ? 1 : 0.6,
      );
    }
    if (engine.waveFish.t > 0 && engine.waveFish.lane >= 0) {
      const alpha = Math.min(1, engine.waveFish.t / 0.4);
      drawSprite(
        ctx,
        this.images.wave,
        engine.laneX(engine.waveFish.lane),
        250,
        140,
        false,
        0.85 * alpha,
      );
    }
    if (engine.hazards.tide)
      drawSprite(ctx, this.images.jelly, 50, engine.queueTop - 26, 48, false, 0.85);
    for (const bird of engine.parakeets) {
      drawSprite(
        ctx,
        this.images.parakeets,
        bird.x,
        bird.y,
        70,
        bird.vx > 0,
        bird.state === 'flee' ? 0.6 : 1,
      );
    }
    if (
      engine.night > 0.05 ||
      (engine.hazards.night && engine.nightClock % 26 > 12 && engine.nightClock % 26 < 14)
    ) {
      const alpha = Math.max(engine.night, 0.6);
      const tilt = reduced ? 0 : Math.sin(time * 14) * 0.05;
      ctx.save();
      ctx.translate(20, 380);
      ctx.rotate(tilt);
      drawSprite(ctx, this.images.kodama, 0, 0, 22, false, alpha);
      ctx.restore();
      drawSprite(ctx, this.images.kodama2, FIELD_W - 20, 400, 20, true, alpha);
    }
    if (engine.helper === 'turnip' && engine.hazards.parakeets)
      drawSprite(ctx, this.images.turnip, FIELD_W - 34, 470, 50, false, 0.95);
  }

  private drawQueueCounts(ctx: CanvasRenderingContext2D, engine: BoilerEngine) {
    ctx.font = '600 10px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (let lane = 0; lane < engine.lanes; lane++) {
      const count = engine.queue(lane).length;
      if (!count) continue;
      const capacity = Math.max(1, Math.floor((DOOR_Y - engine.queueTop) / 34) + 1);
      const full = count >= capacity - 1;
      ctx.fillStyle = full ? '#ffb4a0' : 'rgba(250, 236, 210, 0.85)';
      ctx.fillText(`${count}/${capacity}`, engine.laneX(lane), CHUTE_TOP - 6);
    }
  }

  private drawDial(ctx: CanvasRenderingContext2D, engine: BoilerEngine) {
    const cx = FIELD_W - 44;
    const cy = FIELD_H - 44;
    const lanes = engine.lanes;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#3a2616';
    ctx.beginPath();
    ctx.arc(0, 0, 32, 0, Math.PI * 2);
    ctx.fill();
    for (let lane = 0; lane < lanes; lane++) {
      const start = -Math.PI / 2 + (lane / lanes) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 27, start + 0.04, start + (Math.PI * 2) / lanes - 0.04);
      ctx.closePath();
      ctx.fillStyle = DOOR_COLOURS[lane];
      ctx.globalAlpha = lane === engine.door ? 1 : 0.55;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    const angle = -Math.PI / 2 + ((engine.door + 0.5) / lanes) * Math.PI * 2;
    ctx.strokeStyle = '#f3d58a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(angle) * 24, Math.sin(angle) * 24);
    ctx.stroke();
    ctx.fillStyle = '#f3d58a';
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawLever(ctx: CanvasRenderingContext2D, engine: BoilerEngine) {
    const x = 30;
    const top = FIELD_H - 100;
    const height = 80;
    ctx.fillStyle = 'rgba(30, 18, 10, 0.7)';
    ctx.beginPath();
    ctx.roundRect(x - 7, top, 14, height, 7);
    ctx.fill();
    const steps = BATCH_STEPS.length - 1;
    const limitIndex = BATCH_STEPS.findIndex((step) => step >= engine.batchLimit);
    const level = (limitIndex === -1 ? steps : limitIndex) / steps;
    const fill = Math.min(1, engine.batch / 64);
    ctx.fillStyle = '#e08a3a';
    ctx.fillRect(x - 4, top + height - fill * height, 8, fill * height);
    const knob = top + height - level * height;
    ctx.fillStyle = '#c8452f';
    ctx.beginPath();
    ctx.arc(x, knob, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#f3d58a';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#fbefd6';
    ctx.font = '700 10px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${engine.batch}/${engine.batchLimit}`, x + 12, knob + 4);
  }

  private drawFlash(ctx: CanvasRenderingContext2D, engine: BoilerEngine) {
    const { kind, t } = engine.flash;
    if (!kind || t <= 0) return;
    const reduced = this.options.reduced;
    const alpha = reduced ? 0.18 : 0.45 * t;
    if (kind === 'oom') {
      // Steam billowing out of the boiler.
      for (let index = 0; index < (reduced ? 0 : 7); index++)
        wash(
          ctx,
          HEARTH.x + (index - 3) * 40,
          HEARTH.y - 40 - (1 - t) * 90 - (index % 2) * 20,
          60,
          '#f4f1ea',
          alpha,
        );
      ctx.fillStyle = `rgba(240, 236, 226, ${alpha * 0.5})`;
    } else if (kind === 'tag') {
      ctx.fillStyle = `rgba(120, 200, 190, ${alpha * 0.45})`;
    } else {
      ctx.fillStyle = `rgba(10, 10, 20, ${alpha * 0.6})`;
    }
    ctx.fillRect(0, 0, FIELD_W, FIELD_H);
  }
}
