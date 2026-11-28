/**
 * Top-down Dust II paint for Operation Pareto. Original canvas drawing, no franchise binaries.
 * Cell size matches csgo-ops.tsx (40).
 */

const CELL = 40;
const COLS = 50;
const ROWS = 35;

export interface ArtBot {
  x: number;
  y: number;
  aim: number;
  alive: boolean;
  flash: number;
  boss: boolean;
  hp: number;
  max: number;
  muzzle: number;
}

export interface ArtWorld {
  x: number;
  y: number;
  aim: number;
  camX: number;
  camY: number;
  viewW: number;
  viewH: number;
  hit: number;
  flash: number;
  muzzle: number;
  beam: number;
  kv: number;
  plant: number;
  smokes: { x: number; y: number; life: number }[];
  bots: ArtBot[];
  boss: ArtBot | null;
  feed: { text: string; life: number }[];
  tracers: { x: number; y: number; angle: number; range: number; life: number }[];
}

export interface ArtDeps {
  calm: boolean;
  zoneName: string;
  side: string;
  zoneAt: (x: number, y: number) => number;
  gateSolid: (c: number, r: number) => boolean;
  solid: (c: number, r: number) => boolean;
  benches?: { c: number; r: number }[];
  benchHint?: string;
}

const FLOOR = ['#d8c4a0', '#b7b1a6', '#e4d3b0', '#6d5b45', '#24302c'];
const FLOOR_DARK = ['#c3ab86', '#8e8880', '#cbb892', '#4e4030', '#15201c'];

function hash(c: number, r: number) {
  return ((c * 374761393 + r * 668265263) >>> 0) % 997;
}

function drawCrate(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#8a5a32';
  ctx.fillRect(x + 8, y + 8, 24, 24);
  ctx.strokeStyle = '#5c3a1e';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 8, y + 8, 24, 24);
  ctx.beginPath();
  ctx.moveTo(x + 8, y + 8);
  ctx.lineTo(x + 32, y + 32);
  ctx.moveTo(x + 32, y + 8);
  ctx.lineTo(x + 8, y + 32);
  ctx.stroke();
  ctx.fillStyle = '#c48a52';
  ctx.fillRect(x + 10, y + 8, 20, 3);
}

function drawDoor(ctx: CanvasRenderingContext2D, x: number, y: number, shut: boolean) {
  ctx.fillStyle = shut ? '#3a4248' : '#6a5428';
  ctx.fillRect(x + 4, y + 6, CELL - 8, CELL - 12);
  ctx.strokeStyle = '#d7c08a';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 4, y + 6, CELL - 8, CELL - 12);
  if (shut) {
    ctx.strokeStyle = '#9aa4aa';
    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath();
      ctx.moveTo(x + 6, y + 12 + i * 6);
      ctx.lineTo(x + CELL - 6, y + 12 + i * 6);
      ctx.stroke();
    }
  }
  ctx.fillStyle = shut ? '#de4b4b' : '#7dffb3';
  ctx.fillRect(x + CELL - 10, y + 8, 4, 4);
}

