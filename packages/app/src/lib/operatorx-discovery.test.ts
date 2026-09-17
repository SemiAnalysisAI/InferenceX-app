import AdmZip from 'adm-zip';
import { afterEach, expect, it, vi } from 'vitest';
import {
  readOperatorXBundle,
  type OperatorXBundle,
} from '@semianalysisai/inferencex-db/operatorx/reader';
import { makeOperatorXBundle } from '@semianalysisai/inferencex-db/operatorx/test-fixture';

// Substitute only the durable store and GitHub; execute discovery, download,
// artifact selection, ZIP parsing, and provenance validation unchanged.
const { stored } = vi.hoisted(() => ({ stored: new Map<string, OperatorXBundle>() }));
vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  getOperatorXWriteDb: () => null,
}));
vi.mock('@semianalysisai/inferencex-db/queries/operatorx', () => ({
  getOperatorXBundle: (_sql: unknown, id: string) => Promise.resolve(stored.get(id) ?? null),
  listOperatorXRuns: () =>
    Promise.resolve([...stored.values()].map((b) => readOperatorXBundle(b).run)),
  saveOperatorXBundle: (_sql: unknown, bundle: OperatorXBundle) => {
    stored.set(bundle.run.run_id, bundle);
    return Promise.resolve();
  },
}));
import { discoverOperatorXRuns } from './operatorx-ingest';

function zip(name: string, doc: unknown) {
  const archive = new AdmZip();
  archive.addFile(name, Buffer.from(JSON.stringify(doc)));
  return new Response(new Uint8Array(archive.toBuffer()));
}

afterEach(() => {
  stored.clear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it('continues past four unavailable reruns and stops polling after importing a later new run', async () => {
  vi.stubEnv('GITHUB_TOKEN', 'test-token');
  const fresh = makeOperatorXBundle();
  const runs = [127, 126, 125, 124, 123].map((id) => ({
    id,
    name: 'OperatorX Sweep',
    path: '.github/workflows/operatorx-sweep.yml',
    event: 'workflow_dispatch',
    status: 'completed',
    run_attempt: id === 123 ? 1 : 2,
    head_sha: 'abc',
    head_branch: 'test',
    created_at: '2026-09-16T00:00:00Z',
    conclusion: 'success',
  }));
  for (const run of runs.slice(0, 4)) {
    // Adjust the complete provenance consistently for each independent run.
    stored.set(String(run.id), JSON.parse(JSON.stringify(fresh).replaceAll('123', String(run.id))));
  }
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      const path = new URL(url).pathname;
      if (path.endsWith('/operatorx-sweep.yml/runs')) return Response.json({ workflow_runs: runs });
      const run = runs.find((r) => path.endsWith(`/runs/${r.id}`));
      if (run) return Response.json(run);
      if (path.endsWith('/runs/123/artifacts'))
        return Response.json({
          total_count: 2,
          artifacts: [
            { id: 1, name: 'operatorx-manifest-123', expired: false, size_in_bytes: 200 },
            { id: 2, name: 'operatorx-shard-123-1-a', expired: false, size_in_bytes: 200 },
          ],
        });
      if (path.endsWith('/1/zip')) return zip('operatorx-manifest.json', fresh.manifest);
      if (path.endsWith('/2/zip')) return zip('results/nvidia/run.json', fresh.shards[0].docs[0]);
      return new Response('Artifacts unavailable', { status: 404 });
    }),
  );

  for (let request = 0; request < 2; request++) {
    const result = await discoverOperatorXRuns('example.com');
    expect(result.discovery_complete).toBe(true);
    expect(result.runs).toHaveLength(5);
    expect(result.runs.find((run) => run.run_id === '123')).toMatchObject({
      run_attempt: 1,
      measured: 1,
      missing: 0,
    });
    expect(result.runs.find((run) => run.run_id === '127')?.run_attempt).toBe(1);
  }
});
