import {
  blocked,
  distance,
  GARAGE,
  JOBS,
  DESTINATIONS,
  lanePoint,
  START,
  START_ANGLE,
  VEHICLES,
  type Point,
  type Vehicle,
} from './gta-world';
import { BAY_LANDMARKS, roadHeading, streetRoute } from './gta-geography';
const TOUR_LOOK_AT: Record<number, Point> = {
  1: BAY_LANDMARKS[1],
  2: BAY_LANDMARKS[0],
  3: { x: 290, z: 256 },
  4: { x: -600, z: -1060 },
  5: { x: -1150, z: -1350 },
  6: { x: -125, z: 1850 },
  7: { x: 260, z: 2130 },
  8: { x: 570, z: 2680 },
};
const pursuitRoutes = new WeakMap<Actor, { points: Point[]; next: number; until: number }>();
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
export type Actor = Point & { angle: number; speed: number };
export interface CityState {
  phase: 'ready' | 'driving' | 'paused' | 'won' | 'busted';
  player: Actor;
  car: Actor;
  onFoot: boolean;
  vehicle: Vehicle;
  health: number;
  elapsed: number;
  time: number;
  job: number;
  cash: number;
  heat: number;
  escape: number;
  immunity: number;
  police: Actor[];
  traffic: (Actor & { progress: number; lane: number; model: Vehicle })[];
  message: 'drive' | 'pickup' | 'escape' | 'repair' | 'vehicle' | 'far' | 'fast' | 'blocked';
  night: boolean;
  camera: number;
  explorer: boolean;
  altitude: number;
  tour: number | null;
}
export function newCity(): CityState {
  return {
    phase: 'ready',
    player: { ...START, angle: START_ANGLE, speed: 0 },
    car: { ...START, angle: START_ANGLE, speed: 0 },
    onFoot: false,
    vehicle: 'adder',
    health: 100,
    elapsed: 0,
    time: 480,
    job: 0,
    cash: 0,
    heat: 0,
    escape: 0,
    immunity: 0,
    police: [],
    traffic: Array.from({ length: 18 }, (_, i) => {
      const lane = i % 3,
        progress = i * 91;
      return {
        ...lanePoint(progress, lane),
        progress,
        lane,
        speed: 12 + (i % 5),
        model: VEHICLES[i % 4],
      };
    }),
    message: 'drive',
    night: false,
    camera: 0,
    explorer: false,
    altitude: 800,
    tour: null,
  };
}
export const target = (s: CityState) =>
  s.tour === null ? JOBS[Math.min(s.job, JOBS.length - 1)] : DESTINATIONS[s.tour];
