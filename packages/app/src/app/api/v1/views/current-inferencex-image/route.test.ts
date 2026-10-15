import type { LatestImageRow } from '@/lib/api/api';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';
import { imageAgeHistory, imageAgeSummary } from '@/components/latest-image/image-age';

const mocks = vi.hoisted(() => ({ images: vi.fn(), releases: vi.fn(), history: vi.fn() }));
vi.mock('@semianalysisai/inferencex-db/connection', () => ({ getDb: () => ({}) }));
vi.mock('@semianalysisai/inferencex-db/queries/latest-images', () => ({
  getImageAgeObservations: mocks.history,
}));
vi.mock('@/app/api/v1/latest-images/route', () => ({ GET: mocks.images }));
vi.mock('@/app/api/v1/framework-releases/route', () => ({ GET: mocks.releases }));
vi.mock('@/lib/cache/api-cache', () => ({
  cachedJson: (data: unknown) => Response.json(data),
  cachedQuery: (fn: unknown) => fn,
}));
const image: LatestImageRow = {
  model: 'dsv4',
  hardware: 'b200',
  framework: 'sglang',
  precision: 'fp8',
  spec_method: 'none',
  disagg: false,
  isl: null,
  osl: null,
  benchmark_type: 'agentic_traces',
  image: 'example:v1',
  date: '2026-09-01',
};
const request = (params: Record<string, string> = {}) =>
  new NextRequest(
    `http://localhost/api/v1/views/current-inferencex-image?${new URLSearchParams({
      asOf: '2026-09-19',
      ...params,
    })}`,
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.images.mockImplementation(() => Response.json([image, { ...image, disagg: true }]));
  mocks.releases.mockImplementation(() => Response.json({ sglang: 'v2' }));
  mocks.history.mockResolvedValue([
    image,
    { ...image, date: '2026-09-18' },
    { ...image, hardware: 'h200' },
  ]);
});

describe('current image selector normalization', () => {
  it('defaults to Agentic and all node types when both scenarios are available', async () => {
    mocks.images.mockImplementation(() =>
      Response.json([
        { ...image, model: 'qwen3.5', benchmark_type: 'single_turn', isl: 8192, osl: 1024 },
        image,
        { ...image, disagg: true },
      ]),
    );
    const response = await GET(request());
    const body = await response.json();
    expect(body.params).toMatchObject({ sequence: 'agentic-traces', nodeType: 'all' });
    expect(body.rows).toHaveLength(2);
    expect(body.rows.map((row: typeof image) => row.disagg)).toEqual([false, true]);
  });

  it('matches the UI p90 helper and omits history unless requested', async () => {
    const response = await GET(request());
    const body = await response.json();
    expect(body.ageSummary).toEqual(
      imageAgeSummary([image, { ...image, disagg: true }], '2026-09-19'),
    );
    expect(body.ageHistory).toBeUndefined();
    expect(mocks.history).not.toHaveBeenCalled();
  });

  it('returns the same filtered 90-day series as the UI helper', async () => {
    const response = await GET(request({ hardware: 'b200', includeHistory: 'true' }));
    const body = await response.json();
    expect(body.ageHistory).toEqual(
      imageAgeHistory([image, { ...image, date: '2026-09-18' }], '2026-09-19'),
    );
    expect(body.ageHistory).toHaveLength(90);
    expect(body.ageHistory.at(-1)).toMatchObject({ p90AgeDays: 1, configurationCount: 1 });
    expect(body.params.includeHistory).toBe(true);
    expect(mocks.history).toHaveBeenCalledWith({}, '2026-09-19');
  });

  it('rejects invalid history selectors', async () => {
    const response = await GET(request({ includeHistory: 'yes' }));
    expect(response.status).toBe(400);
    expect(mocks.history).not.toHaveBeenCalled();
  });

  it.each([
    ['model', 'deepseek-v4', 'DeepSeek-V4-Pro'],
    ['model', ' dEePsEeK-v4-pRo ', 'DeepSeek-V4-Pro'],
    ['hardware', ' B200 ', 'b200'],
    ['precision', ' FP8 ', 'fp8'],
    ['spec', ' NONE ', 'none'],
  ])('resolves %s=%s to the same image as its canonical value', async (key, value, canonical) => {
    const response = await GET(request({ [key]: value }));
    const expected = await GET(request({ [key]: canonical }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.rows).toHaveLength(2);
    expect(body.params[key]).toBe(canonical);
    expect(body).toEqual(await expected.json());
  });

  it.each<Record<string, string>>([
    {},
    { model: ' ALL ', hardware: 'ALL', precision: 'All', spec: 'all' },
  ])('preserves omitted and explicit all selections: %j', async (params) => {
    const response = await GET(request(params));
    const body = await response.json();
    expect(body.params).toMatchObject({
      model: 'all',
      hardware: 'all',
      precision: 'all',
      spec: 'all',
    });
    expect(body.rows).toHaveLength(2);
    expect(body.rows[0]).toMatchObject({
      ...image,
      displayModel: 'DeepSeek-V4-Pro',
      ageDays: 18,
    });
  });

  it('keeps a new unregistered model selectable by its image catalog name', async () => {
    mocks.images.mockImplementation(() => Response.json([{ ...image, model: 'Future-Model' }]));
    const response = await GET(request({ model: 'future-model' }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.params.model).toBe('Future-Model');
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].model).toBe('Future-Model');
  });

  it.each([
    ['single', false],
    ['disagg', true],
  ] as const)('still filters explicit nodeType=%s', async (nodeType, disagg) => {
    const response = await GET(request({ nodeType }));
    const body = await response.json();
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].disagg).toBe(disagg);
  });

  it('rejects an unknown model instead of returning an empty successful projection', async () => {
    const response = await GET(request({ model: 'not-a-model' }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ param: 'model' });
  });
});
