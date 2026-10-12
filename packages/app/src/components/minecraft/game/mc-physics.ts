import { B, BLOCKS, collisionBoxes, doorBox, isLiquid, ladderBox, type Box } from './mc-blocks';
import type { World } from './mc-world';

export interface Body {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Full width and height of the axis-aligned box; x, z is the bottom centre. */
  w: number;
  h: number;
  onGround: boolean;
  collidedH: boolean;
  /** Vertical step the body can climb without jumping (0.6 for mobs and players). */
  step: number;
}

interface AABB {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
}

const boxesScratch: AABB[] = [];

/** Collision boxes of all blocks overlapping a region. */
function gatherBoxes(world: World, r: AABB, out: AABB[]) {
  out.length = 0;
  const x0 = Math.floor(r.x0);
  const x1 = Math.floor(r.x1);
  const y0 = Math.floor(r.y0) - 1;
  const y1 = Math.floor(r.y1);
  const z0 = Math.floor(r.z0);
  const z1 = Math.floor(r.z1);
  for (let x = x0; x <= x1; x++)
    for (let z = z0; z <= z1; z++) {
      if (!world.isLoaded(x, z)) {
        // Unloaded terrain acts as a wall so nothing falls out of the world.
        out.push({ x0: x, y0: -64, z0: z, x1: x + 1, y1: 512, z1: z + 1 });
        continue;
      }
      for (let y = y0; y <= y1; y++) {
        const id = world.getBlock(x, y, z);
        if (id === B.air) continue;
        const boxes = collisionBoxes(id, world.getMeta(x, y, z));
        if (!boxes) continue;
        for (const b of boxes) {
          const bx: AABB = {
            x0: x + b[0] / 16,
            y0: y + b[1] / 16,
            z0: z + b[2] / 16,
            x1: x + b[3] / 16,
            y1: y + (id === B.cactus ? 15 : b[4]) / 16,
            z1: z + b[5] / 16,
          };
          out.push(bx);
        }
      }
    }
  return out;
}

const overlaps = (a: AABB, b: AABB) =>
  a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0 && a.z0 < b.z1 && a.z1 > b.z0;

export function bodyBox(b: Body): AABB {
  const r = b.w / 2;
  return { x0: b.x - r, y0: b.y, z0: b.z - r, x1: b.x + r, y1: b.y + b.h, z1: b.z + r };
}

function clip(boxes: AABB[], box: AABB, axis: 0 | 1 | 2, d: number) {
  for (const o of boxes) {
    if (axis === 1) {
      if (box.x1 <= o.x0 || box.x0 >= o.x1 || box.z1 <= o.z0 || box.z0 >= o.z1) continue;
      if (d > 0 && box.y1 <= o.y0) d = Math.min(d, o.y0 - box.y1);
      else if (d < 0 && box.y0 >= o.y1) d = Math.max(d, o.y1 - box.y0);
    } else if (axis === 0) {
      if (box.y1 <= o.y0 || box.y0 >= o.y1 || box.z1 <= o.z0 || box.z0 >= o.z1) continue;
      if (d > 0 && box.x1 <= o.x0) d = Math.min(d, o.x0 - box.x1);
      else if (d < 0 && box.x0 >= o.x1) d = Math.max(d, o.x1 - box.x0);
    } else {
      if (box.x1 <= o.x0 || box.x0 >= o.x1 || box.y1 <= o.y0 || box.y0 >= o.y1) continue;
      if (d > 0 && box.z1 <= o.z0) d = Math.min(d, o.z0 - box.z1);
      else if (d < 0 && box.z0 >= o.z1) d = Math.max(d, o.z1 - box.z0);
    }
  }
  return d;
}

function shift(box: AABB, axis: 0 | 1 | 2, d: number) {
  if (axis === 0) {
    box.x0 += d;
    box.x1 += d;
  } else if (axis === 1) {
    box.y0 += d;
    box.y1 += d;
  } else {
    box.z0 += d;
    box.z1 += d;
  }
}

