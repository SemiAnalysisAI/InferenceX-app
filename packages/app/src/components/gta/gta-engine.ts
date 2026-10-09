import {
  distance,
  JOB_IDS,
  ROAD,
  TRAFFIC_MODELS,
  TOUR_STOPS,
  VEHICLES,
  type Point,
  type Road,
  type TrafficModel,
  type Vehicle,
  type World,
  type TourId,
} from './gta-world';

export interface Controls {
  forward: boolean;
  reverse: boolean;
  left: boolean;
  right: boolean;
  brake: boolean;
  sprint: boolean;
}
export const EMPTY_CONTROLS: Controls = {
  forward: false,
  reverse: false,
  left: false,
  right: false,
  brake: false,
  sprint: false,
};

export interface Actor extends Point {
  angle: number;
  speed: number;
}
export interface Car extends Actor {
  y: number;
  vy: number;
  /** Lateral (sideways) velocity in m/s; non-zero while sliding. */
  slip: number;
  steer: number;
  airborne: boolean;
  /** Wheel rotation in radians, used by the renderer. */
  spin: number;
}
export interface Walker extends Actor {
  y: number;
  /** Accumulated stride phase in radians for the walk cycle. */
  stride: number;
}
export interface LaneAgent extends Actor {
  y: number;
  lane: number;
  s: number;
  dir: 1 | -1;
  model: TrafficModel;
  paint: number;
  cruise: number;
  spin: number;
}
export interface Ped extends Walker {
  lane: number;
  s: number;
  dir: 1 | -1;
  side: 1 | -1;
  model: number;
  /** Seconds remaining knocked down, or 0. */
  down: number;
  flee: number;
}

export interface CityState {
  phase: 'ready' | 'driving' | 'paused' | 'won' | 'busted';
  player: Walker;
  car: Car;
  onFoot: boolean;
  vehicle: Vehicle;
  paint: number;
  health: number;
  elapsed: number;
  time: number;
  /** Hour of day, 0-24. */
  clock: number;
  job: number;
  cash: number;
  heat: number;
  escape: number;
  immunity: number;
  police: LaneAgent[];
  traffic: LaneAgent[];
  peds: Ped[];
  message:
    | 'drive'
    | 'pickup'
    | 'escape'
    | 'repair'
    | 'vehicle'
    | 'far'
    | 'fast'
    | 'blocked'
    | 'travel';
  night: boolean;
  fog: boolean;
  camera: number;
  explorer: boolean;
  altitude: number;
  /** Deterministic RNG state. */
  seed: number;
  tour: TourId | null;
}

export const SPECS: Record<
  Vehicle,
  { top: number; accel: number; grip: number; wheelbase: number; en: string }
> = {
  buffalo: { top: 52, accel: 7.5, grip: 10, wheelbase: 2.9, en: 'Bravado Buffalo' },
  adder: { top: 66, accel: 10, grip: 13, wheelbase: 2.7, en: 'Truffade Adder' },
  blista: { top: 40, accel: 5.2, grip: 9, wheelbase: 2.5, en: 'Dinka Blista' },
  taxi: { top: 42, accel: 5.5, grip: 8.5, wheelbase: 2.9, en: 'Vapid Taxi' },
  dilettante: { top: 38, accel: 4.6, grip: 9, wheelbase: 2.7, en: 'Karin Dilettante' },
  raiden: { top: 58, accel: 11, grip: 11, wheelbase: 2.95, en: 'Coil Raiden' },
  baller: { top: 46, accel: 6.2, grip: 8, wheelbase: 2.9, en: 'Gallivanter Baller' },
  stanier: { top: 43, accel: 5.6, grip: 8.5, wheelbase: 2.9, en: 'Vapid Stanier' },
};

const rand = (s: CityState) => {
  s.seed = (s.seed * 1664525 + 1013904223) >>> 0;
  return s.seed / 4294967296;
};

const markers = new WeakMap<World, Map<string, Point>>();
export function markerFor(world: World, id: string): Point {
  let cache = markers.get(world);
  if (!cache) {
    cache = new Map();
    markers.set(world, cache);
  }
  let point = cache.get(id);
  if (!point) {
    const p = world.landmarks[id];
    const lane = nearestLane(world, p, 400);
    point = lane ? { x: lane.point.x, z: lane.point.z } : p;
    cache.set(id, point);
  }
  return point;
}

