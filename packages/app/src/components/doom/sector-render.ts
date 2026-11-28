import { ready, wall, worldColor, maps, type World } from './sector-world';
const path = '/decorative/doom/';
function picture(file: string) {
  const im = new Image();
  im.src = path + file;
  return im;
}
export const loadSectorArt = () => ({
  wall: picture('bulkheads.webp'),
  actors: picture('sector-sprites.webp'),
  tool: picture('emitters.webp'),
  sky: picture('phobos-sky.webp'),
});
type Art = ReturnType<typeof loadSectorArt>;
const loaded = (im: HTMLImageElement) => im.complete && im.naturalWidth > 0;
const terrain = new WeakMap<World, Map<string, HTMLCanvasElement>>();
const lightTables = new WeakMap<HTMLImageElement, Map<string, Uint32Array>>();
// Ray depth is still calculated for every original four-pixel strip. Composite the
// textured columns into one reusable surface instead of submitting ~165 blits per frame.
interface Film {
  draw: CanvasRenderingContext2D;
  image: ImageData;
  pixels: Uint32Array;
}
const films = new WeakMap<HTMLCanvasElement, Film>();
const horizons = new WeakMap<Art, Map<string, HTMLCanvasElement>>();
function wallFilm(target: HTMLCanvasElement, width: number, height: number) {
  const cached = films.get(target);
  if (cached && cached.image.width === width && cached.image.height === height) return cached;
  const sheet = document.createElement('canvas');
  sheet.width = width;
  sheet.height = height;
  const draw = sheet.getContext('2d');
  if (!draw) return null;
  const image = draw.createImageData(width, height);
  const film = { draw, image, pixels: new Uint32Array(image.data.buffer) };
  films.set(target, film);
  return film;
}
function wallTable(image: HTMLImageElement, accent: string) {
  if (!loaded(image)) return null;
  let byAccent = lightTables.get(image);
  if (!byAccent) {
    byAccent = new Map();
    lightTables.set(image, byAccent);
  }
  const old = byAccent.get(accent);
  if (old) return old;
  const sheet = document.createElement('canvas');
  sheet.width = 512;
  sheet.height = 8 * 128;
  const g = sheet.getContext('2d', { willReadFrequently: true });
  if (!g) return null;
  for (let i = 0; i < 8; i++) {
    const y = i * 128;
    g.drawImage(image, 0, y);
    g.fillStyle = `rgba(12,14,12,${0.11 + i * 0.083})`;
    g.fillRect(0, y, 512, 128);
    for (const col of [0, 2, 3]) {
      g.fillStyle = accent;
      g.globalAlpha = 0.56;
      g.fillRect(col * 128, y + 23, 128, 3);
      g.globalAlpha = 1;
      g.fillStyle = '#161d1d';
      g.fillRect(col * 128, y + 107, 128, 5);
      g.fillRect(col * 128, y, 3, 128);
    }
  }
  const pixels = new Uint32Array(g.getImageData(0, 0, sheet.width, sheet.height).data.buffer);
  byAccent.set(accent, pixels);
  return pixels;
}
export function drawSector(
  ctx: CanvasRenderingContext2D,
  w: World,
  art: Art,
  map: boolean,
  zh: boolean,
  still: boolean,
  contrast: boolean,
) {
  const W = ctx.canvas.width,
    H = ctx.canvas.height,
    P = w.player,
    ac = contrast ? '#fff' : worldColor(w.zone),
    white = '#f1ead3';
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 1;
  const mapdraw = (x: number, y: number, size: number, large: boolean) => {
    const cell = Math.min(size / 23, (large ? H - 36 : size) / 19);
    ctx.fillStyle = large ? '#101a1a' : '#0c1216ea';
    ctx.fillRect(x - 4, y - 4, cell * 23 + 8, cell * 19 + 8);
    ctx.strokeStyle = large ? '#54615b' : '#94856c';
    ctx.strokeRect(x - 4, y - 4, cell * 23 + 8, cell * 19 + 8);
    let surfaces = terrain.get(w);
    if (!surfaces) {
      surfaces = new Map();
      terrain.set(w, surfaces);
    }
    const cacheKey = `${cell}:${large}:${ac}`;
    let board = surfaces.get(cacheKey);
    if (!board) {
      board = document.createElement('canvas');
      board.width = Math.ceil(cell * 23 + 1);
      board.height = Math.ceil(cell * 19 + 1);
      const tile = board.getContext('2d');
      if (!tile) return;
      tile.fillStyle = large ? '#30433d' : '#344943';
      tile.strokeStyle = ac;
      tile.lineWidth = large ? 1.6 : 0.6;
      tile.beginPath();
      for (let j = 0; j < 19; j++)
        for (let i = 0; i < 23; i++)
          if (!w.grid[j][i]) {
            tile.fillRect(i * cell, j * cell, cell + 0.2, cell + 0.2);
            if (wall(w, i, j - 1)) {
              tile.moveTo(i * cell, j * cell);
              tile.lineTo((i + 1) * cell, j * cell);
            }
            if (wall(w, i - 1, j)) {
              tile.moveTo(i * cell, j * cell);
              tile.lineTo(i * cell, (j + 1) * cell);
            }
          }
      tile.stroke();
      surfaces.set(cacheKey, board);
    }
    ctx.drawImage(board, x, y);
    const dot = (u: number, v: number, color: string, r: number) => {
      ctx.fillStyle = color;
      ctx.fillRect(x + u * cell - r, y + v * cell - r, r * 2, r * 2);
    };
    for (const p of w.props)
      if (p.active && (large || p.type === 'exit' || p.type === 'key'))
        dot(
          p.x,
          p.y,
          p.type === 'exit'
            ? '#aaff90'
            : p.type === 'key'
              ? '#71cfff'
              : p.type === 'relay'
                ? '#f6b944'
                : '#beb891',
          large ? 3 : 1.5,
        );
    for (const m of w.mobs) if (m.hp > 0) dot(m.x, m.y, '#da6a57', large ? 2.5 : 1);
    ctx.save();
    ctx.translate(x + P.x * cell, y + P.y * cell);
    ctx.rotate(P.a);
    ctx.fillStyle = '#f5ffce';
    ctx.beginPath();
    ctx.moveTo(large ? 8 : 4, 0);
    ctx.lineTo(-3, large ? -4 : -2);
    ctx.lineTo(-2, large ? 4 : 2);
    ctx.fill();
    ctx.restore();
  };
  if (map) {
    ctx.fillStyle = '#121b1b';
    ctx.fillRect(0, 0, W, H);
    const size = Math.min(W * 0.77, ((H - 38) * 23) / 19),
      x = (W - size) / 2;
    mapdraw(x, 18, size, true);
    ctx.fillStyle = white;
    ctx.font = 'bold 12px monospace';
    ctx.fillText(
      zh ? '自动地图  /  蓝: 钥匙   绿: 出口' : 'AUTOMAP  /  BLUE: KEY   GREEN: EXIT',
      14,
      H - 8,
    );
    return;
  }
  const mid = Math.floor(H * 0.51),
    fov = 1.2,
    proj = W / (2 * Math.tan(fov / 2)),
    strip = Math.max(2, Math.ceil(W / 165)),
    depth: number[] = [];
  const lit = wallTable(art.wall, ac),
    columns = Math.ceil(W / strip),
    rows = Math.ceil(H / 2),
    film = lit && wallFilm(ctx.canvas, columns, rows);
  film?.pixels.fill(0);
  const faceX = Math.cos(P.a),
    faceY = Math.sin(P.a);
  // The sky, floor and grid never depend on camera pose; bake them once per room.
  let rooms = horizons.get(art);
  if (!rooms) {
    rooms = new Map();
    horizons.set(art, rooms);
  }
  const k = `${w.zone}:${W}:${H}:${loaded(art.sky)}`;
  let plate = rooms.get(k);
  if (!plate) {
    plate = document.createElement('canvas');
    plate.width = W;
    plate.height = H;
    const g = plate.getContext('2d', { alpha: false });
    if (!g) return;
    g.fillStyle = '#121b1b';
    g.fillRect(0, 0, W, H);
    g.imageSmoothingEnabled = false;
    if (loaded(art.sky))
      g.drawImage(art.sky, 0, 0, art.sky.width, art.sky.height * 0.5, 0, 0, W, mid);
    const mist = g.createLinearGradient(0, 0, 0, mid);
    mist.addColorStop(0, ['#1a12103a', '#1c493ec2', '#23444c9e', '#212439d9', '#48191dbf'][w.zone]);
    mist.addColorStop(1, ['#c6865170', '#8aa468a6', '#6b9e9b99', '#6f6388aa', '#d763418c'][w.zone]);
    g.fillStyle = mist;
    g.fillRect(0, 0, W, mid);
    const floor = g.createLinearGradient(0, mid, 0, H);
    floor.addColorStop(0, '#2f302b');
    floor.addColorStop(0.65, ['#4b493d', '#3a5142', '#3e5351', '#474352', '#553e33'][w.zone]);
    floor.addColorStop(1, '#272d2b');
    g.fillStyle = floor;
    g.fillRect(0, mid, W, H - mid);
    g.strokeStyle = '#a8a09338';
    g.lineWidth = 1;
    g.beginPath();
    for (let y = mid + 6; y < H; y = mid + (y - mid) * 1.52) {
      g.moveTo(0, y);
      g.lineTo(W, y);
    }
    for (let i = -5; i <= 5; i++) {
      g.moveTo(W * 0.52, mid);
      g.lineTo(W * 0.5 + i * W * 0.27, H);
    }
    g.stroke();
    rooms.set(k, plate);
  }
  ctx.drawImage(plate, 0, 0);
  for (let x = 0; x < W; x += strip) {
    const plane = (x + strip / 2 - W / 2) / proj,
      dx = faceX - plane * faceY,
      dy = faceY + plane * faceX,
      invX = 1 / Math.max(0.0001, Math.abs(dx)),
      invY = 1 / Math.max(0.0001, Math.abs(dy)),
      sx = dx < 0 ? -1 : 1,
      sy = dy < 0 ? -1 : 1;
    let gx = Math.floor(P.x),
      gy = Math.floor(P.y),
      tx = (dx < 0 ? P.x - gx : gx + 1 - P.x) / Math.max(0.0001, Math.abs(dx)),
      ty = (dy < 0 ? P.y - gy : gy + 1 - P.y) / Math.max(0.0001, Math.abs(dy)),
      side = 0,
      t = 0;
    for (let n = 0; n < 70; n++) {
      if (tx < ty) {
        gx += sx;
        t = tx;
        tx += invX;
        side = 0;
      } else {
        gy += sy;
        t = ty;
        ty += invY;
        side = 1;
      }
      if (wall(w, gx, gy)) break;
    }
    const d = Math.max(0.1, t),
      height = Math.min(H * 9, (proj * 0.94) / d),
      top = mid - height * 0.55,
      along = side ? P.x + dx * t : P.y + dy * t,
      u = along - Math.floor(along),
      panel = Math.abs((gx * 3 + gy + w.zone * 2) % 8),
      id = panel === 1 ? 1 : panel < 4 ? 0 : 2 + (w.zone % 2);
    depth.push(d);
    if (lit && film) {
      const col = Math.floor(x / strip),
        atlas =
          Math.min(7, Math.round(d * 0.4 + (side ? 1.45 : 0))) * 128 * 512 +
          id * 128 +
          (Math.trunc(u * 256) & 127),
        first = Math.max(0, Math.ceil((top - 1) / 2)),
        end = Math.min(rows, Math.ceil((top + height - 1) / 2)),
        stride = 512 / height;
      // Two world-anchored panels per bay. A close metal wall still reads as
      // door seams and rivets instead of a handful of enlarged atlas pixels.
      let v = ((first * 2 + 1 - top) * 256) / height;
      for (let j = first; j < end; j++, v += stride)
        film.pixels[j * columns + col] = lit[atlas + (Math.trunc(v) & 127) * 512];
    } else {
      ctx.fillStyle = side ? '#675b48' : '#81735c';
      ctx.fillRect(x, top, strip, height);
    }
  }
  if (film) {
    film.draw.putImageData(film.image, 0, 0);
    ctx.drawImage(film.draw.canvas, 0, 0, W, H);
  }
  const objects = [
    ...w.mobs
      .filter((m) => m.hp > 0)
      .map((m) => ({
        x: m.x,
        y: m.y,
        s:
          m.kind === 3
            ? 2
            : m.kind === 2
              ? 0
              : m.kind === 0 && !still && Math.sin(w.time * 4 + m.phase) > 0.35
                ? 8
                : m.kind,
        scale: m.kind === 3 ? 1.21 : 0.84,
        tag: m.kind === 3 ? 'boss' : 'mob',
      })),
    ...w.props
      .filter((p) => p.active)
      .map((p) => ({
        x: p.x,
        y: p.y,
        s: p.type === 'key' ? 4 + (w.zone % 3) : p.type === 'med' ? 7 : 3,
        scale: p.type === 'key' ? 0.6 : 0.74,
        tag: p.type,
      })),
    ...w.rays.map((p) => ({ x: p.x, y: p.y, s: 0, scale: 0.15, tag: 'ray' })),
  ]
    .map((o) => {
      const dx = o.x - P.x,
        dy = o.y - P.y;
      return {
        ...o,
        d: dx * faceX + dy * faceY,
        side: -dx * faceY + dy * faceX,
      };
    })
    .filter((o) => o.d > 0.16)
    .sort((a, b) => b.d - a.d);
  for (const o of objects) {
    const cx = W / 2 + (o.side * proj) / o.d,
      h = Math.min(H * 3, (proj * o.scale) / o.d),
      wid = h * 0.89,
      x = cx - wid / 2,
      y = mid + (proj * 0.4) / o.d - h;
    if (
      cx + wid < 0 ||
      cx - wid > W ||
      o.d > (depth[Math.max(0, Math.min(depth.length - 1, Math.floor(cx / strip)))] || 0) + 0.1
    )
      continue;
    if (o.tag === 'ray') {
      ctx.fillStyle = '#ffbd58';
      ctx.beginPath();
      ctx.arc(cx, y, Math.max(2, h * 0.26), 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    if (o.tag === 'exit' || o.tag === 'relay' || o.tag === 'secret') {
      ctx.fillStyle = o.tag === 'exit' ? '#253e38' : '#423b2d';
      ctx.fillRect(cx - wid * 0.29, y + h * 0.2, wid * 0.58, h * 0.8);
      ctx.strokeStyle = o.tag === 'exit' ? '#abff92' : '#e4ad62';
      ctx.lineWidth = Math.max(1, h * 0.025);
      ctx.strokeRect(cx - wid * 0.24, y + h * 0.26, wid * 0.48, h * 0.63);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.font = `bold ${Math.max(7, h * 0.11)}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(
        o.tag === 'exit' ? (zh ? '出口' : 'EXIT') : o.tag === 'relay' ? 'KV' : '?',
        cx,
        y + h * 0.59,
      );
      ctx.textAlign = 'left';
      continue;
    }
    if (loaded(art.actors)) ctx.drawImage(art.actors, o.s * 80, 0, 80, 90, x, y, wid, h);
    if (o.tag === 'boss') {
      const boss = w.mobs.find((m) => m.kind === 3);
      const open =
        w.relays >= 2 && Math.sin(w.time * (boss && boss.hp <= boss.max / 2 ? 2.2 : 1.45)) <= 0.72;
      ctx.strokeStyle = '#ff9c50';
      ctx.strokeRect(cx - wid * 0.42, y + 2, wid * 0.84, 3);
      ctx.fillStyle = open ? '#c6eaa6' : '#f58e69';
      ctx.fillRect(cx - wid * 0.42, y + 2, wid * 0.84 * (boss ? boss.hp / boss.max : 1), 3);
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(
        open
          ? zh
            ? '监工 / 暴露'
            : 'OVERSEER / EXPOSED'
          : zh
            ? '监工 / 护盾'
            : 'OVERSEER / SHIELDED',
        cx,
        Math.max(26, y - 2),
      );
      ctx.textAlign = 'left';
    }
  }
  if (loaded(art.tool)) {
    const sway = still ? 0 : Math.sin(w.time * 3) * 2,
      h = H * 0.47,
      wid = h * 1.333;
    ctx.drawImage(
      art.tool,
      (w.kit === 0 ? 1 : w.kit === 1 ? 0 : 2) * 128,
      0,
      128,
      96,
      W / 2 - wid / 2 + sway,
      H - h + (w.flash > 0 ? 4 : 0),
      wid,
      h,
    );
  }
  const cx = W / 2,
    cy = mid;
  ctx.strokeStyle = w.flash > 0 ? '#fff38c' : '#cad5b4';
  ctx.lineWidth = 1;
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    ctx.beginPath();
    ctx.moveTo(cx + dx * 4, cy + dy * 4);
    ctx.lineTo(cx + dx * 9, cy + dy * 9);
    ctx.stroke();
  }
  if (!still && w.hurt > 0) {
    ctx.strokeStyle = '#c85847';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, W - 4, H - 4);
  }
  mapdraw(W - Math.min(104, W * 0.19) - 7, 10, Math.min(104, W * 0.19), false);
  ctx.font = 'bold 10px monospace';
  ctx.fillStyle = white;
  ctx.fillText(`UAC / E1M${maps[w.zone]}`, 10, 18);
  if (ready(w)) {
    ctx.fillStyle = '#b1fa9b';
    ctx.fillText(zh ? '出口已启用' : 'EXIT ONLINE', 10, 32);
  }
}
