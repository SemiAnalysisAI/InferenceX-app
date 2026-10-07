import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  changeVehicle,
  beginTour,
  cityText,
  EMPTY_CONTROLS,
  enterExit,
  interact,
  markerFor,
  newCity,
  START_POINT,
  stepCity,
  target,
  travel,
  type CityState,
  type Controls,
} from './gta-engine';
import { distance, JOB_IDS, TOUR_STOPS, World, type CityData } from './gta-world';
import { streetRoute } from './gta-navigation';
import { objectiveStatus } from './gta-hud';

// The real San Fierro data on flat terrain keeps these tests independent of
// browser image decoding while still exercising the actual street network.
let world: World;
beforeAll(() => {
  const data = JSON.parse(
    readFileSync(resolve(process.cwd(), 'public/decorative/gta/sf/city.json'), 'utf8'),
  ) as CityData;
  const g = data.grid;
  const tw = Math.ceil((g.x1 - g.x0) / g.terrain) + 1,
    th = Math.ceil((g.z1 - g.z0) / g.terrain) + 1,
    gw = Math.ceil((g.x1 - g.x0) / g.ground) + 1,
    gh = Math.ceil((g.z1 - g.z0) / g.ground) + 1;
  world = new World(
    data,
    { width: tw, height: th, data: new Float32Array(tw * th) },
    { width: gw, height: gh, data: new Uint8Array(gw * gh) },
  );
});

const driving = () => ({ ...newCity(world), phase: 'driving' as const });
const advance = (s: CityState, c: Controls = EMPTY_CONTROLS, seconds = 1) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) stepCity(world, s, c, 1 / 60);
};

describe('San Fierro world data', () => {
  it('keeps both compressed-region access roads clear of buildings', () => {
    const connectors = world.roads.filter(
      (road) => road.name.endsWith('Connector') && road.cls < 100,
    );
    expect(connectors).toHaveLength(2);
    for (const road of connectors) {
      for (let s = 0; s <= road.length; s += 4) {
        expect(world.blocked(world.lanePoint(road, s, 0), 4), road.name).toBe(false);
      }
    }
  });
  it('places the real landmarks, including Oren’s Hummus and the South Bay campuses', () => {
    for (const id of [
      'oren',
      'transamerica',
      'coit',
      'ferry',
      'gg_south',
      'nvidia_endeavor',
      'amd_hq',
    ])
      expect(world.landmarks[id], id).toBeDefined();
    expect(world.southBay(world.landmarks.nvidia_endeavor)).toBe(true);
    expect(world.southBay(world.landmarks.amd_hq)).toBe(true);
    expect(world.southBay(world.landmarks.oren)).toBe(false);
    expect(world.buildings.length).toBeGreaterThan(10000);
  });
  it('names streets and districts from the map', () => {
    const s = newCity(world);
    expect(world.street(s.car.x, s.car.z)).not.toBe('');
    expect(world.district(s.car).en).toBe('SoMa');
  });
});

