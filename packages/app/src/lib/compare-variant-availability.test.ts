import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { AvailabilityRow } from '@semianalysisai/inferencex-db/queries/workflow-info';

import {
  getPrecisionPairsByModelSlug,
  getAllComparablePrecisionSlugs,
  getSpecDecodePairsByModelSlug,
  getAllComparableSpecDecodeSlugs,
} from './compare-variant-availability';

// ---------------------------------------------------------------------------
// Mock the availability data source and shared helpers.
// ---------------------------------------------------------------------------

vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  FIXTURES_MODE: false,
  getDb: vi.fn(),
}));

vi.mock('@semianalysisai/inferencex-db/queries/workflow-info', () => ({
  getAvailabilityData: vi.fn(),
}));

vi.mock('next/cache', () => ({
  unstable_cache: <T>(fn: T) => fn,
  revalidateTag: vi.fn(),
}));

vi.mock('./blob-cache', () => ({
  blobGet: vi.fn().mockResolvedValue(null),
  blobSet: vi.fn(),
  blobPurge: vi.fn(),
}));

vi.mock('./test-fixtures', () => ({
  loadFixture: vi.fn(),
}));

// Mock the DB query to return our test rows.
const { getAvailabilityData: mockGetAvailability } =
  await import('@semianalysisai/inferencex-db/queries/workflow-info');

const mockFn = vi.mocked(mockGetAvailability);