export function nearestLane(world: World, p: Point, radius: number) {
  let best: { lane: number; s: number; point: Point & { angle: number }; d: number } | null = null;
  for (const lane of world.lanesNear(p.x, p.z, radius + 400)) {
    const r = world.roads[lane];
    if (r.cls - 100 > ROAD.residential) continue;
    if (
      Math.abs(r.pts[0] - p.x) > radius + r.length ||
      Math.abs(r.pts[1] - p.z) > radius + r.length
    )
      continue;
    for (let s = 0; s <= r.length; s += 4) {
      const q = world.lanePoint(r, s, 0);
      const d = distance(q, p);
      if (d < (best?.d ?? radius)) best = { lane, s, point: q, d };
    }
  }
  return best;
}

export const START_POINT: Point = { x: 470, z: 290 };
/** San Jovano arrival point on the road between NVIDIA Endeavor and AMD HQ. */
export const SOUTH_POINT: Point = { x: -470, z: 6000 };

export function newCity(world: World, seed = 1): CityState {
  const start = nearestLane(world, START_POINT, 200);
  const p = start?.point || START_POINT;
  const angle = start ? start.point.angle : Math.PI;
  const y = world.surface(p.x, p.z);
  const s: CityState = {
    phase: 'ready',
    player: { ...p, y, angle, speed: 0, stride: 0 },
    car: { ...p, y, vy: 0, angle, speed: 0, slip: 0, steer: 0, airborne: false, spin: 0 },
    onFoot: false,
    vehicle: 'buffalo',
    paint: 0,
    health: 100,
    elapsed: 0,
    time: 1500,
    clock: 15.5,
    job: 0,
    cash: 0,
    heat: 0,
    escape: 0,
    immunity: 0,
    police: [],
    traffic: [],
    peds: [],
    message: 'drive',
    night: false,
    fog: false,
    camera: 0,
    explorer: false,
    altitude: 800,
    seed,
    tour: null,
  };
  populate(world, s, true);
  return s;
}

export const target = (world: World, s: CityState) => {
  const id = s.tour ?? JOB_IDS[Math.min(s.job, JOB_IDS.length - 1)];
  return { id, ...markerFor(world, id) };
};

export function beginTour(world: World, s: CityState, id: string, fastTravel = false) {
  const stop = TOUR_STOPS.find((entry) => entry.id === id);
  if (!stop || s.explorer || !['ready', 'paused', 'driving'].includes(s.phase)) return false;
  if (fastTravel && Math.abs(s.player.speed) > 2) return false;
  const p = markerFor(world, stop.id);
  if (fastTravel && world.blocked(p, 1.15)) return false;
  s.tour = stop.id;
  s.phase = 'driving';
  s.message = 'drive';
  if (fastTravel) {
    const face = world.landmarks[id];
    const angle = Math.atan2(face.x - p.x, face.z - p.z);
    const y = world.surface(p.x, p.z);
    s.car = { ...s.car, ...p, y, vy: 0, angle, speed: 0, slip: 0, airborne: false };
    s.player = { ...s.player, ...p, y, angle, speed: 0, stride: 0 };
    s.onFoot = false;
    s.traffic = [];
    s.peds = [];
    s.police = [];
    s.heat = 0;
    populate(world, s, true);
  }
  return true;
}

export function enterExit(world: World, s: CityState) {
  if (s.phase !== 'driving' || s.explorer) return false;
  if (s.onFoot) {
    if (distance(s.player, s.car) > 5) {
      s.message = 'far';
      return false;
    }
    s.onFoot = false;
    s.player = { ...s.player, x: s.car.x, z: s.car.z, angle: s.car.angle, speed: 0 };
  } else {
    if (Math.abs(s.car.speed) > 2) {
      s.message = 'fast';
      return false;
    }
    // Driver door first (left side), then the passenger side, then behind/in front.
    const p = [-Math.PI / 2, Math.PI / 2, Math.PI, 0]
      .map((offset) => ({
        x: s.car.x + Math.sin(s.car.angle + offset) * 1.9,
        z: s.car.z + Math.cos(s.car.angle + offset) * 1.9,
      }))
      .find((point) => !world.blocked(point, 0.35));
    if (!p) {
      s.message = 'blocked';
      return false;
    }
    s.player = {
      ...p,
      y: world.surface(p.x, p.z),
      angle: s.car.angle,
      speed: 0,
      stride: 0,
    };
    s.car.speed = 0;
    s.car.slip = 0;
    s.onFoot = true;
  }
  s.message = 'drive';
  return true;
}

