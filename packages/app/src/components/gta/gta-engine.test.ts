import { describe, it, expect } from 'vitest';
import {
  changeVehicle,
  beginTour,
  cityText,
  EMPTY_CONTROLS,
  enterExit,
  interact,
  newCity,
  stepCity,
  target,
} from './gta-engine';
import {
  blocked,
  BUILDINGS,
  DESTINATIONS,
  GARAGE,
  JOBS,
  lanePoint,
  START,
  START_ANGLE,
} from './gta-world';
const driving = (): ReturnType<typeof newCity> => ({ ...newCity(), phase: 'driving' });
const advance = (s: ReturnType<typeof newCity>, c = EMPTY_CONTROLS, seconds = 1) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) stepCity(s, c, 1 / 60);
};
describe('GTA 3D simulation', () => {
  it('offers a driveable, untimed NVIDIA tour without silently teleporting', () => {
    const s = driving();
    const before = { ...s.player };
    expect(beginTour(s, 6)).toBe(true);
    expect(s.player).toEqual(before);
    s.time = 0.01;
    advance(s);
    expect(s.time).toBe(0.01);
    expect(s.phase).toBe('driving');
    expect(target(s).en).toContain('NVIDIA');
  });
  it('fast travels explicitly to safe destinations without advancing missions', () => {
    for (let i = 0; i < DESTINATIONS.length; i++) {
      const s = driving();
      expect(beginTour(s, i, true)).toBe(true);
      expect(blocked(s.player, 1.3)).toBe(false);
      expect(s.car.x).toBe(DESTINATIONS[i].x);
      expect(interact(s)).toBe(true);
      expect(s.job).toBe(0);
      expect(s.cash).toBe(0);
    }
    const s = driving();
    expect(beginTour(s, -1, true)).toBe(false);
  });
  it('starts independently at a clear spawn', () => {
    const a = newCity(),
      b = newCity();
    a.police.push({ ...a.car });
    expect(b.police).toHaveLength(0);
    expect(a.car).toMatchObject(START);
    expect(blocked(a.car)).toBe(false);
  });
  it('requires manual steering and supports forward, reverse and braking', () => {
    const s = driving();
    advance(s, { ...EMPTY_CONTROLS, forward: true });
    expect(s.car.z).toBeLessThan(START.z - 5);
    expect(s.car.angle).toBe(START_ANGLE);
    const speed = s.car.speed;
    advance(s, { ...EMPTY_CONTROLS, brake: true });
    expect(s.car.speed).toBeLessThan(speed / 2);
    advance(s, { ...EMPTY_CONTROLS, reverse: true });
    expect(s.car.speed).toBeLessThan(0);
  });
  it('steers in the requested direction', () => {
    const s = driving();
    advance(s, { ...EMPTY_CONTROLS, forward: true, right: true }, 0.8);
    expect(s.car.angle).toBeLessThan(START_ANGLE);
  });
  it('collides with buildings and cannot leave the bounded city', () => {
    expect(BUILDINGS.every((b) => blocked(b.ring[0]))).toBe(true);
    const s = driving();
    s.car = { x: 948, z: 1500, angle: Math.PI / 2, speed: 40 };
    advance(s, EMPTY_CONTROLS, 0.2);
    expect(s.car.x).toBeLessThan(950);
    expect(s.health).toBeLessThan(100);
  });
  it.each(['ready', 'paused', 'won', 'busted'] as const)('freezes %s completely', (phase) => {
    const s = newCity();
    s.phase = phase;
    const before = cityText(s);
    advance(s, { ...EMPTY_CONTROLS, forward: true });
    expect(cityText(s)).toBe(before);
  });
  it('ignores invalid time and caps catchup', () => {
    const s = driving(),
      before = cityText(s);
    for (const dt of [NaN, Infinity, -1, 0]) stepCity(s, EMPTY_CONTROLS, dt);
    expect(cityText(s)).toBe(before);
    stepCity(s, EMPTY_CONTROLS, 50);
    expect(s.time).toBeCloseTo(480 - 1 / 30);
  });
  it('only exits a stopped car and requires proximity to reenter', () => {
    const s = driving();
    s.car.speed = 10;
    expect(enterExit(s)).toBe(false);
    s.car.speed = 0;
    expect(enterExit(s)).toBe(true);
    expect(s.onFoot).toBe(true);
    advance(s, { ...EMPTY_CONTROLS, forward: true, sprint: true }, 2);
    expect(enterExit(s)).toBe(false);
    s.player = { ...s.car };
    expect(enterExit(s)).toBe(true);
  });
  it('exits through the opposite door when parked beside a building', () => {
    const s = driving();
    s.car = { x: 348, z: 2130, angle: Math.PI, speed: 0 };
    expect(blocked(s.car)).toBe(false);
    expect(blocked({ x: 345, z: 2130 }, 0.4)).toBe(true);
    expect(enterExit(s)).toBe(true);
    expect(s.player.x).toBeCloseTo(351);
    expect(blocked(s.player, 0.4)).toBe(false);
  });
  it('reports an obstructed exit without moving the player', () => {
    const s = driving();
    s.car = { ...BUILDINGS[0], angle: 0, speed: 0 };
    const before = { ...s.player };
    expect(enterExit(s)).toBe(false);
    expect(s.message).toBe('blocked');
    expect(s.onFoot).toBe(false);
    expect(s.player).toEqual(before);
  });
  it('changes parked cars but not moving vehicles or on foot', () => {
    const s = driving();
    expect(changeVehicle(s)).toBe(true);
    expect(s.vehicle).toBe('buffalo');
    s.car.speed = 4;
    expect(changeVehicle(s)).toBe(false);
    s.car.speed = 0;
    s.onFoot = true;
    expect(changeVehicle(s)).toBe(false);
  });
  it('requires each pickup and garage delivery to win', () => {
    const s = driving();
    s.player.x += 40;
    expect(interact(s)).toBe(false);
    for (const job of JOBS) {
      s.player = { ...job, angle: 0, speed: 0 };
      expect(target(s)).toEqual(job);
      expect(interact(s)).toBe(true);
    }
    expect(s.phase).toBe('won');
    expect(s.cash).toBe(5000);
    expect(interact(s)).toBe(false);
  });
  it('cannot collect at speed or while paused', () => {
    const s = driving();
    s.player = { ...JOBS[0], angle: 0, speed: 9 };
    expect(interact(s)).toBe(false);
    s.player.speed = 0;
    s.phase = 'paused';
    expect(interact(s)).toBe(false);
  });
  it('repairs only while parked at garage', () => {
    const s = driving();
    s.car = { ...GARAGE, angle: 0, speed: 0 };
    s.player = { ...s.car };
    s.health = 50;
    advance(s);
    expect(s.health).toBeGreaterThan(59);
  });
  it('lets the player escape police and applies damage cooldowns', () => {
    const s = driving();
    s.heat = 1;
    s.police = [{ ...s.player }];
    advance(s, EMPTY_CONTROLS, 0.2);
    expect(s.health).toBe(88);
    s.police = [];
    s.heat = 1;
    advance(s, EMPTY_CONTROLS, 16);
    expect(s.heat).toBe(0);
  });
  it('traffic stays on roads and uses distinct car models', () => {
    for (let lane = 0; lane < 3; lane++)
      for (let d = 0; d < 2500; d += 10) expect(blocked(lanePoint(d, lane))).toBe(false);
    expect(new Set(newCity().traffic.map((t) => t.model)).size).toBe(4);
  });
  it('police continue from a route endpoint toward a clear mid-block target', () => {
    const s = driving();
    s.car = { x: 0, z: 1250, angle: 0, speed: 0 };
    s.player = { ...s.car };
    s.heat = 1;
    s.police = [{ x: 0, z: 1000, angle: 0, speed: 0 }];
    advance(s, EMPTY_CONTROLS, 4);
    expect(s.police[0].z).toBeGreaterThan(1070);
    expect(s.police[0].speed).toBeGreaterThan(0);
  });
  it('ends the run on timeout or zero health', () => {
    const s = driving();
    s.time = 0.001;
    advance(s);
    expect(s.phase).toBe('busted');
    const b = driving();
    b.health = 0;
    advance(b);
    expect(b.phase).toBe('busted');
  });
  it('flight does not mutate the city mission and stays above terrain', () => {
    const s = driving();
    s.explorer = true;
    advance(s, { ...EMPTY_CONTROLS, forward: true, brake: true }, 3);
    expect(s.altitude).toBe(750);
    expect(s.time).toBe(480);
    expect(s.car).toMatchObject(START);
    expect(enterExit(s)).toBe(false);
    expect(interact(s)).toBe(false);
  });
});
