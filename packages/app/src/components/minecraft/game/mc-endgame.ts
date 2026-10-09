import { B, BLOCKS } from './mc-blocks';
import { DIMENSION_NAMES, PILLARS, PORTAL_RING, stronghold, type Dimension } from './mc-dimensions';
import type { Entity, Game } from './mc-game';
import { raycast } from './mc-physics';
import { World } from './mc-world';

export interface Progress {
  dragonDefeated: boolean;
  completed: boolean;
  arenaInitialized: boolean;
  overworldPortal?: [number, number, number];
  netherPortal?: [number, number, number];
}

/** Rules confined to the optional Minecraft bundle. No application-level effects. */
export class Endgame {
  progress: Progress = { dragonDefeated: false, completed: false, arenaInitialized: false };
  portalCooldown = 0;
  portalTicks = 0;
  ending = false;
  private readonly game: Game;
  constructor(game: Game) {
    this.game = game;
  }

  private message(en: string, zh: string) {
    this.game.message(this.game.locale === 'zh' ? zh : en);
  }

  /** A frame may be 2–21 blocks wide and 3–21 high; corners are optional. */
  ignite(x: number, y: number, z: number) {
    const w = this.game.world;
    if (w.dimension === 'end' || w.getBlock(x, y, z) !== B.air) return false;
    for (const [dx, dz] of [
      [1, 0],
      [0, 1],
    ]) {
      let bottom = y;
      while (bottom > y - 21 && bottom > 0 && w.getBlock(x, bottom - 1, z) === B.air) bottom--;
      if (w.getBlock(x, bottom - 1, z) !== B.obsidian) continue;
      let left = 0;
      while (left > -21 && w.getBlock(x + (left - 1) * dx, bottom, z + (left - 1) * dz) === B.air)
        left--;
      if (w.getBlock(x + (left - 1) * dx, bottom, z + (left - 1) * dz) !== B.obsidian) continue;
      let width = 0;
      while (
        width <= 21 &&
        w.getBlock(x + (left + width) * dx, bottom, z + (left + width) * dz) === B.air
      )
        width++;
      if (width < 2 || width > 21) continue;
      let height = 0;
      for (; height <= 21; height++) {
        if (w.getBlock(x + left * dx, bottom + height, z + left * dz) === B.obsidian) break;
      }
      if (height < 3 || height > 21) continue;
      let valid = true;
      for (let a = -1; a <= width; a++)
        for (let b = -1; b <= height; b++) {
          const side = a === -1 || a === width,
            cap = b === -1 || b === height;
          if (side && cap) continue;
          const id = w.getBlock(x + (left + a) * dx, bottom + b, z + (left + a) * dz);
          if (id !== (side || cap ? B.obsidian : B.air)) valid = false;
        }
      if (!valid) continue;
      for (let a = 0; a < width; a++)
        for (let b = 0; b < height; b++)
          w.setBlock(
            x + (left + a) * dx,
            bottom + b,
            z + (left + a) * dz,
            B.netherPortal,
            dz ? 1 : 0,
            false,
          );
      this.game.sound('fire/ignite', x, y, z);
      return true;
    }
    return false;
  }

