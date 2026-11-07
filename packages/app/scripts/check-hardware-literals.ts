#!/usr/bin/env bun
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { GPU_RUNNER_ALIASES, HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import {
  compareToBaseline,
  hardwareKeyPattern,
  scanHardwareLiterals,
  type HardwareLiteral,
  type HardwareLiteralCounts,
} from '../src/lib/testing/hardware-literal-gate';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const BASELINE_PATH = path.join(import.meta.dirname, 'hardware-literals-baseline.json');
const UPDATE = process.argv.includes('--update');

const EXCLUDED = [
  // The registry.
  /^packages\/constants\/src\/gpu-keys\.ts$/u,
  // The power model port mirrors InferenceX power_model, which owns its system tables.
  /^packages\/app\/src\/lib\/power\/power_model\//u,
  // Hand-curated corrections record the hardware of specific historical runs.
  /^packages\/db\/src\/etl\/[\w-]+-(?:overrides|backfills)\.ts$/u,
  /\.(?:test|fixture|test-harness)\.tsx?$|test-fixture\.ts$|\/src\/test\/|\/lib\/testing\//u,
  /\/lib\/views-api\/docs\/|\/api-documentation\.ts$/u,
];

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(full, out);
    } else if (/\.tsx?$/u.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

const keys = new Set([...Object.keys(HW_REGISTRY), ...Object.keys(GPU_RUNNER_ALIASES)]);
const pattern = hardwareKeyPattern(keys);
const packagesDir = path.join(REPO_ROOT, 'packages');

const found: Record<string, HardwareLiteral[]> = {};
for (const pkg of readdirSync(packagesDir).sort()) {
  const srcDir = path.join(packagesDir, pkg, 'src');
  if (!existsSync(srcDir)) continue;
  for (const absPath of collectSourceFiles(srcDir)) {
    const relPath = path.relative(REPO_ROOT, absPath).replaceAll(path.sep, '/');
    if (EXCLUDED.some((excluded) => excluded.test(relPath))) continue;
    const hits = scanHardwareLiterals(relPath, readFileSync(absPath, 'utf8'), keys, pattern);
    if (hits.length > 0) found[relPath] = hits;
  }
}

const counts: HardwareLiteralCounts = Object.fromEntries(
  Object.keys(found)
    .sort()
    .map((file) => [file, found[file].length]),
);
const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
const summary = `${total} literal(s) in ${Object.keys(counts).length} file(s)`;

if (UPDATE) {
  writeFileSync(BASELINE_PATH, `${JSON.stringify(counts, null, 2)}\n`);
  console.log(`check-hardware-literals: baseline rewritten, ${summary}.`);
  process.exit(0);
}

const baseline: HardwareLiteralCounts = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
const { grown, shrunk } = compareToBaseline(counts, baseline);

if (grown.length > 0) {
  console.error('check-hardware-literals: new hardware keys outside the registry:\n');
  for (const file of grown) {
    console.error(`  ${file}: ${counts[file]}, baseline allows ${baseline[file] ?? 0}`);
    for (const hit of found[file]) {
      console.error(`    ${file}:${hit.line}  ${JSON.stringify(hit.text)}`);
    }
  }
  console.error(
    '\nDerive hardware from HW_REGISTRY (packages/constants/src/gpu-keys.ts) instead of naming keys;' +
      ' to accept a literal on purpose, run:\n  bun run check:hardware-literals --update\n',
  );
  process.exit(1);
}

if (shrunk.length > 0) {
  console.log('check-hardware-literals: counts dropped; lower the baseline with:');
  console.log('  bun run check:hardware-literals --update');
  for (const file of shrunk) {
    console.log(`  ${file}: ${counts[file] ?? 0} (baseline ${baseline[file]})`);
  }
}

console.log(`check-hardware-literals: OK, ${summary}.`);