export function interact(world: World, s: CityState) {
  if (s.phase !== 'driving' || s.explorer) return false;
  const t = target(world, s);
  if (distance(s.player, t) > 14 || Math.abs(s.player.speed) > 3) return false;
  if (s.tour !== null) {
    s.health = 100;
    s.message = 'repair';
    return true;
  }
  s.cash += 1500 + s.job * 500;
  s.job++;
  s.message = 'pickup';
  if (s.job === JOB_IDS.length) {
    s.phase = 'won';
    s.car.speed = 0;
    return true;
  }
  s.heat = Math.min(5, s.heat + 1);
  s.escape = 0;
  spawnPolice(world, s);
  return true;
}

export function changeVehicle(s: CityState) {
  if (s.phase !== 'driving' || s.explorer || s.onFoot || Math.abs(s.car.speed) > 2) return false;
  s.vehicle = VEHICLES[(VEHICLES.indexOf(s.vehicle) + 1) % VEHICLES.length];
  s.paint = (s.paint + 1) % 8;
  return true;
}

/** Quick travel between San Fierro and the South Bay when stopped. */
export function travel(world: World, s: CityState, to: 'city' | 'south') {
  if (s.phase !== 'driving' || s.explorer || Math.abs(s.player.speed) > 2) return false;
  const goal = to === 'south' ? SOUTH_POINT : START_POINT;
  const lane = nearestLane(world, goal, 400);
  const p = lane?.point || goal;
  let angle = lane?.point.angle ?? Math.PI;
  // Arrive facing the NVIDIA campus in San Jovano, or downtown in the city.
  const face = to === 'south' ? world.landmarks.nvidia_endeavor : world.landmarks.transamerica;
  if (face && Math.sin(angle) * (face.x - p.x) + Math.cos(angle) * (face.z - p.z) < 0)
    angle += Math.PI;
  const y = world.surface(p.x, p.z);
  s.car = { ...s.car, x: p.x, z: p.z, y, vy: 0, angle, speed: 0, slip: 0, airborne: false };
  s.player = { ...s.player, x: p.x, z: p.z, y, angle, speed: 0 };
  s.onFoot = false;
  s.traffic = [];
  s.peds = [];
  s.police = [];
  s.heat = 0;
  s.message = 'travel';
  populate(world, s, true);
  return true;
}

function laneOffset(r: Road) {
  return r.oneway ? r.width * 0.18 : r.width * 0.25;
}

function placeAgent(world: World, a: LaneAgent) {
  const r = world.roads[a.lane];
  const along = a.dir > 0 ? a.s : r.length - a.s;
  const p = world.lanePoint(r, along, laneOffset(r) * a.dir);
  a.x = p.x;
  a.z = p.z;
  a.angle = a.dir > 0 ? p.angle : p.angle + Math.PI;
  a.y = world.height(a.x, a.z);
}

function nextLane(world: World, s: CityState, a: LaneAgent, toward?: Point) {
  const r = world.roads[a.lane];
  const end = a.dir > 0 ? r.pts.length - 2 : 0;
  const x = r.pts[end],
    z = r.pts[end + 1];
  const options = (world.nodes.get(world.nodeKey(x, z)) || []).filter((o) => {
    if (o.road === a.lane) return false;
    const lane = world.roads[o.road];
    if (lane.cls - 100 > ROAD.residential) return false;
    return !(lane.oneway && o.end === 1);
  });
  if (options.length === 0) {
    // Dead end: turn around unless the street is one-way.
    if (!r.oneway) a.dir = a.dir > 0 ? -1 : 1;
    a.s = 0;
    return !r.oneway;
  }
  let pick = options[Math.floor(rand(s) * options.length)];
  if (toward) {
    let best = Infinity;
    for (const o of options) {
      const lane = world.roads[o.road];
      const far = o.end === 0 ? lane.pts.length - 2 : 0;
      const d = Math.hypot(lane.pts[far] - toward.x, lane.pts[far + 1] - toward.z);
      if (d < best) {
        best = d;
        pick = o;
      }
    }
  }
  a.lane = pick.road;
  a.dir = pick.end === 0 ? 1 : -1;
  a.s = 0;
  return true;
}

