import { describe, expect, it } from 'vitest';
import { B } from './mc-blocks';
import { PORTAL_RING, stronghold } from './mc-dimensions';
import { Game, NO_INPUT } from './mc-game';
import { craft } from './mc-items';
import { newWorldMeta, restore, serialize } from './mc-save';
import { World } from './mc-world';

const stack = (id: string) => ({ id, count: 1 });

function game() {
  const g = new Game({ seed: '2', name: 'Endgame test', mode: 'survival', difficulty: 'normal' });
  g.renderDistance = 1;
  g.streamChunks(Infinity, () => 0);
  return g;
}
function portal(g: Game, axis: 'x' | 'z' = 'x') {
  const x = Math.floor(g.player.x),
    z = Math.floor(g.player.z),
    y = 100;
  for (let a = -1; a <= 2; a++)
    for (let b = -1; b <= 3; b++)
      g.world.setBlock(
        x + (axis === 'x' ? a : 0),
        y + b,
        z + (axis === 'z' ? a : 0),
        a === -1 || a === 2 || b === -1 || b === 3 ? B.obsidian : B.air,
        0,
        false,
      );
  return { x, y, z };
}
function enter(g: Game, id: number) {
  const p = g.player;
  g.world.setBlock(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z), id, 0, false);
  g.endgame.portalCooldown = 0;
  for (let i = 0; i < (id === B.netherPortal ? 60 : 1); i++) g.endgame.tick();
}