  use() {
    const g = this.game,
      p = g.player,
      held = g.held,
      hit = g.target;
    if (!held) return false;
    const consume = () => {
      if (g.mode !== 'creative' && --held.count <= 0) g.inventory[g.selected] = null;
      p.swing = 6;
    };
    if (held.id === 'flint_and_steel' && hit) {
      const offsets = [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
        [0, 0, 1],
        [0, 0, -1],
      ];
      const [x, y, z] = offsets[hit.face];
      if (this.ignite(hit.x + x, hit.y + y, hit.z + z)) {
        p.swing = 6;
        return true;
      }
    }
    if (held.id === 'ender_eye') {
      if (hit?.id === B.endFrame) {
        if (g.world.getMeta(hit.x, hit.y, hit.z) & 4) return true;
        g.world.setBlock(hit.x, hit.y, hit.z, B.endFrame, 4, false);
        consume();
        // Find the ring around this frame, including player-built creative portals.
        for (const [dx, dz] of PORTAL_RING) {
          const cx = hit.x - dx,
            cz = hit.z - dz;
          if (
            !PORTAL_RING.every(
              ([a, b]) =>
                g.world.getBlock(cx + a, hit.y, cz + b) === B.endFrame &&
                g.world.getMeta(cx + a, hit.y, cz + b) & 4,
            )
          )
            continue;
          for (let x = -1; x <= 1; x++)
            for (let z = -1; z <= 1; z++)
              g.world.setBlock(cx + x, hit.y, cz + z, B.endPortal, 0, false);
          this.message('The End portal is open.', '末地传送门已开启。');
        }
      } else if (g.dimension === 'overworld') {
        const target = stronghold(g.seedNumber);
        const dx = target.x - p.x,
          dz = target.z - p.z,
          distance = Math.hypot(dx, dz) || 1;
        consume();
        // An eye flies toward the stronghold and falls as a recoverable item.
        g.spawnItem(
          { id: 'ender_eye', count: 1 },
          p.x,
          p.y + 2,
          p.z,
          (dx / distance) * 0.8,
          0.6,
          (dz / distance) * 0.8,
          60,
        );
        this.message(
          `Eye of Ender: stronghold at X ${target.x}, Y ${target.y}, Z ${target.z}.`,
          `末影之眼：要塞位于 X ${target.x}、Y ${target.y}、Z ${target.z}。`,
        );
      }
      return true;
    }
    if (held.id === 'bow') {
      const ammo = g.inventory.findIndex((s) => s?.id === 'arrow');
      if (ammo === -1 && g.mode !== 'creative') return true;
      if (g.mode !== 'creative' && --g.inventory[ammo]!.count <= 0) g.inventory[ammo] = null;
      const [dx, dy, dz] = g.lookVector();
      const arrow = g.newEntity(
        'arrow',
        p.x + dx * 0.6,
        p.y + g.eyeHeight + dy * 0.6,
        p.z + dz * 0.6,
        0.2,
        0.2,
      );
      Object.assign(arrow, { vx: dx * 2.5, vy: dy * 2.5, vz: dz * 2.5, owner: 'player' });
      g.entities.push(arrow);
      g.sound('random/bow', p.x, p.y, p.z);
      p.swing = 6;
      return true;
    }
    return false;
  }

  private buildPortal(x: number, y: number, z: number) {
    const w = this.game.world;
    // Clear a protected landing pad before allowing physics in the destination.
    for (let a = -2; a <= 4; a++)
      for (let b = -2; b <= 2; b++)
        for (let h = -1; h <= 4; h++)
          w.setBlock(x + a, y + h, z + b, h === -1 ? B.obsidian : B.air, 0, false);
    for (let a = -1; a <= 2; a++)
      for (let b = -1; b <= 3; b++)
        w.setBlock(
          x + a,
          y + b,
          z,
          a === -1 || a === 2 || b === -1 || b === 3 ? B.obsidian : B.netherPortal,
          0,
          false,
        );
  }

