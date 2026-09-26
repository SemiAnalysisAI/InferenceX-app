import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { fetchRunMeta } from './lib/github-artifacts';
import { sweepBundle } from './ingest-operatorx';

vi.mock('./lib/github-artifacts', () => ({
  fetchRunMeta: vi.fn(),
  listRunArtifacts: vi.fn(),
  downloadArtifact: vi.fn(),
}));

const meta = {
  id: 123,
  name: 'OperatorX Sweep',
  path: '.github/workflows/operatorx-sweep.yml',
  status: 'completed',
  conclusion: 'failure',
  run_attempt: 2,
  head_sha: 'a'.repeat(40),
  head_branch: 'operatorx',
  created_at: '2026-09-26T00:00:00Z',
};

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  vi.mocked(fetchRunMeta).mockReset();
});

function scratch(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'operatorx-ingest-test-'));
  dirs.push(dir);
  return dir;
}

function json(root: string, relative: string, value: unknown): void {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
}

it('loads the newest completed artifact per shard while retaining untouched shards', () => {
  vi.mocked(fetchRunMeta).mockReturnValue(meta);
  const dir = scratch();
  json(dir, 'operatorx-manifest-123/operatorx-manifest.json', { include: [] });
  json(dir, 'operatorx-shard-123-1-s1/results/old.json', { value: 'old' });
  json(dir, 'operatorx-shard-123-2-s1/results/new.json', { value: 'new' });
  json(dir, 'operatorx-shard-123-2-s1/results/counters/ignored.json', { value: 'counter' });
  json(dir, 'operatorx-shard-123-1-s2/results/only.json', { value: 'untouched' });
  json(dir, 'operatorx-shard-123-3-s1/results/future.json', { value: 'future' });

  const bundle = sweepBundle('SemiAnalysisAI/InferenceX', '123', dir, false);

  expect(bundle.run).toMatchObject({
    run_id: '123',
    run_attempt: 2,
    conclusion: 'failure',
    source_sha: meta.head_sha,
    source_branch: 'operatorx',
  });
  expect(bundle.shards).toEqual([
    { id: 's1', attempt: 2, docs: [{ value: 'new' }] },
    { id: 's2', attempt: 1, docs: [{ value: 'untouched' }] },
  ]);
});

it('rejects a run from another workflow before reading its artifacts', () => {
  vi.mocked(fetchRunMeta).mockReturnValue({ ...meta, path: '.github/workflows/ci.yml' });

  expect(() => sweepBundle('SemiAnalysisAI/InferenceX', '123', scratch(), false)).toThrow(
    'not an OperatorX sweep',
  );
});
