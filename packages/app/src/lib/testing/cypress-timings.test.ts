import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

interface TimingEntry {
  spec: string;
  duration: number;
}

interface TimingFile {
  durations: TimingEntry[];
}

const appRoot = resolve(import.meta.dirname, '../../..');

function expectBaseline(dir: string, file: string) {
  const specs = readdirSync(resolve(appRoot, dir))
    .filter((name) => name.endsWith('.cy.ts') || name.endsWith('.cy.tsx'))
    .map((name) => `${dir}/${name}`)
    .toSorted();
  const timings = (JSON.parse(readFileSync(resolve(appRoot, file), 'utf8')) as TimingFile)
    .durations;
  expect(timings.map(({ spec }) => spec).toSorted()).toEqual(specs);
  expect(new Set(timings.map(({ spec }) => spec)).size).toBe(timings.length);
  for (const { duration } of timings) {
    expect(Number.isFinite(duration)).toBe(true);
    expect(duration).toBeGreaterThan(0);
  }
}

describe('Cypress split timing baseline', () => {
  it('contains one positive timing for every current integration spec', () => {
    expectBaseline('cypress/e2e', 'timings.json');
  });

  it('contains one positive timing for every current component spec', () => {
    expectBaseline('cypress/component', 'component-timings.json');
  });
});
