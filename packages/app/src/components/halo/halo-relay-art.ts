import { CHAPTERS, HEIGHT, WIDTH } from './halo-relay-engine';

type Vertex = readonly [number, number];
const environments = [
  ['#10384c', '#081f2c', '#183e42'],
  ['#562948', '#291b35', '#452642'],
  ['#24284d', '#14182e', '#35325c'],
  ['#233b27', '#13251d', '#354829'],
  ['#402745', '#18172d', '#44234b'],
] as const;
const backdrops = new WeakMap<HTMLCanvasElement, { sector: number; surface: HTMLCanvasElement }>();

function polygon(ctx: CanvasRenderingContext2D, vertices: readonly Vertex[]) {
  ctx.beginPath();
  vertices.forEach(([x, y], i) => {
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
}

export function drawBulkhead(
  ctx: CanvasRenderingContext2D,
  block: { x: number; y: number; w: number; h: number },
  sector: number,
) {
  const { x, y, w, h } = block;
  const side = Math.min(w, h) * 0.25;
  const metal = ['#47625d', '#744843', '#555371', '#525d3c', '#584868'][sector];
  const signal = CHAPTERS[sector].color;
  ctx.save();
  ctx.translate(x, y);
  const hull = ctx.createLinearGradient(0, 0, w, h);
  hull.addColorStop(0, metal);
  hull.addColorStop(0.6, '#232d38');
  hull.addColorStop(1, '#0b1420');
  polygon(ctx, [
    [side, 0],
    [w - side, 0],
    [w, side],
    [w, h - side],
    [w - side, h],
    [side, h],
    [0, h - side],
    [0, side],
  ]);
  ctx.fillStyle = hull;
  ctx.fill();
  ctx.strokeStyle = '#8a9bab';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.clip();
  for (const start of [0.12, 0.76]) {
    const ridge = start * h;
    polygon(ctx, [
      [0, ridge - 4],
      [w * 0.22, ridge + 3],
      [w * 0.78, ridge + 3],
      [w, ridge - 4],
      [w, ridge + 6],
      [w * 0.78, ridge + 10],
      [w * 0.22, ridge + 10],
      [0, ridge + 6],
    ]);
    ctx.fillStyle = '#101923';
    ctx.fill();
    ctx.strokeStyle = '#78899888';
    ctx.stroke();
  }
  ctx.translate(w / 2, h / 2);
  const scale = Math.min(1.7, Math.min(w, h) / 28);
  ctx.scale(scale, scale);
  polygon(ctx, [
    [0, -13],
    [9, -4],
    [9, 4],
    [0, 13],
    [-9, 4],
    [-9, -4],
  ]);
  ctx.fillStyle = '#0c1723';
  ctx.fill();
  ctx.strokeStyle = signal;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-4, 2);
  ctx.lineTo(0, -3);
  ctx.lineTo(4, 2);
  ctx.moveTo(0, -3);
  ctx.lineTo(0, 7);
  ctx.stroke();
  ctx.restore();
}

export function drawTerrain(ctx: CanvasRenderingContext2D, sector: number) {
  let cached = backdrops.get(ctx.canvas);
  if (cached?.sector !== sector) {
    const surface = document.createElement('canvas');
    surface.width = WIDTH;
    surface.height = HEIGHT;
    const layer = surface.getContext('2d');
    if (!layer) return;
    const [sky, floor, rock] = environments[sector];
    const tint = CHAPTERS[sector].color;
    const horizon = layer.createLinearGradient(0, 0, 0, HEIGHT);
    horizon.addColorStop(0, sky);
    horizon.addColorStop(0.55, floor);
    horizon.addColorStop(1, '#080f19');
    layer.fillStyle = horizon;
    layer.fillRect(0, 0, WIDTH, HEIGHT);
    layer.strokeStyle = `${tint}42`;
    layer.lineWidth = 4;
    layer.beginPath();
    layer.ellipse(380, 215, 419, 193, -0.45, Math.PI * 0.1, Math.PI * 1.5);
    layer.stroke();
    layer.lineWidth = 1;
    layer.strokeStyle = `${tint}78`;
    layer.beginPath();
    layer.ellipse(380, 219, 421, 195, -0.45, Math.PI * 0.1, Math.PI * 1.5);
    layer.stroke();

    const ridge: Vertex[] = [[0, HEIGHT]];
    for (let x = 0; x <= WIDTH; x += 18) {
      const offset = Math.sin(x * 0.039 + sector) * 13 + Math.cos(x * 0.017) * 19;
      ridge.push([x, 120 + offset + (sector === 1 ? Math.sin(x * 0.08) * 20 : 0)]);
    }
    ridge.push([WIDTH, HEIGHT]);
    layer.fillStyle = rock;
    polygon(layer, ridge);
    layer.fill();
    layer.fillStyle = floor;
    layer.fillRect(0, 165, WIDTH, HEIGHT - 165);
    layer.strokeStyle = `${tint}18`;
    layer.beginPath();
    for (let x = -300; x < 1000; x += 50) {
      layer.moveTo(360 + (x - 360) * 0.36, 165);
      layer.lineTo(x, HEIGHT);
    }
    for (const y of [170, 185, 206, 237, 280, 335]) {
      layer.moveTo(0, y);
      layer.lineTo(WIDTH, y);
    }
    layer.stroke();

    for (let x = 12; x < WIDTH; x += 43) {
      const y = 132 + Math.sin(x * 0.038) * 11;
      const h = 13 + ((x * 13) % 50);
      layer.fillStyle = '#071320';
      layer.strokeStyle = `${tint}39`;
      if (sector === 0) {
        polygon(layer, [
          [x, y - h],
          [x + 12, y - 3],
          [x + 5, y - 3],
          [x + 5, y + 5],
          [x - 4, y + 5],
          [x - 4, y - 3],
          [x - 11, y - 3],
        ]);
        layer.fill();
      } else if (sector === 3) {
        layer.beginPath();
        layer.ellipse(x, y - h / 4, 9, h / 3, 0.58, 0, Math.PI * 2);
        layer.fill();
        layer.stroke();
        layer.beginPath();
        layer.moveTo(x + 9, y + 9);
        layer.quadraticCurveTo(x - 12, y - 15, x + 7, y - h);
        layer.stroke();
      } else {
        const w = sector === 2 ? 15 : 7;
        polygon(layer, [
          [x - w, y + 7],
          [x - w, y - h + 8],
          [x + w, y - h],
          [x + w, y + 7],
        ]);
        layer.fill();
        layer.stroke();
        layer.fillStyle = `${tint}61`;
        layer.fillRect(x + w - 4, y - h + 13, 2, h - 9);
      }
    }
    cached = { sector, surface };
    backdrops.set(ctx.canvas, cached);
  }
  ctx.drawImage(cached.surface, 0, 0);
}

export function drawSkiff(ctx: CanvasRenderingContext2D, tint: string, thrust: boolean) {
  // Pelican-inspired dropship: split nacelles, swept armor and a two-seat canopy.
  ctx.fillStyle = '#263937';
  ctx.strokeStyle = tint;
  ctx.lineWidth = 1.3;
  polygon(ctx, [
    [20, 0],
    [13, -7],
    [4, -8],
    [1, -15],
    [-13, -16],
    [-16, -10],
    [-9, -7],
    [-12, -3],
    [-18, -3],
    [-18, 3],
    [-12, 3],
    [-9, 7],
    [-16, 10],
    [-13, 16],
    [1, 15],
    [4, 8],
    [13, 7],
  ]);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#f3ffff';
  polygon(ctx, [
    [13, 0],
    [7, -4],
    [1, -4],
    [3, 0],
    [1, 4],
    [7, 4],
  ]);
  ctx.fill();
  ctx.fillStyle = thrust ? '#fff0ba' : tint;
  ctx.fillRect(-17, -13, 6, 4);
  ctx.fillRect(-17, 9, 6, 4);
}

export function drawSentinel(ctx: CanvasRenderingContext2D, sentry: boolean) {
  ctx.fillStyle = '#452c39';
  ctx.strokeStyle = '#ffb18c';
  ctx.lineWidth = 1.4;
  polygon(
    ctx,
    sentry
      ? [
          [0, -12],
          [12, -6],
          [12, 6],
          [0, 12],
          [-12, 6],
          [-12, -6],
        ]
      : [
          [-16, -9],
          [-6, -4],
          [0, -10],
          [6, -4],
          [16, -9],
          [13, 4],
          [5, 3],
          [0, 10],
          [-5, 3],
          [-13, 4],
        ],
  );
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffd0a9';
  ctx.fillRect(-4, -1.5, 8, 3);
}
