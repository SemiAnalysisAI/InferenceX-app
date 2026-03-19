import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

import { normalizeArtifactRows } from './route';

// ── Mock AdmZip ──────────────────────────────────────────────────────
const mockGetEntries = vi.fn();
const mockReadAsText = vi.fn();
vi.mock('adm-zip', () => {
  return {
    default: class MockAdmZip {
      getEntries() {
        return mockGetEntries();
      }
      readAsText(entry: unknown) {
        return mockReadAsText(entry);
      }
    },
  };
});

// ── Mock fetch ───────────────────────────────────────────────────────
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

/** Minimal raw artifact row matching the shape produced by CI benchmarks. */
function rawRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    hw: 'h200-nv',
    model: 'deepseek-ai/DeepSeek-R1-0528',
    infmax_model_prefix: 'dsr1',
    framework: 'sglang',
    precision: 'fp8',
    isl: 1024,
    osl: 1024,
    conc: 128,
    tp: 8,
    ep: 1,
    dp_attention: false,
    disagg: false,
    is_multinode: false,
    spec_decoding: '',
    tput_per_gpu: 100.5,
    mean_ttft: 0.5,
    median_ttft: 0.4,
    p99_ttft: 1.2,
    std_ttft: 0.1,
    mean_tpot: 0.01,
    median_tpot: 0.009,
    p99_tpot: 0.02,
    std_tpot: 0.003,
    mean_e2el: 1.5,
    median_e2el: 1.4,
    p99_e2el: 2.0,
    std_e2el: 0.2,
    mean_intvty: 50,
    median_intvty: 48,
    p99_intvty: 80,
    std_intvty: 5,
    mean_itl: 0.008,
    median_itl: 0.007,
    p99_itl: 0.01,
    std_itl: 0.001,
    output_tput_per_gpu: 80,
    input_tput_per_gpu: 120,
    ...overrides,
  };
}

describe('normalizeArtifactRows', () => {
  it('converts raw artifact row to BenchmarkRow shape', () => {
    const rows = normalizeArtifactRows([rawRow()], '2026-03-01');
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.hardware).toBe('h200');
    expect(row.framework).toBe('sglang');
    expect(row.model).toBe('dsr1');
    expect(row.precision).toBe('fp8');
    expect(row.date).toBe('2026-03-01');
  });

  it('normalizes hardware key (strips suffix)', () => {
    const rows = normalizeArtifactRows([rawRow({ hw: 'mi355x-amds' })], '2026-03-01');
    expect(rows[0].hardware).toBe('mi355x');
  });

  it('resolves model from infmax_model_prefix', () => {
    const rows = normalizeArtifactRows(
      [rawRow({ infmax_model_prefix: 'gptoss', model: 'openai/gpt-oss-120b' })],
      '2026-03-01',
    );
    expect(rows[0].model).toBe('gptoss120b');
  });

  it('falls back to model path when prefix is absent', () => {
    const rows = normalizeArtifactRows(
      [rawRow({ infmax_model_prefix: undefined, model: 'deepseek-ai/DeepSeek-R1-0528' })],
      '2026-03-01',
    );
    expect(rows[0].model).toBe('dsr1');
  });

  it('nests metrics into a metrics object', () => {
    const rows = normalizeArtifactRows([rawRow()], '2026-03-01');
    const m = rows[0].metrics;
    expect(m.tput_per_gpu).toBe(100.5);
    expect(m.mean_ttft).toBe(0.5);
    expect(m.mean_e2el).toBe(1.5);
  });

  it('normalizes spec_method from spec_decoding', () => {
    const rows = normalizeArtifactRows([rawRow({ spec_decoding: 'eagle' })], '2026-03-01');
    expect(rows[0].spec_method).toBe('eagle');
  });

  it('normalizes empty spec_decoding to "none"', () => {
    const rows = normalizeArtifactRows([rawRow({ spec_decoding: '' })], '2026-03-01');
    expect(rows[0].spec_method).toBe('none');
  });

  it('handles v1 schema (single tp/ep)', () => {
    const rows = normalizeArtifactRows([rawRow({ tp: 4, ep: 2 })], '2026-03-01');
    const row = rows[0];
    expect(row.prefill_tp).toBe(4);
    expect(row.decode_tp).toBe(4);
    expect(row.prefill_ep).toBe(2);
    expect(row.decode_ep).toBe(2);
  });

  it('handles v2 schema (separate prefill/decode)', () => {
    const rows = normalizeArtifactRows(
      [rawRow({ prefill_tp: 8, prefill_ep: 1, decode_tp: 4, decode_ep: 2 })],
      '2026-03-01',
    );
    const row = rows[0];
    expect(row.prefill_tp).toBe(8);
    expect(row.decode_tp).toBe(4);
    expect(row.prefill_ep).toBe(1);
    expect(row.decode_ep).toBe(2);
  });

  it('normalizes sglang-disagg framework to mori-sglang', () => {
    const rows = normalizeArtifactRows([rawRow({ framework: 'sglang-disagg' })], '2026-03-01');
    expect(rows[0].framework).toBe('mori-sglang');
    expect(rows[0].disagg).toBe(true);
  });

  it('skips rows with unmapped model', () => {
    const rows = normalizeArtifactRows(
      [rawRow({ infmax_model_prefix: undefined, model: 'unknown/model' })],
      '2026-03-01',
    );
    expect(rows).toHaveLength(0);
  });

  it('skips rows with unmapped hardware', () => {
    const rows = normalizeArtifactRows([rawRow({ hw: 'unknown-gpu' })], '2026-03-01');
    expect(rows).toHaveLength(0);
  });

  it('skips rows missing ISL/OSL', () => {
    const rows = normalizeArtifactRows([rawRow({ isl: undefined, osl: undefined })], '2026-03-01');
    expect(rows).toHaveLength(0);
  });

  it('processes multiple rows, skipping invalid ones', () => {
    const rows = normalizeArtifactRows(
      [
        rawRow({ infmax_model_prefix: 'dsr1' }),
        rawRow({ infmax_model_prefix: undefined, model: 'unknown/bad' }),
        rawRow({ infmax_model_prefix: 'gptoss', model: 'openai/gpt-oss-120b' }),
      ],
      '2026-03-01',
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].model).toBe('dsr1');
    expect(rows[1].model).toBe('gptoss120b');
  });

  it('sets the provided date on all rows', () => {
    const rows = normalizeArtifactRows(
      [rawRow(), rawRow({ infmax_model_prefix: 'gptoss', model: 'openai/gpt-oss-120b' })],
      '2026-03-11',
    );
    expect(rows.every((r) => r.date === '2026-03-11')).toBe(true);
  });
});

