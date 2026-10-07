import { GROUND, ROAD, type Point, type World } from './gta-world';

// Raster map of San Fierro drawn once from the same OpenStreetMap data as the
// 3D city, then cropped and rotated for the radar.

export const MAP_SCALE = 4; // metres per pixel

const COLORS: Record<number, [number, number, number]> = {
  [GROUND.urban]: [222, 219, 210],
  [GROUND.grass]: [176, 205, 150],
  [GROUND.sand]: [233, 222, 186],
  [GROUND.water]: [118, 166, 196],
  [GROUND.pier]: [205, 200, 190],
  [GROUND.dryGrass]: [210, 205, 160],
  [GROUND.forest]: [143, 181, 125],
  [GROUND.plaza]: [230, 226, 216],
  [GROUND.parking]: [214, 210, 202],
  [GROUND.sidewalk]: [228, 225, 218],
};

export function drawCityMap(world: World) {
  const w = Math.ceil((world.x1 - world.x0) / MAP_SCALE),
    h = Math.ceil((world.z1 - world.z0) / MAP_SCALE);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const x = world.x0 + (i + 0.5) * MAP_SCALE,
        z = world.z0 + (j + 0.5) * MAP_SCALE;
      const c = COLORS[world.ground(x, z)] ?? COLORS[0];
      const o = (j * w + i) * 4;
      img.data[o] = c[0];
      img.data[o + 1] = c[1];
      img.data[o + 2] = c[2];
      img.data[o + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  const px = (x: number) => (x - world.x0) / MAP_SCALE,
    pz = (z: number) => (z - world.z0) / MAP_SCALE;
  ctx.fillStyle = '#b9b5ab';
  for (const b of world.buildings) {
    ctx.beginPath();
    for (let k = 0; k < b.pts.length; k += 2) {
      if (k) ctx.lineTo(px(b.pts[k]), pz(b.pts[k + 1]));
      else ctx.moveTo(px(b.pts[k]), pz(b.pts[k + 1]));
    }
    ctx.fill();
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const order = [
    ROAD.service,
    ROAD.residential,
    ROAD.tertiary,
    ROAD.secondary,
    ROAD.primary,
    ROAD.trunk,
    ROAD.motorway,
  ];
  for (const cls of order) {
    ctx.strokeStyle = cls <= ROAD.trunk ? '#f2c76b' : cls <= ROAD.secondary ? '#fbf3dc' : '#ffffff';
    for (const r of world.roads) {
      if (r.cls !== cls) continue;
      ctx.lineWidth = Math.max(1, r.width / MAP_SCALE);
      ctx.beginPath();
      for (let k = 0; k < r.pts.length; k += 2) {
        if (k) ctx.lineTo(px(r.pts[k]), pz(r.pts[k + 1]));
        else ctx.moveTo(px(r.pts[k]), pz(r.pts[k + 1]));
      }
      ctx.stroke();
    }
  }
  return canvas;
}

export interface RadarMarks {
  player: Point & { angle: number };
  target: Point;
  police: Point[];
  route?: Point[];
}

/** Rotating GTA-style radar: north follows the player's heading. */
export function paintRadar(
  out: HTMLCanvasElement,
  map: HTMLCanvasElement,
  world: World,
  m: RadarMarks,
  radius = 260,
) {
  const ctx = out.getContext('2d');
  if (!ctx) return;
  const size = out.width;
  const k = size / (radius * 2);
  ctx.save();
  ctx.fillStyle = '#76a6c4';
  ctx.fillRect(0, 0, size, size);
  ctx.translate(size / 2, size / 2);
  // Heading up: rotate the world so the player's facing points to the top.
  ctx.rotate(m.player.angle - Math.PI);
  ctx.scale(k * MAP_SCALE, k * MAP_SCALE);
  ctx.translate(-(m.player.x - world.x0) / MAP_SCALE, -(m.player.z - world.z0) / MAP_SCALE);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(map, 0, 0);
  if (m.route?.length) {
    ctx.strokeStyle = '#a94cff';
    ctx.lineWidth = 3 / (k * MAP_SCALE);
    ctx.beginPath();
    m.route.forEach((p, i) => {
      const x = (p.x - world.x0) / MAP_SCALE;
      const y = (p.z - world.z0) / MAP_SCALE;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.stroke();
  }
  ctx.restore();
  // Target blip (clamped to the edge) and police.
  const toRadar = (p: Point) => {
    const dx = p.x - m.player.x,
      dz = p.z - m.player.z;
    const a = -(m.player.angle - Math.PI);
    const rx = dx * Math.cos(-a) - dz * Math.sin(-a),
      rz = dx * Math.sin(-a) + dz * Math.cos(-a);
    let x = size / 2 + rx * k,
      y = size / 2 + rz * k;
    const d = Math.hypot(x - size / 2, y - size / 2);
    const max = size / 2 - 8;
    if (d > max) {
      x = size / 2 + ((x - size / 2) / d) * max;
      y = size / 2 + ((y - size / 2) / d) * max;
    }
    return { x, y };
  };
  ctx.fillStyle = '#ef5c68';
  for (const p of m.police) {
    const q = toRadar(p);
    ctx.fillRect(q.x - 3, q.y - 3, 6, 6);
  }
  const t = toRadar(m.target);
  ctx.fillStyle = '#ffd23f';
  ctx.strokeStyle = '#3b2e00';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(t.x, t.y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#000';
  ctx.beginPath();
  ctx.moveTo(size / 2, size / 2 - 8);
  ctx.lineTo(size / 2 - 6, size / 2 + 6);
  ctx.lineTo(size / 2 + 6, size / 2 + 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

/** Whole-city overview with numbered mission stops. */
export function paintOverview(
  out: HTMLCanvasElement,
  map: HTMLCanvasElement,
  world: World,
  stops: Point[],
  done: number,
  player: Point,
) {
  const ctx = out.getContext('2d');
  if (!ctx) return;
  const sx = out.width / map.width,
    sy = out.height / map.height;
  const s = Math.min(sx, sy);
  ctx.fillStyle = '#76a6c4';
  ctx.fillRect(0, 0, out.width, out.height);
  const ox = (out.width - map.width * s) / 2,
    oy = (out.height - map.height * s) / 2;
  ctx.drawImage(map, ox, oy, map.width * s, map.height * s);
  const at = (p: Point) => ({
    x: ox + ((p.x - world.x0) / MAP_SCALE) * s,
    y: oy + ((p.z - world.z0) / MAP_SCALE) * s,
  });
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  stops.forEach((p, i) => {
    const q = at(p);
    ctx.fillStyle = i < done ? '#6b7280' : '#ffd23f';
    ctx.beginPath();
    ctx.arc(q.x, q.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.fillText(String(i + 1), q.x, q.y + 0.5);
  });
  const q = at(player);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#000';
  ctx.beginPath();
  ctx.arc(q.x, q.y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}