function randomLaneNear(world: World, s: CityState, p: Point, min: number, max: number) {
  const pool = world.lanesNear(p.x, p.z, max);
  if (pool.length === 0) return -1;
  for (let attempt = 0; attempt < 40; attempt++) {
    const lane = pool[Math.floor(rand(s) * pool.length)];
    const r = world.roads[lane];
    if (r.cls - 100 > ROAD.residential || r.length < 20) continue;
    const d = Math.hypot(r.pts[0] - p.x, r.pts[1] - p.z);
    if (d < min || d > max) continue;
    return lane;
  }
  return -1;
}

function spawnAgent(
  world: World,
  s: CityState,
  near: Point,
  min: number,
  max: number,
): LaneAgent | null {
  const lane = randomLaneNear(world, s, near, min, max);
  if (lane < 0) return null;
  const r = world.roads[lane];
  const dir: 1 | -1 = r.oneway || rand(s) < 0.5 ? 1 : -1;
  const isBus = r.cls - 100 <= ROAD.secondary && rand(s) < 0.08;
  const a: LaneAgent = {
    x: 0,
    z: 0,
    y: 0,
    angle: 0,
    speed: 0,
    lane,
    s: rand(s) * r.length,
    dir,
    model: isBus ? 'bus' : TRAFFIC_MODELS[Math.floor(rand(s) * TRAFFIC_MODELS.length)],
    paint: Math.floor(rand(s) * 12),
    cruise: [24, 20, 16, 14, 12, 10, 7][Math.min(6, r.cls - 100)] * (0.85 + rand(s) * 0.25),
    spin: 0,
  };
  placeAgent(world, a);
  return a;
}

function spawnPolice(world: World, s: CityState) {
  const a = spawnAgent(world, s, s.player, 140, 320);
  if (!a) return;
  a.model = 'taxi';
  a.cruise = 22 + s.heat * 3;
  s.police.push(a);
}

function populate(world: World, s: CityState, fresh = false) {
  const traffic = 34,
    peds = 42;
  s.traffic = s.traffic.filter((t) => distance(t, s.player) < 460);
  while (s.traffic.length < traffic) {
    const a = spawnAgent(world, s, s.player, fresh ? 20 : 220, fresh ? 360 : 420);
    if (!a) break;
    s.traffic.push(a);
  }
  s.peds = s.peds.filter((p) => distance(p, s.player) < 220);
  while (s.peds.length < peds) {
    const lane = randomLaneNear(world, s, s.player, fresh ? 6 : 90, fresh ? 150 : 200);
    if (lane < 0) break;
    const r = world.roads[lane];
    if (r.cls - 100 < ROAD.primary) continue;
    const ped: Ped = {
      x: 0,
      z: 0,
      y: 0,
      angle: 0,
      speed: 1.15 + rand(s) * 0.5,
      stride: rand(s) * 6,
      lane,
      s: rand(s) * r.length,
      dir: rand(s) < 0.5 ? 1 : -1,
      side: rand(s) < 0.5 ? 1 : -1,
      model: Math.floor(rand(s) * 64),
      down: 0,
      flee: 0,
    };
    placePed(world, ped);
    if (world.blocked(ped, 0.3)) continue;
    s.peds.push(ped);
  }
}

function placePed(world: World, p: Ped) {
  const r = world.roads[p.lane];
  const along = p.dir > 0 ? p.s : r.length - p.s;
  const q = world.lanePoint(r, along, (r.width / 2 + 1.9) * p.side);
  p.x = q.x;
  p.z = q.z;
  p.angle = p.dir > 0 ? q.angle : q.angle + Math.PI;
  p.y = world.surface(p.x, p.z);
}

function slide(world: World, a: Actor, dx: number, dz: number, radius: number) {
  const full = { x: a.x + dx, z: a.z + dz };
  if (!world.blocked(full, radius)) {
    a.x = full.x;
    a.z = full.z;
    return 1;
  }
  const xOnly = { x: a.x + dx, z: a.z };
  if (!world.blocked(xOnly, radius)) {
    a.x = xOnly.x;
    return 0.5;
  }
  const zOnly = { x: a.x, z: a.z + dz };
  if (!world.blocked(zOnly, radius)) {
    a.z = zOnly.z;
    return 0.5;
  }
  return 0;
}

