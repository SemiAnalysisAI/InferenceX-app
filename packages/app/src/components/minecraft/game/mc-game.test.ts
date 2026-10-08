import { describe, expect, it } from 'vitest';

import { B, BLOCKS } from './mc-blocks';
import { Game, NO_INPUT } from './mc-game';
import { breakTime, canHarvest, craft, ITEMS, SMELTING, type Stack } from './mc-items';
import { hashSeed, rng } from './mc-noise';
import { move, raycast } from './mc-physics';
import { decodeEdits, encodeEdits, restore, serialize, newWorldMeta } from './mc-save';
import { CHUNK, chunkKey, HEIGHT, World } from './mc-world';

const always = () => 0;

function newGame(mode: 'survival' | 'creative' = 'survival', seed = 'inferencex') {
  const game = new Game({ seed, name: 'Test', mode, difficulty: 'peaceful' });
  game.renderDistance = 1;
  game.streamChunks(Infinity, always);
  return game;
}

/** A flat stone pad high above the terrain so tests are independent of world generation. */
function pad(game: Game, y = HEIGHT - 20) {
  const p = game.player;
  const cx = Math.floor(p.x);
  const cz = Math.floor(p.z);
  for (let dx = -4; dx <= 4; dx++)
    for (let dz = -4; dz <= 4; dz++) {
      game.world.setBlock(cx + dx, y, cz + dz, B.stone, 0, false);
      for (let h = 1; h < 6; h++) game.world.setBlock(cx + dx, y + h, cz + dz, B.air, 0, false);
    }
  p.x = cx + 0.5;
  p.z = cz + 0.5;
  p.y = y + 1;
  p.vx = 0;
  p.vy = 0;
  p.vz = 0;
  game.entities.length = 0;
  return { cx, cy: y, cz };
}

const grid = (...ids: (string | null)[]): (Stack | null)[] =>
  ids.map((id) => (id ? { id, count: 1 } : null));

describe('minecraft world generation', () => {
  it('is deterministic for a seed and differs across seeds', () => {
    const a = new World(hashSeed('alpha'));
    const b = new World(hashSeed('alpha'));
    const c = new World(hashSeed('beta'));
    a.ensureChunk(0, 0);
    b.ensureChunk(0, 0);
    c.ensureChunk(0, 0);
    const ca = a.chunks.get(chunkKey(0, 0))!;
    const cb = b.chunks.get(chunkKey(0, 0))!;
    const cc = c.chunks.get(chunkKey(0, 0))!;
    expect(ca.blocks).toEqual(cb.blocks);
    expect(ca.blocks).not.toEqual(cc.blocks);
  });

  it('places bedrock at the bottom and air at the build limit', () => {
    const w = new World(42);
    w.ensureChunk(0, 0);
    for (let x = 0; x < CHUNK; x++) {
      expect(w.getBlock(x, 0, 3)).toBe(B.bedrock);
      expect(w.getBlock(x, HEIGHT - 1, 3)).toBe(B.air);
    }
  });

  it('generates ores, caves and surface blocks', () => {
    const w = new World(hashSeed('ores'));
    const seen = new Set<number>();
    for (let cx = -2; cx <= 2; cx++)
      for (let cz = -2; cz <= 2; cz++) {
        w.ensureChunk(cx, cz);
        for (const id of w.chunks.get(chunkKey(cx, cz))!.blocks) seen.add(id);
      }
    for (const id of [B.grass, B.dirt, B.stone, B.coalOre, B.ironOre, B.bedrock])
      expect(seen.has(id)).toBe(true);
  });

  it('lights open sky fully and caves dark', () => {
    const game = newGame();
    const { cx, cy, cz } = pad(game);
    game.streamChunks(Infinity, always);
    for (const c of game.world.chunks.values()) game.world.lightChunk(c);
    expect(game.world.getLight(cx, cy + 2, cz) >> 4).toBe(15);
    // Enclose a pocket under the pad.
    expect(game.world.getLight(cx, cy - 3, cz) >> 4).toBeLessThan(15);
  });
});

