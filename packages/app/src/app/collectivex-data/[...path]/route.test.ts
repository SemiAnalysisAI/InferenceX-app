import { createHash } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { parseCollectiveXChannel, parseCollectiveXDataset } from '@/components/collectivex/reader';
import { makeCollectiveXDataset } from '@/components/collectivex/test-fixture';

const github = vi.hoisted(() => ({
  errorCode: vi.fn((error: unknown) =>
    error instanceof Error && 'code' in error ? (error.code as string) : null,
  ),
  load: vi.fn(),
}));

vi.mock('@/lib/collectivex-github', () => ({
  collectiveXPublicationErrorCode: github.errorCode,
  loadCollectiveXPublication: github.load,
}));

import { GET } from './route';

const dataset = makeCollectiveXDataset();
const body = Buffer.from(`${JSON.stringify(dataset)}\n`);
const digest = createHash('sha256').update(body).digest('hex');

function request(...segments: string[]) {
  return GET(new Request('http://localhost/collectivex-data/test'), {
    params: Promise.resolve({ path: segments }),
  });
}

beforeEach(() => {
  github.load.mockReset();
  github.load.mockResolvedValue({
    artifactId: 123,
    body: Uint8Array.from(body),
    dataset,
    digest,
    runId: 456,
  });
});

describe('CollectiveX GitHub publication route', () => {
  it('resolves dev-latest to the JIT-fetched publication', async () => {
    const response = await request('1', 'channels', 'dev-latest.json');
    const channel = parseCollectiveXChannel(await response.json());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('s-maxage=60');
    expect(response.headers.get('x-collectivex-source')).toBe('github-actions');
    expect(channel).toMatchObject({
      channel: 'dev-latest',
      dataset: { bytes: body.byteLength, sha256: digest },
    });
    expect(github.load).toHaveBeenCalledWith(1, undefined);
  });

  it('serves the exact digest-addressed dataset bytes', async () => {
    const response = await request('1', 'datasets', digest, 'dataset.json');
    const served = Buffer.from(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('immutable');
    expect(served).toEqual(body);
    expect(parseCollectiveXDataset(JSON.parse(served.toString('utf8')))).toEqual(dataset);
    expect(github.load).toHaveBeenCalledWith(1, digest);
  });

  it('does not expose the private latest-attempt channel', async () => {
    const response = await request('1', 'channels', 'latest-attempt.json');

    expect(response.status).toBe(404);
    expect(response.headers.get('x-collectivex-status')).toBeNull();
    expect(github.load).not.toHaveBeenCalled();
  });

  it.each([
    ['not-found', 404, 'channel-unavailable'],
    ['unavailable', 503, 'source-unavailable'],
    ['invalid', 502, null],
  ] as const)('maps %s source failures without exposing details', async (code, status, marker) => {
    github.load.mockRejectedValue(Object.assign(new Error('private upstream detail'), { code }));

    const response = await request('1', 'channels', 'dev-latest.json');

    expect(response.status).toBe(status);
    expect(response.headers.get('x-collectivex-status')).toBe(marker);
    expect(await response.text()).toBe('');
  });

  it('rejects unlisted paths before contacting GitHub', async () => {
    const response = await request('private', 'bundle.json');
    expect(response.status).toBe(404);
    expect(github.load).not.toHaveBeenCalled();
  });

  it.each(['v1', '0', '99', '01'])(
    'rejects the unknown version segment %s before contacting GitHub',
    async (segment) => {
      const response = await request(segment, 'channels', 'dev-latest.json');
      expect(response.status).toBe(404);
      expect(github.load).not.toHaveBeenCalled();
    },
  );
});