describe('San Fierro simulation', () => {
  it.each(TOUR_STOPS)('keeps sightseeing stop $id reachable and safe', ({ id }) => {
    const s = driving();
    expect(beginTour(world, s, id, true)).toBe(true);
    expect(world.blocked(s.car, 1.15)).toBe(false);
    expect(target(world, s).id).toBe(id);
    expect(streetRoute(world, newCity(world).car, s.car).length).toBeGreaterThan(1);
    expect(interact(world, s)).toBe(true);
    expect(s.cash).toBe(0);
    expect(s.job).toBe(0);
  });
  it('sets GPS without teleporting and removes only the tour time limit', () => {
    const s = driving();
    const before = { ...s.car };
    expect(beginTour(world, s, 'nvidia_endeavor')).toBe(true);
    expect(s.car).toEqual(before);
    s.time = 0;
    advance(s, EMPTY_CONTROLS, 0.2);
    expect(s.phase).toBe('driving');
    s.health = 0;
    advance(s, EMPTY_CONTROLS, 0.2);
    expect(s.phase).toBe('busted');
  });
  it('rejects invalid or moving fast travel without mutating state', () => {
    const s = driving();
    const before = cityText(world, s);
    expect(beginTour(world, s, 'missing', true)).toBe(false);
    expect(cityText(world, s)).toBe(before);
    s.player.speed = 10;
    s.car.speed = 10;
    expect(beginTour(world, s, 'coit', true)).toBe(false);
    expect(s.tour).toBe(null);
  });
  it('keeps warnings above tour guidance and clears blocked exit when driving resumes', () => {
    const s = driving();
    beginTour(world, s, 'coit');
    const copy = { blockedExit: 'blocked', escape: 'wanted', aim: 'drive', arrived: 'arrived' };
    s.message = 'blocked';
    s.heat = 1;
    expect(objectiveStatus(world, s, copy)).toEqual({ text: 'blocked', warning: true });
    advance(s, { ...EMPTY_CONTROLS, forward: true }, 0.1);
    expect(objectiveStatus(world, s, copy)).toEqual({ text: 'wanted', warning: true });
    s.heat = 0;
    expect(objectiveStatus(world, s, copy).text).toContain('GPS');
  });
  it('starts on a clear lane near Oren’s Hummus with traffic and pedestrians', () => {
    const a = newCity(world),
      b = newCity(world);
    a.police.push({ ...a.car } as never);
    expect(b.police).toHaveLength(0);
    expect(distance(a.car, START_POINT)).toBeLessThan(200);
    expect(world.blocked(a.car, 0.8)).toBe(false);
    expect(a.traffic.length).toBeGreaterThan(10);
    expect(a.peds.length).toBeGreaterThan(10);
    expect(target(world, a).id).toBe('oren');
  });
  it('drives forward along the heading, brakes and reverses', () => {
    const s = driving();
    const start = { ...s.car };
    advance(s, { ...EMPTY_CONTROLS, forward: true });
    const moved = { x: s.car.x - start.x, z: s.car.z - start.z };
    expect(Math.hypot(moved.x, moved.z)).toBeGreaterThan(3);
    expect(moved.x * Math.sin(start.angle) + moved.z * Math.cos(start.angle)).toBeGreaterThan(0);
    const speed = s.car.speed;
    advance(s, { ...EMPTY_CONTROLS, brake: true });
    expect(s.car.speed).toBeLessThan(speed / 2);
    advance(s, { ...EMPTY_CONTROLS, reverse: true }, 1.5);
    expect(s.car.speed).toBeLessThan(0);
  });
  it.each(['ready', 'paused', 'won', 'busted'] as const)('freezes %s completely', (phase) => {
    const s = newCity(world);
    s.phase = phase;
    const before = cityText(world, s);
    advance(s, { ...EMPTY_CONTROLS, forward: true });
    expect(cityText(world, s)).toBe(before);
  });
  it('ignores invalid time steps', () => {
    const s = driving(),
      before = cityText(world, s);
    for (const dt of [NaN, Infinity, -1, 0]) stepCity(world, s, EMPTY_CONTROLS, dt);
    expect(cityText(world, s)).toBe(before);
  });
  it('only exits a stopped car, animates walking and requires proximity to reenter', () => {
    const s = driving();
    s.car.speed = 10;
    expect(enterExit(world, s)).toBe(false);
    s.car.speed = 0;
    expect(enterExit(world, s)).toBe(true);
    expect(s.onFoot).toBe(true);
    const stride = s.player.stride;
    advance(s, { ...EMPTY_CONTROLS, forward: true, sprint: true }, 3);
    expect(s.player.stride).toBeGreaterThan(stride + 1);
    expect(distance(s.player, s.car)).toBeGreaterThan(5);
    expect(enterExit(world, s)).toBe(false);
    s.player = { ...s.player, x: s.car.x + 1, z: s.car.z };
    expect(enterExit(world, s)).toBe(true);
    expect(s.onFoot).toBe(false);
  });
  it('changes vehicle only while stopped', () => {
    const s = driving();
    const v = s.vehicle;
    s.car.speed = 10;
    expect(changeVehicle(s)).toBe(false);
    s.car.speed = 0;
    expect(changeVehicle(s)).toBe(true);
    expect(s.vehicle).not.toBe(v);
  });
  it('collects only at the marker and finishes after NVIDIA and AMD', () => {
    const s = driving();
    expect(interact(world, s)).toBe(false);
    for (const id of JOB_IDS) {
      expect(target(world, s).id).toBe(id);
      const m = markerFor(world, id);
      s.player = { ...s.player, x: m.x, z: m.z, speed: 0 };
      s.car = { ...s.car, x: m.x, z: m.z, speed: 0 };
      expect(interact(world, s)).toBe(true);
    }
    expect(s.phase).toBe('won');
    expect(s.cash).toBeGreaterThan(0);
  });
  it('quick-travels to San Jovano and back when stopped', () => {
    const s = driving();
    s.car.speed = 20;
    s.player.speed = 20;
    expect(travel(world, s, 'south')).toBe(false);
    s.car.speed = 0;
    s.player.speed = 0;
    expect(travel(world, s, 'south')).toBe(true);
    expect(world.southBay(s.car)).toBe(true);
    expect(distance(s.car, world.landmarks.nvidia_endeavor)).toBeLessThan(800);
    expect(travel(world, s, 'city')).toBe(true);
    expect(world.southBay(s.car)).toBe(false);
  });
  it('flies the San Andreas explorer within bounds', () => {
    const s = { ...driving(), explorer: true, altitude: 900 };
    advance(s, { ...EMPTY_CONTROLS, forward: true, sprint: true }, 60);
    expect(Math.abs(s.player.x)).toBeLessThanOrEqual(5500);
    expect(Math.abs(s.player.z)).toBeLessThanOrEqual(7000);
    expect(s.altitude).toBeLessThanOrEqual(2600);
  });
});