/** Swept move, Y then X then Z like the original, with step-up and sneak edge guard. */
export function move(
  world: World,
  b: Body,
  dx: number,
  dy: number,
  dz: number,
  sneakGuard = false,
) {
  const start = bodyBox(b);
  if (sneakGuard && b.onGround) {
    const probe = (ox: number, oz: number) => {
      const r: AABB = {
        ...start,
        x0: start.x0 + ox,
        x1: start.x1 + ox,
        z0: start.z0 + oz,
        z1: start.z1 + oz,
        y0: start.y0 - 1.01,
        y1: start.y0,
      };
      const boxes = gatherBoxes(world, r, []);
      return boxes.some((o) => overlaps(o, { ...r, y0: start.y0 - 0.6, y1: start.y0 - 0.001 }));
    };
    const stepSize = 0.05;
    while (dx !== 0 && !probe(dx, 0))
      dx = Math.abs(dx) < stepSize ? 0 : dx - Math.sign(dx) * stepSize;
    while (dz !== 0 && !probe(0, dz))
      dz = Math.abs(dz) < stepSize ? 0 : dz - Math.sign(dz) * stepSize;
    while (dx !== 0 && dz !== 0 && !probe(dx, dz)) {
      dx = Math.abs(dx) < stepSize ? 0 : dx - Math.sign(dx) * stepSize;
      dz = Math.abs(dz) < stepSize ? 0 : dz - Math.sign(dz) * stepSize;
    }
  }
  const region: AABB = {
    x0: Math.min(start.x0, start.x0 + dx) - 1,
    y0: Math.min(start.y0, start.y0 + dy) - 1,
    z0: Math.min(start.z0, start.z0 + dz) - 1,
    x1: Math.max(start.x1, start.x1 + dx) + 1,
    y1: Math.max(start.y1, start.y1 + dy) + b.step + 1,
    z1: Math.max(start.z1, start.z1 + dz) + 1,
  };
  const boxes = gatherBoxes(world, region, boxesScratch);
  const attempt = (sx: number, sy: number, sz: number) => {
    const box = { ...start };
    const my = clip(boxes, box, 1, sy);
    shift(box, 1, my);
    const mx = clip(boxes, box, 0, sx);
    shift(box, 0, mx);
    const mz = clip(boxes, box, 2, sz);
    shift(box, 2, mz);
    return { box, mx, my, mz };
  };
  let r = attempt(dx, dy, dz);
  const blocked = r.mx !== dx || r.mz !== dz;
  if (blocked && b.step > 0 && (b.onGround || (dy < 0 && r.my !== dy))) {
    // Try stepping up.
    const up = { ...start };
    const sy = clip(boxes, up, 1, b.step);
    shift(up, 1, sy);
    const sx = clip(boxes, up, 0, dx);
    shift(up, 0, sx);
    const sz = clip(boxes, up, 2, dz);
    shift(up, 2, sz);
    const down = clip(boxes, up, 1, -sy + Math.min(dy, 0));
    shift(up, 1, down);
    if (sx * sx + sz * sz > r.mx * r.mx + r.mz * r.mz + 1e-6)
      r = { box: up, mx: sx, my: up.y0 - start.y0, mz: sz };
  }
  b.x = (r.box.x0 + r.box.x1) / 2;
  b.y = r.box.y0;
  b.z = (r.box.z0 + r.box.z1) / 2;
  b.collidedH = Math.abs(r.mx - dx) > 1e-7 || Math.abs(r.mz - dz) > 1e-7;
  const vertical = Math.abs(r.my - dy) > 1e-7;
  b.onGround = vertical && dy < 0;
  if (Math.abs(r.mx - dx) > 1e-7) b.vx = 0;
  if (Math.abs(r.mz - dz) > 1e-7) b.vz = 0;
  if (vertical) b.vy = 0;
}

/** Whether a body intersects any solid block (used for placement checks). */
export function intersectsBlock(
  b: { x: number; y: number; z: number; w: number; h: number },
  bx: number,
  by: number,
  bz: number,
  box: Box,
) {
  const r = b.w / 2;
  return (
    b.x - r < bx + box[3] / 16 &&
    b.x + r > bx + box[0] / 16 &&
    b.y < by + box[4] / 16 &&
    b.y + b.h > by + box[1] / 16 &&
    b.z - r < bz + box[5] / 16 &&
    b.z + r > bz + box[2] / 16
  );
}

/** Fraction of the body submerged in a liquid, sampled at feet, waist and eyes. */
export function liquidAt(world: World, x: number, y: number, z: number, id: number) {
  const block = world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
  if (block !== id) return false;
  const meta = world.getMeta(Math.floor(x), Math.floor(y), Math.floor(z));
  const top = meta === 0 || meta === 8 ? 0.89 : (8 - meta) / 9;
  return (
    y - Math.floor(y) <= top + 0.02 ||
    world.getBlock(Math.floor(x), Math.floor(y) + 1, Math.floor(z)) === id
  );
}

export function climbableAt(world: World, b: Body) {
  return world.getBlock(Math.floor(b.x), Math.floor(b.y), Math.floor(b.z)) === B.ladder;
}

export interface RayHit {
  x: number;
  y: number;
  z: number;
  /** Face index hit (+X -X +Y -Y +Z -Z). */
  face: number;
  distance: number;
  id: number;
}

