import { B } from './mc-blocks';
import { hash3 } from './mc-noise';

export type Dimension = 'overworld' | 'nether' | 'end';
export const DIMENSIONS: Dimension[] = ['overworld', 'nether', 'end'];
export const DIMENSION_NAMES = {
  overworld: { en: 'Overworld', zh: '主世界' },
  nether: { en: 'The Nether', zh: '下界' },
  end: { en: 'The End', zh: '末地' },
};
export const stronghold = (seed: number) => ({
  x: 160 + (seed % 6) * 16,
  y: 36,
  z: 160 + ((seed >>> 4) % 6) * 16,
});
export const PORTAL_RING = [
  [-1, -2],
  [0, -2],
  [1, -2],
  [-1, 2],
  [0, 2],
  [1, 2],
  [-2, -1],
  [-2, 0],
  [-2, 1],
  [2, -1],
  [2, 0],
  [2, 1],
] as const;
export const PILLARS = Array.from({ length: 10 }, (_, i) => ({
  x: Math.round(Math.cos((i * Math.PI) / 5) * 32),
  z: Math.round(Math.sin((i * Math.PI) / 5) * 32),
  height: 74 + (i % 5) * 4,
}));

/** Pure chunk generation, independent of loading order and player edits. */
export function dimensionBlocks(
  dimension: Dimension,
  seed: number,
  cx: number,
  cz: number,
  blocks: Uint8Array,
) {
  const room = stronghold(seed);
  for (let z = 0; z < 16; z++)
    for (let x = 0; x < 16; x++) {
      const wx = cx * 16 + x,
        wz = cz * 16 + z;
      const set = (y: number, id: number) => {
        blocks[x + z * 16 + y * 256] = id;
      };
      if (dimension === 'overworld') {
        const dx = wx - room.x,
          dz = wz - room.z;
        if (Math.abs(dx) > 6 || Math.abs(dz) > 6) continue;
        for (let y = room.y - 1; y <= room.y + 5; y++)
          set(
            y,
            y === room.y - 1 || y === room.y + 5 || Math.abs(dx) === 6 || Math.abs(dz) === 6
              ? 47
              : B.air,
          );
        if (PORTAL_RING.some(([px, pz]) => px === dx && pz === dz)) set(room.y, B.endFrame);
        if (Math.abs(dx) === 5 && Math.abs(dz) === 5) set(room.y + 3, 38);
      } else if (dimension === 'nether') {
        const floor = Math.floor(38 + 7 * Math.sin(wx / 23) * Math.cos(wz / 29));
        for (let y = 0; y < 128; y++) {
          let id: number = B.air;
          if (y === 0 || y === 127) id = B.bedrock;
          else if (y <= floor || y >= 115 + Math.sin(wx / 19 + wz / 23) * 4) id = B.netherrack;
          if (y > floor && y < 34) id = B.lava;
          if (y === 112 && hash3(seed, wx, y, wz) < 0.03) id = 38;
          set(y, id);
        }
        // Repeating fortress bridges and crossing platforms, reachable from any portal.
        const fx = (((wx % 128) + 128) % 128) - 64;
        const fz = (((wz % 128) + 128) % 128) - 64;
        if (
          (Math.abs(fx) <= 3 || Math.abs(fz) <= 3) &&
          Math.max(Math.abs(fx), Math.abs(fz)) <= 42
        ) {
          for (let y = 47; y <= 53; y++) set(y, y < 49 ? B.netherBricks : B.air);
          if ((Math.abs(fx) === 3 && Math.abs(fz) > 4) || (Math.abs(fz) === 3 && Math.abs(fx) > 4))
            set(49, B.netherBricks);
        }
      } else {
        const dist = Math.hypot(wx, wz);
        const edge = 72 + Math.sin(wx / 11) * 4 + Math.cos(wz / 13) * 4;
        if (dist < edge) {
          const bottom = Math.max(15, Math.floor(32 + dist * 0.28));
          for (let y = bottom; y <= 62; y++) set(y, B.endStone);
        }
        for (const pillar of PILLARS)
          if (Math.hypot(wx - pillar.x, wz - pillar.z) <= 2.5) {
            for (let y = 60; y < pillar.height; y++) set(y, B.obsidian);
            if (wx === pillar.x && wz === pillar.z) set(pillar.height, B.bedrock);
          }
        if (Math.abs(wx) <= 3 && Math.abs(wz) <= 3) set(62, B.bedrock);
      }
    }
}
