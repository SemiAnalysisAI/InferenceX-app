import { describe, expect, it } from 'vitest';
import {
  EMPTY_CONTROLS,
  LAPS,
  newRace,
  pauseRace,
  startRace,
  stepRace,
  TRACK_LENGTH,
  trackPose,
} from './kart-engine';

const advance = (race: ReturnType<typeof newRace>, seconds: number, controls = EMPTY_CONTROLS) => {
  for (let i = 0; i < seconds * 60; i++) stepRace(race, controls, 1 / 60);
};
const racing = () => {
  const race = newRace();
  startRace(race);
  advance(race, 3.1);
  return race;
};
describe('kart racing engine', () => {
  it('counts down without moving, then accelerates and brakes', () => {
    const race = newRace();
    startRace(race);
    advance(race, 2);
    expect(race.phase).toBe('countdown');
    expect(race.player.distance).toBe(0);
    advance(race, 1.1);
    expect(race.phase).toBe('racing');
    race.opponents.forEach((r) => {
      r.distance += 100;
    });
    advance(race, 2, { ...EMPTY_CONTROLS, throttle: true });
    expect(race.player.speed).toBeCloseTo(60);
    expect(race.player.distance).toBeGreaterThan(55);
    advance(race, 2, { ...EMPTY_CONTROLS, brake: true });
    expect(race.player.speed).toBe(0);
  });
  it('pauses countdown and racing without consuming time or boosts', () => {
    const race = newRace();
    startRace(race);
    advance(race, 1);
    pauseRace(race);
    const before = structuredClone(race);
    advance(race, 4);
    expect(race).toEqual(before);
    startRace(race);
    expect(race.phase).toBe('countdown');
    advance(race, 3);
    pauseRace(race);
    const elapsed = race.elapsed;
    advance(race, 20);
    expect(race.elapsed).toBe(elapsed);
    startRace(race);
    expect(race.phase).toBe('racing');
  });
  it('bounds lanes and slows the kart outside the road', () => {
    const race = racing();
    advance(race, 8, { ...EMPTY_CONTROLS, throttle: true, left: true });
    expect(race.player.lane).toBe(-22);
    expect(race.player.speed).toBeLessThanOrEqual(30);
  });
  it('grants drift boost on release, not on brake-only input', () => {
    const race = racing();
    advance(race, 3, { ...EMPTY_CONTROLS, throttle: true });
    advance(race, 0.9, { ...EMPTY_CONTROLS, throttle: true, drift: true, right: true });
    expect(race.driftCharge).toBeGreaterThan(0.7);
    advance(race, 0.1, { ...EMPTY_CONTROLS, throttle: true });
    expect(race.turbo).toBeGreaterThan(0.6);
  });
  it('spends a boost only on a press edge and will not overdraw charge', () => {
    const race = racing();
    advance(race, 1, { ...EMPTY_CONTROLS, boost: true });
    expect(race.charge).toBeCloseTo(55);
    race.charge = 10;
    advance(race, 0.1);
    advance(race, 0.1, { ...EMPTY_CONTROLS, boost: true });
    expect(race.charge).toBeGreaterThanOrEqual(10);
  });
  it('finishes exactly three laps and freezes the result', () => {
    const race = racing();
    advance(race, 100, { ...EMPTY_CONTROLS, throttle: true });
    expect(race.phase).toBe('finished');
    expect(race.player.distance).toBe(LAPS * TRACK_LENGTH);
    const finished = structuredClone(race);
    advance(race, 10);
    expect(race).toEqual(finished);
  });
  it('wraps the course without a position discontinuity', () => {
    expect(trackPose(0).position.distanceTo(trackPose(TRACK_LENGTH).position)).toBeLessThan(0.001);
    expect(trackPose(-1).position.distanceTo(trackPose(TRACK_LENGTH - 1).position)).toBeLessThan(
      0.001,
    );
  });
  it('penalizes contact with an opponent, with a cooldown', () => {
    const race = racing();
    race.player.speed = 60;
    race.opponents[0] = { distance: 1, speed: 60, lane: 0, finishedAt: null };
    stepRace(race, EMPTY_CONTROLS, 1 / 60);
    expect(race.player.speed).toBeLessThan(50);
    expect(race.bumpCooldown).toBeGreaterThan(0);
  });
  it('does not award first place after opponents have already finished', () => {
    const race = racing();
    advance(race, 100);
    expect(race.opponents.every((r) => r.finishedAt !== null)).toBe(true);
    advance(race, 100, { ...EMPTY_CONTROLS, throttle: true });
    expect(race.phase).toBe('finished');
    expect(race.place).toBe(4);
  });
});