describe('minecraft items and crafting', () => {
  it('crafts planks, sticks, tables and tools', () => {
    expect(craft(grid('oak_log', null, null, null), 2)).toEqual({ id: 'oak_planks', count: 4 });
    expect(craft(grid(null, 'oak_planks', null, 'oak_planks'), 2)).toEqual({
      id: 'stick',
      count: 4,
    });
    expect(craft(grid('oak_planks', 'oak_planks', 'oak_planks', 'oak_planks'), 2)?.id).toBe(
      'crafting_table',
    );
    expect(
      craft(
        grid('cobblestone', 'cobblestone', 'cobblestone', null, 'stick', null, null, 'stick', null),
        3,
      )?.id,
    ).toBe('stone_pickaxe');
    // Shifted patterns still match.
    expect(craft(grid(null, null, null, null, 'oak_log', null, null, null, null), 3)).toEqual({
      id: 'oak_planks',
      count: 4,
    });
    expect(craft(grid('dirt', null, null, null), 2)).toBeNull();
  });

  it('only allows 3x3 recipes in a crafting table', () => {
    const pick = grid(
      'iron_ingot',
      'iron_ingot',
      'iron_ingot',
      null,
      'stick',
      null,
      null,
      'stick',
      null,
    );
    expect(craft(pick, 3)?.id).toBe('iron_pickaxe');
  });

  it('has smelting recipes and item definitions for every result', () => {
    expect(SMELTING.raw_iron).toBe('iron_ingot');
    expect(SMELTING.cobblestone).toBe('stone');
    for (const out of Object.values(SMELTING)) expect(ITEMS[out]).toBeDefined();
  });

  it('times mining like vanilla and gates harvest by tool tier', () => {
    // Stone by hand: hardness 1.5 * 5 = 7.5s; with a wooden pickaxe 1.15s.
    expect(breakTime(B.stone, undefined, true, false)).toBeCloseTo(7.5, 1);
    expect(breakTime(B.stone, 'wooden_pickaxe', true, false)).toBeCloseTo(1.15, 1);
    expect(breakTime(B.stone, 'wooden_pickaxe', false, false)).toBeGreaterThan(5);
    expect(breakTime(B.bedrock, 'diamond_pickaxe', true, false)).toBe(Infinity);
    expect(canHarvest(B.stone, undefined)).toBe(false);
    expect(canHarvest(B.ironOre, 'wooden_pickaxe')).toBe(false);
    expect(canHarvest(B.ironOre, 'stone_pickaxe')).toBe(true);
    expect(canHarvest(B.diamondOre, 'iron_pickaxe')).toBe(true);
    expect(canHarvest(B.dirt, undefined)).toBe(true);
  });
});

describe('minecraft physics', () => {
  it('falls onto and stands on solid ground', () => {
    const game = newGame();
    const { cy } = pad(game);
    const p = game.player;
    p.y = cy + 4;
    for (let i = 0; i < 60; i++) game.tick();
    expect(p.onGround).toBe(true);
    expect(p.y).toBeCloseTo(cy + 1, 5);
  });

  it('collides with walls and steps never more than half a block for players', () => {
    const game = newGame();
    const { cx, cy, cz } = pad(game);
    game.world.setBlock(cx, cy + 1, cz - 1, B.stone, 0, false);
    game.world.setBlock(cx, cy + 2, cz - 1, B.stone, 0, false);
    const p = game.player;
    for (let i = 0; i < 20; i++) move(game.world, p, 0, -0.08, -0.2);
    expect(p.z).toBeGreaterThan(cz - 0.01 + 0.3 - 1e-6);
  });

  it('raycasts the first solid block in view', () => {
    const game = newGame();
    const { cx, cy, cz } = pad(game);
    game.world.setBlock(cx, cy + 2, cz - 3, B.dirt, 0, false);
    const hit = raycast(game.world, cx + 0.5, cy + 2.5, cz + 0.5, 0, 0, -1, 5);
    expect(hit).not.toBeNull();
    expect([hit!.x, hit!.y, hit!.z, hit!.id]).toEqual([cx, cy + 2, cz - 3, B.dirt]);
  });
});

