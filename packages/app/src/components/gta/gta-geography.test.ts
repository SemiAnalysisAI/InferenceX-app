import { describe, expect, it } from 'vitest';
import {
  FOOTPRINTS,
  inside,
  project,
  segmentDistance,
  STREETS_SF,
  streetRoute,
} from './gta-geography';
import { blocked, JOBS, START } from './gta-world';

describe('San Paloma geography', () => {
  it('uses the SF survey instead of an invented rectangular grid', () => {
    expect(FOOTPRINTS.length).toBeGreaterThan(1800);
    expect(STREETS_SF.length).toBeGreaterThan(600);
    expect(STREETS_SF.some((s) => s.name === 'MARKET ST')).toBe(true);
    expect(STREETS_SF.some((s) => s.name === '03RD ST')).toBe(true);
    expect(FOOTPRINTS.every((b) => b.h >= 4 && b.ring.length >= 3)).toBe(true);
  });
  it('uses metre coordinates with north pointing toward negative z', () => {
    expect(project(-122.4, 37.792)).toEqual({ x: 0, z: 0 });
    expect(project(-122.399, 37.793).x).toBeCloseTo(87.93);
    expect(project(-122.399, 37.793).z).toBeCloseTo(-111.32);
  });
  it('keeps every mission reachable through connected, unobstructed streets', () => {
    for (const destination of JOBS) {
      expect(blocked(destination)).toBe(false);
      const route = streetRoute(START, destination);
      expect(route.length).toBeGreaterThan(0);
      for (let i = 1; i < route.length; i++) {
        const a = route[i - 1],
          b = route[i];
        const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 2);
        for (let step = 0; step <= steps; step++) {
          const f = step / (steps || 1);
          expect(blocked({ x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f })).toBe(false);
        }
      }
    }
  });
  it('tests concave footprints rather than treating their entire bounding box as solid', () => {
    const ring = [
      { x: 0, z: 0 },
      { x: 0, z: 4 },
      { x: 1, z: 4 },
      { x: 1, z: 1 },
      { x: 4, z: 1 },
      { x: 4, z: 0 },
    ];
    expect(inside({ x: 0.5, z: 3 }, ring)).toBe(true);
    expect(inside({ x: 3, z: 3 }, ring)).toBe(false);
    expect(segmentDistance({ x: 3, z: 2 }, { x: 0, z: 0 }, { x: 4, z: 0 })).toBe(2);
  });
  it('marks the compressed South Bay connection separately from surveyed streets', () => {
    expect(STREETS_SF.filter((s) => s.id.startsWith('connector-'))).toHaveLength(5);
    expect(FOOTPRINTS.filter((b) => b.id.startsWith('south-'))).toHaveLength(6);
    expect(JOBS[2].en).toContain('NVIDIA');
    expect(JOBS[3].en).toContain('AMD');
  });
});
