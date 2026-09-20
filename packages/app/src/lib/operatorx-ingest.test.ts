import AdmZip from 'adm-zip';
import { afterEach, it, expect, vi } from 'vitest';
import { makeOperatorXBundle } from '@semianalysisai/inferencex-db/operatorx/test-fixture';
import { downloadOperatorXBundle, selectOperatorXArtifacts } from './operatorx-ingest';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function zip(name: string, doc: unknown) {
  const z = new AdmZip();
  z.addFile(name, Buffer.from(JSON.stringify(doc)));
  return z.toBuffer();
}
const artifact = (id: number, name: string, expired = false) => ({
  id,
  name,
  expired,
  size_in_bytes: 10,
});
it('downloads a real ZIP contract through paginated artifact discovery and validates the bundle', async () => {
  vi.stubEnv('GITHUB_TOKEN', 'test-token');
  const fixture = makeOperatorXBundle();
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      urls.push(url);
      if (url.includes('/artifacts?'))
        return Response.json({
          total_count: 2,
          artifacts: url.endsWith('&page=1')
            ? [{ id: 1, name: 'operatorx-manifest-123', expired: false, size_in_bytes: 200 }]
            : [{ id: 2, name: 'operatorx-shard-123-1-a', expired: false, size_in_bytes: 200 }],
        });
      return new Response(
        new Uint8Array(
          url.endsWith('/1/zip')
            ? zip('operatorx-manifest.json', fixture.manifest)
            : zip('results/nvidia/run.json', fixture.shards[0].docs[0]),
        ),
      );
    }),
  );
  const bundle = await downloadOperatorXBundle({
    id: 123,
    name: 'OperatorX Sweep',
    path: '.github/workflows/operatorx-sweep.yml',
    event: 'workflow_dispatch',
    status: 'completed',
    run_attempt: 1,
    head_sha: 'abc',
    head_branch: 'test',
    created_at: '2026-09-16T00:00:00Z',
    conclusion: 'success',
  });
  expect(bundle).toEqual(fixture);
  expect(urls).toHaveLength(4);
});
it('selects newest per-shard attempts, including an expired newest artifact rather than resurrecting stale data', () => {
  const selected = selectOperatorXArtifacts(
    [
      artifact(1, 'operatorx-shard-123-1-a'),
      artifact(2, 'operatorx-shard-123-2-a', true),
      artifact(3, 'operatorx-shard-123-1-b'),
      artifact(4, 'operatorx-shard-124-1-c'),
      artifact(5, 'operatorx-shard-123-3-b'),
    ],
    '123',
    2,
  );
  expect([...selected].map(([id, s]) => [id, s.attempt, s.artifact.id])).toEqual([
    ['a', 2, 2],
    ['b', 1, 3],
  ]);
});

it('rejects a different workflow before downloading artifacts', async () => {
  await expect(
    downloadOperatorXBundle({
      id: 123,
      name: 'Run Sweep',
      path: '.github/workflows/run-sweep.yml',
      event: 'workflow_dispatch',
      status: 'completed',
      run_attempt: 1,
      head_sha: 'abc',
      head_branch: 'test',
      created_at: '2026-09-16T00:00:00Z',
      conclusion: 'success',
    }),
  ).rejects.toMatchObject({ status: 404 });
});
