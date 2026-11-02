import { beforeEach, describe, expect, it, vi } from 'vitest';

const queries = vi.hoisted(() => ({ campaign: vi.fn(), runs: vi.fn(), detail: vi.fn() }));
vi.mock('@semianalysisai/inferencex-db/connection', () => ({ getDb: () => 'test-db' }));
vi.mock('@semianalysisai/inferencex-db/queries/experiments', () => ({
  getExperimentCampaign: queries.campaign,
  getExperimentRuns: queries.runs,
  getExperimentRunDetail: queries.detail,
}));

import { GET as campaignGet } from './[campaign]/route';
import { GET as detailGet } from './[campaign]/runs/[runId]/route';

const request = new Request('https://example.test/api/v1/experiments/weka-amg-kimi-k3');
const context = { params: Promise.resolve({ campaign: 'weka-amg-kimi-k3' }) };

beforeEach(() => vi.resetAllMocks());

describe('experiment raw read routes', () => {
  it('retains replicate identities and recovery flags without numeric benchmark IDs', async () => {
    const campaign = { slug: 'weka-amg-kimi-k3', complete: true };
    const runs = [
      { run_id: 'cam-k3-amg-c56-r1', concurrency: 56, replicate: 1 },
      { run_id: 'cam-k3-amg-c56-r2', concurrency: 56, replicate: 2 },
      {
        run_id: 'sa-k3-original-rdma2048-c150-m089',
        frontier_eligible: false,
        health: { recovered: true },
      },
    ];
    queries.campaign.mockResolvedValue(campaign);
    queries.runs.mockResolvedValue(runs);
    const response = await campaignGet(request, context);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({ campaign, runs });
    expect(queries.runs).toHaveBeenCalledWith('test-db', 'weka-amg-kimi-k3');
  });

  it('does not read runs when the campaign is absent or unpublished', async () => {
    queries.campaign.mockResolvedValue(null);
    const response = await campaignGet(request, context);
    expect(response.status).toBe(404);
    expect(queries.runs).not.toHaveBeenCalled();
  });

  it('scopes string run IDs to their campaign and preserves stored trace data', async () => {
    const run = {
      run_id: 'cam-k3-amg-c56-r2',
      chart_series: { samples: [1, null, 3] },
      request_timeline: { requests: [] },
    };
    queries.detail.mockResolvedValue(run);
    const response = await detailGet(request, {
      params: Promise.resolve({ campaign: 'weka-amg-kimi-k3', runId: run.run_id }),
    });
    expect(queries.detail).toHaveBeenCalledWith('test-db', 'weka-amg-kimi-k3', run.run_id);
    expect(await response.json()).toEqual(run);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns a missing-run response without substituting official benchmark data', async () => {
    queries.detail.mockResolvedValue(null);
    const response = await detailGet(request, {
      params: Promise.resolve({ campaign: 'missing', runId: 'same-id' }),
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Not found' });
  });

  it('does not expose database errors to clients', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    queries.campaign.mockRejectedValue(new Error('private database detail'));
    const response = await campaignGet(request, context);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
    log.mockRestore();
  });
});