  travel(dimension: Dimension, position: [number, number, number]) {
    const g = this.game;
    g.closeScreen();
    g.dimensions.set(g.dimension, g.dimensionState());
    // Only the active dimension keeps generated terrain in memory.
    for (const c of g.world.chunks.values()) g.world.unloadChunk(c.cx, c.cz);
    const state = g.dimensions.get(dimension);
    g.dimension = dimension;
    g.world = state?.world ?? new World(g.seedNumber, dimension);
    g.entities = state?.entities ?? [];
    g.furnaces = state?.furnaces ?? new Map();
    g.chests = state?.chests ?? new Map();
    g.animalChunks = state?.animalChunks ?? new Set();
    g.resetDimension();
    const [x, y, z] = position;
    Object.assign(g.player, {
      x,
      y,
      z,
      px: x,
      py: y,
      pz: z,
      vx: 0,
      vy: 0,
      vz: 0,
      fallDistance: 0,
      fire: 0,
      onGround: false,
      inWater: false,
      inLava: false,
      eyesInWater: false,
    });
    const cx = Math.floor(x / 16),
      cz = Math.floor(z / 16);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) g.world.ensureChunk(cx + a, cz + b);
    this.portalCooldown = 100;
    this.portalTicks = 0;
    if (dimension === 'end' && !this.progress.arenaInitialized) {
      this.progress.arenaInitialized = true;
      for (const pillar of PILLARS)
        g.spawnMob('crystal', pillar.x + 0.5, pillar.height + 1, pillar.z + 0.5);
      g.spawnMob('dragon', 0, 80, 0);
    }
    this.message(DIMENSION_NAMES[dimension].en, DIMENSION_NAMES[dimension].zh);
  }

  private enterPortal(id: number) {
    const g = this.game,
      p = g.player;
    if (id === B.netherPortal && g.dimension !== 'end') {
      const from = g.dimension,
        destination = from === 'overworld' ? 'nether' : 'overworld';
      const sourceKey = from === 'overworld' ? 'overworldPortal' : 'netherPortal';
      const targetKey = destination === 'overworld' ? 'overworldPortal' : 'netherPortal';
      this.progress[sourceKey] = [Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)];
      const existing = this.progress[targetKey];
      const ratio = destination === 'nether' ? 1 / 8 : 8;
      const x = existing?.[0] ?? Math.floor(p.x * ratio),
        z = existing?.[2] ?? Math.floor(p.z * ratio);
      const y =
        existing?.[1] ??
        (destination === 'nether'
          ? 49
          : g.dimensions.get('overworld')!.world.terrain.spawnHeight(x, z));
      // The linked portal cell is safe for either frame orientation; its exterior may be walled in.
      this.travel(destination, [x + 0.5, y, z + 0.5]);
      // Rebuild only if the linked frame was destroyed, never overwrite intact landing areas.
      if (!existing || g.world.getBlock(x, y, z) !== B.netherPortal) this.buildPortal(x, y, z);
      this.progress[targetKey] = [x, y, z];
    } else if (id === B.endPortal) {
      if (g.dimension === 'overworld') {
        this.travel('end', [45.5, 64, 0.5]);
        for (let x = 43; x <= 47; x++)
          for (let z = -2; z <= 2; z++)
            for (let y = 62; y <= 66; y++)
              g.world.setBlock(x, y, z, y === 62 ? B.obsidian : B.air, 0, false);
      } else if (g.dimension === 'end' && this.progress.dragonDefeated) {
        this.progress.completed = true;
        this.ending = true;
        this.travel('overworld', [p.spawnX, p.spawnY, p.spawnZ]);
        g.events.push({ type: 'ending' });
      }
    }
  }

  tick() {
    const g = this.game,
      p = g.player;
    if (this.portalCooldown > 0) this.portalCooldown--;
    if (!p.dead) {
      const id = g.world.getBlock(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
      if (
        id === B.netherPortal &&
        !this.validatePortal(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))
      ) {
        this.portalTicks = 0;
      } else if ((id === B.netherPortal || id === B.endPortal) && this.portalCooldown === 0) {
        if (++this.portalTicks >= (id === B.endPortal || g.mode === 'creative' ? 1 : 60))
          this.enterPortal(id);
      } else this.portalTicks = 0;
    }
    if (g.ticks % 100 === 0 && g.difficulty !== 'peaceful' && g.dimension !== 'end') this.spawn();
  }

  /** Extinguish a portal whose frame was mined or exploded. */
  validatePortal(x: number, y: number, z: number) {
    const w = this.game.world;
    const axis = w.getMeta(x, y, z) & 1;
    const offsets = axis
      ? [
          [0, 0, 1],
          [0, 0, -1],
          [0, 1, 0],
          [0, -1, 0],
        ]
      : [
          [1, 0, 0],
          [-1, 0, 0],
          [0, 1, 0],
          [0, -1, 0],
        ];
    const queue: number[][] = [[x, y, z]],
      visited = new Set<string>([`${x},${y},${z}`]);
    let valid = true;
    for (let i = 0; i < queue.length && i < 500; i++) {
      const [px, py, pz] = queue[i];
      for (const [dx, dy, dz] of offsets) {
        const id = w.getBlock(px + dx, py + dy, pz + dz);
        if (id === B.netherPortal) {
          const key = `${px + dx},${py + dy},${pz + dz}`;
          if (!visited.has(key)) {
            visited.add(key);
            queue.push([px + dx, py + dy, pz + dz]);
          }
        } else if (id !== B.obsidian) valid = false;
      }
    }
    if (!valid)
      for (const key of visited) {
        const [px, py, pz] = key.split(',').map(Number);
        w.setBlock(px, py, pz, B.air, 0, false);
      }
    return valid;
  }

  private spawn() {
    const g = this.game,
      p = g.player;
    if (g.dimension === 'overworld' && g.skyDarken() < 7) return;
    const kind = g.dimension === 'nether' && g.ticks % 200 === 0 ? 'blaze' : 'enderman';
    if (g.entities.filter((e) => e.kind === kind && !e.removed).length >= 5) return;
    const angle = g.ticks * 1.618;
    const x = Math.floor(p.x + Math.cos(angle) * 20),
      z = Math.floor(p.z + Math.sin(angle) * 20);
    if (!g.world.chunkAt(x, z)?.lit) return;
    for (let y = Math.min(100, Math.floor(p.y) + 16); y > 1; y--) {
      const floor = g.world.getBlock(x, y - 1, z);
      if (!BLOCKS[floor].solid || (kind === 'blaze' && floor !== B.netherBricks)) continue;
      if ([0, 1, 2].every((dy) => g.world.getBlock(x, y + dy, z) === B.air)) {
        g.spawnMob(kind, x + 0.5, y, z + 0.5);
        return;
      }
    }
  }

  hurt(e: Entity, amount: number, source: string) {
    const g = this.game;
    if (e.kind === 'crystal') {
      if (e.removed) return true;
      e.removed = true;
      g.explode(e.x, e.y + 0.5, e.z, 4, false);
      const dragon = g.entities.find((m) => m.kind === 'dragon' && !m.removed);
      if (dragon && Math.hypot(dragon.x - e.x, dragon.z - e.z) < 48)
        this.hurt(dragon, 10, 'crystal');
      return true;
    }
    if (e.kind !== 'dragon') return false;
    if (e.health <= 0 || e.invulnerable > 0 || source === 'fire' || source === 'fall') return true;
    e.health = Math.max(0, e.health - amount);
    e.hurtTime = 10;
    e.invulnerable = 10;
    if (e.health === 0 && !this.progress.dragonDefeated) {
      this.progress.dragonDefeated = true;
      e.deathTime = 1;
      g.addXp(12000);
      for (let x = -1; x <= 1; x++)
        for (let z = -1; z <= 1; z++) {
          g.world.ensureChunk(x >> 4, z >> 4);
          g.world.setBlock(x, 63, z, B.endPortal, 0, false);
        }
      this.message(
        'Free the End! Enter the portal at the island centre to return home.',
        '解放末地！进入岛屿中央的传送门返回主世界。',
      );
    }
    return true;
  }

  tickEntity(e: Entity) {
    const g = this.game,
      p = g.player;
    if (e.kind !== 'dragon' && e.kind !== 'crystal' && e.kind !== 'blaze') return false;
    if (e.hurtTime > 0) e.hurtTime--;
    if (e.invulnerable > 0) e.invulnerable--;
    if (e.kind === 'crystal') return true;
    if (e.deathTime > 0) {
      if (++e.deathTime > (e.kind === 'dragon' ? 100 : 20)) e.removed = true;
      if (e.kind === 'dragon') e.y += 0.12;
      return true;
    }
    const dx = p.x - e.x,
      dz = p.z - e.z,
      distance = Math.hypot(dx, dz) || 1;
    if (e.kind === 'blaze') {
      e.y += Math.sin(e.age / 18) * 0.015;
      e.yaw = Math.atan2(-dx, -dz);
      if (e.age % 60 === 0 && distance < 28 && g.mode !== 'creative' && !p.dead) {
        this.shoot(e, dx, p.y + 1 - e.y, dz, 0.8);
      }
      return true;
    }
    // Circle, descend/perch (melee window), then charge; all movement is 20 Hz.
    const phase = e.age % 800;
    const perch = phase >= 440 && phase < 620;
    const charge = phase >= 620;
    const angle = e.age / 60;
    const tx = perch ? 0 : charge ? p.x : Math.cos(angle) * 30;
    const tz = perch ? 0 : charge ? p.z : Math.sin(angle) * 30;
    const ty = perch
      ? 64
      : charge
        ? Math.max(64, Math.min(100, p.y + 2))
        : 80 + Math.sin(angle * 2) * 6;
    const speed = perch ? 0.08 : 0.045;
    e.x += (tx - e.x) * speed;
    e.y += (ty - e.y) * speed;
    e.z += (tz - e.z) * speed;
    e.yaw = Math.atan2(e.px - e.x, e.pz - e.z);
    if (g.ticks % 20 === 0 && g.entities.some((c) => c.kind === 'crystal' && !c.removed))
      e.health = Math.min(e.maxHealth, e.health + 1);
    if (e.age % 60 === 0 && !perch && !p.dead && g.mode !== 'creative')
      this.shoot(e, dx, p.y + 1 - e.y, dz, 1);
    if (distance < 5 && Math.abs(p.y - e.y) < 4 && !p.dead)
      g.hurtPlayer(
        6,
        g.locale === 'zh' ? '被末影龙杀死了 by mob' : 'was slain by Ender Dragon by mob',
        dx / distance,
        dz / distance,
      );
    return true;
  }

  private shoot(e: Entity, dx: number, dy: number, dz: number, speed: number) {
    const g = this.game,
      norm = Math.hypot(dx, dy, dz) || 1;
    if (raycast(g.world, e.x, e.y + 1, e.z, dx / norm, dy / norm, dz / norm, norm)) return;
    const arrow = g.newEntity('arrow', e.x, e.y + 1, e.z, 0.3, 0.3);
    Object.assign(arrow, {
      vx: (dx / norm) * speed,
      vy: (dy / norm) * speed,
      vz: (dz / norm) * speed,
      owner: 'mob',
      fireball: true,
      shooter: e.kind === 'dragon' ? 'dragon' : 'blaze',
    });
    g.entities.push(arrow);
  }
}
