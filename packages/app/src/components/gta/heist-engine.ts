import { distance, driveable, OFFICES, onRoad, SAFEHOUSE, type Point } from './heist-world';

export type Phase = 'ready' | 'driving' | 'paused' | 'won' | 'busted';
export type Car = Point & { angle: number; speed: number; vx: number; vy: number };
export interface Controls {
  forward: boolean;
  reverse: boolean;
  left: boolean;
  right: boolean;
  brake: boolean;
}
export interface HeistState {
  phase: Phase;
  car: Car;
  health: number;
  time: number;
  collected: string[];
  target: string;
  police: Point[];
  heat: number;
  immunity: number;
  skid: Point[];
}
export const EMPTY_CONTROLS: Controls = {
  forward: false,
  reverse: false,
  left: false,
  right: false,
  brake: false,
};
export const CRATE_GOAL = 3;
export const ROUND_SECONDS = 300;

export function newHeist(): HeistState {
  return {
    phase: 'ready',
    car: { ...SAFEHOUSE, angle: -Math.PI / 2, speed: 0, vx: 0, vy: 0 },
    health: 100,
    time: ROUND_SECONDS,
    collected: [],
    target: 'openai',
    police: [],
    heat: 0,
    immunity: 0,
    skid: [],
  };
}

export function objective(state: HeistState) {
  return state.collected.length >= CRATE_GOAL
    ? { ...SAFEHOUSE, id: 'safehouse', name: 'Safehouse' }
    : (OFFICES.find((o) => o.id === state.target) ?? OFFICES[0]);
}

export function nearbyStop(state: HeistState) {
  if (state.collected.length >= CRATE_GOAL)
    return distance(state.car, SAFEHOUSE) < 78 ? 'safehouse' : null;
  return (
    OFFICES.find((o) => !state.collected.includes(o.id) && distance(state.car, o) < 78)?.id ?? null
  );
}

/** The heist only collects fictional crates; it never calls any application API. */
export function interact(state: HeistState) {
  if (state.phase !== 'driving' || Math.abs(state.car.speed) > 55) return false;
  const stop = nearbyStop(state);
  if (!stop) return false;
  if (stop === 'safehouse') {
    state.phase = 'won';
    state.car.speed = 0;
    return true;
  }
  state.collected.push(stop);
  state.heat = Math.min(5, state.collected.length + 1);
  const spawn = { x: state.car.x - 210, y: state.car.y + 170 };
  if (driveable(spawn)) state.police.push(spawn);
  else state.police.push({ ...SAFEHOUSE });
  const available = OFFICES.filter((o) => !state.collected.includes(o.id));
  if (available.length > 0)
    state.target = available.reduce((a, b) =>
      distance(a, state.car) < distance(b, state.car) ? a : b,
    ).id;
  return true;
}

export function stepHeist(state: HeistState, controls: Controls, seconds: number) {
  if (state.phase !== 'driving' || !Number.isFinite(seconds) || seconds <= 0) return;
  // Bound catch-up after a throttled tab; deterministic callers use 1/60 steps.
  const dt = Math.min(seconds, 1 / 20);
  const car = state.car;
  state.time = Math.max(0, state.time - dt);
  state.immunity = Math.max(0, state.immunity - dt);
  const throttle = Number(controls.forward) - Number(controls.reverse);
  car.speed += throttle * 260 * dt;
  car.speed *= Math.exp(-(controls.brake ? 3.8 : throttle ? 0.38 : 1.25) * dt);
  const limit = onRoad(car) ? 330 : 145;
  car.speed = Math.max(-115, Math.min(limit, car.speed));
  const turn = Number(controls.right) - Number(controls.left);
  car.angle +=
    turn *
    (controls.brake ? 3.4 : 2.25) *
    Math.min(1, Math.abs(car.speed) / 65) *
    Math.sign(car.speed) *
    dt;
  const grip = 1 - Math.exp(-(controls.brake ? 3 : 12) * dt);
  car.vx += (Math.cos(car.angle) * car.speed - car.vx) * grip;
  car.vy += (Math.sin(car.angle) * car.speed - car.vy) * grip;
  const next = { x: car.x + car.vx * dt, y: car.y + car.vy * dt };
  if (driveable(next)) {
    car.x = next.x;
    car.y = next.y;
  } else {
    if (Math.abs(car.speed) > 90 && state.immunity === 0) {
      state.health = Math.max(0, state.health - 8);
      state.immunity = 0.8;
    }
    car.speed *= -0.25;
    car.vx = 0;
    car.vy = 0;
  }
  if (controls.brake && Math.abs(car.speed) > 35) {
    state.skid.push({ x: car.x, y: car.y });
    if (state.skid.length > 90) state.skid.shift();
  }
  for (const cop of state.police) {
    const gap = distance(cop, car);
    if (gap > 1) {
      const speed = 92 + state.heat * 13;
      const candidate = {
        x: cop.x + ((car.x - cop.x) / gap) * speed * dt,
        y: cop.y + ((car.y - cop.y) / gap) * speed * dt,
      };
      // Pursuers cannot cross water or buildings either.
      if (driveable(candidate)) Object.assign(cop, candidate);
    }
    if (gap < 28 && state.immunity === 0) {
      state.health = Math.max(0, state.health - 15);
      state.immunity = 1.5;
    }
  }
  if (state.health === 0 || state.time === 0) {
    state.phase = 'busted';
    car.speed = 0;
  }
}

export function gameText(state: HeistState) {
  return JSON.stringify({
    coordinates: 'schematic pixels; origin northwest; x east, y south; angle radians, 0 east',
    phase: state.phase,
    car: { ...state.car },
    health: state.health,
    seconds: Math.ceil(state.time),
    crates: state.collected,
    goal: CRATE_GOAL,
    target: objective(state),
    nearby: nearbyStop(state),
    heat: state.heat,
    police: state.police,
    offices: OFFICES,
    safehouse: SAFEHOUSE,
  });
}
