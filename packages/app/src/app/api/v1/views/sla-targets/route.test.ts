import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

import { decodeSlaAttempts } from '@semianalysisai/inferencex-db/etl/sla-attempts';

// The route runs on the captured fixture: real AgentX results read from GitHub
// Actions artifacts by `scripts/capture-sla-targets-fixtures.ts`.
vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  FIXTURES_MODE: true,
  getDb: vi.fn(),
}));

vi.mock('@/lib/cache/api-cache', () => ({
  cachedQuery: (fn: (...args: unknown[]) => unknown) => fn,
  cachedJson: (_request: Request, data: unknown) => Response.json(data),
}));

import { apiOperations } from '@/lib/api/api-documentation';
import type { SlaAttemptsFixture, SlaTargetsFixture } from '@/lib/sla-targets/dataset.server';
import { evaluateSlaAttemptsBlob, type SlaPointEvaluations } from '@/lib/sla-targets/evaluation';
import type { SlaPublicConfig, SlaPublicView } from '@/lib/sla-targets/public-view';
import { evaluateSlaTargetsView, slaEvaluationIds } from '@/lib/sla-targets/view';
import { loadFixture } from '@/lib/testing/test-fixtures';
import { VIEW_QUERY_PARAMS } from '@/lib/views-api/registry';

import { GET } from './route';

async function get(query = ''): Promise<{ status: number; body: SlaPublicView }> {
  const response = await GET(
    new NextRequest(new URL(`/api/v1/views/sla-targets${query}`, 'http://localhost')),
  );
  return { status: response.status, body: (await response.json()) as SlaPublicView };
}

function configOf(body: SlaPublicView, hardware: string, serving: string): SlaPublicConfig {
  const config = body.configs.find(
    (entry) => entry.hardware === hardware && entry.servingLabel === serving,
  );
  if (!config) throw new Error(`no configuration ${hardware} ${serving}`);
  return config;
}

const B200_8P8D = 'Dynamo SGLang · FP4 · MTP · 8P+8D · KV offload';

/** The B200 8P+8D configuration of the response to `query`. */
async function b200(query: string): Promise<SlaPublicConfig> {
  const { body } = await get(query);
  return configOf(body, 'b200', B200_8P8D);
}

