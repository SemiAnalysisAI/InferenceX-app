import { describe, expect, it } from 'vitest';
import {
  CRATE_GOAL,
  EMPTY_CONTROLS,
  gameText,
  interact,
  nearbyStop,
  newHeist,
  objective,
  stepHeist,
} from './heist-engine';
import {
  distance,
  driveable,
  inBay,
  OFFICES,
  onRoad,
  ROADS,
  routeTo,
  SAFEHOUSE,
} from './heist-world';

function driving() {
  const state = newHeist();
  state.phase = 'driving';
  return state;
}

describe('Bay Area heist simulation', () => {
  it('starts parked at a driveable safehouse with independent run state', () => {
    const a = newHeist();
    const b = newHeist();
    a.collected.push('openai');
    expect(b.collected).toEqual([]);
    expect(b.phase).toBe('ready');
    expect(b.car).toMatchObject(SAFEHOUSE);
    expect(b.health).toBe(100);
    expect(driveable(b.car)).toBe(true);
    expect(objective(b).id).toBe('openai');
  });

  it('accelerates forward with elapsed time and decreases the round timer', () => {
    const state = driving();
    for (let i = 0; i < 60; i++) stepHeist(state, { ...EMPTY_CONTROLS, forward: true }, 1 / 60);
    expect(state.car.y).toBeLessThan(SAFEHOUSE.y - 70);
    expect(state.car.speed).toBeGreaterThan(100);
    expect(state.time).toBeCloseTo(299);
  });

  it('steers while moving but does not rotate a parked car', () => {
    const state = driving();
    const angle = state.car.angle;
    stepHeist(state, { ...EMPTY_CONTROLS, right: true }, 1 / 60);
    expect(state.car.angle).toBe(angle);
    state.car.speed = 120;
    stepHeist(state, { ...EMPTY_CONTROLS, right: true }, 1 / 60);
    expect(state.car.angle).toBeGreaterThan(angle);
  });

  it('allows reverse and handbrake slows a moving car', () => {
    const state = driving();
    stepHeist(state, { ...EMPTY_CONTROLS, reverse: true }, 1 / 60);
    expect(state.car.speed).toBeLessThan(0);
    state.car.speed = 120;
    stepHeist(state, { ...EMPTY_CONTROLS, brake: true }, 1 / 60);
    expect(state.car.speed).toBeLessThan(120);
    expect(state.skid.length).toBe(1);
  });

  it('does not collect remotely, at speed, or while paused', () => {
    const state = driving();
    expect(interact(state)).toBe(false);
    Object.assign(state.car, OFFICES[0], { speed: 70 });
    expect(interact(state)).toBe(false);
    state.car.speed = 0;
    state.phase = 'paused';
    expect(interact(state)).toBe(false);
    expect(state.collected).toEqual([]);
  });

  it('collects once, raises heat, spawns a pursuer and selects another office', () => {
    const state = driving();
    Object.assign(state.car, OFFICES[0]);
    expect(nearbyStop(state)).toBe('openai');
    expect(interact(state)).toBe(true);
    expect(interact(state)).toBe(false);
    expect(state.collected).toEqual(['openai']);
    expect(state.heat).toBe(2);
    expect(state.police).toHaveLength(1);
    expect(state.target).toBe('anthropic');
  });

  it('requires three different crates and delivery at the safehouse to win', () => {
    const state = driving();
    for (const office of OFFICES.slice(0, CRATE_GOAL)) {
      Object.assign(state.car, office);
      expect(interact(state)).toBe(true);
    }
    expect(objective(state).id).toBe('safehouse');
    expect(state.phase).toBe('driving');
    expect(interact(state)).toBe(false);
    Object.assign(state.car, SAFEHOUSE);
    expect(interact(state)).toBe(true);
    expect(state.phase).toBe('won');
  });

  it.each(['ready', 'paused', 'won', 'busted'] as const)(
    'freezes every simulation field during %s',
    (phase) => {
      const state = driving();
      state.phase = phase;
      const before = gameText(state);
      stepHeist(state, { ...EMPTY_CONTROLS, forward: true }, 1);
      expect(gameText(state)).toBe(before);
    },
  );

  it('fails when the clock expires and cannot collect afterward', () => {
    const state = driving();
    state.time = 0.001;
    stepHeist(state, EMPTY_CONTROLS, 1 / 60);
    expect(state.time).toBe(0);
    expect(state.phase).toBe('busted');
    Object.assign(state.car, OFFICES[0]);
    expect(interact(state)).toBe(false);
  });

  it('pursuer contact damages the car once per cooldown, not once per frame', () => {
    const state = driving();
    state.police.push({ ...SAFEHOUSE });
    stepHeist(state, EMPTY_CONTROLS, 1 / 60);
    expect(state.health).toBe(85);
    stepHeist(state, EMPTY_CONTROLS, 1 / 60);
    expect(state.health).toBe(85);
    state.immunity = 0;
    state.health = 10;
    stepHeist(state, EMPTY_CONTROLS, 1 / 60);
    expect(state.phase).toBe('busted');
    expect(state.health).toBe(0);
  });

  it('keeps the car inside the world after a fast collision', () => {
    const state = driving();
    Object.assign(state.car, { x: 72, y: 100, angle: Math.PI, speed: 300, vx: -300, vy: 0 });
    stepHeist(state, EMPTY_CONTROLS, 1 / 20);
    expect(state.car.x).toBeGreaterThan(70);
    expect(state.health).toBe(92);
    expect(state.car.speed).toBeLessThan(0);
  });

  it('bounds catch-up and ignores invalid elapsed times', () => {
    const state = driving();
    stepHeist(state, EMPTY_CONTROLS, 100);
    expect(state.time).toBeCloseTo(299.95);
    const before = gameText(state);
    for (const value of [NaN, Infinity, -1, 0]) stepHeist(state, EMPTY_CONTROLS, value);
    expect(gameText(state)).toBe(before);
  });
});

describe('schematic road map', () => {
  it('keeps every office and safehouse reachable and on a road', () => {
    for (const stop of [...OFFICES, SAFEHOUSE]) {
      expect(driveable(stop)).toBe(true);
      expect(onRoad(stop)).toBe(true);
      const path = routeTo(SAFEHOUSE, stop);
      expect(path.at(-1)).toEqual(stop);
      expect(path[0]).toEqual(SAFEHOUSE);
      for (let i = 1; i < path.length; i++) {
        const midpoint = { x: (path[i - 1].x + path[i].x) / 2, y: (path[i - 1].y + path[i].y) / 2 };
        expect(onRoad(midpoint)).toBe(true);
      }
    }
  });

  it('blocks bay water but permits the bridge deck', () => {
    const water = { x: 1350, y: 800 };
    expect(inBay(water)).toBe(true);
    expect(driveable(water)).toBe(false);
    const a = ROADS[3][1];
    const b = ROADS[3][2];
    const bridge = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    expect(inBay(bridge)).toBe(true);
    expect(driveable(bridge)).toBe(true);
  });

  it('gives an ordered connected route from SF to the South Bay', () => {
    const path = routeTo(OFFICES[1], OFFICES[6]);
    expect(path.length).toBeGreaterThan(5);
    const length = path.slice(1).reduce((total, p, i) => total + distance(path[i], p), 0);
    expect(length).toBeGreaterThan(distance(OFFICES[1], OFFICES[6]));
  });
});
