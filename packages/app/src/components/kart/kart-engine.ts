import { CatmullRomCurve3, Vector3 } from 'three';

// Centerline traced against the source course mesh, in its exported world units.
const WAYPOINTS = [
  [-204, 258],
  [-204, 170],
  [-202, 82],
  [-187, 33],
  [-130, 12],
  [-74, 4],
  [-29, -11],
  [38, -63],
  [78, -60],
  [123, -17],
  [145, 11],
  [140, 58],
  [96, 110],
  [52, 161],
  [-8, 227],
  [-41, 272],
  [-48, 350],
  [-48, 430],
  [-66, 477],
  [-122, 507],
  [-164, 500],
  [-206, 458],
  [-207, 360],
];
export const TRACK = new CatmullRomCurve3(
  WAYPOINTS.map(([x, z]) => new Vector3(x, 0, z)),
  true,
  'centripetal',
);
TRACK.arcLengthDivisions = 2000;
export const TRACK_LENGTH = TRACK.getLength();
export const LAPS = 3;
export interface Controls {
  throttle: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
  drift: boolean;
  boost: boolean;
}
export const EMPTY_CONTROLS: Controls = {
  throttle: false,
  brake: false,
  left: false,
  right: false,
  drift: false,
  boost: false,
};
export type Phase = 'ready' | 'countdown' | 'racing' | 'paused' | 'finished';
export interface Racer {
  distance: number;
  lane: number;
  speed: number;
  finishedAt: number | null;
}
export interface Race {
  phase: Phase;
  resumePhase: 'countdown' | 'racing';
  countdown: number;
  elapsed: number;
  player: Racer;
  opponents: Racer[];
  charge: number;
  turbo: number;
  driftCharge: number;
  drifting: boolean;
  boostHeld: boolean;
  bumpCooldown: number;
  place: number;
}
export function newRace(): Race {
  return {
    phase: 'ready',
    resumePhase: 'racing',
    countdown: 3,
    elapsed: 0,
    player: { distance: 0, lane: 0, speed: 0, finishedAt: null },
    opponents: [6, 12, 18].map((distance, i) => ({
      distance,
      lane: (i - 1) * 8,
      speed: 0,
      finishedAt: null,
    })),
    charge: 100,
    turbo: 0,
    driftCharge: 0,
    drifting: false,
    boostHeld: false,
    bumpCooldown: 0,
    place: 4,
  };
}
export function startRace(race: Race) {
  if (race.phase === 'ready') race.phase = 'countdown';
  else if (race.phase === 'paused') race.phase = race.resumePhase;
}
export function pauseRace(race: Race) {
  if (race.phase === 'racing' || race.phase === 'countdown') {
    race.resumePhase = race.phase;
    race.phase = 'paused';
  }
}
export function lap(race: Race) {
  return Math.min(LAPS, Math.floor(race.player.distance / TRACK_LENGTH) + 1);
}
export function trackPose(distance: number, lane = 0) {
  const t = (((distance / TRACK_LENGTH) % 1) + 1) % 1;
  const p = TRACK.getPointAt(t);
  const tangent = TRACK.getTangentAt(t);
  p.x -= tangent.z * lane;
  p.z += tangent.x * lane;
  return { position: p, heading: Math.atan2(tangent.x, tangent.z) };
}
export function stepRace(race: Race, input: Controls, seconds: number) {
  if (!Number.isFinite(seconds)) return;
  if (race.phase !== 'racing' && race.phase !== 'countdown') return;
  const dt = Math.max(0, Math.min(seconds, 1 / 30));
  if (race.phase === 'countdown') {
    race.countdown = Math.max(0, race.countdown - dt);
    if (race.countdown <= 0) race.phase = 'racing';
    return;
  }
  race.elapsed += dt;
  const p = race.player;
  const steer = Number(input.right) - Number(input.left);
  race.turbo = Math.max(0, race.turbo - dt);
  race.bumpCooldown = Math.max(0, race.bumpCooldown - dt);
  if (input.boost && !race.boostHeld && race.charge >= 50) {
    race.charge -= 50;
    race.turbo = 1.8;
  }
  race.boostHeld = input.boost;
  race.charge = Math.min(100, race.charge + dt * 5);
  const drifting = input.drift && steer !== 0 && p.speed > 25;
  if (drifting) race.driftCharge = Math.min(1.5, race.driftCharge + dt);
  else if (race.drifting) {
    if (race.driftCharge >= 0.7) race.turbo = Math.max(race.turbo, race.driftCharge);
    race.driftCharge = 0;
  }
  race.drifting = drifting;
  p.lane = Math.max(
    -22,
    Math.min(22, p.lane + steer * dt * (drifting ? 19 : 13) * Math.min(1, p.speed / 20)),
  );
  // Assisted steering follows bends; steering input still controls lateral position.
  const offroad = Math.abs(p.lane) > 16;
  const maxSpeed = offroad ? 30 : race.turbo > 0 ? 106 : drifting ? 62 : 72;
  p.speed = input.throttle ? Math.min(maxSpeed, p.speed + dt * 30) : Math.max(0, p.speed - dt * 14);
  if (input.brake) p.speed = Math.max(0, p.speed - dt * 65);
  if (p.speed > maxSpeed) p.speed = Math.max(maxSpeed, p.speed - dt * 55);
  p.distance = Math.min(LAPS * TRACK_LENGTH, p.distance + p.speed * dt);
  if (p.distance >= LAPS * TRACK_LENGTH && p.finishedAt === null) p.finishedAt = race.elapsed;
  race.opponents.forEach((r, i) => {
    if (r.finishedAt !== null) return;
    r.speed = Math.min(57 + i * 2 + Math.sin(race.elapsed * 0.4 + i) * 3, r.speed + dt * 24);
    r.distance = Math.min(LAPS * TRACK_LENGTH, r.distance + r.speed * dt);
    if (r.distance >= LAPS * TRACK_LENGTH && r.finishedAt === null) {
      r.finishedAt = race.elapsed;
      r.speed = 0;
    }
    if (
      Math.abs(r.distance - p.distance) < 5 &&
      Math.abs(r.lane - p.lane) < 4 &&
      race.bumpCooldown === 0
    ) {
      p.speed *= 0.72;
      p.lane = Math.max(-22, Math.min(22, p.lane + (p.lane >= r.lane ? 3 : -3)));
      race.bumpCooldown = 0.8;
    }
  });
  race.place =
    1 +
    race.opponents.filter((r) =>
      p.finishedAt === null
        ? r.distance > p.distance
        : r.finishedAt !== null && r.finishedAt < p.finishedAt,
    ).length;
  if (p.distance >= LAPS * TRACK_LENGTH) {
    race.phase = 'finished';
    p.speed = 0;
  }
}
export function raceText(race: Race) {
  const pose = trackPose(race.player.distance, race.player.lane);
  return JSON.stringify({
    phase: race.phase,
    coordinateSystem: 'Y up; course X/Z; distance forward along closed track',
    player: { ...race.player, x: pose.position.x, z: pose.position.z },
    lap: lap(race),
    laps: LAPS,
    place: race.place,
    elapsed: race.elapsed,
    countdown: race.countdown,
    boost: race.charge,
    turbo: race.turbo,
    drifting: race.drifting,
    opponents: race.opponents,
  });
}
