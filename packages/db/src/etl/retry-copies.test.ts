import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  benchmarkPointKey,
  dropSupersededJobCopies,
  perJobPointKeys,
  type RetryArtifactMeta,
} from './retry-copies';
import { readBenchmarkArtifacts } from './benchmark-artifacts';
import { createSkipTracker } from './skip-tracker';

const golden = path.resolve(import.meta.dirname, 'fixtures/powerx-manifest-v2');
const goldenRow = JSON.parse(
  fs.readFileSync(path.join(golden, 'bmk_agentic_golden/agg.json'), 'utf8'),
) as Record<string, unknown>;

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function tempRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'retry-copies-'));
  roots.push(dir);
  return dir;
}

const SIBLINGS = ['bmk_agentic_', 'agentic_', 'power_audit_', 'multinode_server_logs_'];

function writeCopy(dir: string, suffix: string, row: Record<string, unknown>): void {
  for (const prefix of SIBLINGS) fs.mkdirSync(path.join(dir, `${prefix}${suffix}`));
  fs.writeFileSync(path.join(dir, `bmk_agentic_${suffix}`, 'result.json'), JSON.stringify(row));
  fs.writeFileSync(path.join(dir, `power_audit_${suffix}`, 'gpu_metrics.csv'), 'x');
}

function metas(entries: [string, string, number][]): RetryArtifactMeta[] {
  return entries.flatMap(([suffix, createdAt, id]) =>
    SIBLINGS.map((prefix) => ({ name: `${prefix}${suffix}`, created_at: createdAt, id })),
  );
}

