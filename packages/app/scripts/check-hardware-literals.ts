#!/usr/bin/env bun
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { GPU_RUNNER_ALIASES, HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import { collectSourceFiles } from '../src/lib/testing/source-files';
import {
  compareToBaseline,
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
  // Per-chip content: pages, presets, glossary, articles, quotes and support matrices.
  /^packages\/app\/src\/lib\/catalog\/chip-pages(?:-zh)?\.ts$/u,
  /^packages\/app\/src\/lib\/content\/(?:glossary|glossary-zh|whitepapers)\.ts$/u,
  /^packages\/app\/src\/lib\/agentx\/agentx-optimizations(?:-zh)?\.ts$/u,
  /^packages\/app\/src\/components\/favorites\/favorite-presets\.ts$/u,
  /^packages\/app\/src\/components\/collectivex\/known-support\.ts$/u,
  /^packages\/app\/src\/components\/quotes\/quotes-data\.ts$/u,
  /^packages\/app\/src\/components\/ubenchx\/ubenchx-data\.ts$/u,
  /\.(?:test|fixture|test-harness)\.tsx?$|test-fixture\.ts$|\/src\/test\/|\/lib\/testing\//u,
  /\/lib\/views-api\/docs\/|\/api-documentation\.ts$/u,
];

const keys = new Set([...Object.keys(HW_REGISTRY), ...Object.keys(GPU_RUNNER_ALIASES)]);
const packagesDir = path.join(REPO_ROOT, 'packages');

const found: Record<string, HardwareLiteral[]> = {};
for (const pkg of readdirSync(packagesDir).sort()) {
  const srcDir = path.join(packagesDir, pkg, 'src');
  if (!existsSync(srcDir)) continue;
  for (const absPath of collectSourceFiles(srcDir)) {
    const relPath = path.relative(REPO_ROOT, absPath).replaceAll(path.sep, '/');
    if (EXCLUDED.some((excluded) => excluded.test(relPath))) continue;
    const hits = scanHardwareLiterals(relPath, readFileSync(absPath, 'utf8'), keys);
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
  console.error('check-hardware-literals: counts dropped; lower the baseline with:');
  console.error('  bun run check:hardware-literals --update');
  for (const file of shrunk) {
    console.error(`  ${file}: ${counts[file] ?? 0} (baseline ${baseline[file]})`);
  }
  process.exit(1);
}

console.log(`check-hardware-literals: OK, ${summary}.`);
