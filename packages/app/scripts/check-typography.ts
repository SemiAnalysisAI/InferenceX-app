#!/usr/bin/env bun
/**
 * Typography ratchet gate — CLI.
 *
 *   bun run check:typography            # verify (CI + lefthook)
 *   bun run check:typography --update   # shrink the allowlist after fixes
 *
 * Scans packages/app/src for arbitrary font sizes (text-[11px]), arbitrary
 * letter-spacing (tracking-[0.16em]), and quoted font-size literals in the
 * shared D3 chart library, then compares per-file counts against
 * scripts/typography-allowlist.json. New offenders fail immediately; the
 * allowlisted ones are the migration burndown and may only ever decrease.
 * Rules and exemptions live in src/lib/typography-gate.ts; docs/typography.md
 * explains the token system these rules point at.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  compareToAllowlist,
  countViolations,
  scanSource,
  type ViolationCounts,
} from '../src/lib/typography-gate';

const APP_ROOT = path.resolve(import.meta.dirname, '..');
const ALLOWLIST_PATH = path.join(import.meta.dirname, 'typography-allowlist.json');
const UPDATE = process.argv.includes('--update');

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(full, out);
    } else if (/\.tsx?$/u.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const files = collectSourceFiles(path.join(APP_ROOT, 'src'))
  .map((absPath) => ({
    relPath: path.relative(APP_ROOT, absPath).replaceAll(path.sep, '/'),
    source: readFileSync(absPath, 'utf8'),
  }))
  .sort((a, b) => a.relPath.localeCompare(b.relPath));

const counts = countViolations(files);

if (UPDATE) {
  const sorted: ViolationCounts = Object.fromEntries(
    Object.keys(counts)
      .sort()
      .map((file) => [file, counts[file]]),
  );
  writeFileSync(ALLOWLIST_PATH, `${JSON.stringify(sorted, null, 2)}\n`);
  const total = Object.values(sorted)
    .flatMap((rules) => Object.values(rules))
    .reduce((sum, n) => sum + n, 0);
  console.log(
    `check-typography: allowlist rewritten with ${Object.keys(sorted).length} file(s), ${total} violation(s) remaining.`,
  );
  process.exit(0);
}

const allowlist: ViolationCounts = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8'));
const { errors, stale } = compareToAllowlist(counts, allowlist);

if (errors.length > 0) {
  console.error('check-typography: new typography violations (see docs/typography.md):\n');
  for (const error of errors) {
    console.error(`  ${error}`);
    const [file] = error.split(':', 1);
    const entry = files.find((candidate) => candidate.relPath === file);
    if (!entry) continue;
    for (const violation of scanSource(entry.relPath, entry.source)) {
      console.error(
        `    ${file}:${violation.line}  ${violation.match}  →  ${violation.suggestion}`,
      );
    }
  }
}

if (stale.length > 0) {
  console.error(
    '\ncheck-typography: violations were fixed — ratchet down by running:\n  bun run check:typography --update\n',
  );
  for (const line of stale) console.error(`  ${line}`);
}

if (errors.length > 0 || stale.length > 0) {
  process.exit(1);
}

console.log('check-typography: OK');
