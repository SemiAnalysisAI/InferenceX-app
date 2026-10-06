import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  aiControls,
  EMPTY_CONTROLS,
  lap,
  LAPS,
  newRace,
  pauseRace,
  raceText,
  standings,
  startRace,
  STEP,
  stepRace,
  TRACK_LENGTH,
  type Controls,
  type Race,
} from './kart-engine';
import { heightAt, parseSurface, SURFACE, surfaceAt } from './kart-surface';
import { nearest, pointAt as trackPoint, wrapAngle } from './kart-track';

const bin = readFileSync(
  path.resolve(import.meta.dirname, '../../../public/decorative/kart/luigi-circuit-surface.bin'),
);
const surface = parseSurface(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
const pointAt = (distance: number, lane = 0) => {
  const p = trackPoint(distance, lane);
  return { ...p, y: heightAt(surface, p.x, p.z) };
};

const run = (
  race: Race,
  controls: Partial<Controls> | ((r: Race) => Controls),
  seconds: number,
) => {
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    const c = typeof controls === 'function' ? controls(race) : { ...EMPTY_CONTROLS, ...controls };
    stepRace(race, c, STEP);
    race.events.length = 0;
  }
};
const go = (seed = 3) => {
  const race = newRace({ surface, seed });
  startRace(race);
  run(race, {}, 4.2);
  return race;
};
/** Puts the player alone on a straight so item and physics tests are isolated. */
const solo = (distance = 40) => {
  const race = go();
  race.karts.forEach((k, i) => {
    if (k.human) return;
    const p = pointAt(distance + 600 + i * 30);
    Object.assign(k, { x: p.x, z: p.z, progress: distance + 600 + i * 30, speed: 0 });
  });
  const p = pointAt(distance);
  Object.assign(race.player, {
    x: p.x,
    z: p.z,
    y: p.y,
    heading: p.heading,
    progress: distance,
    speed: 0,
  });
  race.boxes.forEach((b) => (b.respawn = 999));
  return race;
};