function stepCar(world: World, s: CityState, c: Controls, dt: number) {
  const car = s.car,
    spec = SPECS[s.vehicle];
  const throttle = Number(c.forward) - Number(c.reverse),
    turn = Number(c.right) - Number(c.left);
  // Steering: smoothed wheel angle, reduced at speed like a real car.
  const maxSteer = 0.62 / (1 + Math.abs(car.speed) / 14);
  car.steer += (turn * maxSteer - car.steer) * Math.min(1, dt * 7);
  const grounded = !car.airborne;
  if (grounded) {
    let force = 0;
    if (throttle > 0) force = car.speed < -0.5 ? 14 : spec.accel * (1 - car.speed / spec.top);
    else if (throttle < 0) force = car.speed > 0.5 ? -14 : -4.5 * (1 + car.speed / 14);
    // Gravity along the slope: San Francisco hills matter.
    const ax = Math.sin(car.angle),
      az = Math.cos(car.angle);
    const grade =
      (world.surface(car.x + ax * 1.5, car.z + az * 1.5) -
        world.surface(car.x - ax * 1.5, car.z - az * 1.5)) /
      3;
    force -= 9.81 * Math.sin(Math.atan(grade));
    car.speed += force * dt;
    const drag = 0.0009 * car.speed * Math.abs(car.speed) + 0.25 * Math.sign(car.speed);
    car.speed -= drag * dt;
    if (c.brake) car.speed *= Math.exp(-2.6 * dt);
    if (!throttle && Math.abs(car.speed) < 0.3 && Math.abs(grade) < 0.12) car.speed = 0;
    car.speed = Math.max(-14, Math.min(spec.top, car.speed));
    // Kinematic bicycle model plus lateral slip that decays with tyre grip.
    const yaw = (car.speed * Math.tan(car.steer)) / spec.wheelbase;
    car.angle -= yaw * dt * (c.brake && Math.abs(car.speed) > 12 ? 1.35 : 1);
    car.slip += yaw * car.speed * dt * (c.brake ? 0.35 : 0.08);
    car.slip *= Math.exp(-(c.brake ? 2.2 : spec.grip) * dt);
  }
  const ax = Math.sin(car.angle),
    az = Math.cos(car.angle);
  const dx = (ax * car.speed + az * car.slip) * dt,
    dz = (az * car.speed - ax * car.slip) * dt;
  const before = Math.abs(car.speed);
  const moved = slide(world, car, dx, dz, 1.15);
  if (moved < 1) {
    car.speed *= moved ? 0.82 : -0.25;
    car.slip *= 0.3;
    if (before > 6 && s.immunity === 0) {
      s.health = Math.max(0, s.health - Math.min(25, before * 0.6));
      s.immunity = 0.6;
    }
  }
  // Vertical motion: follow the road, or fly off crests and land.
  const groundY = world.surface(car.x, car.z);
  if (car.airborne) {
    car.vy -= 9.81 * dt;
    car.y += car.vy * dt;
    if (car.y <= groundY) {
      if (car.vy < -9 && s.immunity === 0) {
        s.health = Math.max(0, s.health + car.vy * 0.6);
        s.immunity = 0.5;
      }
      car.y = groundY;
      car.vy = 0;
      car.airborne = false;
    }
  } else {
    const vy = (groundY - car.y) / dt;
    // Leave the ground when the road falls away faster than gravity can follow.
    if (groundY < car.y - 0.05 && car.vy - 9.81 * dt > vy && Math.abs(car.speed) > 14) {
      car.airborne = true;
      car.vy = Math.max(car.vy, 0);
    } else {
      car.vy = Math.max(-30, Math.min(30, vy));
      car.y = groundY;
    }
  }
  car.spin += (car.speed * dt) / 0.34;
  s.player.x = car.x;
  s.player.z = car.z;
  s.player.y = car.y;
  s.player.angle = car.angle;
  s.player.speed = car.speed;
}