function drawOperator(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  aim: number,
  team: 'ct' | 't',
  muzzle: number,
  flashed: boolean,
  boss: boolean,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(aim);
  ctx.fillStyle = '#00000055';
  ctx.beginPath();
  ctx.ellipse(2, 4, boss ? 12 : 9, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = team === 'ct' ? '#2f5f86' : '#c45c28';
  ctx.fillRect(boss ? -8 : -6, boss ? -6 : -5, boss ? 16 : 12, boss ? 12 : 10);
  ctx.fillStyle = team === 'ct' ? '#16344c' : '#6a3016';
  ctx.fillRect(-4, -1, 8, 5);
  ctx.fillStyle = flashed ? '#f4f0e4' : team === 'ct' ? '#e6d2b8' : '#efc8a4';
  ctx.beginPath();
  ctx.arc(0, -8, boss ? 5.5 : 4.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = team === 'ct' ? '#1d3f5c' : '#3a2218';
  ctx.beginPath();
  ctx.arc(0, -9, boss ? 5.6 : 4.6, Math.PI * 1.05, Math.PI * 1.95);
  ctx.fill();
  if (team === 't') {
    ctx.fillStyle = '#1a120e';
    ctx.fillRect(-3.2, -7, 6.4, 2.2);
  }
  ctx.fillStyle = '#1c1c1c';
  ctx.fillRect(3, -1.4, boss ? 22 : 16, 2.6);
  ctx.fillStyle = '#c9a15b';
  ctx.fillRect(boss ? 22 : 16, -0.7, 4, 1.4);
  if (muzzle > 0) {
    ctx.fillStyle = `rgba(255, 214, 120, ${Math.min(1, muzzle * 8)})`;
    ctx.beginPath();
    ctx.moveTo(boss ? 26 : 20, 0);
    ctx.lineTo(boss ? 34 : 28, -4);
    ctx.lineTo(boss ? 34 : 28, 4);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawBench(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#3a4650';
  ctx.fillRect(x + 6, y + 14, 28, 12);
  ctx.fillStyle = '#101820';
  ctx.fillRect(x + 8, y + 26, 3, 10);
  ctx.fillRect(x + 29, y + 26, 3, 10);
  ctx.strokeStyle = '#e6bd68';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 10, y + 8, 16, 10);
  ctx.fillStyle = '#7dffb3';
  ctx.fillRect(x + 14, y + 11, 8, 4);
}

export function drawOps(ctx: CanvasRenderingContext2D, sim: ArtWorld, deps: ArtDeps) {
  const { calm, zoneAt, gateSolid, solid, zoneName, side } = deps;
  const shake = calm ? 0 : sim.hit * 8;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const dpr = ctx.canvas.width / Math.max(1, sim.viewW);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#1a1612';
  ctx.fillRect(0, 0, sim.viewW, sim.viewH);
  ctx.save();
  ctx.translate(-sim.camX + shake, -sim.camY);

  const c0 = Math.max(0, Math.floor(sim.camX / CELL) - 1);
  const c1 = Math.min(COLS - 1, Math.ceil((sim.camX + sim.viewW) / CELL) + 1);
  const r0 = Math.max(0, Math.floor(sim.camY / CELL) - 1);
  const r1 = Math.min(ROWS - 1, Math.ceil((sim.camY + sim.viewH) / CELL) + 1);

  for (let r = r0; r <= r1; r += 1) {
    for (let c = c0; c <= c1; c += 1) {
      const x = c * CELL;
      const y = r * CELL;
      if (solid(c, r)) {
        ctx.fillStyle = (c + r) % 2 === 0 ? '#8d7356' : '#7a6248';
        ctx.fillRect(x, y, CELL, CELL);
        ctx.fillStyle = '#c4a57a';
        ctx.fillRect(x, y, CELL, 4);
        ctx.fillStyle = '#4e3b2a';
        ctx.fillRect(x, y + CELL - 3, CELL, 3);
        continue;
      }
      if (gateSolid(c, r)) {
        drawDoor(ctx, x, y, true);
        continue;
      }
      const zone = zoneAt(x + 8, y + 8);
      const speck = hash(c, r) % 5 === 0;
      ctx.fillStyle = speck ? (FLOOR_DARK[zone] ?? '#cbb892') : (FLOOR[zone] ?? '#d8c4a0');
      ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
      if (zone === 1) {
        ctx.strokeStyle = '#ffffff18';
        ctx.strokeRect(x + 6, y + 6, CELL - 12, CELL - 12);
      }
      if (zone === 3 && r % 2 === 0) {
        ctx.strokeStyle = '#3a3026';
        ctx.beginPath();
        ctx.moveTo(x + 2, y + 20);
        ctx.lineTo(x + CELL - 2, y + 20);
        ctx.stroke();
      }
      if (zone === 4 && hash(c, r) % 7 === 0) {
        ctx.fillStyle = '#1a3a34';
        ctx.fillRect(x + 8, y + 6, 8, 28);
        ctx.fillStyle = '#7dffb3';
        ctx.fillRect(x + 10, y + 10, 4, 3);
      }
      if (hash(c, r) % 17 === 0) drawCrate(ctx, x, y);
    }
  }

  ctx.save();
  ctx.translate(42 * CELL + 20, 5 * CELL + 20);
  ctx.fillStyle = '#f4f0e4cc';
  ctx.font = '28px CsgoDisplay, Rajdhani, sans-serif';
  ctx.fillText('A', -8, 8);
  ctx.strokeStyle = '#7dffb3';
  ctx.lineWidth = 2;
  ctx.strokeRect(-26, -26, 52, 52);
  ctx.restore();

  ctx.save();
  ctx.translate(8 * CELL, 27 * CELL);
  ctx.fillStyle = '#f4f0e4aa';
  ctx.font = '28px CsgoDisplay, Rajdhani, sans-serif';
  ctx.fillText('B', 0, 0);
  ctx.restore();

  ctx.strokeStyle = '#de4b4b';
  ctx.lineWidth = 2;
  ctx.strokeRect(40 * CELL - 14, 24 * CELL - 14, 68, 68);

  for (const smoke of sim.smokes) {
    for (let i = 0; i < 5; i += 1) {
      ctx.fillStyle = `rgba(210, 214, 208, ${0.18 + i * 0.05})`;
      ctx.beginPath();
      ctx.arc(smoke.x + (i - 2) * 8, smoke.y + (i % 2) * 6, 28 + i * 10, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  for (const tracer of sim.tracers) {
    ctx.strokeStyle = 'rgba(255, 220, 140, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(tracer.x, tracer.y);
    ctx.lineTo(
      tracer.x + Math.cos(tracer.angle) * tracer.range,
      tracer.y + Math.sin(tracer.angle) * tracer.range,
    );
    ctx.stroke();
  }

  for (const bot of sim.bots) {
    if (!bot.alive) continue;
    drawOperator(ctx, bot.x, bot.y, bot.aim, 't', bot.muzzle, bot.flash > 0, false);
  }
  if (sim.boss?.alive) {
    ctx.save();
    ctx.translate(sim.boss.x, sim.boss.y);
    // The beam does damage where the simulation points it, so the drawn beam always follows it;
    // reduced motion slows the sweep instead of hiding it.
    ctx.rotate(sim.beam);
    ctx.strokeStyle = calm ? '#de4b4bcc' : '#de4b4b88';
    ctx.lineWidth = calm ? 6 : 10;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(460, 0);
    ctx.stroke();
    ctx.restore();
    drawOperator(ctx, sim.boss.x, sim.boss.y, sim.boss.aim, 't', sim.boss.muzzle, false, true);
    ctx.fillStyle = '#101820';
    ctx.fillRect(sim.boss.x - 18, sim.boss.y - 28, 36, 4);
    ctx.fillStyle = '#de4b4b';
    ctx.fillRect(sim.boss.x - 18, sim.boss.y - 28, 36 * (sim.boss.hp / sim.boss.max), 4);
  }

  for (const bench of deps.benches ?? []) drawBench(ctx, bench.c * CELL, bench.r * CELL);
  drawOperator(ctx, sim.x, sim.y, sim.aim, side === 't' ? 't' : 'ct', sim.muzzle, false, false);
  ctx.restore();

  drawMinimap(ctx, sim, deps);
  if (!calm && sim.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${sim.flash})`;
    ctx.fillRect(0, 0, sim.viewW, sim.viewH);
  }
  ctx.fillStyle = '#101820cc';
  ctx.fillRect(8, 8, Math.min(220, zoneName.length * 11 + 16), 22);
  ctx.fillStyle = '#e6bd68';
  ctx.font = '16px CsgoDisplay, Rajdhani, sans-serif';
  ctx.fillText(zoneName, 14, 24);
  sim.feed.slice(0, 4).forEach((row, index) => {
    const y = 36 + index * 20;
    ctx.fillStyle = '#101820dd';
    ctx.fillRect(8, y, Math.min(240, sim.viewW * 0.42), 18);
    ctx.fillStyle = '#f0eee7';
    ctx.font = '13px CsgoBody, Barlow, sans-serif';
    ctx.fillText(row.text, 14, y + 13);
  });
  if (deps.benchHint) {
    ctx.fillStyle = '#101820cc';
    ctx.fillRect(sim.viewW / 2 - 54, sim.viewH - 46, 108, 18);
    ctx.fillStyle = '#e6bd68';
    ctx.font = '13px CsgoBody, Barlow, sans-serif';
    ctx.fillText(deps.benchHint, sim.viewW / 2 - 46, sim.viewH - 33);
  }
  if (sim.plant > 0.02) {
    ctx.fillStyle = '#101820cc';
    ctx.fillRect(sim.viewW / 2 - 60, sim.viewH - 28, 120, 10);
    ctx.fillStyle = '#de4b4b';
    ctx.fillRect(sim.viewW / 2 - 60, sim.viewH - 28, 120 * Math.min(1, sim.plant), 10);
  }
}

function drawMinimap(ctx: CanvasRenderingContext2D, sim: ArtWorld, deps: ArtDeps) {
  const scale = 0.055;
  const ox = sim.viewW - COLS * CELL * scale - 12;
  const oy = 12;
  ctx.fillStyle = '#101820ee';
  ctx.fillRect(ox - 4, oy - 4, COLS * CELL * scale + 8, ROWS * CELL * scale + 8);
  ctx.strokeStyle = '#e6bd68';
  ctx.strokeRect(ox - 4, oy - 4, COLS * CELL * scale + 8, ROWS * CELL * scale + 8);
  for (let r = 0; r < ROWS; r += 2) {
    for (let c = 0; c < COLS; c += 2) {
      if (deps.solid(c, r)) continue;
      ctx.fillStyle = FLOOR[deps.zoneAt(c * CELL, r * CELL)] ?? '#d8c4a0';
      ctx.fillRect(ox + c * CELL * scale, oy + r * CELL * scale, 3, 3);
    }
  }
  ctx.fillStyle = '#de4b4b';
  for (const bot of sim.bots) {
    if (!bot.alive) continue;
    ctx.fillRect(ox + bot.x * scale - 1, oy + bot.y * scale - 1, 3, 3);
  }
  if (sim.boss?.alive) {
    ctx.fillStyle = '#ffd24a';
    ctx.fillRect(ox + sim.boss.x * scale - 2, oy + sim.boss.y * scale - 2, 5, 5);
  }
  ctx.fillStyle = deps.side === 't' ? '#e07a2f' : '#5aa7ff';
  ctx.beginPath();
  ctx.arc(ox + sim.x * scale, oy + sim.y * scale, 3, 0, Math.PI * 2);
  ctx.fill();
}
