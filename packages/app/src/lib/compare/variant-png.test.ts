import { beforeEach, describe, expect, it, mock, vi } from 'bun:test';

const mocks = {
  render: vi.fn((_options: { lang: string }) =>
    Promise.resolve(new Response('png', { status: 200 })),
  ),
  trackServer: vi.fn(),
};

mock.module('@/lib/benchmarks/benchmark-data.server', () => ({
  getCachedBenchmarks: () => Promise.resolve([]),
  getCachedBenchmarksAsOf: () => Promise.resolve([]),
}));
mock.module('@/lib/seo/og-assets', () => ({ getLogoSrc: () => Promise.resolve('data:logo') }));
mock.module('@/lib/compare/png-chart', () => ({ renderComparePngChart: mocks.render }));
mock.module('@/lib/analytics/analytics-server', () => ({ trackServer: mocks.trackServer }));

// Imported after mock.module so the helper binds to the mocked renderer, data and analytics.
const { canonicalPrecisionCompareSlug, canonicalSpecDecodeCompareSlug } =
  await import('./compare-variant-slug');
const { precisionPngResponse, specDecodePngResponse } = await import('./variant-png');

const PRECISION_SLUG = canonicalPrecisionCompareSlug('deepseek-r1', 'h100', 'fp8', 'bf16');
const SPEC_SLUG = canonicalSpecDecodeCompareSlug('deepseek-r1', 'b200', 'fp8', 'mtp');

describe.each([
  ['precision', precisionPngResponse, PRECISION_SLUG, 'compare_precision_png_render_failed'],
  ['spec-decode', specDecodePngResponse, SPEC_SLUG, 'compare_spec_decode_png_render_failed'],
] as const)('%s hero PNG', (kind, respond, slug, failureEvent) => {
  beforeEach(() => {
    mocks.render.mockReset();
    mocks.render.mockImplementation(() => Promise.resolve(new Response('png', { status: 200 })));
    mocks.trackServer.mockReset();
  });

  it('renders the canonical slug in the requested language', async () => {
    const response = await respond(slug, 'zh');
    expect(response.status).toBe(200);
    expect(mocks.render).toHaveBeenCalledTimes(1);
    expect(mocks.render).toHaveBeenCalledWith(expect.objectContaining({ lang: 'zh' }));
  });

  it('returns 404 for a slug that is not a canonical comparison, without rendering', async () => {
    const unknown = await respond('not-a-slug', 'en');
    const extended = await respond(`${slug}-extra`, 'en');
    expect([unknown.status, extended.status]).toEqual([404, 404]);
    expect(mocks.render).not.toHaveBeenCalled();
  });

  it('rethrows a failed render so ISR keeps the previous PNG, and reports it', async () => {
    mocks.render.mockImplementation(() => Promise.reject(new Error(`${kind} boom`)));
    await expect(respond(slug, 'zh')).rejects.toThrow(`${kind} boom`);
    expect(mocks.trackServer).toHaveBeenCalledTimes(1);
    const [event, properties] = mocks.trackServer.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(event).toBe(failureEvent);
    expect(properties.route_template).toStartWith('/zh/compare-');
    expect(properties).toMatchObject({ slug, error_name: 'Error', error_message: `${kind} boom` });
  });
});