describe('dropSupersededJobCopies', () => {
  it('keeps the latest attempt of a point and every sibling of that copy', () => {
    const dir = tempRoot();
    writeCopy(dir, 'conc48-aaaa', { ...goldenRow, median_e2el: 1 });
    writeCopy(dir, 'conc48-zzzz', { ...goldenRow, median_e2el: 2 });
    writeCopy(dir, 'conc48-mmmm', { ...goldenRow, median_e2el: 3 });

    const selection = dropSupersededJobCopies(
      dir,
      metas([
        ['conc48-zzzz', '2026-10-13T21:34:14Z', 30],
        ['conc48-aaaa', '2026-10-14T18:25:00Z', 10],
        ['conc48-mmmm', '2026-10-15T00:46:49Z', 20],
      ]),
    );

    expect(selection.superseded.map((copy) => [copy.suffix, copy.keptSuffix])).toEqual([
      ['conc48-aaaa', 'conc48-mmmm'],
      ['conc48-zzzz', 'conc48-mmmm'],
    ]);
    expect(fs.readdirSync(dir).toSorted()).toEqual(
      SIBLINGS.map((p) => `${p}conc48-mmmm`).toSorted(),
    );
  });

  it('leaves single copies, other points and eval artifacts alone', () => {
    const dir = tempRoot();
    writeCopy(dir, 'conc48-old', goldenRow);
    writeCopy(dir, 'conc48-new', goldenRow);
    writeCopy(dir, 'conc56-only', { ...goldenRow, conc: 56, users: 56 });
    fs.mkdirSync(path.join(dir, 'eval_conc48-old'));
    fs.mkdirSync(path.join(dir, 'results_bmk'));

    dropSupersededJobCopies(
      dir,
      metas([
        ['conc48-old', '2026-10-13T00:00:00Z', 1],
        ['conc48-new', '2026-10-14T00:00:00Z', 2],
        ['conc56-only', '2026-10-13T00:00:00Z', 3],
      ]),
    );

    const left = fs.readdirSync(dir);
    expect(left).toContain('bmk_agentic_conc56-only');
    expect(left).toContain('power_audit_conc56-only');
    expect(left).toContain('eval_conc48-old');
    expect(left).toContain('results_bmk');
    expect(left.filter((name) => name.endsWith('conc48-old'))).toEqual(['eval_conc48-old']);
  });

  it('prefers the producer run_attempt over artifact timestamps', () => {
    const dir = tempRoot();
    writeCopy(dir, 'attempt3', { ...goldenRow, run_attempt: 3 });
    writeCopy(dir, 'attempt2', { ...goldenRow, run_attempt: 2 });
    const selection = dropSupersededJobCopies(
      dir,
      metas([
        ['attempt3', '2026-10-13T00:00:00Z', 1],
        ['attempt2', '2026-10-14T00:00:00Z', 2],
      ]),
    );
    expect(selection.superseded.map((copy) => copy.suffix)).toEqual(['attempt2']);
  });

  it('does not store run_attempt as a metric', () => {
    const dir = tempRoot();
    writeCopy(dir, 'attempt3', { ...goldenRow, run_attempt: 3 });
    const [file] = readBenchmarkArtifacts(dir, { runId: 1, tracker: createSkipTracker() });
    expect(file!.rows[0]!.mapped!.metrics).not.toHaveProperty('run_attempt');
  });

  it('breaks equal timestamps by artifact id', () => {
    const dir = tempRoot();
    writeCopy(dir, 'a', goldenRow);
    writeCopy(dir, 'b', goldenRow);
    const selection = dropSupersededJobCopies(
      dir,
      metas([
        ['a', '2026-10-14T00:00:00Z', 9],
        ['b', '2026-10-14T00:00:00Z', 5],
      ]),
    );
    expect(selection.superseded.map((copy) => copy.suffix)).toEqual(['b']);
  });

  it('keeps a passing copy when a failed copy of the point exists', () => {
    const dir = tempRoot();
    writeCopy(dir, 'passed', goldenRow);
    writeCopy(dir, 'failed', { ...goldenRow, benchmark_outcome: { status: 'failed' } });
    const selection = dropSupersededJobCopies(
      dir,
      metas([
        ['passed', '2026-10-13T00:00:00Z', 1],
        ['failed', '2026-10-14T00:00:00Z', 2],
      ]),
    );
    expect(selection.superseded).toEqual([]);
    expect(fs.existsSync(path.join(dir, 'power_audit_passed'))).toBe(true);
  });

  it('fails when an older copy loses only some of its points', () => {
    const dir = tempRoot();
    writeCopy(dir, 'old', goldenRow);
    fs.writeFileSync(
      path.join(dir, 'bmk_agentic_old', 'result.json'),
      JSON.stringify([goldenRow, { ...goldenRow, conc: 56, users: 56 }]),
    );
    writeCopy(dir, 'new', goldenRow);
    expect(() =>
      dropSupersededJobCopies(
        dir,
        metas([
          ['old', '2026-10-13T00:00:00Z', 1],
          ['new', '2026-10-14T00:00:00Z', 2],
        ]),
      ),
    ).toThrow('lost only some of its points');
    expect(fs.readdirSync(dir)).toHaveLength(SIBLINGS.length * 2);
  });

  it('keeps every copy and reports the point when artifact metadata is missing', () => {
    const dir = tempRoot();
    writeCopy(dir, 'a', goldenRow);
    writeCopy(dir, 'b', goldenRow);
    const selection = dropSupersededJobCopies(dir, metas([['a', '2026-10-14T00:00:00Z', 1]]));
    expect(selection).toMatchObject({ superseded: [], unordered: [expect.any(String)] });
    expect(fs.readdirSync(dir)).toHaveLength(SIBLINGS.length * 2);
  });
});

describe('perJobPointKeys', () => {
  it('lists points held by per-job files, not by the aggregate', () => {
    const dir = tempRoot();
    writeCopy(dir, 'conc48', goldenRow);
    fs.mkdirSync(path.join(dir, 'results_bmk'));
    fs.writeFileSync(
      path.join(dir, 'results_bmk', 'agg_bmk.json'),
      JSON.stringify([goldenRow, { ...goldenRow, conc: 56, users: 56 }]),
    );
    const files = readBenchmarkArtifacts(dir, { runId: 1, tracker: createSkipTracker() });
    const keys = perJobPointKeys(files);
    const aggregate = files.find((file) => file.path.startsWith('results_bmk/'))!;
    expect(aggregate.rows.map(({ mapped }) => keys.has(benchmarkPointKey(mapped!)))).toEqual([
      true,
      false,
    ]);
  });
});