function stubAvailRow(overrides: Partial<AvailabilityRow> = {}): AvailabilityRow {
  return {
    model: 'dsr1',
    isl: 1024,
    osl: 1024,
    precision: 'fp8',
    hardware: 'h100',
    framework: 'sglang',
    spec_method: 'none',
    disagg: false,
    benchmark_type: 'single_turn',
    date: '2026-06-01',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Precision pairs
// ---------------------------------------------------------------------------

describe('getPrecisionPairsByModelSlug', () => {
  it('returns precision pairs for models with >=2 precisions on a GPU', async () => {
    mockFn.mockResolvedValue([
      stubAvailRow({ model: 'dsr1', hardware: 'h100', precision: 'fp8' }),
      stubAvailRow({ model: 'dsr1', hardware: 'h100', precision: 'bf16' }),
      stubAvailRow({ model: 'dsr1', hardware: 'h100', precision: 'fp4' }),
    ]);

    const result = await getPrecisionPairsByModelSlug();
    const dsr1Pairs = result.get('deepseek-r1')!;

    // C(3,2) = 3 pairs: fp4-vs-fp8, fp4-vs-bf16, fp8-vs-bf16
    expect(dsr1Pairs).toHaveLength(3);
    expect(dsr1Pairs).toContainEqual({ gpu: 'h100', precA: 'fp4', precB: 'fp8' });
    expect(dsr1Pairs).toContainEqual({ gpu: 'h100', precA: 'fp4', precB: 'bf16' });
    expect(dsr1Pairs).toContainEqual({ gpu: 'h100', precA: 'fp8', precB: 'bf16' });
  });

  it('ignores rows with hardware not in GPU_KEYS', async () => {
    mockFn.mockResolvedValue([
      stubAvailRow({ model: 'dsr1', hardware: 'unknown_gpu', precision: 'fp8' }),
      stubAvailRow({ model: 'dsr1', hardware: 'unknown_gpu', precision: 'bf16' }),
    ]);

    const result = await getPrecisionPairsByModelSlug();
    expect(result.get('deepseek-r1')!).toHaveLength(0);
  });

  it('ignores rows with precision outside the allowlist', async () => {
    mockFn.mockResolvedValue([
      stubAvailRow({ model: 'dsr1', hardware: 'h100', precision: 'fp8' }),
      stubAvailRow({ model: 'dsr1', hardware: 'h100', precision: 'weirdprec' }),
    ]);

    const result = await getPrecisionPairsByModelSlug();
    // Only 1 valid precision, so no pairs.
    expect(result.get('deepseek-r1')!).toHaveLength(0);
  });

  it('returns empty for models with only 1 precision on a GPU', async () => {
    mockFn.mockResolvedValue([stubAvailRow({ model: 'dsr1', hardware: 'h100', precision: 'fp8' })]);

    const result = await getPrecisionPairsByModelSlug();
    expect(result.get('deepseek-r1')!).toHaveLength(0);
  });

  it('handles multiple GPUs independently', async () => {
    mockFn.mockResolvedValue([
      stubAvailRow({ model: 'dsr1', hardware: 'h100', precision: 'fp8' }),
      stubAvailRow({ model: 'dsr1', hardware: 'h100', precision: 'bf16' }),
      stubAvailRow({ model: 'dsr1', hardware: 'h200', precision: 'fp8' }),
      // h200 has only 1 precision, so no pairs for h200.
    ]);

    const result = await getPrecisionPairsByModelSlug();
    const dsr1 = result.get('deepseek-r1')!;
    expect(dsr1).toHaveLength(1);
    expect(dsr1[0]).toEqual({ gpu: 'h100', precA: 'fp8', precB: 'bf16' });
  });

  it('sorts GPUs alphabetically', async () => {
    mockFn.mockResolvedValue([
      stubAvailRow({ model: 'dsr1', hardware: 'h200', precision: 'fp8' }),
      stubAvailRow({ model: 'dsr1', hardware: 'h200', precision: 'bf16' }),
      stubAvailRow({ model: 'dsr1', hardware: 'h100', precision: 'fp8' }),
      stubAvailRow({ model: 'dsr1', hardware: 'h100', precision: 'bf16' }),
    ]);

    const result = await getPrecisionPairsByModelSlug();
    const dsr1 = result.get('deepseek-r1')!;
    expect(dsr1[0].gpu).toBe('h100');
    expect(dsr1[1].gpu).toBe('h200');
  });

  it('maps multi-dbKey models correctly (Kimi K2.5/K2.6/K2.7)', async () => {
    mockFn.mockResolvedValue([
      stubAvailRow({ model: 'kimik2.5', hardware: 'h100', precision: 'fp8' }),
      stubAvailRow({ model: 'kimik2.6', hardware: 'h100', precision: 'bf16' }),
    ]);

    const result = await getPrecisionPairsByModelSlug();
    const kimiPairs = result.get('kimi-k26')!;
    // Both dbKeys map to the same slug; two distinct precisions => 1 pair.
    expect(kimiPairs).toHaveLength(1);
    expect(kimiPairs[0]).toEqual({ gpu: 'h100', precA: 'fp8', precB: 'bf16' });
  });

  it('pairs are in PRECISION_SLUG_ORDER (canonical) order', async () => {
    mockFn.mockResolvedValue([
      stubAvailRow({ model: 'dsr1', hardware: 'h100', precision: 'bf16' }),
      stubAvailRow({ model: 'dsr1', hardware: 'h100', precision: 'fp4' }),
    ]);

    const result = await getPrecisionPairsByModelSlug();
    const pair = result.get('deepseek-r1')![0];
    // fp4 (index 0) before bf16 (index 6)
    expect(pair.precA).toBe('fp4');
    expect(pair.precB).toBe('bf16');
  });
});

describe('getAllComparablePrecisionSlugs', () => {
  it('returns a flat list matching the map', async () => {
    mockFn.mockResolvedValue([
      stubAvailRow({ model: 'dsr1', hardware: 'h100', precision: 'fp8' }),
      stubAvailRow({ model: 'dsr1', hardware: 'h100', precision: 'bf16' }),
    ]);

    const slugs = await getAllComparablePrecisionSlugs();
    expect(slugs).toHaveLength(1);
    expect(slugs[0]).toEqual({
      modelSlug: 'deepseek-r1',
      gpu: 'h100',
      precA: 'fp8',
      precB: 'bf16',
    });
  });
});

// ---------------------------------------------------------------------------
// Spec-decode pairs
// ---------------------------------------------------------------------------

describe('getSpecDecodePairsByModelSlug', () => {
  it('returns spec-decode pairs when both mtp and none exist at same precision', async () => {
    mockFn.mockResolvedValue([
      stubAvailRow({ model: 'dsr1', hardware: 'h100', precision: 'fp8', spec_method: 'none' }),
      stubAvailRow({ model: 'dsr1', hardware: 'h100', precision: 'fp8', spec_method: 'mtp' }),
    ]);

    const result = await getSpecDecodePairsByModelSlug();
    const dsr1 = result.get('deepseek-r1')!;
    expect(dsr1).toHaveLength(1);
    expect(dsr1[0]).toEqual({ gpu: 'h100', precision: 'fp8', method: 'mtp' });
  });

  it('returns empty when only none exists (no active method)', async () => {
    mockFn.mockResolvedValue([
      stubAvailRow({ model: 'dsr1', hardware: 'h100', spec_method: 'none' }),
    ]);

    const result = await getSpecDecodePairsByModelSlug();
    expect(result.get('deepseek-r1')!).toHaveLength(0);
  });

  it('returns empty when only mtp exists (no none baseline)', async () => {
    mockFn.mockResolvedValue([
      stubAvailRow({ model: 'dsr1', hardware: 'h100', spec_method: 'mtp' }),
    ]);

    const result = await getSpecDecodePairsByModelSlug();
    expect(result.get('deepseek-r1')!).toHaveLength(0);
  });

  it('rows differing only in precision yield separate pairs', async () => {
    mockFn.mockResolvedValue([
      stubAvailRow({ model: 'dsr1', hardware: 'h100', precision: 'fp8', spec_method: 'none' }),
      stubAvailRow({ model: 'dsr1', hardware: 'h100', precision: 'fp8', spec_method: 'mtp' }),
      stubAvailRow({ model: 'dsr1', hardware: 'h100', precision: 'bf16', spec_method: 'none' }),
      stubAvailRow({ model: 'dsr1', hardware: 'h100', precision: 'bf16', spec_method: 'mtp' }),
    ]);

    const result = await getSpecDecodePairsByModelSlug();
    const dsr1 = result.get('deepseek-r1')!;
    expect(dsr1).toHaveLength(2);
    // Sorted by PRECISION_SLUG_ORDER: fp8 (index 5) before bf16 (index 6).
    expect(dsr1[0]).toEqual({ gpu: 'h100', precision: 'fp8', method: 'mtp' });
    expect(dsr1[1]).toEqual({ gpu: 'h100', precision: 'bf16', method: 'mtp' });
  });

  it('(gpu,precision) with method-only or none-only data must NOT emit', async () => {
    mockFn.mockResolvedValue([
      // fp8 has both none+mtp → should emit
      stubAvailRow({ model: 'dsr1', hardware: 'h100', precision: 'fp8', spec_method: 'none' }),
      stubAvailRow({ model: 'dsr1', hardware: 'h100', precision: 'fp8', spec_method: 'mtp' }),
      // bf16 has only mtp (no none) → should NOT emit
      stubAvailRow({ model: 'dsr1', hardware: 'h100', precision: 'bf16', spec_method: 'mtp' }),
    ]);

    const result = await getSpecDecodePairsByModelSlug();
    const dsr1 = result.get('deepseek-r1')!;
    expect(dsr1).toHaveLength(1);
    expect(dsr1[0]).toEqual({ gpu: 'h100', precision: 'fp8', method: 'mtp' });
  });

  it('ignores rows with hardware not in GPU_KEYS', async () => {
    mockFn.mockResolvedValue([
      stubAvailRow({ model: 'dsr1', hardware: 'unknown_gpu', spec_method: 'none' }),
      stubAvailRow({ model: 'dsr1', hardware: 'unknown_gpu', spec_method: 'mtp' }),
    ]);

    const result = await getSpecDecodePairsByModelSlug();
    expect(result.get('deepseek-r1')!).toHaveLength(0);
  });

  it('ignores rows with spec_method not in SPEC_METHOD_KEYS', async () => {
    mockFn.mockResolvedValue([
      stubAvailRow({ model: 'dsr1', hardware: 'h100', spec_method: 'none' }),
      stubAvailRow({ model: 'dsr1', hardware: 'h100', spec_method: 'junk_method' }),
    ]);

    const result = await getSpecDecodePairsByModelSlug();
    expect(result.get('deepseek-r1')!).toHaveLength(0);
  });

  it('ignores rows with precision outside the allowlist', async () => {
    mockFn.mockResolvedValue([
      stubAvailRow({
        model: 'dsr1',
        hardware: 'h100',
        precision: 'weirdprec',
        spec_method: 'none',
      }),
      stubAvailRow({ model: 'dsr1', hardware: 'h100', precision: 'weirdprec', spec_method: 'mtp' }),
    ]);

    const result = await getSpecDecodePairsByModelSlug();
    expect(result.get('deepseek-r1')!).toHaveLength(0);
  });

  it('sorts GPUs alphabetically, then precision by PRECISION_SLUG_ORDER', async () => {
    mockFn.mockResolvedValue([
      stubAvailRow({ model: 'dsr1', hardware: 'h200', precision: 'bf16', spec_method: 'none' }),
      stubAvailRow({ model: 'dsr1', hardware: 'h200', precision: 'bf16', spec_method: 'mtp' }),
      stubAvailRow({ model: 'dsr1', hardware: 'h200', precision: 'fp8', spec_method: 'none' }),
      stubAvailRow({ model: 'dsr1', hardware: 'h200', precision: 'fp8', spec_method: 'mtp' }),
      stubAvailRow({ model: 'dsr1', hardware: 'h100', precision: 'fp8', spec_method: 'none' }),
      stubAvailRow({ model: 'dsr1', hardware: 'h100', precision: 'fp8', spec_method: 'mtp' }),
    ]);

    const result = await getSpecDecodePairsByModelSlug();
    const dsr1 = result.get('deepseek-r1')!;
    expect(dsr1).toHaveLength(3);
    // h100 before h200
    expect(dsr1[0].gpu).toBe('h100');
    expect(dsr1[0].precision).toBe('fp8');
    // h200: fp8 (index 5) before bf16 (index 6)
    expect(dsr1[1].gpu).toBe('h200');
    expect(dsr1[1].precision).toBe('fp8');
    expect(dsr1[2].gpu).toBe('h200');
    expect(dsr1[2].precision).toBe('bf16');
  });

  it('maps multi-dbKey models correctly', async () => {
    mockFn.mockResolvedValue([
      stubAvailRow({ model: 'kimik2.5', hardware: 'h100', precision: 'fp8', spec_method: 'none' }),
      stubAvailRow({ model: 'kimik2.6', hardware: 'h100', precision: 'fp8', spec_method: 'mtp' }),
    ]);

    const result = await getSpecDecodePairsByModelSlug();
    const kimi = result.get('kimi-k26')!;
    expect(kimi).toHaveLength(1);
    expect(kimi[0]).toEqual({ gpu: 'h100', precision: 'fp8', method: 'mtp' });
  });
});

describe('getAllComparableSpecDecodeSlugs', () => {
  it('returns a flat list matching the map', async () => {
    mockFn.mockResolvedValue([
      stubAvailRow({ model: 'dsr1', hardware: 'h100', precision: 'fp8', spec_method: 'none' }),
      stubAvailRow({ model: 'dsr1', hardware: 'h100', precision: 'fp8', spec_method: 'mtp' }),
    ]);

    const slugs = await getAllComparableSpecDecodeSlugs();
    expect(slugs).toHaveLength(1);
    expect(slugs[0]).toEqual({
      modelSlug: 'deepseek-r1',
      gpu: 'h100',
      precision: 'fp8',
      method: 'mtp',
    });
  });
});