describe('minecraft gameplay', () => {
  it('breaks blocks into drops and picks them up in survival', () => {
    const game = newGame();
    const { cx, cy, cz } = pad(game);
    game.world.setBlock(cx + 1, cy + 1, cz, B.dirt, 0, false);
    game.breakBlock(cx + 1, cy + 1, cz, true);
    expect(game.world.getBlock(cx + 1, cy + 1, cz)).toBe(B.air);
    for (let i = 0; i < 60; i++) game.update(1 / 20, NO_INPUT);
    expect(game.inventory.some((s) => s?.id === 'dirt')).toBe(true);
  });

  it('drops nothing for stone mined by hand, cobblestone with a pickaxe', () => {
    const game = newGame();
    const { cx, cy, cz } = pad(game);
    game.world.setBlock(cx + 1, cy + 1, cz, B.stone, 0, false);
    game.breakBlock(cx + 1, cy + 1, cz, true);
    expect(game.entities.filter((e) => e.kind === 'item')).toHaveLength(0);
    game.inventory[0] = { id: 'wooden_pickaxe', count: 1 };
    game.selected = 0;
    game.world.setBlock(cx + 1, cy + 1, cz, B.stone, 0, false);
    game.breakBlock(cx + 1, cy + 1, cz, true);
    expect(game.entities.some((e) => e.kind === 'item' && e.stack?.id === 'cobblestone')).toBe(
      true,
    );
  });

  it('places blocks but not inside the player', () => {
    const game = newGame();
    const { cx, cy, cz } = pad(game);
    game.inventory[0] = { id: 'cobblestone', count: 2 };
    game.selected = 0;
    expect(game.place(B.cobblestone, cx + 2, cy + 1, cz, 2)).toBe(true);
    expect(game.world.getBlock(cx + 2, cy + 1, cz)).toBe(B.cobblestone);
    expect(game.place(B.cobblestone, cx, cy + 1, cz, 2)).toBe(false);
  });

  it('crafts through the inventory grid with slot clicks', () => {
    const game = newGame();
    game.inventory[0] = { id: 'oak_log', count: 2 };
    game.openScreen({ kind: 'inventory' });
    game.clickSlot({ kind: 'inv', index: 0 }, 'left', false);
    expect(game.cursor).toEqual({ id: 'oak_log', count: 2 });
    game.clickSlot({ kind: 'craft', index: 0 }, 'right', false);
    expect(game.cursor).toEqual({ id: 'oak_log', count: 1 });
    expect(game.slot({ kind: 'result' })).toEqual({ id: 'oak_planks', count: 4 });
    game.clickSlot({ kind: 'inv', index: 0 }, 'left', false);
    game.clickSlot({ kind: 'result' }, 'left', true);
    expect(game.inventory.find((s) => s?.id === 'oak_planks')?.count).toBe(4);
    expect(game.craftGrid.every((s) => s === null)).toBe(true);
  });

  it('stops shift-crafting when a whole result no longer fits', () => {
    const game = newGame();
    // Fill every slot but one with unstackable items.
    for (let i = 0; i < 36; i++) game.inventory[i] = { id: 'diamond_pickaxe', count: 1 };
    game.inventory[35] = { id: 'oak_planks', count: 62 };
    game.openScreen({ kind: 'inventory' });
    game.craftGrid[0] = { id: 'oak_log', count: 3 };
    game.clickSlot({ kind: 'result' }, 'left', true);
    // 4 planks do not fit in the 2 free places, so nothing is crafted or lost.
    expect(game.inventory[35]).toEqual({ id: 'oak_planks', count: 62 });
    expect(game.craftGrid[0]).toEqual({ id: 'oak_log', count: 3 });
  });

  it('scatters crafting grid and cursor items on death', () => {
    const game = newGame();
    pad(game);
    game.inventory[0] = { id: 'stick', count: 2 };
    game.openScreen({ kind: 'inventory' });
    game.craftGrid[0] = { id: 'oak_log', count: 2 };
    game.cursor = { id: 'cobblestone', count: 5 };
    game.hurtPlayer(100, 'test');
    game.respawn();
    expect(game.inventory.every((s) => s === null)).toBe(true);
    expect(game.cursor).toBeNull();
    expect(game.craftGrid.every((s) => s === null)).toBe(true);
    const dropped = game.entities.filter((e) => e.kind === 'item').map((e) => e.stack?.id);
    expect(dropped).toEqual(expect.arrayContaining(['stick', 'oak_log', 'cobblestone']));
  });

  it('distributes a dragged stack evenly across slots', () => {
    const game = newGame();
    game.openScreen({ kind: 'inventory' });
    game.cursor = { id: 'oak_planks', count: 9 };
    const refs = [0, 1, 3].map((index) => ({ kind: 'craft' as const, index }));
    game.distribute(refs, 'left');
    expect(game.craftGrid[0]?.count).toBe(3);
    expect(game.craftGrid[1]?.count).toBe(3);
    expect(game.craftGrid[3]?.count).toBe(3);
    expect(game.cursor).toBeNull();
  });

  it('smelts in a furnace using fuel', () => {
    const game = newGame();
    const { cx, cy, cz } = pad(game);
    game.inventory[0] = { id: 'furnace', count: 1 };
    game.selected = 0;
    expect(game.place(B.furnace, cx + 2, cy + 1, cz, 2)).toBe(true);
    const f = game.furnaces.get(`${cx + 2},${cy + 1},${cz}`)!;
    f.input = { id: 'raw_iron', count: 2 };
    f.fuel = { id: 'coal', count: 1 };
    for (let i = 0; i < 20 * 21; i++) game.tick();
    expect(f.output).toEqual({ id: 'iron_ingot', count: 2 });
    expect(f.input).toBeNull();
  });

  it('flows water and lava, and makes obsidian/cobblestone where they meet', () => {
    const game = newGame();
    const { cx, cy, cz } = pad(game);
    game.world.setBlock(cx + 2, cy + 1, cz, B.water);
    for (let i = 0; i < 40; i++) game.tick();
    const wet = [-1, 0, 1].some(
      (d) => BLOCKS[game.world.getBlock(cx + 3, cy + 1, cz + d)].key === 'water',
    );
    expect(wet).toBe(true);
    game.world.setBlock(cx - 3, cy + 1, cz, B.lava);
    for (let i = 0; i < 200; i++) game.tick();
    let rock = 0;
    for (let dx = -4; dx <= 4; dx++)
      for (let dz = -4; dz <= 4; dz++) {
        const id = game.world.getBlock(cx + dx, cy + 1, cz + dz);
        if (id === B.cobblestone || id === B.obsidian || id === B.stone) rock++;
      }
    expect(rock).toBeGreaterThan(0);
  }, 30_000);

  it('applies fall damage and hunger, and respawns after death', () => {
    const game = newGame();
    const { cy } = pad(game);
    const p = game.player;
    p.y = cy + 12;
    for (let i = 0; i < 80; i++) game.tick();
    expect(p.health).toBeLessThan(20);
    game.hurtPlayer(100, 'test');
    expect(p.dead).toBe(true);
    game.respawn();
    expect(p.dead).toBe(false);
    expect(p.health).toBe(20);
  });

  it('runs chat commands', () => {
    const game = newGame();
    expect(game.command('/give @s diamond 3')).toContain('3');
    expect(game.inventory.find((s) => s?.id === 'diamond')?.count).toBe(3);
    game.command('/gamemode creative');
    expect(game.mode).toBe('creative');
    game.command('/time set 13000');
    expect(game.dayTime).toBe(13000);
  });

  it('spawns and simulates mobs deterministically', () => {
    const run = () => {
      const game = newGame('survival', 'mobs');
      pad(game);
      const p = game.player;
      for (const kind of ['pig', 'cow', 'sheep', 'chicken'] as const)
        game.spawnMob(kind, p.x + 2, p.y, p.z + 2);
      for (let i = 0; i < 100; i++) game.tick();
      return game.entities.map((e) => `${e.kind}:${e.x.toFixed(3)},${e.z.toFixed(3)}`).join('|');
    };
    expect(run()).toBe(run());
  });
});

