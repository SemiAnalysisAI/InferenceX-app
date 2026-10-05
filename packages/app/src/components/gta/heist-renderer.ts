import { type HeistState, objective } from './heist-engine';
import {
  BAY,
  BUILDINGS,
  OFFICES,
  ROADS,
  SAFEHOUSE,
  WORLD,
  routeTo,
  type Point,
} from './heist-world';

const line = (ctx: CanvasRenderingContext2D, points: Point[]) => {
  ctx.beginPath();
  for (const [i, p] of points.entries()) {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
};

export function makeMap() {
  const map = document.createElement('canvas');
  map.width = WORLD.width;
  map.height = WORLD.height;
  const ctx = map.getContext('2d');
  if (!ctx) return map;
  ctx.fillStyle = '#647264';
  ctx.fillRect(0, 0, map.width, map.height);
  // Hills and parkland use a deterministic pattern, not per-frame randomness.
  for (let i = 0; i < 600; i++) {
    const x = (i * 173) % WORLD.width;
    const y = (i * 317) % WORLD.height;
    ctx.fillStyle = i % 2 ? '#566958' : '#72806a';
    ctx.beginPath();
    ctx.ellipse(x, y, 28 + (i % 50), 18 + (i % 35), i, 0, Math.PI * 2);
    ctx.fill();
  }
  line(ctx, BAY);
  ctx.closePath();
  ctx.fillStyle = '#2d5d62';
  ctx.fill();
  ctx.lineWidth = 15;
  ctx.strokeStyle = '#afba9c';
  ctx.stroke();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = '#ffffff0d';
  ctx.lineWidth = 2;
  for (let y = 70; y < 1400; y += 30) {
    ctx.beginPath();
    ctx.moveTo(500, y);
    ctx.lineTo(2100, y - 150);
    ctx.stroke();
  }
  ctx.restore();
  for (const b of BUILDINGS) {
    ctx.fillStyle = '#25343260';
    ctx.fillRect(b.x + 10, b.y + 12, b.w, b.h);
    ctx.fillStyle = ['#9a9b8d', '#b0ac95', '#8f9c99'][b.tone];
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = '#566762';
    ctx.fillRect(b.x + 5, b.y + 5, b.w - 10, b.h - 10);
    ctx.fillStyle = '#a6b4ad';
    ctx.fillRect(b.x + 10, b.y + 9, 13, 9);
    ctx.fillStyle = '#f4e6c329';
    ctx.fillRect(b.x, b.y, b.w, 3);
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const road of ROADS) {
    line(ctx, road);
    ctx.strokeStyle = '#bbc0a2';
    ctx.lineWidth = 68;
    ctx.stroke();
    ctx.strokeStyle = '#343d3f';
    ctx.lineWidth = 55;
    ctx.stroke();
    ctx.strokeStyle = '#b3ac75';
    ctx.lineWidth = 2;
    ctx.setLineDash([14, 13]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for (const office of OFFICES) {
    ctx.fillStyle = '#313e3d';
    ctx.fillRect(office.x - 65, office.y - 118, 130, 57);
    ctx.fillStyle = office.color;
    ctx.fillRect(office.x - 65, office.y - 118, 130, 5);
    ctx.fillStyle = '#7c99976b';
    for (let i = 0; i < 7; i++) ctx.fillRect(office.x - 52 + i * 16, office.y - 104, 9, 24);
    ctx.font = 'bold 17px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(office.name, office.x, office.y - 132);
  }
  ctx.font = '600 21px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f7f1d28c';
  for (const [name, x, y] of [
    ['SAN FRANCISCO', 410, 100],
    ['OAKLAND', 1860, 390],
    ['SAN MATEO', 720, 1000],
    ['MENLO PARK', 780, 1260],
    ['SAN JOSE', 1910, 1820],
  ] as const)
    ctx.fillText(name, x, y);
  ctx.save();
  ctx.translate(1370, 740);
  ctx.rotate(-0.5);
  ctx.font = 'italic 36px serif';
  ctx.fillStyle = '#dbede854';
  ctx.fillText('San Francisco Bay', 0, 0);
  ctx.restore();
  ctx.font = 'bold 15px sans-serif';
  ctx.fillStyle = '#dbe2d0';
  ctx.fillText('BAY BRIDGE', 1200, 395);
  ctx.fillText('SAN MATEO BRIDGE', 1510, 916);
  ctx.fillText('DUMBARTON BRIDGE', 1590, 1202);
  return map;
}

export function camera(state: HeistState, w: number, h: number, overview: boolean) {
  const scale = overview
    ? Math.min(w / WORLD.width, h / WORLD.height) * 0.94
    : w < 600
      ? 0.9
      : 1.13;
  return {
    scale,
    x: overview ? w / 2 - (WORLD.width * scale) / 2 : w / 2 - state.car.x * scale,
    y: overview ? h / 2 - (WORLD.height * scale) / 2 : h * 0.56 - state.car.y * scale,
  };
}

function drawCar(ctx: CanvasRenderingContext2D, p: Point, angle: number, cop = false) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(angle);
  ctx.fillStyle = '#00000055';
  ctx.fillRect(-19, -9, 43, 23);
  ctx.fillStyle = '#171a1b';
  for (const x of [-13, 10]) {
    ctx.fillRect(x, -15, 9, 5);
    ctx.fillRect(x, 10, 9, 5);
  }
  ctx.fillStyle = cop ? '#e5ebe7' : '#bce18a';
  ctx.beginPath();
  ctx.roundRect(-22, -11, 44, 22, 5);
  ctx.fill();
  ctx.fillStyle = cop ? '#252e38' : '#8db563';
  ctx.fillRect(-10, -9, 20, 18);
  ctx.fillStyle = '#183d45';
  ctx.fillRect(4, -8, 7, 16);
  ctx.fillRect(-14, -7, 4, 14);
  ctx.fillStyle = '#f8f7d7';
  ctx.fillRect(19, -9, 3, 5);
  ctx.fillRect(19, 4, 3, 5);
  ctx.fillStyle = '#fa7055';
  ctx.fillRect(-22, -9, 3, 4);
  ctx.fillRect(-22, 5, 3, 4);
  if (cop) {
    ctx.fillStyle = '#fa6370';
    ctx.fillRect(-2, -8, 5, 8);
    ctx.fillStyle = '#60b8ff';
    ctx.fillRect(-2, 0, 5, 8);
  }
  ctx.restore();
}

export function renderHeist(
  ctx: CanvasRenderingContext2D,
  map: HTMLCanvasElement,
  state: HeistState,
  w: number,
  h: number,
  overview: boolean,
) {
  const view = camera(state, w, h, overview);
  ctx.fillStyle = '#273837';
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(view.x, view.y);
  ctx.scale(view.scale, view.scale);
  ctx.drawImage(map, 0, 0);
  line(ctx, routeTo(state.car, objective(state)));
  ctx.strokeStyle = '#d6a5ffba';
  ctx.lineWidth = overview ? 9 : 5;
  ctx.setLineDash([14, 8]);
  ctx.stroke();
  ctx.setLineDash([]);
  for (const point of state.skid) {
    ctx.fillStyle = '#15221c55';
    ctx.fillRect(point.x - 3, point.y - 3, 6, 6);
  }
  for (const stop of [
    ...OFFICES,
    { ...SAFEHOUSE, id: 'safehouse', name: 'SAFEHOUSE', color: '#c8ed80' },
  ]) {
    const collected = state.collected.includes(stop.id);
    const active = objective(state).id === stop.id;
    ctx.beginPath();
    ctx.arc(stop.x, stop.y, active ? 65 : 38, 0, Math.PI * 2);
    ctx.fillStyle = collected ? '#a8da6225' : `${stop.color}25`;
    ctx.fill();
    ctx.strokeStyle = active ? '#e4efa1' : `${stop.color}99`;
    ctx.lineWidth = active ? 4 : 2;
    ctx.stroke();
    ctx.fillStyle = collected ? '#7eb473' : stop.color;
    ctx.fillRect(stop.x - 12, stop.y - 12, 24, 24);
    ctx.strokeStyle = '#182728';
    ctx.lineWidth = 3;
    ctx.strokeRect(stop.x - 7, stop.y - 7, 14, 14);
    if (overview || stop.id === 'safehouse') {
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#101a18';
      ctx.fillRect(stop.x - 85, stop.y + 43, 170, 30);
      ctx.fillStyle = '#f7f7e9';
      ctx.fillText(stop.name, stop.x, stop.y + 65);
    }
  }
  for (const cop of state.police)
    drawCar(ctx, cop, Math.atan2(state.car.y - cop.y, state.car.x - cop.x), true);
  drawCar(ctx, state.car, state.car.angle);
  ctx.restore();
  if (overview) return;
  const mw = w < 600 ? 115 : 190;
  const mh = (mw * WORLD.height) / WORLD.width;
  const x = 16;
  const y = h - mh - 18;
  ctx.fillStyle = '#07100de8';
  ctx.fillRect(x - 4, y - 4, mw + 8, mh + 8);
  ctx.globalAlpha = 0.94;
  ctx.drawImage(map, x, y, mw, mh);
  ctx.globalAlpha = 1;
  const sx = mw / WORLD.width;
  const sy = mh / WORLD.height;
  for (const stop of OFFICES) {
    ctx.fillStyle = state.collected.includes(stop.id) ? '#8fb976' : stop.color;
    ctx.fillRect(x + stop.x * sx - 2, y + stop.y * sy - 2, 4, 4);
  }
  const goal = objective(state);
  ctx.strokeStyle = '#e2adff';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + goal.x * sx - 5, y + goal.y * sy - 5, 10, 10);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x + state.car.x * sx, y + state.car.y * sy, 4, 0, Math.PI * 2);
  ctx.fill();
}