function stepFoot(world: World, s: CityState, c: Controls, dt: number) {
  const p = s.player;
  const throttle = Number(c.forward) - Number(c.reverse),
    turn = Number(c.right) - Number(c.left);
  p.angle -= turn * 2.6 * dt;
  const goal = throttle * (throttle > 0 ? (c.sprint ? 6.2 : 1.55) : 1.1);
  // Ease into and out of walking instead of snapping to full speed.
  p.speed += (goal - p.speed) * Math.min(1, dt * (c.sprint ? 3.5 : 6));
  if (Math.abs(p.speed) < 0.02 && !throttle) p.speed = 0;
  const dx = Math.sin(p.angle) * p.speed * dt,
    dz = Math.cos(p.angle) * p.speed * dt;
  if (!slide(world, p, dx, dz, 0.32)) p.speed = 0;
  // Do not let the player walk through traffic.
  for (const t of s.traffic)
    if (distance(t, p) < 1.6) {
      const a = Math.atan2(p.x - t.x, p.z - t.z);
      p.x = t.x + Math.sin(a) * 1.6;
      p.z = t.z + Math.cos(a) * 1.6;
    }
  const ground = world.surface(p.x, p.z);
  p.y += (ground - p.y) * Math.min(1, dt * 12);
  // One stride cycle per 1.4 m walked (two steps).
  p.stride += (Math.abs(p.speed) * dt * Math.PI * 2) / (Math.abs(p.speed) > 3 ? 2.6 : 1.45);
}

function stepAgents(world: World, s: CityState, dt: number) {
  const all = [...s.traffic, ...s.police];
  for (const t of s.traffic) {
    let goal = t.cruise;
    const ax = Math.sin(t.angle),
      az = Math.cos(t.angle);
    for (const o of all) {
      if (o === t) continue;
      const dx = o.x - t.x,
        dz = o.z - t.z;
      const ahead = dx * ax + dz * az,
        side = Math.abs(dx * az - dz * ax);
      if (ahead > 0 && ahead < 14 && side < 2.4)
        goal = Math.min(goal, Math.max(0, (ahead - 6) * 1.2));
    }
    for (const o of [s.player, ...s.peds.filter((p) => !p.down)]) {
      const dx = o.x - t.x,
        dz = o.z - t.z;
      const ahead = dx * ax + dz * az,
        side = Math.abs(dx * az - dz * ax);
      if (ahead > 0 && ahead < 16 && side < 2.6)
        goal = Math.min(goal, Math.max(0, (ahead - 6) * 1.1));
    }
    t.speed += Math.max(-7, Math.min(2.5, goal - t.speed)) * dt * 1.6;
    t.speed = Math.max(0, t.speed);
    t.s += t.speed * dt;
    while (t.s > world.roads[t.lane].length) {
      const over = t.s - world.roads[t.lane].length;
      nextLane(world, s, t);
      t.s = over;
    }
    placeAgent(world, t);
    t.spin += (t.speed * dt) / 0.33;
    if (
      !s.onFoot &&
      distance(t, s.car) < 3.2 &&
      Math.abs(s.car.speed - t.speed) > 6 &&
      !s.immunity
    ) {
      s.health = Math.max(0, s.health - 8);
      s.car.speed *= -0.3;
      s.immunity = 1;
      if (s.heat === 0) {
        s.heat = 1;
        spawnPolice(world, s);
      }
    }
  }
  for (const cop of s.police) {
    const d = distance(cop, s.player);
    if (d < 90) {
      // Close pursuit: steer straight at the player and ram.
      const want = Math.atan2(s.player.x - cop.x, s.player.z - cop.z);
      let diff = want - cop.angle;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      cop.angle += Math.max(-2.2 * dt, Math.min(2.2 * dt, diff));
      cop.speed += (Math.min(cop.cruise, 6 + d * 0.5) - cop.speed) * dt * 1.5;
      const moved = slide(
        world,
        cop,
        Math.sin(cop.angle) * cop.speed * dt,
        Math.cos(cop.angle) * cop.speed * dt,
        1.15,
      );
      if (!moved) {
        cop.angle += 1.2 * dt * 6;
        cop.speed *= 0.5;
      }
      cop.y = world.surface(cop.x, cop.z);
    } else {
      cop.speed += (cop.cruise - cop.speed) * dt;
      cop.s += cop.speed * dt;
      while (cop.s > world.roads[cop.lane].length) {
        const over = cop.s - world.roads[cop.lane].length;
        nextLane(world, s, cop, s.player);
        cop.s = over;
      }
      placeAgent(world, cop);
    }
    cop.spin += (cop.speed * dt) / 0.34;
    if (d < 3 && !s.immunity) {
      s.health = Math.max(0, s.health - 10);
      s.immunity = 1.4;
    }
  }
  for (const p of s.peds) {
    if (p.down > 0) {
      p.down = Math.max(0, p.down - dt);
      continue;
    }
    const r = world.roads[p.lane];
    p.flee = Math.max(0, p.flee - dt);
    if (!s.onFoot && Math.abs(s.car.speed) > 3 && distance(s.car, p) < 7) {
      p.flee = 1.2;
      if (distance(s.car, p) < 2.2 && Math.abs(s.car.speed) > 5) {
        p.down = 7;
        p.speed = 0;
        if (s.heat < 2) {
          s.heat++;
          spawnPolice(world, s);
        }
        continue;
      }
    }
    const pace = p.flee ? 5.5 : 1.15 + (p.model % 5) * 0.09;
    p.speed += (pace - p.speed) * Math.min(1, dt * 3);
    p.s += p.speed * dt;
    if (p.s > r.length) {
      const lane = p.lane;
      const fake: LaneAgent = { ...p, model: 'asea', paint: 0, cruise: 0, spin: 0 };
      nextLane(world, s, fake);
      p.lane = fake.lane;
      p.dir = fake.dir;
      p.s = 0;
      if (p.lane === lane) p.dir = p.dir > 0 ? -1 : 1;
    }
    placePed(world, p);
    p.stride += (p.speed * dt * Math.PI * 2) / (p.speed > 3 ? 2.6 : 1.45);
  }
}

