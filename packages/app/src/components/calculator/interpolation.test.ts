import { describe, expect, it } from 'vitest';

import { paretoFrontUpperLeft } from './interpolation';

interface P {
  id: number;
  x: number;
  y: number;
}

// The accessor-based algorithm the index sort replaced.
function referenceFront(points: P[]): P[] {
  const sorted = [...points].toSorted((a, b) => (a.x === b.x ? b.y - a.y : a.x - b.x));
  const front: P[] = [];
  for (const point of sorted) {
    if (front.length > 0 && front.at(-1)!.x === point.x) {
      if (point.y > front.at(-1)!.y) front[front.length - 1] = point;
      continue;
    }
    while (front.length > 0 && point.y >= front.at(-1)!.y) front.pop();
    front.push(point);
  }
  return front;
}

function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

describe('paretoFrontUpperLeft', () => {
  it('matches the reference on ties, NaN and infinities on both sides of the small-sort cutoff', () => {
    const values = [0, 1, 2, 2.5, 3, Number.NaN, Infinity, -Infinity];
    const random = seeded(7);
    const pick = () => values[Math.floor(random() * values.length)];
    for (let trial = 0; trial < 2000; trial++) {
      const n = Math.floor(random() * 40);
      const points = Array.from({ length: n }, (_, id) => ({ id, x: pick(), y: pick() }));

      const ids = paretoFrontUpperLeft(
        points,
        (p) => p.x,
        (p) => p.y,
      ).map((p) => p.id);

      expect(ids).toEqual(referenceFront(points).map((p) => p.id));
    }
  });
});
