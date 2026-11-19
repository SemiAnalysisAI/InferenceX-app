import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { cypressSourceFingerprint } from './cypress-source-fingerprint';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'cypress-inputs-'));
  roots.push(root);
  const write = (file: string, value: string) => {
    const target = join(root, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, value);
  };
  write('packages/app/cypress/e2e/example.cy.ts', 'original test');
  write('packages/app/src/example.ts', 'original implementation');
  write('packages/app/src/app/api/openapi.json/route.ts', 'JSON-named route directory');
  write('packages/app/cypress/fixtures/api/example.json', '{}');
  write('packages/app/cypress.config.ts', 'original config');
  write('bun.lock', 'original dependencies');
  return { app: join(root, 'packages/app'), write };
}

describe('timing input fingerprint', () => {
  it.each([
    'packages/app/cypress/e2e/example.cy.ts',
    'packages/app/cypress/support/new-helper.ts',
    'packages/app/src/example.ts',
    'packages/app/cypress/fixtures/api/example.json',
    'packages/app/cypress.config.ts',
    'packages/app/content/blog/article.mdx',
    'packages/app/public/chart.svg',
    'tsconfig.json',
    'bun.lock',
  ])('invalidates old timings when %s changes', (file) => {
    const { app, write } = fixture();
    const original = cypressSourceFingerprint(app);
    expect(cypressSourceFingerprint(app)).toBe(original);
    write(file, 'changed');
    expect(cypressSourceFingerprint(app)).not.toBe(original);
  });

  it('allows committing measured timings and documentation without changing measured inputs', () => {
    const { app, write } = fixture();
    const original = cypressSourceFingerprint(app);
    write('packages/app/timings.json', '{"durations":[]}');
    write('packages/app/timings-firefox.json', '{"durations":[]}');
    write('packages/app/component-timings.json', '{"durations":[]}');
    write('docs/testing.md', 'updated evidence');
    expect(cypressSourceFingerprint(app)).toBe(original);
  });
});