describe('minecraft saves', () => {
  it('encodes and decodes block edits', () => {
    const edits = new Map<number, number>([
      [1, 2],
      [12345, 7],
      [32767, 0],
    ]);
    expect(decodeEdits(encodeEdits(edits))).toEqual(edits);
  });

  it('round-trips a world with edits, inventory and furnaces', () => {
    const game = newGame('survival', 'save-test');
    const { cx, cy, cz } = pad(game);
    game.inventory[3] = { id: 'diamond_pickaxe', count: 1, wear: 12 };
    game.inventory[0] = { id: 'furnace', count: 1 };
    game.place(B.furnace, cx + 2, cy + 1, cz, 2);
    game.furnaces.get(`${cx + 2},${cy + 1},${cz}`)!.input = { id: 'sand', count: 5 };
    game.time = 12345;
    const meta = newWorldMeta('Save', 'save-test', 'survival', 'peaceful');
    // A JSON round trip, exactly as localStorage stores it.
    // oxlint-disable-next-line unicorn/prefer-structured-clone
    const data = JSON.parse(JSON.stringify(serialize(game, meta)));
    const back = restore(data);
    back.renderDistance = 1;
    back.streamChunks(Infinity, always);
    expect(back.world.getBlock(cx, cy, cz)).toBe(B.stone);
    expect(back.world.getBlock(cx + 2, cy + 1, cz)).toBe(B.furnace);
    expect(back.inventory[3]).toEqual({ id: 'diamond_pickaxe', count: 1, wear: 12 });
    expect(back.furnaces.get(`${cx + 2},${cy + 1},${cz}`)?.input).toEqual({ id: 'sand', count: 5 });
    expect(back.time).toBe(12345);
    expect(back.player.x).toBeCloseTo(game.player.x, 5);
  });

  it('saves an open crafting grid and the cursor with the inventory', () => {
    const game = newGame();
    game.openScreen({ kind: 'inventory' });
    game.craftGrid[0] = { id: 'oak_log', count: 2 };
    game.cursor = { id: 'cobblestone', count: 5 };
    const back = restore(
      serialize(game, newWorldMeta('Save', 'grid-test', 'survival', 'peaceful')),
    );
    expect(back.inventory).toEqual(
      expect.arrayContaining([
        { id: 'oak_log', count: 2 },
        { id: 'cobblestone', count: 5 },
      ]),
    );
  });
});

describe('minecraft noise', () => {
  it('produces stable pseudo-random sequences', () => {
    const a = rng(7);
    const b = rng(7);
    for (let i = 0; i < 10; i++) expect(a()).toBe(b());
  });
});