describe('GET /api/v1/views/sla-targets', () => {
  it('resolves every selector to the example values and echoes them', async () => {
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body.view).toBe('sla-targets');
    expect(body.params).toEqual({
      model: 'DeepSeek-V4-Pro',
      sequence: 'agentic-traces',
      ttft: 1000,
      tpot: 50,
      e2e: null,
      attainment: 99,
      cost: 'hyperscaler',
    });
    expect(body.disclaimer).toContain('do not guarantee production SLA compliance');
    expect(body.contract.accountingPolicy.incompleteAtCutoff).toBe('not_passing');
    expect(body.source.kind).toBe('captured');
    // Nothing in the captured runs keeps 99% of attempts under a 1 s TTFT.
    expect(body.qualifying).toEqual([]);
  });

  it('returns the same numbers the page computes from the same inputs', async () => {
    const { body } = await get('?ttft=10000&tpot=50&attainment=99');
    const configs = loadFixture<SlaTargetsFixture>('sla-targets').models['DeepSeek-V4-Pro'];
    const attempts = loadFixture<SlaAttemptsFixture>('sla-attempts');
    const evaluations: SlaPointEvaluations = {};
    for (const id of slaEvaluationIds(configs)) {
      evaluations[id] = evaluateSlaAttemptsBlob(
        decodeSlaAttempts(Buffer.from(attempts[id], 'base64')),
        { maxTtftMs: 10_000, maxTpotMs: 50, maxE2eS: null },
      );
    }
    const page = evaluateSlaTargetsView(
      configs,
      'DeepSeek-V4-Pro',
      evaluations,
      0.99,
      'hyperscaler',
    );

    expect(body.qualifying).toEqual(page.qualifying.map((row) => row.config.key));
    expect(body.configs.map((config) => config.key)).toEqual(
      page.rows.map((row) => row.config.key),
    );
    for (const [rowIndex, row] of page.rows.entries()) {
      const config = body.configs[rowIndex];
      expect(config.status).toBe(row.status);
      expect(config.exploratory).toBe(row.exploratory);
      for (const [pointIndex, view] of row.points.entries()) {
        const point = config.points[pointIndex];
        expect(point.load).toBe(view.concurrency);
        expect(point.observed).toEqual(view.result!.observed);
        expect(point.qualification).toEqual(view.result!.qualification);
        expect(point.costPer1kCompliantUsd).toBe(view.result!.costPer1kCompliantUsd);
      }
      for (const key of ['highestPassingLoad', 'highestGoodput', 'lowestCost'] as const) {
        const selected = row.selections[key];
        expect(config.selections[key]).toBe(
          selected === null ? null : row.points.indexOf(selected),
        );
      }
    }
  });

  it('names the measured point behind each headline value', async () => {
    const { body } = await get('?ttft=10000');
    const config = configOf(body, 'b200', B200_8P8D);
    expect(config.status).toBe('meets');
    expect(config.loadKind).toBe('agentx_users');
    const point = config.points[config.selections.highestPassingLoad!];
    expect(point.load).toBe(32);
    expect(point.observed).toMatchObject({ attempted: 4537, passing: 4497 });
    expect(point.accounting).toMatchObject({
      issued: 4537,
      completeness: 'complete',
      reason: 'reconciled',
    });
    expect(point.accounting).not.toHaveProperty('policy');
    expect(point.accounting!.window).toMatchObject({
      durationS: 3600,
      durationSource: 'configured_window',
    });
    expect(point.costPer1kCompliantUsd).toBeCloseTo(6.155, 3);
  });

  it('keeps observed metrics for a point that cannot qualify, and says why', async () => {
    const { body } = await get('?ttft=10000');
    const exploratory = body.configs.filter((config) => config.exploratory);
    expect(exploratory.length).toBeGreaterThan(0);
    for (const config of exploratory) {
      expect(config.status).toBe('insufficient_data');
      expect(body.qualifying).not.toContain(config.key);
      const measured = config.points.filter((point) => point.observed !== null);
      expect(measured.length).toBeGreaterThan(0);
      for (const point of measured) {
        expect(point.qualification.status).toBe('insufficient_data');
        expect(point.qualification.reason).toBe('attempt_population_not_established');
        expect(point.observed!.attainment).toBeTypeOf('number');
      }
    }
  });

  it('surfaces a failed load point with its recorded reason', async () => {
    const { body } = await get('?ttft=10000');
    const failed = body.configs
      .flatMap((config) => config.points)
      .filter((point) => point.exclusion?.category === 'service_failure');
    expect(failed).toHaveLength(1);
    expect(failed[0].load).toBe(256);
    expect(failed[0].observed).toBeNull();
    expect(failed[0].exclusion!.reason).toContain('234/2337 profiling requests failed');
    expect(failed[0].qualification).toMatchObject({ status: 'misses', reason: 'service_failure' });
  });

  it('applies the end-to-end target, the required attainment and the price table', async () => {
    const base = await b200('?ttft=10000');
    const withE2e = await b200('?ttft=10000&e2e=60');
    expect(withE2e.points[withE2e.selections.highestPassingLoad!].load).toBe(16);

    const { body: strict } = await get('?ttft=10000&attainment=99.9');
    expect(strict.params.attainment).toBe(99.9);
    expect(strict.qualifying.length).toBeLessThan(3);

    const rental = await b200('?ttft=10000&cost=rental');
    expect(rental.gpuHourUsd).not.toBe(base.gpuHourUsd);
    const index = base.selections.lowestCost!;
    expect(rental.points[index].observed).toEqual(base.points[index].observed);
    expect(rental.points[index].costPer1kCompliantUsd! / rental.gpuHourUsd).toBeCloseTo(
      base.points[index].costPer1kCompliantUsd! / base.gpuHourUsd,
      9,
    );
  });

  it('evaluates an off-grid threshold exactly, inclusive at the measured value', async () => {
    const reference = await b200('?ttft=10000');
    const index = reference.selections.highestPassingLoad!;
    const attempts = loadFixture<SlaAttemptsFixture>('sla-attempts');
    const { ttftUs } = decodeSlaAttempts(
      Buffer.from(attempts[reference.points[index].pointId!], 'base64'),
    ).set.completed;
    // A measured TTFT near the 90th percentile, in microseconds: not a round number of ms.
    const measuredUs = ttftUs[Math.floor(ttftUs.length * 0.9)];
    const within = (limitUs: number) => ttftUs.filter((value) => value <= limitUs).length;
    const at = async (ttftMs: number) => {
      const { body } = await get(`?ttft=${ttftMs}`);
      expect(body.params.ttft).toBe(ttftMs);
      return configOf(body, 'b200', B200_8P8D).points[index].counts!.withinTtft;
    };
    expect(await at(measuredUs / 1000)).toBe(within(measuredUs));
    expect(await at((measuredUs - 0.5) / 1000)).toBe(within(measuredUs - 1));
    expect(within(measuredUs)).toBeGreaterThan(within(measuredUs - 1));
  });

  it.each([
    ['?ttft=0', 'ttft'],
    ['?ttft=fast', 'ttft'],
    ['?tpot=-5', 'tpot'],
    ['?e2e=4000', 'e2e'],
    ['?attainment=100', 'attainment'],
    ['?attainment=10', 'attainment'],
    ['?cost=free', 'cost'],
    ['?model=No-Such-Model', 'model'],
    ['?sequence=8k/1k', 'sequence'],
    ['?surprise=1', 'surprise'],
    ['?ttft=1000&ttft=2000', 'ttft'],
  ])('rejects %s instead of substituting a value', async (query, param) => {
    const response = await GET(
      new NextRequest(new URL(`/api/v1/views/sla-targets${query}`, 'http://localhost')),
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { param: string };
    expect(body.param).toBe(param);
  });

  it('documents every selector and every top-level field it returns', async () => {
    const operation = apiOperations.find((op) => op.path === '/api/v1/views/sla-targets')!;
    expect(operation.parameters.map((parameter) => parameter.name).toSorted()).toEqual([
      ...VIEW_QUERY_PARAMS['sla-targets'],
    ]);
    const schema = operation.responses.find((response) => response.status === '200')!.schema;
    const { body } = await get('?ttft=10000');
    expect(Object.keys(body).toSorted()).toEqual(Object.keys(schema.properties!).toSorted());
    const pointSchema = schema.properties!.configs.items!.properties!.points.items!;
    expect(Object.keys(body.configs[0].points[0]).toSorted()).toEqual(
      Object.keys(pointSchema.properties!).toSorted(),
    );
    const configKeys = Object.keys(schema.properties!.configs.items!.properties!);
    for (const key of configKeys) expect(body.configs[0]).toHaveProperty(key);
  });
});
