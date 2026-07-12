import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildRunSummary } from '@/components/collectivex/reader';
import { makeCollectiveXDataset } from '@/components/collectivex/test-fixture';

const github = vi.hoisted(() => ({
  errorCode: vi.fn((error: unknown) =>
    error instanceof Error && 'code' in error ? (error.code as string) : null,
  ),
  load: vi.fn(),
  list: vi.fn(),
}));

vi.mock('@/lib/collectivex-github', () => ({
  collectiveXSweepErrorCode: github.errorCode,
  loadCollectiveXSweepRun: github.load,
  listCollectiveXSweepRuns: github.list,
}));

import { GET } from './route';

const dataset = makeCollectiveXDataset();
const runId = dataset.run.run_id;
const summary = buildRunSummary(dataset);

function request(...segments: string[]) {
  return GET(new Request('http://localhost/collectivex-data/test'), {
    params: Promise.resolve({ path: segments }),
  });
}

beforeEach(() => {
  github.load.mockReset();
  github.list.mockReset();
  github.load.mockResolvedValue(dataset);
  github.list.mockResolvedValue([summary]);
});

describe('CollectiveX sweep data route', () => {
  it('serves the latest run dataset without a run id', async () => {
    const response = await request('1', 'latest.json');
    const served = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('s-maxage=60');
    expect(response.headers.get('x-collectivex-source')).toBe('github-actions');
    expect(served).toEqual(dataset);
    expect(github.load).toHaveBeenCalledWith(1, undefined);
  });

  it('serves a specific run by id with a short rerun-safe cache window', async () => {
    const response = await request('1', 'runs', `${runId}.json`);
    const served = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('s-maxage=60');
    expect(served).toEqual(dataset);
    expect(github.load).toHaveBeenCalledWith(1, runId);
  });

  it('lists recent runs as a neutral run summary document', async () => {
    const response = await request('1', 'runs.json');
    const body = (await response.json()) as {
      version: number;
      runs: unknown[];
    };

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('s-maxage=60');
    expect(body.version).toBe(1);
    expect(body.runs).toHaveLength(1);
    expect(github.list).toHaveBeenCalledWith(1);
    expect(github.load).not.toHaveBeenCalled();
  });

  it.each([
    ['not-found', 404],
    ['unavailable', 503],
    ['invalid', 502],
  ] as const)('maps %s source failures without exposing details', async (code, status) => {
    github.load.mockRejectedValue(Object.assign(new Error('private upstream detail'), { code }));

    const response = await request('1', 'latest.json');

    expect(response.status).toBe(status);
    expect(await response.text()).toBe('');
  });

  it('rejects a non-numeric run id before contacting the source', async () => {
    const response = await request('1', 'runs', 'latest.json');
    expect(response.status).toBe(404);
    expect(github.load).not.toHaveBeenCalled();
  });

  it('rejects unlisted paths before contacting the source', async () => {
    const response = await request('private', 'bundle.json');
    expect(response.status).toBe(404);
    expect(github.load).not.toHaveBeenCalled();
    expect(github.list).not.toHaveBeenCalled();
  });

  it.each(['v1', '0', '99', '01'])(
    'rejects the unknown version segment %s before contacting the source',
    async (segment) => {
      const response = await request(segment, 'latest.json');
      expect(response.status).toBe(404);
      expect(github.load).not.toHaveBeenCalled();
    },
  );
});