/** Outline box used for selection and ray tests, in 1/16 units. */
export function selectionBox(id: number, meta: number): Box {
  if (id === B.netherPortal && meta & 1) return [7, 0, 0, 9, 16, 16];
  const def = BLOCKS[id];
  switch (def.render) {
    case 'cross': {
      return [2, 0, 2, 14, 13, 14];
    }
    case 'crop': {
      return [0, 0, 0, 16, 2 + Math.min(7, meta) * 2, 16];
    }
    case 'torch': {
      if (meta === 0) return [6, 0, 6, 10, 10, 10];
      return meta === 1
        ? [5, 3, 11, 11, 13, 16]
        : meta === 2
          ? [0, 3, 5, 5, 13, 11]
          : meta === 3
            ? [5, 3, 0, 11, 13, 5]
            : [11, 3, 5, 16, 13, 11];
    }
    case 'door': {
      return doorBox(meta);
    }
    case 'ladder': {
      return ladderBox(meta);
    }
    default: {
      return def.boxes?.[0] ?? [0, 0, 0, 16, 16, 16];
    }
  }
}

function rayBox(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, b: AABB) {
  let tmin = -Infinity;
  let tmax = Infinity;
  let face = -1;
  const axes: [number, number, number, number, number, number][] = [
    [ox, dx, b.x0, b.x1, 1, 0],
    [oy, dy, b.y0, b.y1, 3, 2],
    [oz, dz, b.z0, b.z1, 5, 4],
  ];
  for (const [o, d, lo, hi, faceLo, faceHi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return null;
      continue;
    }
    let t1 = (lo - o) / d;
    let t2 = (hi - o) / d;
    let f1 = faceLo;
    if (t1 > t2) {
      [t1, t2] = [t2, t1];
      f1 = faceHi;
    }
    if (t1 > tmin) {
      tmin = t1;
      face = f1;
    }
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  return { t: Math.max(0, tmin), face };
}

/** Voxel ray cast (Amanatides-Woo) honouring partial block shapes. */
export function raycast(
  world: World,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  reach: number,
  hitFluids = false,
): RayHit | null {
  let x = Math.floor(ox);
  let y = Math.floor(oy);
  let z = Math.floor(oz);
  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);
  const stepZ = Math.sign(dz);
  const tDeltaX = stepX ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = stepY ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = stepZ ? Math.abs(1 / dz) : Infinity;
  let tMaxX = stepX > 0 ? (x + 1 - ox) * tDeltaX : stepX < 0 ? (ox - x) * tDeltaX : Infinity;
  let tMaxY = stepY > 0 ? (y + 1 - oy) * tDeltaY : stepY < 0 ? (oy - y) * tDeltaY : Infinity;
  let tMaxZ = stepZ > 0 ? (z + 1 - oz) * tDeltaZ : stepZ < 0 ? (oz - z) * tDeltaZ : Infinity;
  for (let i = 0; i < 64; i++) {
    const id = world.getBlock(x, y, z);
    if (id !== B.air) {
      const liquid = isLiquid(id);
      if (!liquid || (hitFluids && world.getMeta(x, y, z) === 0)) {
        const sb = liquid
          ? ([0, 0, 0, 16, 16, 16] as Box)
          : selectionBox(id, world.getMeta(x, y, z));
        const hit = rayBox(ox, oy, oz, dx, dy, dz, {
          x0: x + sb[0] / 16,
          y0: y + sb[1] / 16,
          z0: z + sb[2] / 16,
          x1: x + sb[3] / 16,
          y1: y + sb[4] / 16,
          z1: z + sb[5] / 16,
        });
        if (hit && hit.t <= reach) return { x, y, z, face: hit.face, distance: hit.t, id };
      }
    }
    const next = Math.min(tMaxX, tMaxY, tMaxZ);
    if (next > reach) return null;
    if (tMaxX === next) {
      x += stepX;
      tMaxX += tDeltaX;
    } else if (tMaxY === next) {
      y += stepY;
      tMaxY += tDeltaY;
    } else {
      z += stepZ;
      tMaxZ += tDeltaZ;
    }
  }
  return null;
}

/** Ray against an entity box; returns the distance or null. */
export function rayEntity(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  b: { x: number; y: number; z: number; w: number; h: number },
) {
  const r = b.w / 2 + 0.1;
  const hit = rayBox(ox, oy, oz, dx, dy, dz, {
    x0: b.x - r,
    y0: b.y - 0.1,
    z0: b.z - r,
    x1: b.x + r,
    y1: b.y + b.h + 0.1,
    z1: b.z + r,
  });
  return hit ? hit.t : null;
}