// ── GET handler tests ────────────────────────────────────────────────

describe('GET /api/unofficial-run', () => {
  // Dynamic import to avoid hoisting issues with mocks
  let GET: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    mockFetch.mockReset();
    mockGetEntries.mockReset();
    mockReadAsText.mockReset();
    process.env.GITHUB_TOKEN = 'test-token';
    const mod = await import('./route');
    GET = mod.GET as any;
  });

  function makeRequest(params: string) {
    return new NextRequest(`http://localhost/api/unofficial-run?${params}`);
  }

  it('returns 400 for missing runId', async () => {
    const res = await GET(makeRequest(''));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('runId');
  });

  it('returns 400 for non-numeric runId', async () => {
    const res = await GET(makeRequest('runId=abc'));
    expect(res.status).toBe(400);
  });

  it('returns 500 when GITHUB_TOKEN is not set', async () => {
    delete process.env.GITHUB_TOKEN;
    const mod = await import('./route');
    const handler = mod.GET as any;
    const res = await handler(makeRequest('runId=123'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('token');
  });

  it('returns GitHub error status when run fetch fails', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, statusText: 'Not Found' });
    const res = await GET(makeRequest('runId=999'));
    expect(res.status).toBe(404);
  });

  it('returns 404 when no results_bmk artifact exists', async () => {
    // Run metadata fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 123, created_at: '2026-01-01T00:00:00Z' }),
    });
    // Artifacts fetch (no results_bmk)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ artifacts: [{ name: 'other_artifact', id: 1 }] }),
    });
    const res = await GET(makeRequest('runId=123'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain('results_bmk');
  });

  it('returns error when artifact download fails', async () => {
    // Run metadata
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 123, created_at: '2026-01-01T00:00:00Z' }),
    });
    // Artifacts
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        artifacts: [{ name: 'results_bmk', id: 10, archive_download_url: 'http://dl' }],
      }),
    });
    // Download fails
    mockFetch.mockResolvedValueOnce({ ok: false, status: 410, statusText: 'Gone' });
    const res = await GET(makeRequest('runId=123'));
    expect(res.status).toBe(410);
  });

  it('returns benchmarks on success', async () => {
    const bmkData = [rawRow()];

    // Run metadata
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 123,
        name: 'test-run',
        head_branch: 'main',
        head_sha: 'abc123',
        created_at: '2026-01-01T00:00:00Z',
        html_url: 'http://github.com/run/123',
        conclusion: 'success',
        status: 'completed',
      }),
    });
    // Artifacts
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        artifacts: [{ name: 'results_bmk', id: 10, archive_download_url: 'http://dl' }],
      }),
    });
    // Download — return a buffer-like object
    const fakeBuffer = new ArrayBuffer(8);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => fakeBuffer,
    });

    // Mock zip extraction — the AdmZip constructor receives the buffer,
    // and our mock returns these entries
    mockGetEntries.mockReturnValue([{ entryName: 'results.json' }]);
    mockReadAsText.mockReturnValue(JSON.stringify(bmkData));

    const res = await GET(makeRequest('runId=123'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.runInfo.id).toBe(123);
    expect(body.runInfo.isNonMainBranch).toBe(false);
    expect(body.benchmarks).toHaveLength(1);
    expect(body.benchmarks[0].hardware).toBe('h200');
  });

  it('returns 500 on unexpected error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network failure'));
    const res = await GET(makeRequest('runId=123'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('unofficial run');
  });

  it('uses today date when created_at is missing', async () => {
    // Run metadata without created_at
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 456, head_branch: 'feature' }),
    });
    // Artifacts
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        artifacts: [{ name: 'results_bmk', id: 20, archive_download_url: 'http://dl' }],
      }),
    });
    // Download
    const fakeBuffer = new ArrayBuffer(8);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => fakeBuffer,
    });

    // No JSON entries in zip
    mockGetEntries.mockReturnValue([]);

    const res = await GET(makeRequest('runId=456'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.runInfo.isNonMainBranch).toBe(true);
    expect(body.benchmarks).toHaveLength(0);
  });
});