export function beginTour(s: CityState, index: number, fastTravel = false) {
  if (!Number.isInteger(index) || !DESTINATIONS[index] || s.explorer) return false;
  s.tour = index;
  s.phase = 'driving';
  s.health = 100;
  s.heat = 0;
  s.police = [];
  s.message = 'drive';
  if (fastTravel) {
    const p = DESTINATIONS[index];
    const lookAt = TOUR_LOOK_AT[index];
    const viewAngle = lookAt ? Math.atan2(lookAt.x - p.x, lookAt.z - p.z) : roadHeading(p);
    s.car = { x: p.x, z: p.z, angle: viewAngle, speed: 0 };
    s.player = { ...s.car };
    s.onFoot = false;
  }
  return true;
}
export function enterExit(s: CityState) {
  if (s.phase !== 'driving' || s.explorer) return false;
  if (s.onFoot) {
    if (distance(s.player, s.car) > 5) {
      s.message = 'far';
      return false;
    }
    s.player = { ...s.car };
    s.onFoot = false;
  } else {
    if (Math.abs(s.car.speed) > 2) {
      s.message = 'fast';
      return false;
    }
    // Try both doors, then behind/in front of the car when parked beside walls.
    const p = [Math.PI / 2, -Math.PI / 2, Math.PI, 0]
      .map((offset) => ({
        x: s.car.x + Math.sin(s.car.angle + offset) * 3,
        z: s.car.z + Math.cos(s.car.angle + offset) * 3,
      }))
      .find((point) => !blocked(point, 0.4));
    if (!p) {
      s.message = 'blocked';
      return false;
    }
    s.player = { ...p, angle: s.car.angle, speed: 0 };
    s.car.speed = 0;
    s.onFoot = true;
  }
  s.message = 'drive';
  return true;
}
export function interact(s: CityState) {
  if (s.phase !== 'driving' || s.explorer) return false;
  if (distance(s.player, target(s)) > 13 || Math.abs(s.player.speed) > 3) return false;
  if (s.tour !== null) {
    s.message = 'repair';
    return true;
  }
  s.cash += 1000;
  s.job++;
  s.message = 'pickup';
  if (s.job === JOBS.length) {
    s.phase = 'won';
    s.car.speed = 0;
    return true;
  }
  s.heat = Math.min(5, s.job);
  s.escape = 0;
  const p = lanePoint(s.job * 230, 0);
  s.police.push({ ...p, speed: 0 });
  return true;
}
export function changeVehicle(s: CityState) {
  if (s.phase !== 'driving' || s.explorer || s.onFoot || Math.abs(s.car.speed) > 2) return false;
  s.vehicle = VEHICLES[(VEHICLES.indexOf(s.vehicle) + 1) % VEHICLES.length];
  return true;
}
function move(actor: Actor, dt: number, radius: number) {
  const next = {
    x: actor.x + Math.sin(actor.angle) * actor.speed * dt,
    z: actor.z + Math.cos(actor.angle) * actor.speed * dt,
  };
  if (blocked(next, radius)) {
    actor.speed *= -0.2;
    return false;
  }
  Object.assign(actor, next);
  return true;
}
export function stepCity(s: CityState, c: Controls, seconds: number) {
  if (s.phase !== 'driving' || !Number.isFinite(seconds) || seconds <= 0) return;
  const dt = Math.min(seconds, 1 / 30);
  s.elapsed += dt;
  if (s.explorer) {
    s.player.angle -= (Number(c.right) - Number(c.left)) * dt;
    const v = (Number(c.forward) - Number(c.reverse)) * 260;
    s.player.x = Math.max(-5500, Math.min(5500, s.player.x + Math.sin(s.player.angle) * v * dt));
    s.player.z = Math.max(-7000, Math.min(7000, s.player.z + Math.cos(s.player.angle) * v * dt));
    s.altitude = Math.max(
      750,
      Math.min(2600, s.altitude + (Number(c.sprint) - Number(c.brake)) * 400 * dt),
    );
    return;
  }
  if (s.tour === null) s.time = Math.max(0, s.time - dt);
  s.immunity = Math.max(0, s.immunity - dt);
  const throttle = Number(c.forward) - Number(c.reverse),
    turn = Number(c.right) - Number(c.left);
  if (s.onFoot) {
    s.player.angle -= turn * 2.4 * dt; // Camera faces the actor's forward direction.
    s.player.speed = throttle * (c.sprint ? 8 : 3.5);
    move(s.player, dt, 0.4);
  } else {
    const car = s.car;
    const top = s.vehicle === 'adder' ? 58 : s.vehicle === 'buffalo' ? 47 : 38;
    car.speed += throttle * 22 * dt;
    car.speed *= Math.exp(-(c.brake ? 4.5 : throttle ? 0.2 : 1.1) * dt);
    car.speed = Math.max(-12, Math.min(top, car.speed));
    car.angle -=
      turn *
      (c.brake ? 1.8 : 1.05) *
      Math.min(1, Math.abs(car.speed) / 8) *
      Math.sign(car.speed) *
      dt;
    const impactSpeed = Math.abs(car.speed);
    if (!move(car, dt, 1.3) && impactSpeed > 4 && s.immunity === 0) {
      s.health = Math.max(0, s.health - 6);
      s.immunity = 0.7;
    }
    s.player = { ...car };
  }
  for (const t of s.traffic) {
    const next = lanePoint(t.progress + t.speed * dt, t.lane);
    // Stop for the player rather than driving through them.
    if (distance(next, s.player) > 5) {
      t.progress += t.speed * dt;
      Object.assign(t, next);
    }
    if (!s.onFoot && distance(t, s.car) < 3 && Math.abs(s.car.speed) > 6 && !s.immunity) {
      s.health = Math.max(0, s.health - 5);
      s.car.speed *= -0.25;
      s.immunity = 1;
      if (s.heat === 0) {
        s.heat = 1;
        s.police.push({ ...lanePoint(t.progress - 90, t.lane), speed: 0 });
      }
    }
  }
  for (const cop of s.police) {
    let route = pursuitRoutes.get(cop);
    if (!route || route.until < s.elapsed) {
      route = { points: streetRoute(cop, s.player), next: 0, until: s.elapsed + 3 };
      pursuitRoutes.set(cop, route);
    }
    while (route.next < route.points.length && distance(cop, route.points[route.next]) < 3)
      route.next++;
    const steps = Math.max(1, Math.ceil(distance(cop, s.player) / 2));
    let clear = true;
    for (let i = 1; i <= steps; i++) {
      if (
        blocked(
          {
            x: cop.x + ((s.player.x - cop.x) * i) / steps,
            z: cop.z + ((s.player.z - cop.z) * i) / steps,
          },
          1.3,
        )
      ) {
        clear = false;
        break;
      }
    }
    const goal = clear ? s.player : route.points[route.next];
    cop.angle = goal ? Math.atan2(goal.x - cop.x, goal.z - cop.z) : cop.angle;
    cop.speed = goal ? 18 + s.heat * 2 : 0;
    move(cop, dt, 1.3);
    if (distance(cop, s.player) < 3 && !s.immunity) {
      s.health = Math.max(0, s.health - 12);
      s.immunity = 1.5;
    }
  }
  if (s.heat) {
    if (s.police.every((p) => distance(p, s.player) > 110)) s.escape += dt;
    else s.escape = 0;
    if (s.escape >= 15) {
      s.heat = 0;
      s.police = [];
      s.escape = 0;
      s.message = 'escape';
    }
  }
  if (s.health > 0 && !s.heat && distance(s.player, GARAGE) < 10 && Math.abs(s.player.speed) < 1) {
    s.health = Math.min(100, s.health + dt * 10);
  }
  if ((s.tour === null && s.time === 0) || s.health === 0) {
    s.phase = 'busted';
    s.car.speed = 0;
    s.player.speed = 0;
  }
}
export function cityText(s: CityState) {
  return JSON.stringify({
    ...s,
    target: target(s),
    coordinates: 'metres; x east, z south; angle 0 south, PI north',
  });
}