describe('Minecraft endgame progression', () => {
  it.each([1, 2])('lights diagonal mesh dependencies at render distance %s', (distance) => {
    const g = game();
    g.renderDistance = distance;
    g.endgame.travel('end', [0.5, 63, 0.5]);
    g.streamChunks(Infinity, () => 0);
    // All nine spawn meshes require the surrounding five-by-five lit area.
    for (let x = -2; x <= 2; x++)
      for (let z = -2; z <= 2; z++) expect(g.world.chunkAt(x * 16, z * 16)?.lit).toBe(true);
  });
  it.each(['x', 'z'] as const)('ignites only complete obsidian frames along %s', (axis) => {
    const g = game(),
      { x, y, z } = portal(g, axis);
    const dx = axis === 'x' ? -1 : 0,
      dz = axis === 'z' ? -1 : 0;
    g.world.setBlock(x + dx, y + 1, z + dz, B.air, 0, false);
    expect(g.endgame.ignite(x, y, z)).toBe(false);
    g.world.setBlock(x + dx, y + 1, z + dz, B.obsidian, 0, false);
    expect(g.endgame.ignite(x, y, z)).toBe(true);
    expect(g.world.getBlock(x, y + 2, z)).toBe(B.netherPortal);
  });

  it('travels through Nether portals without losing inventory, terrain or containers', () => {
    const g = game(),
      { x, y, z } = portal(g);
    g.endgame.ignite(x, y, z);
    Object.assign(g.player, { x: x + 0.5, y, z: z + 0.5 });
    g.inventory[0] = { id: 'diamond', count: 3 };
    g.chests.set('1,2,3', [{ id: 'iron_ingot', count: 8 }]);
    const home = g.world;
    enter(g, B.netherPortal);
    expect(g.dimension).toBe('nether');
    expect(home.chunks.size).toBe(0);
    expect(g.chests.size).toBe(0);
    expect(g.inventory[0]?.count).toBe(3);
    expect(g.endgame.portalCooldown).toBe(100);
    const destination = g.endgame.progress.netherPortal!;
    Object.assign(g.player, {
      x: destination[0] + 0.5,
      y: destination[1],
      z: destination[2] + 0.5,
    });
    enter(g, B.netherPortal);
    expect(g.dimension).toBe('overworld');
    expect(g.world).toBe(home);
    expect(g.chests.get('1,2,3')?.[0]?.count).toBe(8);
    expect(g.world.getBlock(x, y, z)).toBe(B.netherPortal);
  });

  it('generates deterministic dimensions, fortresses, a stronghold and a real End void', () => {
    const a = new World(2, 'nether'),
      b = new World(2, 'nether');
    expect(a.ensureChunk(4, 4).blocks).toEqual(b.ensureChunk(4, 4).blocks);
    expect(a.getBlock(64, 48, 64)).toBe(B.netherBricks);
    const end = new World(2, 'end');
    end.ensureChunk(0, 0);
    expect(end.getBlock(4, 62, 4)).toBe(B.endStone);
    expect(end.getBlock(0, -1, 0)).toBe(B.air);
    expect([...end.ensureChunk(20, 20).blocks].every((id) => id === B.air)).toBe(true);
    const overworld = new World(2),
      target = stronghold(2);
    overworld.ensureChunk(target.x >> 4, target.z >> 4);
    expect(overworld.getBlock(target.x, target.y - 1, target.z)).toBe(B.stoneBricks);
    expect(overworld.getBlock(target.x, target.y + 5, target.z)).toBe(B.stoneBricks);
    for (const [dx, dz] of PORTAL_RING) {
      overworld.ensureChunk((target.x + dx) >> 4, (target.z + dz) >> 4);
      expect(overworld.getBlock(target.x + dx, target.y, target.z + dz)).toBe(B.endFrame);
    }
  });

  it('crafts progression ingredients and requires all twelve eyes before opening the End', () => {
    expect(craft([stack('blaze_rod'), null, null, null], 2)).toEqual({
      id: 'blaze_powder',
      count: 2,
    });
    expect(craft([stack('blaze_powder'), stack('ender_pearl'), null, null], 2)).toEqual({
      id: 'ender_eye',
      count: 1,
    });
    const g = game(),
      target = stronghold(g.seedNumber);
    g.endgame.travel('overworld', [target.x, target.y + 1, target.z]);
    g.inventory[0] = { id: 'ender_eye', count: 12 };
    PORTAL_RING.forEach(([dx, dz], i) => {
      g.target = {
        x: target.x + dx,
        y: target.y,
        z: target.z + dz,
        id: B.endFrame,
        face: 2,
        distance: 2,
      };
      expect(g.endgame.use()).toBe(true);
      if (i < 11) expect(g.world.getBlock(target.x, target.y, target.z)).toBe(B.air);
    });
    expect(g.world.getBlock(target.x, target.y, target.z)).toBe(B.endPortal);
    expect(g.inventory[0]).toBeNull();
  });

  it('spawns a single persistent dragon, heals with crystals, unlocks the ending once', () => {
    const g = game();
    g.endgame.travel('end', [45, 64, 0]);
    const dragon = g.entities.find((e) => e.kind === 'dragon')!;
    expect(g.entities.filter((e) => e.kind === 'crystal')).toHaveLength(10);
    dragon.health = 100;
    g.ticks = 20;
    g.endgame.tickEntity(dragon);
    expect(dragon.health).toBe(101);
    for (const crystal of g.entities.filter((e) => e.kind === 'crystal')) {
      g.hurtEntity(crystal, 1, 0, 0, 'player');
    }
    dragon.invulnerable = 0;
    g.hurtEntity(dragon, 200, 0, 0, 'player');
    const level = g.player.level;
    expect(g.endgame.progress.dragonDefeated).toBe(true);
    expect(g.world.getBlock(0, 63, 0)).toBe(B.endPortal);
    g.hurtEntity(dragon, 200, 0, 0, 'player');
    expect(g.player.level).toBe(level);
    Object.assign(g.player, { x: 0.5, y: 63, z: 0.5 });
    enter(g, B.endPortal);
    expect(g.dimension).toBe('overworld');
    expect(g.endgame.progress.completed).toBe(true);
    expect(g.events.some((e) => e.type === 'ending')).toBe(true);
    g.endgame.travel('end', [45, 64, 0]);
    expect(g.entities.filter((e) => e.kind === 'dragon' && e.health > 0)).toHaveLength(0);
  });

  it('saves inactive dimensions, boss health, removed crystals and open-cursor inventory', () => {
    const g = game();
    g.world.ensureChunk(0, 0);
    g.world.setBlock(0, 100, 0, B.diamondOre, 0, false);
    g.endgame.travel('nether', [64, 49, 64]);
    g.chests.set('64,49,64', [{ id: 'blaze_rod', count: 6 }]);
    g.endgame.travel('end', [45, 64, 0]);
    const dragon = g.entities.find((e) => e.kind === 'dragon')!;
    dragon.health = 83;
    g.entities.find((e) => e.kind === 'crystal')!.removed = true;
    g.cursor = { id: 'ender_eye', count: 3 };
    const saved = serialize(g, newWorldMeta('Test', '2', 'survival', 'normal'));
    // Exercise the actual JSON storage boundary, not a richer structured clone.
    const encoded = JSON.stringify(saved);
    const copy = restore(JSON.parse(encoded));
    expect(copy.dimension).toBe('end');
    expect(copy.entities.find((e) => e.kind === 'dragon')?.health).toBe(83);
    expect(copy.entities.filter((e) => e.kind === 'crystal')).toHaveLength(9);
    expect(copy.inventory.some((s) => s?.id === 'ender_eye' && s.count === 3)).toBe(true);
    copy.endgame.travel('nether', [64, 49, 64]);
    expect(copy.chests.get('64,49,64')?.[0]?.count).toBe(6);
    copy.endgame.travel('overworld', [0, 101, 0]);
    expect(copy.world.getBlock(0, 100, 0)).toBe(B.diamondOre);
  });

  it('restores legacy v1 worlds as Overworld without losing edits', () => {
    const g = game();
    const saved = serialize(g, newWorldMeta('Legacy', '2', 'survival', 'normal'));
    saved.version = 1;
    delete saved.dimension;
    delete saved.dimensions;
    delete saved.progress;
    expect(restore(saved).dimension).toBe('overworld');
  });

  it('respawns in the Overworld and leaves death drops in the End', () => {
    const g = game();
    g.endgame.travel('end', [45, 64, 0]);
    g.inventory[0] = { id: 'diamond', count: 1 };
    g.player.invulnerable = 0;
    g.hurtPlayer(100, 'test');
    expect(g.player.dead).toBe(true);
    g.respawn();
    expect(g.dimension).toBe('overworld');
    expect(g.player.dead).toBe(false);
    expect(g.dimensions.get('end')?.entities.some((e) => e.stack?.id === 'diamond')).toBe(true);
  });

  it('fires player arrows through swept collision and never damages the shooter', () => {
    const g = game();
    const { x, z } = g.player;
    Object.assign(g.player, { y: 105, yaw: 0, pitch: 0 });
    const target = g.spawnMob('blaze', x, 105, z - 3);
    g.inventory[0] = { id: 'bow', count: 1 };
    g.inventory[1] = { id: 'arrow', count: 1 };
    g.endgame.use();
    for (let i = 0; i < 3; i++) g.update(0.05, NO_INPUT);
    expect(target.health).toBeLessThan(20);
    expect(g.player.health).toBe(20);
    expect(g.inventory[1]).toBeNull();
  });

  it.each([
    ['blaze', 'en', 'was burned by Blaze'],
    ['dragon', 'en', 'was burned by Ender Dragon'],
    ['blaze', 'zh', '被烈焰人烧死了'],
    ['dragon', 'zh', '被末影龙烧死了'],
  ] as const)('attributes %s fireballs in %s', (shooter, locale, message) => {
    const g = game();
    g.locale = locale;
    g.player.health = 1;
    const p = g.player;
    const projectile = g.newEntity('arrow', p.x, p.y + 1, p.z, 0.3, 0.3);
    Object.assign(projectile, { owner: 'mob', fireball: true, shooter, vy: 0.01 });
    g.entities.push(projectile);
    g.update(0.05, NO_INPUT);
    expect(p.dead).toBe(true);
    expect(p.deathMessage).toBe(message);
  });
});
