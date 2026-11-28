import { ART } from './strings';
import { rail, limit, liftOf, type Run } from './frontier-model';
import type { GameCopy } from './frontier-copy';
import { palettes } from './frontier-levels';
const names = [
  'bart-ollie',
  'lisa-sax',
  'homer',
  'donut',
  'nelson',
  'towers',
  'town',
  'cola-pickup',
  'terrace',
  'studio',
  'gorge',
  'market',
  'plant-shift',
  'patrol',
] as const;
export function loadDeckArt() {
  return Object.fromEntries(
    names.map((name) => {
      const im = new Image();
      im.src = `${ART}${name}.webp`;
      return [name, im];
    }),
  ) as Record<(typeof names)[number], HTMLImageElement>;
}
const layers = new WeakMap<
  HTMLCanvasElement,
  {
    background?: HTMLCanvasElement;
    key?: string;
    track?: HTMLCanvasElement;
    course?: Run;
    trackKey?: string;
  }
>();
export function releaseRink(canvas: HTMLCanvasElement) {
  layers.delete(canvas);
}
export function drawRink(
  canvas: HTMLCanvasElement,
  s: Run,
  ims: ReturnType<typeof loadDeckArt>,
  t: GameCopy,
  stepped: boolean,
  lowDetail = false,
) {
  const surface = canvas.getContext('2d', { alpha: false });
  if (!surface) return;
  let ctx: CanvasRenderingContext2D = surface;
  const w = Math.max(375, Math.round(canvas.clientWidth)),
    h = 250,
    dpr = lowDetail ? 0.48 : Math.min(devicePixelRatio || 1, 1);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const buffers = layers.get(canvas) ?? {};
  layers.set(canvas, buffers);
  const [sky, far, mid, plank, dark] = palettes[s.stage % 5],
    ink = '#242637';
  const sprite = (n: keyof typeof ims, x: number, y: number, height: number, angle = 0) => {
    const image = ims[n];
    if (!image.complete || !image.naturalWidth) return;
    const wi = (image.naturalWidth / image.naturalHeight) * height;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.drawImage(image, -wi * 0.5, -height, wi, height);
    ctx.restore();
  };
  const riderX = Math.round(w * (w < 510 ? 0.22 : 0.24)),
    offset = s.x - riderX;
  const zone = s.stage % 5,
    location = ims[(['terrace', 'studio', 'gorge', 'market', 'plant-shift'] as const)[zone]];
  const key = `${zone}/${w}/${dpr}/${location.naturalWidth}/${ims.town.naturalWidth}/${ims.towers.naturalWidth}/${t.yAxis}`;
  if (!buffers.background || buffers.key !== key) {
    const page = document.createElement('canvas');
    page.width = canvas.width;
    page.height = canvas.height;
    const painter = page.getContext('2d', { alpha: false });
    if (!painter) return;
    ctx = painter;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    // A diagram and a Springfield location at once: light graph paper, hills, distant industry.
    ctx.fillStyle = '#fff9cd';
    ctx.beginPath();
    ctx.arc(w * 0.79, 40, 25, 0, Math.PI * 2);
    ctx.fill();
    for (let plane = 0; plane < 2; plane++) {
      ctx.fillStyle = plane ? mid : far;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w + 5; x += 5) {
        const phase = x + (stepped ? 0 : offset * (plane ? 0.12 : 0.05));
        ctx.lineTo(
          x,
          107 +
            plane * 18 +
            Math.sin(phase / (plane ? 76 : 106)) * 12 +
            Math.sin(phase / 45 + plane) * 5,
        );
      }
      ctx.lineTo(w, h);
      ctx.fill();
    }
    const set =
      ims[(['terrace', 'studio', 'gorge', 'market', 'plant-shift'] as const)[s.stage % 5]];
    if (set.complete && set.naturalWidth) {
      // Pan within the actual episode location. The course is a separate foreground.
      const screenH = 153,
        scale = Math.max(w / set.naturalWidth, screenH / set.naturalHeight);
      const fh = set.naturalHeight * scale;
      ctx.drawImage(
        set,
        0,
        -(fh - screenH) * (stepped ? 0.46 : 0.4 + 0.12 * Math.min(1, s.x / limit)),
        set.naturalWidth * scale,
        fh,
      );
    } else if (ims.town.complete && ims.town.naturalWidth) {
      const stripHeight = ims.town.naturalHeight * 0.46,
        stripWidth = (ims.town.naturalWidth * 82) / stripHeight;
      const x0 = -(stepped ? 0 : (s.x * 0.14) % stripWidth);
      ctx.globalAlpha = 0.7;
      for (let x = x0; x < w; x += stripWidth)
        ctx.drawImage(
          ims.town,
          0,
          ims.town.naturalHeight * 0.15,
          ims.town.naturalWidth,
          stripHeight,
          x,
          60,
          stripWidth + 0.5,
          82,
        );
      ctx.globalAlpha = 1;
    }
    // Five distinct landmarks, not character imitations: porches, a studio lighting rig,
    // a truss bridge, the market awning, and the real plant towers beneath a moving crane.
    const pan = 0;
    for (let x = 118 - pan; (!set.complete || !set.naturalWidth) && x < w + 140; x += 410) {
      ctx.save();
      ctx.translate(x, 135);
      ctx.lineWidth = 2;
      ctx.strokeStyle = mid;
      if (zone === 0) {
        ctx.fillStyle = '#f8d7a0';
        ctx.fillRect(-31, -17, 63, 23);
        ctx.fillStyle = '#ae645b';
        ctx.beginPath();
        ctx.moveTo(-36, -16);
        ctx.lineTo(0, -42);
        ctx.lineTo(38, -16);
        ctx.fill();
        ctx.fillStyle = mid;
        ctx.fillRect(-18, -12, 10, 9);
        ctx.fillRect(6, -14, 10, 20);
      } else if (zone === 1) {
        ctx.strokeRect(-45, -40, 90, 6);
        ctx.strokeRect(-41, -35, 4, 35);
        ctx.strokeRect(37, -35, 4, 35);
        ctx.fillStyle = '#e3bd83';
        for (let n = -30; n <= 30; n += 20) {
          ctx.fillRect(n, -32, 9, 7);
          ctx.beginPath();
          ctx.moveTo(n, -24);
          ctx.lineTo(n - 6, -5);
          ctx.lineTo(n + 14, -5);
          ctx.fill();
        }
      } else if (zone === 2) {
        ctx.strokeRect(-65, -22, 130, 6);
        for (let n = -65; n < 65; n += 26) {
          ctx.beginPath();
          ctx.moveTo(n, -16);
          ctx.lineTo(n + 13, -48);
          ctx.lineTo(n + 26, -16);
          ctx.stroke();
        }
      } else if (zone === 3) {
        ctx.fillStyle = '#f2c28c';
        ctx.fillRect(-48, -30, 96, 34);
        for (let n = 0; n < 8; n++) {
          ctx.fillStyle = n % 2 ? '#fbdda5' : '#a55354';
          ctx.fillRect(-48 + n * 12, -27, 12, 8);
        }
        ctx.fillStyle = mid;
        ctx.fillRect(-22, -14, 21, 17);
        ctx.fillRect(13, -14, 20, 17);
      } else {
        sprite('towers', 0, 4, 65);
      }
      ctx.restore();
    }
    ctx.strokeStyle = '#33586b29';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let x = -(offset % 46); x < w; x += 46) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = 25; y < h; y += 30) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();
    ctx.font = 'bold 10px SimpsonsNunito, sans-serif';
    ctx.fillStyle = '#fff5d5';
    ctx.fillRect(7, 7, Math.ceil(ctx.measureText(t.yAxis).width) + 12, 19);
    ctx.fillStyle = '#2e4853';
    ctx.fillText(t.yAxis, 12, 20);
    buffers.background = page;
    buffers.key = key;
  }
  ctx = surface;
  ctx.drawImage(buffers.background, 0, 0, w, h);
  const trackWidth = limit + w + 12,
    trackKey = `${zone}/${w}/${dpr}/${s.seed}/${s.profile}`;
  if (!buffers.track || buffers.trackKey !== trackKey || buffers.course !== s) {
    const sheet = document.createElement('canvas');
    sheet.width = Math.ceil(trackWidth * dpr);
    sheet.height = canvas.height;
    const painter = sheet.getContext('2d');
    if (!painter) return;
    ctx = painter;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const ramp = new Path2D();
    for (let x = -2; x <= trackWidth + 5; x += 3) {
      const y = rail(x - riderX, s);
      if (x === -2) ramp.moveTo(x, y);
      else ramp.lineTo(x, y);
    }
    const fill = new Path2D(ramp);
    fill.lineTo(trackWidth + 5, h + 2);
    fill.lineTo(-2, h + 2);
    fill.closePath();
    ctx.fillStyle = plank;
    // CanvasRenderingContext2D.fill(Path2D), not Array.fill.
    // oxlint-disable-next-line unicorn/no-array-fill-with-reference-type
    ctx.fill(fill);
    ctx.save();
    ctx.clip(fill);
    ctx.strokeStyle = dark;
    ctx.lineWidth = 2;
    for (let x = -70; x < trackWidth + 100; x += 25) {
      ctx.beginPath();
      ctx.moveTo(x, 100);
      ctx.lineTo(x - 52, h);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 9;
    ctx.stroke(ramp);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#fff6b6';
    ctx.stroke(ramp);
    buffers.track = sheet;
    buffers.trackKey = trackKey;
    buffers.course = s;
  }
  ctx = surface;
  ctx.drawImage(buffers.track, Math.min(s.x, limit) * dpr, 0, w * dpr, h * dpr, 0, 0, w, h);
  for (const it of s.items) {
    const x = it.x - offset;
    if (it.used || x < -30 || x > w + 30) continue;
    const floor = rail(it.x, s),
      y = floor - liftOf(it, s);
    if (it.kind === 'donut')
      sprite(s.delivery === 'pickup' ? 'cola-pickup' : 'donut', x, y + 12, 32);
    else if (it.kind === 'wave') {
      ctx.save();
      ctx.strokeStyle = '#fff3c1';
      ctx.fillStyle = '#57508d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'white';
      ctx.font = 'bold 17px sans-serif';
      ctx.fillText('♫', x - 7, y + 6);
      ctx.restore();
    } else if (it.kind === 'rod') {
      ctx.fillStyle = ink;
      ctx.fillRect(x - 7, y - 3, 14, floor - y + 4);
      ctx.fillStyle = '#8bec5c';
      ctx.fillRect(x - 4, y, 8, floor - y - 1);
      ctx.fillStyle = '#f7ffac';
      ctx.fillRect(x - 3, y + 3, 2, floor - y - 6);
      ctx.fillStyle = ink;
      ctx.fillRect(x - 8, y, 16, 3);
      ctx.fillRect(x - 8, floor - 4, 16, 3);
    } else {
      ctx.fillStyle = ink;
      ctx.fillRect(x - 2, y - 10, 4, floor - y + 12);
      ctx.fillStyle = '#fff5c9';
      ctx.fillRect(x - 13, y - 17, 26, 18);
      ctx.lineWidth = 2;
      ctx.strokeStyle = ink;
      ctx.strokeRect(x - 13, y - 17, 26, 18);
      ctx.fillStyle = '#9d324d';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText('A?', x - 10, y - 3);
    }
  }
  // Homer tosses cache donuts; Lisa monitors the slope, Nelson reacts to collisions.
  for (const it of s.items.filter((o, i) => i % 3 === 0)) {
    const x = it.x - offset + 30;
    if (x > -30 && x < w + 30) {
      ctx.globalAlpha = 0.88;
      sprite(it.kind === 'donut' ? 'homer' : 'lisa-sax', x, rail(it.x + 30, s) - 5, 45);
      ctx.globalAlpha = 1;
    }
  }
  const ground = rail(s.x, s),
    y = ground - s.air;
  ctx.fillStyle = '#35293940';
  ctx.beginPath();
  ctx.ellipse(riderX, ground - 1, 21, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  const tilt = Math.atan2(rail(s.x + 7, s) - rail(s.x - 7, s), 14);
  if (s.delivery === 'carrying') {
    const gap = 115 - s.alert * 0.88,
      patrolX = riderX - gap;
    sprite('patrol', patrolX, rail(s.x - gap, s), 38);
  }
  sprite('bart-ollie', riderX, y + 12, w < 510 ? 62 : 78, s.air > 0 ? -0.3 : tilt - 0.36);
  if (s.flash > 0 && ['burn', 'clear', 'cache'].includes(s.message)) {
    const radius = stepped ? 22 : 15 + (1 - Math.min(1, s.flash)) * 18;
    ctx.save();
    ctx.translate(riderX, y - 18);
    ctx.strokeStyle = s.message === 'burn' ? '#a22c36' : '#ffe04b';
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let i = 0; i < 9; i++) {
      const a = (i * Math.PI * 2) / 9;
      ctx.moveTo(Math.cos(a) * radius, Math.sin(a) * radius);
      ctx.lineTo(Math.cos(a) * (radius + 8), Math.sin(a) * (radius + 8));
    }
    ctx.stroke();
    ctx.restore();
  }
  if (zone === 4 && s.boss.phase !== 'offline') {
    const b = s.boss,
      tx = Math.max(18, Math.min(w - 24, b.aim - offset)),
      gy = rail(b.aim, s);
    ctx.strokeStyle = '#363548';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(w - 30, 105);
    ctx.lineTo(w - 30, 28);
    ctx.lineTo(tx, 28);
    ctx.stroke();
    const fall = b.phase === 'drop' ? Math.min(1, b.time * 2) : b.phase === 'vent' ? 0.38 : 0;
    const targetHeight = b.armor === 2 ? gy - 55 : gy;
    const tip = 46 + (targetHeight - 46) * fall;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(tx, 28);
    ctx.lineTo(tx, tip);
    ctx.stroke();
    ctx.fillStyle = ink;
    ctx.fillRect(tx - 6, tip - 8, 12, 16);
    ctx.fillStyle = b.phase === 'vent' ? '#ffe42d' : '#94df68';
    ctx.fillRect(tx - 3, tip - 6, 6, 12);
    if (b.armor === 2) {
      ctx.fillStyle = '#bd5a17';
      ctx.fillRect(tx - 25, tip, 50, 7);
    } else if (b.armor === 1 && b.phase !== 'vent') {
      ctx.strokeStyle = '#933b39';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = -4; i <= 4; i++) {
        const px = tx + i * 7,
          py = rail(b.aim + i * 7, s) - (i % 2 ? 3 : 12);
        if (i === -4) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    if (b.phase === 'track') {
      ctx.strokeStyle = '#933b39';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(tx, tip + 10);
      ctx.lineTo(tx, gy);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    sprite('nelson', w - 30, 108, 42);
  }
  if (s.boost > 0) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#fff8bb';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(riderX - 32 - i * 7, y - 21, 5 + i * 2, 2, 4.2);
      ctx.stroke();
    }
  }
  if (s.message === 'burn' && s.flash > 0) sprite('nelson', riderX + 65, ground - 3, 52);
  if (limit - offset < w + 20) {
    const x = limit - offset;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x, rail(limit, s));
    ctx.lineTo(x, rail(limit, s) - 73);
    ctx.stroke();
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? '#fff8dd' : ink;
      ctx.fillRect(x + (i % 4) * 7, rail(limit, s) - 73 + Math.floor(i / 4) * 7, 7, 7);
    }
  }
  ctx.font = 'bold 10px SimpsonsNunito, sans-serif';
  ctx.fillStyle = ink;
  ctx.textAlign = 'right';
  ctx.fillText(t.xAxis, w - 12, h - 8);
  ctx.textAlign = 'left';
}
