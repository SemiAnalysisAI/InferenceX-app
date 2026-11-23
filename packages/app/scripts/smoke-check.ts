#!/usr/bin/env bun
// Smoke-checks a deployment's key APIs, pages and share images. See docs/testing.md.
//   bun run smoke -- https://inferencex.semianalysis.com
// Exits 1 when any check fails. In GitHub Actions each failure is also an ::error annotation.
import type { AvailabilityRow } from '@semianalysisai/inferencex-db/queries/workflow-info';

import {
  availabilityChecks,
  derivedChecks,
  escapeAnnotation,
  runChecks,
  staticChecks,
  type CheckResult,
  type RunOptions,
} from '../src/lib/testing/smoke-check';

const args = process.argv.slice(2).filter((arg) => arg !== '--');
const origin = new URL(args[0] ?? 'http://localhost:3000').origin;
const bypassSecret = process.env.VERCEL_PROTECTION_BYPASS_SECRET;
const options: RunOptions & { concurrency: number } = {
  headers: bypassSecret ? { 'x-vercel-protection-bypass': bypassSecret } : {},
  concurrency: 6,
};
const annotate = process.env.GITHUB_ACTIONS === 'true';

function report(result: CheckResult): void {
  const size = result.bytes === undefined ? '' : ` ${(result.bytes / 1024).toFixed(1)} KB`;
  const head = `${result.status ?? '---'} ${result.ms}ms${size} ${result.label}`;
  if (result.problems.length === 0) {
    console.log(`  ✓ ${head}`);
    return;
  }
  console.log(`  ✗ ${head}`);
  for (const problem of result.problems) console.log(`      ${problem}`);
  if (annotate) {
    const message = `${origin}${result.label}: ${result.problems.join('. ')}`;
    console.log(`::error title=Smoke check failed::${escapeAnnotation(message)}`);
  }
}

const start = performance.now();
console.log(`Smoke-checking ${origin}\n`);

const availability = await runChecks(origin, availabilityChecks(), options);
availability.forEach(report);
const rows = availability.find((result) => result.json)?.json as AvailabilityRow[] | undefined;
const derived = rows ? await derivedChecks(rows) : [];
if (!rows) {
  console.log(
    '\n  Availability failed, so the compare, run, ranking and share image checks are skipped.',
  );
} else if (!derived.some((check) => check.kind === 'png')) {
  const message =
    'Availability names no comparable chips, so the compare and share image checks are skipped.';
  console.log(annotate ? `::notice::${message}` : `\n  ${message}`);
}

const rest = await runChecks(origin, [...staticChecks(), ...derived], options);
rest.forEach(report);

const results = [...availability, ...rest];
const failed = results.filter((result) => result.problems.length > 0).length;
const seconds = ((performance.now() - start) / 1000).toFixed(1);
console.log(`\n${results.length - failed}/${results.length} checks passed in ${seconds}s`);
if (failed > 0) process.exitCode = 1;
