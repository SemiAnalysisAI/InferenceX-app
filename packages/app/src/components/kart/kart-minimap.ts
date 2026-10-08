import { isCourseSurface, type SurfaceMap } from './kart-surface';

export function paintMapBase(surface: SurfaceMap, size: number) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) return { canvas: c, toMap: (x: number, z: number) => [x, z] as const };
  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (let j = 0; j < surface.height; j++)
    for (let i = 0; i < surface.width; i++) {
      const t = surface.type[j * surface.width + i];
      if (!isCourseSurface(t)) continue;
      minX = Math.min(minX, i);
      maxX = Math.max(maxX, i);
      minZ = Math.min(minZ, j);
      maxZ = Math.max(maxZ, j);
    }
  const pad = 8;
  const scale = (size - pad * 2) / Math.max(maxX - minX + 1, maxZ - minZ + 1);
  const ox = pad + (size - pad * 2 - (maxX - minX + 1) * scale) / 2;
  const oz = pad + (size - pad * 2 - (maxZ - minZ + 1) * scale) / 2;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = Math.floor((x - ox) / scale) + minX;
      const j = Math.floor((y - oz) / scale) + minZ;
      if (i < 0 || j < 0 || i >= surface.width || j >= surface.height) continue;
      const t = surface.type[j * surface.width + i];
      const o = (y * size + x) * 4;
      if (isCourseSurface(t)) {
        img.data[o] = 245;
        img.data[o + 1] = 246;
        img.data[o + 2] = 250;
        img.data[o + 3] = 235;
      }
    }
  ctx.putImageData(img, 0, 0);
  // Darken the outline for legibility.
  ctx.globalCompositeOperation = 'destination-over';
  ctx.shadowColor = '#0b1830';
  ctx.shadowBlur = 0;
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ])
    ctx.drawImage(c, dx * 1.5, dy * 1.5);
  const toMap = (x: number, z: number) =>
    [
      ox + ((x - surface.x0) / surface.res - minX) * scale,
      oz + ((z - surface.z0) / surface.res - minZ) * scale,
    ] as const;
  return { canvas: c, toMap };
}
