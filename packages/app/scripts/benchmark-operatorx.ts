/**
 * CPU replay only; this does not query a database or establish origin latency.
 *
 * bun packages/app/scripts/benchmark-operatorx.ts \
 *   --dataset /tmp/ascend-dataset.json --dataset /tmp/h200-dataset.json \
 *   --comparison /tmp/comparison.json --output /tmp/operatorx-benchmark.json
 *
 * Inputs are newest first. --dataset accepts a run API's normalized response;
 * --bundle accepts an actual raw bundle and includes normalization in the replay.
 * Use one input kind per invocation so ordering and the measured boundary are clear.
 * Optional --comparison measures parsing a captured final view independently.
 */
import { deepStrictEqual } from 'node:assert';
import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';
import { gzipSync } from 'node:zlib';

import {
  buildComparison,
  comparisonCaseKey,
  comparisonView,
  type ComparisonInput,
  type ComparisonOp,
} from '@semianalysisai/inferencex-db/operatorx/compare';
import {
  buildRunComparison,
  mergeRunComparisons,
  OPERATORX_COMPARISON_VERSION,
} from '@semianalysisai/inferencex-db/operatorx/comparison-cache';
import {
  normalizeBundle,
  type OperatorXDataset,
} from '@semianalysisai/inferencex-db/operatorx/normalize';

const { values } = parseArgs({
  options: {
    help: { type: 'boolean' },
    dataset: { type: 'string', multiple: true },
    bundle: { type: 'string', multiple: true },
    comparison: { type: 'string' },
    op: { type: 'string', default: 'gemm' },
    workload: { type: 'string' },
    output: { type: 'string' },
  },
});
if (values.help) {
  console.log(
    'Usage: bun packages/app/scripts/benchmark-operatorx.ts (--dataset PATH ... | --bundle PATH ...) [--op gemm|moe] [--workload ID] [--comparison PATH] [--output PATH]',
  );
  process.exit(0);
}
if (values.op !== 'gemm' && values.op !== 'moe') throw new Error('--op must be gemm or moe');
const op: ComparisonOp = values.op;
if (values.dataset?.length && values.bundle?.length) {
  throw new Error('Use --dataset or --bundle, not both');
}
const paths = values.bundle ?? values.dataset ?? [];
if (paths.length === 0) throw new Error('Pass newest-first --dataset or --bundle paths');
const texts = paths.map((path) => readFileSync(path, 'utf8'));
const readInputs = (): ComparisonInput[] =>
  texts.map((text) => {
    const dataset: OperatorXDataset = values.bundle
      ? normalizeBundle(JSON.parse(text))
      : JSON.parse(text);
    if (!dataset.run?.plan?.runner || dataset.run.plan.mode !== 'timing') {
      throw new Error('Expected a normalized timing run with a runner in its plan');
    }
    return { runner: dataset.run.plan.runner, dataset };
  });

/** Raw service selection, before projecting rows; retained as the parity oracle. */
function baseline(inputs: ComparisonInput[]) {
  const selected = new Map<
    string,
    { input: ComparisonInput; result: OperatorXDataset['results'][number] }
  >();
  for (const input of inputs)
    for (const result of input.dataset.results) {
      const key = comparisonCaseKey(op, input.runner, result);
      if (key === null) continue;
      const previous = selected.get(key);
      if (!previous || (previous.result.status === 'missing' && result.status !== 'missing')) {
        selected.set(key, { input, result });
      }
    }
  const byRun = new Map<string, ComparisonInput>();
  for (const { input, result } of selected.values()) {
    let into = byRun.get(input.dataset.run.runId);
    if (!into) {
      into = { runner: input.runner, dataset: { run: input.dataset.run, results: [] } };
      byRun.set(input.dataset.run.runId, into);
    }
    into.dataset.results.push(result);
  }
  return buildComparison(op, [...byRun.values()]);
}

const inputs = readInputs();
const compactTexts = inputs.map((input) => JSON.stringify(buildRunComparison(op, input)));
const readCompact = () =>
  mergeRunComparisons(
    op,
    compactTexts.map((text) => JSON.parse(text)),
  );
const expected = baseline(inputs);
const actual = readCompact();
deepStrictEqual(actual, expected);
for (const workload of [null, ...expected.workloads.map((w) => w.id)]) {
  deepStrictEqual(comparisonView(actual, workload), comparisonView(expected, workload));
}
const workload = values.workload ?? null;
const finalText = JSON.stringify(comparisonView(expected, workload));
let sink: unknown;
function measure(name: string, fn: () => unknown) {
  for (let i = 0; i < 10; i++) sink = fn();
  const samples: number[] = [];
  for (let sample = 0; sample < 21; sample++) {
    const start = performance.now();
    for (let iteration = 0; iteration < 5; iteration++) sink = fn();
    samples.push((performance.now() - start) / 5);
  }
  samples.sort((a, b) => a - b);
  return {
    name,
    medianMs: samples[10],
    p10Ms: samples[2],
    p90Ms: samples[18],
  };
}
const measurements = [
  measure('parse input + optional normalization + select + build + view + stringify', () =>
    JSON.stringify(comparisonView(baseline(readInputs()), workload)),
  ),
  measure('parse compact runs + merge + view + stringify', () =>
    JSON.stringify(comparisonView(readCompact(), workload)),
  ),
  measure('parse cached final view', () => JSON.parse(finalText)),
  measure('build per-run projections (ingest CPU)', () =>
    inputs.map((input) => buildRunComparison(op, input)),
  ),
];
const size = (text: string) => ({
  bytes: Buffer.byteLength(text),
  gzipBytes: gzipSync(text).length,
});
let capturedComparison = null;
if (values.comparison) {
  const text = readFileSync(values.comparison, 'utf8');
  const view = JSON.parse(text);
  capturedComparison = { path: values.comparison, cases: view.cases.length, ...size(text) };
  measurements.push(measure('parse independently captured final view', () => JSON.parse(text)));
}
const report = {
  runtime: { node: process.version, bun: process.versions.bun ?? null },
  version: OPERATORX_COMPARISON_VERSION,
  scope: values.bundle ? 'raw-bundle CPU replay' : 'normalized-dataset CPU replay',
  limitations: [
    'No database, network, serverless cold start, CDN, or Rust measurements.',
    ...(values.bundle
      ? []
      : ['Raw bundles are absent: baseline excludes raw metrics transfer and normalization.']),
    'Projection creation is moved to ingest, not eliminated; measured separately.',
    'Cached final-view parsing excludes cache lookup and invalidation costs.',
  ],
  method: { warmups: 10, samples: 21, iterationsPerSample: 5 },
  parity:
    'Exact deep equality of full comparison and every workload view, including sources and provenance.',
  inputs: paths.map((path, i) => ({
    path,
    rows: inputs[i].dataset.results.length,
    ...size(texts[i]),
  })),
  compactRuns: compactTexts.map((text) => size(text)),
  finalView: size(finalText),
  capturedComparison,
  measurements,
};
// Keep timed work observable without including its data in the report.
if (sink === undefined) throw new Error('Benchmark did not run');
const output = `${JSON.stringify(report, null, 2)}\n`;
if (values.output) writeFileSync(values.output, output);
process.stdout.write(output);