export function stepCity(world: World, s: CityState, c: Controls, seconds: number) {
  if (s.phase !== 'driving' || !Number.isFinite(seconds) || seconds <= 0) return;
  const dt = Math.min(seconds, 1 / 30);
  s.elapsed += dt;
  if (s.explorer) {
    const p = s.player;
    p.angle -= (Number(c.right) - Number(c.left)) * dt;
    const v = (Number(c.forward) - Number(c.reverse)) * 260;
    p.x = Math.max(-5500, Math.min(5500, p.x + Math.sin(p.angle) * v * dt));
    p.z = Math.max(-7000, Math.min(7000, p.z + Math.cos(p.angle) * v * dt));
    s.altitude = Math.max(
      750,
      Math.min(2600, s.altitude + (Number(c.sprint) - Number(c.brake)) * 400 * dt),
    );
    return;
  }
  if (s.tour === null) s.time = Math.max(0, s.time - dt);
  if (s.message === 'blocked' && (c.forward || c.reverse || Math.abs(s.car.speed) > 0.5)) {
    s.message = 'drive';
  }
  s.clock = (s.clock + dt / 120) % 24;
  s.immunity = Math.max(0, s.immunity - dt);
  if (s.onFoot) stepFoot(world, s, c, dt);
  else stepCar(world, s, c, dt);
  stepAgents(world, s, dt);
  if (Math.floor(s.elapsed * 2) !== Math.floor((s.elapsed - dt) * 2)) populate(world, s);
  if (s.heat) {
    if (s.police.every((p) => distance(p, s.player) > 140)) s.escape += dt;
    else s.escape = 0;
    if (s.escape >= 15) {
      s.heat = 0;
      s.police = [];
      s.escape = 0;
      s.message = 'escape';
    }
    while (s.police.length < Math.min(4, s.heat)) {
      const before = s.police.length;
      spawnPolice(world, s);
      if (s.police.length === before) break;
    }
  }
  if ((s.tour === null && s.time === 0) || s.health === 0) {
    s.phase = 'busted';
    s.car.speed = 0;
    s.player.speed = 0;
  }
}

export function cityText(world: World, s: CityState) {
  const t = target(world, s);
  return JSON.stringify({
    phase: s.phase,
    player: s.player,
    car: s.car,
    onFoot: s.onFoot,
    vehicle: s.vehicle,
    health: s.health,
    time: s.time,
    clock: s.clock,
    job: s.job,
    tour: s.tour,
    camera: s.camera,
    cash: s.cash,
    heat: s.heat,
    target: t,
    distanceToTarget: Math.round(distance(s.player, t)),
    street: world.street(s.player.x, s.player.z),
    district: world.district(s.player).en,
    traffic: s.traffic.length,
    peds: s.peds.length,
    police: s.police.length,
    coordinates: 'metres; x east, z south; origin Union Square; angle 0 south, PI north',
  });
}