describe('kart engine', () => {
  it('loads the real Luigi Circuit surface map', () => {
    const start = pointAt(0);
    expect(surfaceAt(surface, start.x, start.z)).toBe(SURFACE.road);
    expect(surface.width * surface.height).toBeGreaterThan(100_000);
  });

  it('counts down and enters the race', () => {
    const race = newRace({ surface });
    expect(race.phase).toBe('ready');
    expect(race.karts).toHaveLength(8);
    startRace(race);
    run(race, {}, 4.1);
    expect(race.phase).toBe('racing');
  });

  it('does not steer for you: holding accelerate alone hits the first wall and never finishes', () => {
    const race = go();
    let walls = 0;
    for (let i = 0; i < 60 * 60; i++) {
      stepRace(race, { ...EMPTY_CONTROLS, throttle: true }, STEP);
      walls += race.events.filter((e) => e.type === 'wall' && e.kart === race.player.index).length;
      race.events.length = 0;
    }
    expect(walls).toBeGreaterThan(0);
    expect(race.player.progress).toBeLessThan(TRACK_LENGTH * 0.5);
    expect(race.player.finishedAt).toBeNull();
    expect(race.phase).toBe('racing');
  });

  it('a driver who actually steers can finish three laps', () => {
    const race = go(5);
    run(race, (r) => aiControls(r, r.player), 150);
    expect(race.player.finishedAt).not.toBeNull();
    expect(race.player.lapTimes).toHaveLength(LAPS);
    expect(race.phase).toBe('finished');
    expect(lap(race)).toBe(LAPS);
  });

  it('every CPU racer finishes on the real surface', () => {
    const race = go(9);
    run(race, {}, 160);
    const cpu = race.karts.filter((k) => !k.human);
    expect(cpu.every((k) => k.finishedAt !== null)).toBe(true);
    for (const k of cpu) for (const t of k.lapTimes) expect(t).toBeGreaterThan(15);
  });

  it('steering turns the kart', () => {
    const left = solo();
    const right = solo();
    const h = left.player.heading;
    run(left, { throttle: true, left: true }, 0.8);
    run(right, { throttle: true, right: true }, 0.8);
    expect(wrapAngle(left.player.heading - h)).toBeGreaterThan(0.3);
    expect(wrapAngle(right.player.heading - h)).toBeLessThan(-0.3);
  });

  it('offroad is slower than road', () => {
    const road = solo();
    const grass = solo();
    run(road, { throttle: true }, 3);
    // Park the kart on offroad next to the course.
    let placed = false;
    for (let lane = 20; lane < 60 && !placed; lane += 1) {
      const p = pointAt(40, lane);
      if (surfaceAt(surface, p.x, p.z) === SURFACE.offroad) {
        Object.assign(grass.player, { x: p.x, z: p.z, y: p.y });
        placed = true;
      }
    }
    expect(placed).toBe(true);
    run(grass, { throttle: true }, 1);
    expect(surfaceAt(surface, grass.player.x, grass.player.z)).toBe(SURFACE.offroad);
    expect(grass.player.speed).toBeLessThan(road.player.speed * 0.7);
  });

  it('braking slows and holding brake reverses', () => {
    const race = solo();
    run(race, { throttle: true }, 1.5);
    const fast = race.player.speed;
    run(race, { brake: true }, 0.6);
    expect(race.player.speed).toBeLessThan(fast * 0.6);
    run(race, { brake: true }, 2);
    expect(race.player.speed).toBeLessThan(0);
  });

  it.each([
    [200, 'right', 1, 1],
    [200, 'right', 2, 1.7],
    [400, 'left', 1, 1],
  ] as const)(
    'drifts from %s to the %s and naturally earns stage %s',
    (distance, direction, stage, seconds) => {
      const race = solo(distance);
      race.karts = [race.player];
      race.player.speed = 60;
      for (let i = 0; i < Math.round(seconds / STEP); i++) {
        stepRace(race, { ...EMPTY_CONTROLS, throttle: true, drift: true, [direction]: true }, STEP);
        expect(race.events.some((e) => e.type === 'wall')).toBe(false);
        race.events.length = 0;
      }
      expect(race.player.driftStage).toBe(stage);
      const speed = race.player.speed;
      stepRace(race, { ...EMPTY_CONTROLS, throttle: true }, STEP);
      expect(race.events).toContainEqual({
        type: 'mini-turbo',
        kart: race.player.index,
        value: stage,
      });
      expect(race.player.driftDir).toBe(0);
      expect(race.player.driftCharge).toBe(0);
      expect(race.player.boost).toBeCloseTo(stage === 2 ? 1.25 : 0.7);
      run(race, { throttle: true }, 0.1);
      expect(race.player.speed).toBeGreaterThan(speed + 2);
    },
  );

  it('starts a held drift after accelerating out of a low-speed hop', () => {
    const race = solo(190);
    race.karts = [race.player];
    race.player.speed = 11;
    run(race, { drift: true }, 0.5);
    expect(race.player.grounded).toBe(true);
    expect(race.player.driftDir).toBe(0);
    run(race, { throttle: true, drift: true, right: true }, 0.7);
    expect(race.player.driftDir).toBe(-1);
    expect(race.player.driftCharge).toBeGreaterThan(0);
  });

  it('does not reward an uncharged drift or a spin-out with a mini-turbo', () => {
    for (const spin of [false, true]) {
      const race = solo(200);
      race.karts = [race.player];
      race.player.speed = 60;
      run(race, { throttle: true, drift: true, right: true }, spin ? 1 : 0.3);
      expect(race.player.driftStage).toBe(spin ? 1 : 0);
      if (spin) race.player.spin = 1;
      stepRace(race, { ...EMPTY_CONTROLS, throttle: true }, STEP);
      expect(race.player.boost).toBe(0);
      expect(race.events.some((e) => e.type === 'mini-turbo')).toBe(false);
    }
  });

  it('does not activate a boost strip while flying above it', () => {
    const race = solo();
    race.karts = [race.player];
    Object.assign(race.player, {
      x: -125.13,
      z: 511.65,
      y: 30,
      speed: 60,
      grounded: false,
    });
    stepRace(race, { ...EMPTY_CONTROLS, throttle: true }, STEP);
    expect(race.player.boost).toBe(0);
    expect(race.player.boostPanelContact).toBe(false);
  });

  // Centers of all nine ef_dushBoard strips in the shipped course mesh.
  it.each([
    [-157.58, 505.58],
    [-185.15, 488.04],
    [-203.74, 462.55],
    [-125.13, 511.65],
    [-92.65, 505.64],
    [-65.04, 488.15],
    [-39.95, 439.66],
    [-46.41, 462.68],
    [-210.19, 439.41],
  ])('drives through boost strip at (%s, %s) without a wall impact', (x, z) => {
    const race = solo();
    race.karts = [race.player];
    expect(surfaceAt(surface, x, z)).toBe(SURFACE.boost);
    const n = nearest(x, z);
    Object.assign(race.player, {
      x: x - n.tx * 9,
      z: z - n.tz * 9,
      heading: Math.atan2(n.tx, n.tz),
      speed: 60,
    });
    race.player.y = heightAt(surface, race.player.x, race.player.z);
    let boosts = 0;
    for (let i = 0; i < 15; i++) {
      stepRace(race, { ...EMPTY_CONTROLS, throttle: true }, STEP);
      expect(race.events.some((e) => e.type === 'wall')).toBe(false);
      boosts += race.events.filter((e) => e.type === 'boost').length;
      race.events.length = 0;
    }
    expect(boosts).toBe(1);
    expect(race.player.speed).toBeGreaterThan(70);
    expect((race.player.x - x) * n.tx + (race.player.z - z) * n.tz).toBeGreaterThan(5);
    // Moving to ordinary road must let the boost expire, not refresh it forever.
    const p = pointAt(10);
    Object.assign(race.player, { x: p.x, z: p.z, y: p.y, heading: p.heading });
    run(race, { throttle: true }, 1.2);
    expect(race.player.boost).toBe(0);
    expect(race.player.boostPanelContact).toBe(false);
  });

  it('rocket start rewards timing and burns out when early', () => {
    const timed = newRace({ surface, seed: 1 });
    startRace(timed);
    // Press accelerate while the "2" is showing.
    run(timed, {}, 1.6);
    let rocket = false;
    for (let i = 0; i < 120; i++) {
      stepRace(timed, { ...EMPTY_CONTROLS, throttle: true }, STEP);
      rocket ||= timed.events.some(
        (e) => e.type === 'rocket-start' && e.kart === timed.player.index,
      );
      timed.events.length = 0;
    }
    expect(rocket).toBe(true);
    const early = newRace({ surface, seed: 1 });
    startRace(early);
    run(early, { throttle: true }, 3.1);
    expect(early.player.burnout).toBeGreaterThan(0);
  });

  it('driving through an item box rolls the roulette and lands an item', () => {
    const race = go();
    const k = race.player;
    const box = race.boxes[0];
    Object.assign(k, { x: box.x, z: box.z, y: box.y - 2.2 });
    run(race, {}, STEP);
    expect(k.roulette).toBeGreaterThan(0);
    run(race, {}, 2);
    expect(k.item).not.toBeNull();
  });

  it('mushroom boosts past top speed', () => {
    const race = solo();
    run(race, { throttle: true }, 2);
    const cruise = race.player.speed;
    race.player.item = 'mushroom';
    race.player.itemCount = 1;
    run(race, { throttle: true, item: true }, STEP);
    run(race, { throttle: true }, 0.3);
    expect(race.player.item).toBeNull();
    expect(race.player.speed).toBeGreaterThan(cruise * 1.1);
  });

  it('bananas drop behind and spin out whoever hits them', () => {
    const race = solo();
    const k = race.player;
    k.item = 'banana';
    k.itemCount = 1;
    run(race, { item: true }, 0.1);
    expect(k.trailing).toBe(true);
    run(race, {}, STEP);
    expect(race.projectiles.some((p) => p.kind === 'banana')).toBe(true);
    const banana = race.projectiles.find((p) => p.kind === 'banana')!;
    const victim = race.karts[0];
    Object.assign(victim, { x: banana.x, z: banana.z, y: banana.y, speed: 30 });
    run(race, {}, 0.1);
    expect(victim.spin).toBeGreaterThan(0);
  });

  it('green shells fire forward and knock over a racer ahead', () => {
    const race = solo();
    const k = race.player;
    const victim = race.karts[0];
    const ahead = pointAt(k.progress + 25);
    Object.assign(victim, {
      x: ahead.x,
      z: ahead.z,
      y: ahead.y,
      heading: ahead.heading,
      speed: 0,
      progress: k.progress + 25,
    });
    k.item = 'green-shell';
    k.itemCount = 1;
    run(race, { item: true }, 0.1);
    run(race, {}, 1.5);
    expect(victim.hits).toBeGreaterThan(0);
  });

  it.each(['triple-banana', 'triple-green-shell'] as const)(
    '%s loses one item each time its rear shield takes a hit',
    (item) => {
      const race = solo();
      const k = race.player;
      k.item = item;
      k.itemCount = 3;
      for (const remaining of [2, 1, 0]) {
        k.trailing = true;
        race.projectiles.push({
          id: ++race.nextId,
          kind: 'banana',
          owner: -1,
          target: -1,
          x: k.x - Math.sin(k.heading),
          z: k.z - Math.cos(k.heading),
          y: k.y,
          vx: 0,
          vy: 0,
          vz: 0,
          age: 1,
          life: 10,
          bounces: 0,
          fuse: 0,
          progress: k.progress,
          trackIndex: k.trackIndex,
          grounded: true,
        });
        run(race, { item: true }, STEP);
        expect(k.trailing).toBe(false);
        expect(k.itemCount).toBe(remaining);
        expect(k.item).toBe(remaining ? item : null);
        expect(k.spin).toBe(0);
      }
    },
  );

  it('red shells home in on the racer ahead', () => {
    const race = solo();
    const k = race.player;
    const victim = race.karts[0];
    const ahead = pointAt(k.progress + 60, 6);
    Object.assign(victim, {
      x: ahead.x,
      z: ahead.z,
      y: ahead.y,
      heading: ahead.heading,
      speed: 0,
      progress: k.progress + 60,
    });
    race.karts.forEach((o) => {
      if (o !== victim && !o.human) o.progress = k.progress - 200;
    });
    k.item = 'red-shell';
    k.itemCount = 1;
    run(race, { item: true }, 0.1);
    run(race, {}, 3);
    expect(victim.hits).toBeGreaterThan(0);
  });

  it('a star makes the kart invincible and faster', () => {
    const race = solo();
    const k = race.player;
    k.item = 'star';
    k.itemCount = 1;
    run(race, { throttle: true, item: true }, STEP);
    expect(k.star).toBeGreaterThan(0);
    k.spin = 0;
    run(race, { throttle: true }, 1.5);
    expect(k.speed).toBeGreaterThan(40);
  });

  it('lightning shrinks every rival and takes their items', () => {
    const race = solo();
    const rival = race.karts[0];
    rival.item = 'banana';
    rival.itemCount = 1;
    race.player.item = 'lightning';
    race.player.itemCount = 1;
    run(race, { item: true }, STEP);
    expect(race.karts.filter((o) => !o.human).every((o) => o.shrink > 0)).toBe(true);
    expect(rival.item).toBeNull();
    expect(race.player.shrink).toBe(0);
  });

  it('golden mushroom can be used repeatedly until it expires', () => {
    const race = solo();
    const k = race.player;
    k.item = 'golden-mushroom';
    k.itemCount = 1;
    let boosts = 0;
    for (let i = 0; i < 8; i++) {
      run(race, { throttle: true, item: true }, 0.1);
      run(race, { throttle: true }, 0.4);
      if (k.boost > 0 || k.item === 'golden-mushroom') boosts++;
    }
    expect(boosts).toBeGreaterThan(3);
    run(race, { throttle: true }, 9);
    expect(k.item).toBeNull();
  });

  it('pausing freezes the simulation', () => {
    const race = go();
    run(race, { throttle: true }, 1);
    pauseRace(race);
    const before = raceText(race);
    run(race, { throttle: true }, 1);
    expect(raceText(race)).toBe(before);
    startRace(race);
    expect(race.phase).toBe('racing');
  });

  it('standings rank finished racers by time', () => {
    const race = go(9);
    run(race, {}, 160);
    const order = standings(race).filter((s) => s.kart.finishedAt !== null);
    for (let i = 1; i < order.length; i++)
      expect(order[i].time).toBeGreaterThanOrEqual(order[i - 1].time);
  });
});
