import { describe, expect, it, mock } from 'bun:test';

const derived = {
  sequence: '8k/1k',
  precision: 'fp4',
  ssrRows: [
    { target: 20, a: { costPerMtok: 1.5 }, b: { costPerMtok: 2.5 } },
    { target: 40, a: { costPerMtok: 2 }, b: null },
  ],
  interactivityRange: { min: 10, max: 50 },
  initialPairBenchmarkRows: [],
};

mock.module('@/lib/compare/compare-page-data.server', () => ({
  getComparePageDerivedData: () => Promise.resolve(structuredClone(derived)),
}));
mock.module('@/lib/seo/og-assets', () => ({ getLogoSrc: () => Promise.resolve('data:logo') }));
mock.module('@/lib/compare/png-chart', () => ({
  renderComparePngChart: () => Promise.resolve(new Response('png')),
}));
mock.module('@/lib/analytics/analytics-server', () => ({ trackServer: () => {} }));

// Imported after mock.module so the version reads the mocked pair data.
const { parseCompareSlug } = await import('./compare-slug');
const { PER_DOLLAR_PNG_RENDER_REVISION, perDollarPngVersion, perDollarVersionedPngResponse } =
  await import('./per-dollar-png');

const pair = parseCompareSlug('deepseek-r1-b200-vs-h100')!;

describe('perDollarPngVersion', () => {
  it('is a short hash that stays the same while the pair data is unchanged', async () => {
    const version = await perDollarPngVersion(pair);
    expect(version).toMatch(/^[0-9a-f]{12}$/u);
    expect(await perDollarPngVersion(pair)).toBe(version);
  });

  it('changes when an ingest changes what the PNG draws', async () => {
    const before = await perDollarPngVersion(pair);
    const original = derived.ssrRows[0]!.a.costPerMtok;
    derived.ssrRows[0]!.a.costPerMtok = 1.25;
    try {
      expect(await perDollarPngVersion(pair)).not.toBe(before);
    } finally {
      derived.ssrRows[0]!.a.costPerMtok = original;
    }
    derived.precision = 'fp8';
    try {
      expect(await perDollarPngVersion(pair)).not.toBe(before);
    } finally {
      derived.precision = 'fp4';
    }
  });

  it('changes when the renderer revision is bumped for a new drawing', async () => {
    const current = await perDollarPngVersion(pair);
    expect(await perDollarPngVersion(pair, PER_DOLLAR_PNG_RENDER_REVISION)).toBe(current);
    expect(await perDollarPngVersion(pair, PER_DOLLAR_PNG_RENDER_REVISION + 1)).not.toBe(current);
  });
});

describe('perDollarVersionedPngResponse', () => {
  it('renders the current PNG for a well-formed version, even one a stale page still names', async () => {
    const version = await perDollarPngVersion(pair);
    for (const file of [`${version}.png`, '000000000000.png']) {
      const response = await perDollarVersionedPngResponse('deepseek-r1-b200-vs-h100', file, 'zh');
      expect(response.status).toBe(200);
    }
  });

  it('returns 404 for a malformed version file or a non-canonical slug', async () => {
    const responses = await Promise.all(
      [
        ['deepseek-r1-b200-vs-h100', 'latest.png'],
        ['deepseek-r1-b200-vs-h100', '0123456789ab.webp'],
        ['deepseek-r1-b200-vs-h100', '0123456789AB.png'],
        ['not-a-slug', '0123456789ab.png'],
      ].map(([slug, file]) => perDollarVersionedPngResponse(slug!, file!, 'en')),
    );
    expect(responses.map((response) => response.status)).toEqual([404, 404, 404, 404]);
  });
});
