import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readBenchmarkArtifacts } from './benchmark-artifacts';
import { benchmarkRowDigest, selectBenchmarkMeasurements } from './benchmark-candidates';
import { createSkipTracker } from './skip-tracker';

const golden: Record<string, unknown> = JSON.parse(
  fs.readFileSync(
    new URL('fixtures/powerx-manifest-v2/bmk_agentic_golden/agg.json', import.meta.url),
    'utf8',
  ),
);
const dirs: string[] = [];
function read(rows: Record<string, unknown[]>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentx-candidates-'));
  dirs.push(root);
  for (const [name, content] of Object.entries(rows)) {
    fs.mkdirSync(path.join(root, name));
    fs.writeFileSync(path.join(root, name, 'agg.json'), JSON.stringify(content));
  }
  return readBenchmarkArtifacts(root, { runId: 123, tracker: createSkipTracker() });
}
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});
const context = { githubRunId: 123, runAttempt: 1 };

describe('selectBenchmarkMeasurements', () => {
  it('selects identical per-job copies in both orders without changing raw evidence', () => {
    const files = read({ results_bmk: [golden, golden], bmk_agentic_point: [golden] });
    const before = structuredClone(files);
    for (const inputs of [files, files.toReversed()]) {
      const result = selectBenchmarkMeasurements(inputs, context);
      const selected = result.sources.flatMap((source) => source.rows);
      expect(selected).toHaveLength(1);
      expect(result.decisions[0]?.winner.path).toBe('bmk_agentic_point/agg.json');
      expect(result.sources.find((source) => source.rows.length)?.file).toBe(files[0]);
    }
    expect(files).toEqual(before);
  });

  it('accepts unique aggregate-only legacy measurements and distinct fingerprints', () => {
    const other = { ...golden, recipe_fingerprint: 'b'.repeat(64), duration_seconds: 100 };
    const result = selectBenchmarkMeasurements(read({ results_bmk: [golden, other] }), context);
    expect(result.sources.flatMap((source) => source.rows)).toHaveLength(2);
  });

  it('refuses conflicting measurements in either file order', () => {
    const files = read({
      bmk_agentic_point: [golden],
      results_bmk: [{ ...golden, duration_seconds: 100 }],
    });
    for (const inputs of [files, files.toReversed()]) {
      expect(() => selectBenchmarkMeasurements(inputs, context)).toThrow(
        'Conflicting AgentX measurements',
      );
    }
  });

  it('excludes explicit failures while preserving their raw evidence', () => {
    const files = read({
      results_bmk: [golden, { ...golden, benchmark_outcome: { status: 'failed' } }],
    });
    const selected = selectBenchmarkMeasurements(files, context);
    expect(selected.sources[0]?.rows).toHaveLength(1);
    expect(files[0]?.rows).toHaveLength(2);
    expect(files[0]?.rows[1]?.failed).toBe(true);
  });

  it.each([
    null,
    { status: 'unknown' },
    { status: 'passed', attempt_id: 'one', finalized: false },
    { status: 'passed', attempt_id: 'one' },
    { status: 'passed', finalized: true },
    { status: 'failed', attempt_id: '', finalized: true },
    { status: 'failed', attempt_id: 'one', finalized: 'true' },
  ])('refuses malformed outcomes', (benchmark_outcome) => {
    expect(() =>
      selectBenchmarkMeasurements(
        read({ results_bmk: [{ ...golden, benchmark_outcome }] }),
        context,
      ),
    ).toThrow('Malformed AgentX');
  });

  it('leaves fixed-sequence ordering and duplicates unchanged', () => {
    const single = { ...golden, scenario_type: 'single-turn', isl: 1024, osl: 1024 };
    const files = read({ results_bmk: [single, { ...single, duration_seconds: 9 }] });
    expect(selectBenchmarkMeasurements(files, context).sources[0]?.rows).toEqual(files[0]?.rows);
  });

  it('canonicalizes object keys recursively while preserving array order', () => {
    expect(benchmarkRowDigest({ z: 1, a: { c: 3, b: 2 } })).toBe(
      benchmarkRowDigest({ a: { b: 2, c: 3 }, z: 1 }),
    );
    expect(benchmarkRowDigest({ a: [1, 2] })).not.toBe(benchmarkRowDigest({ a: [2, 1] }));
  });
});
