import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  collectiveXChannelUrl,
  fetchCollectiveXPublication,
  parseCollectiveXChannel,
  parseCollectiveXDataset,
  sha256Hex,
} from './reader';
import {
  makeCollectiveXContractDataset,
  makeCollectiveXDataset,
  makeCollectiveXDiagnosticDataset,
} from './test-fixture';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => mockFetch.mockReset());

describe('CollectiveX publication reader', () => {
  it('hashes bytes without requiring secure-context Web Crypto', async () => {
    await expect(sha256Hex(new TextEncoder().encode('abc'))).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('accepts the strict public shape without recomputing publisher policy', () => {
    const dataset = makeCollectiveXDataset();
    const nonSuccessAttempt = dataset.attempts.find(
      (attempt) => attempt.outcome === 'unsupported',
    )!;
    nonSuccessAttempt.failure_mode = 'future-runtime-mode';
    nonSuccessAttempt.reason = 'future-runtime-reason';

    const result = parseCollectiveXDataset(dataset);

    expect(result.series[0].publication_tier).toBe('official');
    expect(result.cohorts.find((item) => item.kind === 'routing')?.publication_tier).toBe(
      'comparable-experimental',
    );
    expect(result.series[1].points[0].components.dispatch).toBeNull();
  });

  it('preserves mode, measurement, and topology dimensions from the publisher', () => {
    const result = parseCollectiveXDataset(makeCollectiveXContractDataset());
    const normal = result.series.find((item) => item.mode === 'normal')!;
    const lowLatency = result.series.find((item) => item.mode === 'low-latency')!;
    const unsupported = result.coverage.find((item) => item.disposition === 'unsupported')!;

    expect(normal.system).toMatchObject({ ep_size: 8, nodes: 1, scope: 'scale-up' });
    expect(lowLatency.system).toMatchObject({
      ep_size: 16,
      nodes: 2,
      scope: 'scale-out',
      scale_out_transport: 'rdma',
    });
    expect(lowLatency.measurement).toMatchObject({
      contract: 'expert-packed-weighted-combine-v1',
      component_order_contract: 'roundtrip-dispatch-gate-weighted-combine-v1',
      combine_semantics: 'gate-weighted',
      payload_unit: 'token-expert',
    });
    expect(unsupported.topology).toMatchObject({
      ep_size: 16,
      scope: 'scale-out',
      scale_up_transport: 'xgmi',
      scale_out_transport: 'rdma',
    });
  });

  it('rejects unknown, missing, and stale structural fields', () => {
    const unknown = makeCollectiveXDataset() as unknown as Record<string, unknown>;
    unknown.browser_decision = true;
    expect(() => parseCollectiveXDataset(unknown)).toThrow('unknown field browser_decision');

    const missingTier = makeCollectiveXDataset();
    delete (missingTier.series[0] as Partial<(typeof missingTier.series)[number]>).publication_tier;
    expect(() => parseCollectiveXDataset(missingTier)).toThrow('publication_tier');

    const staleMetric = makeCollectiveXDataset();
    const component = staleMetric.series[0].points[0].components.roundtrip! as unknown as Record<
      string,
      unknown
    >;
    component.logical_gbps = component.logical_payload_rate_gbps_at_latency_percentile;
    delete component.logical_payload_rate_gbps_at_latency_percentile;
    expect(() => parseCollectiveXDataset(staleMetric)).toThrow('logical_payload_rate');

    const missingTopologyScope = makeCollectiveXContractDataset();
    delete (
      missingTopologyScope.coverage[0].topology as Partial<
        (typeof missingTopologyScope.coverage)[number]['topology']
      >
    ).scope;
    expect(() => parseCollectiveXDataset(missingTopologyScope)).toThrow('scope');

    const staleMode = makeCollectiveXContractDataset();
    (staleMode.series.at(-1) as unknown as Record<string, unknown>).mode = 'll';
    expect(() => parseCollectiveXDataset(staleMode)).toThrow('normal');
  });

  it('matches backend eligibility and evidence uniqueness constraints', () => {
    const missingReason = makeCollectiveXDataset();
    missingReason.series[0].eligibility.decision_grade = false;
    expect(() => parseCollectiveXDataset(missingReason)).toThrow('diagnostic eligibility');

    const repeatedEvidenceId = makeCollectiveXDataset();
    const attemptWithEvidence = repeatedEvidenceId.attempts.find(
      (attempt) => attempt.evidence.length > 0,
    )!;
    const evidence = attemptWithEvidence.evidence[0];
    attemptWithEvidence.evidence.push({
      evidence_id: evidence.evidence_id,
      point_id: repeatedEvidenceId.series[1].points[0].point_id,
    });
    expect(() => parseCollectiveXDataset(repeatedEvidenceId)).toThrow('duplicate evidence ID');

    const duplicateEvidence = makeCollectiveXDataset();
    const duplicateAttempt = duplicateEvidence.attempts.find(
      (attempt) => attempt.evidence.length > 0,
    )!;
    duplicateAttempt.evidence.push({ ...duplicateAttempt.evidence[0] });
    expect(() => parseCollectiveXDataset(duplicateEvidence)).toThrow('duplicate evidence items');
  });

  it('rejects broken coverage and attempt references', () => {
    const unknownCase = makeCollectiveXDataset();
    unknownCase.attempts[0].case_id = `cxcase-v1-${'f'.repeat(64)}`;
    expect(() => parseCollectiveXDataset(unknownCase)).toThrow('references unknown coverage');

    const incompleteCatalog = makeCollectiveXDataset();
    incompleteCatalog.coverage[0].attempt_ids.pop();
    expect(() => parseCollectiveXDataset(incompleteCatalog)).toThrow(
      'inconsistent attempt catalog',
    );

    const wrongSelection = makeCollectiveXDataset();
    wrongSelection.coverage[0].selected_attempt_id = wrongSelection.coverage[1].attempt_ids[0];
    expect(() => parseCollectiveXDataset(wrongSelection)).toThrow('invalid selected attempt');

    const twoSelections = makeCollectiveXDataset();
    const selected = twoSelections.attempts[0];
    const duplicateSelection = {
      ...structuredClone(selected),
      attempt_id: `cxattempt-v1-${'e'.repeat(64)}`,
      evidence: [],
      attempt_index: 2,
      outcome: 'failed' as const,
      failure_mode: 'retry-failed',
      reason: 'retry-failed',
      series_id: null,
    };
    twoSelections.attempts.push(duplicateSelection);
    twoSelections.coverage
      .find((item) => item.case_id === selected.case_id)!
      .attempt_ids.push(duplicateSelection.attempt_id);
    expect(() => parseCollectiveXDataset(twoSelections)).toThrow('invalid allocation selection');

    const wrongCounters = makeCollectiveXDataset();
    wrongCounters.promotion.requested_cases = 999;
    wrongCounters.promotion.terminal_cases = 0;
    expect(() => parseCollectiveXDataset(wrongCounters)).toThrow(
      'coverage counters differ from coverage',
    );
  });

  it('rejects dangling series and cohort references', () => {
    const unknownSeries = makeCollectiveXDataset();
    unknownSeries.attempts.find((attempt) => attempt.series_id !== null)!.series_id =
      `cxseries-v1-${'f'.repeat(64)}`;
    expect(() => parseCollectiveXDataset(unknownSeries)).toThrow('references unknown series');

    const unknownCohortMember = makeCollectiveXDataset();
    unknownCohortMember.cohorts[0].series_ids[0] = `cxseries-v1-${'f'.repeat(64)}`;
    expect(() => parseCollectiveXDataset(unknownCohortMember)).toThrow('references unknown series');

    const duplicateSeries = makeCollectiveXDataset();
    duplicateSeries.series.push(structuredClone(duplicateSeries.series[0]));
    expect(() => parseCollectiveXDataset(duplicateSeries)).toThrow('duplicate ID');
  });

  it('rejects contradictory publisher status and eligibility catalogs', () => {
    const wrongAttemptReason = makeCollectiveXDataset();
    const unsupported = wrongAttemptReason.attempts.find(
      (attempt) => attempt.outcome === 'unsupported',
    )!;
    unsupported.reason = null;
    expect(() => parseCollectiveXDataset(wrongAttemptReason)).toThrow('contradictory status');

    const wrongSeriesStatus = makeCollectiveXDataset();
    wrongSeriesStatus.series[0].status = 'diagnostic';
    expect(() => parseCollectiveXDataset(wrongSeriesStatus)).toThrow('inconsistent eligibility');

    const wrongCohortAllocations = makeCollectiveXDataset();
    wrongCohortAllocations.cohorts[0].eligibility.allocation_ids.pop();
    expect(() => parseCollectiveXDataset(wrongCohortAllocations)).toThrow(
      'inconsistent eligibility',
    );
  });

  it('rejects decision and sensitivity links outside their cohorts', () => {
    const unknownRankingCohort = makeCollectiveXDataset();
    unknownRankingCohort.rankings[0].cohort_id = `cxcohort-v1-${'f'.repeat(64)}`;
    expect(() => parseCollectiveXDataset(unknownRankingCohort)).toThrow(
      'references unknown cohort',
    );

    const wrongRankingPoint = makeCollectiveXDataset();
    const ranking = wrongRankingPoint.rankings[0];
    ranking.entries[0].point_id = wrongRankingPoint.series.find(
      (series) => series.series_id !== ranking.entries[0].series_id,
    )!.points[0].point_id;
    expect(() => parseCollectiveXDataset(wrongRankingPoint)).toThrow('invalid point');

    const wrongRecommendationSeries = makeCollectiveXDataset();
    const recommendation = wrongRecommendationSeries.recommendations[0];
    const cohort = wrongRecommendationSeries.cohorts.find(
      (item) => item.cohort_id === recommendation.cohort_id,
    )!;
    const outsider = wrongRecommendationSeries.series.find(
      (series) => !cohort.series_ids.includes(series.series_id),
    )!;
    recommendation.series_id = outsider.series_id;
    recommendation.point_id = outsider.points[0].point_id;
    expect(() => parseCollectiveXDataset(wrongRecommendationSeries)).toThrow(
      'invalid publication links',
    );

    const wrongSensitivitySeries = makeCollectiveXDataset();
    const sensitivity = wrongSensitivitySeries.sensitivities[0];
    const sensitivityCohort = wrongSensitivitySeries.cohorts.find(
      (item) => item.cohort_id === sensitivity.cohort_id,
    )!;
    sensitivity.candidate_series_id = wrongSensitivitySeries.series.find(
      (series) => !sensitivityCohort.series_ids.includes(series.series_id),
    )!.series_id;
    expect(() => parseCollectiveXDataset(wrongSensitivitySeries)).toThrow(
      'invalid publication links',
    );
  });

  it('rejects contradictory decision graphs without choosing replacements', () => {
    const duplicateRankingMember = makeCollectiveXDataset();
    duplicateRankingMember.rankings[0].entries.push(
      structuredClone(duplicateRankingMember.rankings[0].entries[0]),
    );
    expect(() => parseCollectiveXDataset(duplicateRankingMember)).toThrow(
      'does not reference its cohort',
    );

    const duplicateMetric = makeCollectiveXDataset();
    const clonedRanking = structuredClone(duplicateMetric.rankings[0]);
    clonedRanking.ranking_id = `cxranking-v1-${'e'.repeat(64)}`;
    clonedRanking.entries = clonedRanking.entries.toReversed();
    clonedRanking.entries.forEach((entry, index) => {
      entry.rank = index + 1;
    });
    duplicateMetric.rankings.push(clonedRanking);
    expect(() => parseCollectiveXDataset(duplicateMetric)).toThrow('duplicates a decision metric');

    const nonWinner = makeCollectiveXDataset();
    const recommendation = nonWinner.recommendations[0];
    const ranking = nonWinner.rankings.find(
      (item) =>
        item.cohort_id === recommendation.cohort_id &&
        item.metric.statistic === 'p50' &&
        item.metric.measure === 'latency_us',
    )!;
    const runnerUp = ranking.entries[1];
    recommendation.series_id = runnerUp.series_id;
    recommendation.point_id = runnerUp.point_id;
    recommendation.value = runnerUp.value;
    recommendation.unit = runnerUp.unit;
    expect(() => parseCollectiveXDataset(nonWinner)).toThrow('invalid publication links');

    const routingRecommendation = makeCollectiveXDataset();
    const routingCohort = routingRecommendation.cohorts.find((item) => item.kind === 'routing')!;
    const routingSeries = routingRecommendation.series.find(
      (item) => item.series_id === routingCohort.series_ids[0],
    )!;
    const movedRecommendation = routingRecommendation.recommendations[0];
    movedRecommendation.cohort_id = routingCohort.cohort_id;
    movedRecommendation.series_id = routingSeries.series_id;
    movedRecommendation.point_id = routingSeries.points[0].point_id;
    expect(() => parseCollectiveXDataset(routingRecommendation)).toThrow(
      'invalid publication links',
    );

    const nonRoutingSensitivity = makeCollectiveXDataset();
    const libraryCohort = nonRoutingSensitivity.cohorts.find((item) => item.kind === 'library')!;
    const sensitivity = nonRoutingSensitivity.sensitivities[0];
    sensitivity.cohort_id = libraryCohort.cohort_id;
    sensitivity.baseline_series_id = libraryCohort.series_ids[0];
    sensitivity.candidate_series_id = libraryCohort.series_ids[0];
    expect(() => parseCollectiveXDataset(nonRoutingSensitivity)).toThrow(
      'invalid publication links',
    );

    const wrongMetricUnit = makeCollectiveXDataset();
    wrongMetricUnit.rankings[0].metric.objective = 'max';
    wrongMetricUnit.rankings[0].entries.forEach((entry) => {
      entry.unit = 'GB/s';
    });
    expect(() => parseCollectiveXDataset(wrongMetricUnit)).toThrow('invalid metric metadata');

    const wrongSensitivityMetric = makeCollectiveXDataset();
    wrongSensitivityMetric.sensitivities[0].metric = {
      ...wrongSensitivityMetric.sensitivities[0].metric,
      objective: 'max',
    };
    expect(() => parseCollectiveXDataset(wrongSensitivityMetric)).toThrow(
      'invalid publication links',
    );

    const duplicateRecommendation = makeCollectiveXDataset();
    const clonedRecommendation = structuredClone(duplicateRecommendation.recommendations[0]);
    clonedRecommendation.recommendation_id = `cxrecommendation-v1-${'e'.repeat(64)}`;
    duplicateRecommendation.recommendations.push(clonedRecommendation);
    expect(() => parseCollectiveXDataset(duplicateRecommendation)).toThrow(
      'invalid publication links',
    );

    const duplicateSensitivity = makeCollectiveXDataset();
    const clonedSensitivity = structuredClone(duplicateSensitivity.sensitivities[0]);
    clonedSensitivity.sensitivity_id = `cxsensitivity-v1-${'e'.repeat(64)}`;
    duplicateSensitivity.sensitivities.push(clonedSensitivity);
    expect(() => parseCollectiveXDataset(duplicateSensitivity)).toThrow(
      'invalid publication links',
    );
  });

  it('rejects copied decision values and invalid publication envelopes', () => {
    const wrongRankingValue = makeCollectiveXDataset();
    wrongRankingValue.rankings[0].entries[0].value *= 2;
    expect(() => parseCollectiveXDataset(wrongRankingValue)).toThrow(
      'differs from measured series data',
    );

    const promotedWithoutEligibleDecisions = makeCollectiveXDataset();
    for (const cohort of promotedWithoutEligibleDecisions.cohorts) {
      cohort.eligibility = {
        ...cohort.eligibility,
        decision_grade: false,
        stable_ordering: false,
        reasons: ['unstable-ordering'],
      };
    }
    promotedWithoutEligibleDecisions.rankings = [];
    promotedWithoutEligibleDecisions.recommendations = [];
    promotedWithoutEligibleDecisions.sensitivities = [];
    expect(() => parseCollectiveXDataset(promotedWithoutEligibleDecisions)).toThrow(
      'promoted dataset lacks a complete decision graph',
    );

    const quarantinedWithEvidence = makeCollectiveXDataset();
    quarantinedWithEvidence.promotion.status = 'quarantined';
    expect(() => parseCollectiveXDataset(quarantinedWithEvidence)).toThrow(
      'quarantined dataset exposes publication evidence',
    );
  });

  it('accepts only digest-addressed public channel paths', () => {
    const digest = 'a'.repeat(64);
    expect(
      parseCollectiveXChannel({
        format: 'collectivex.channel.v1',
        channel: 'dev-latest',
        generated_at: '2026-07-04T00:00:00Z',
        dataset: {
          path: `datasets/${digest}/dataset.json`,
          sha256: digest,
          bytes: 10,
        },
      }).dataset.sha256,
    ).toBe(digest);

    expect(() =>
      parseCollectiveXChannel({
        format: 'collectivex.channel.v1',
        channel: 'dev-latest',
        generated_at: '2026-07-04T00:00:00Z',
        dataset: { path: '../private/dataset.json', sha256: digest, bytes: 10 },
      }),
    ).toThrow('dataset.path');

    expect(() =>
      parseCollectiveXChannel({
        format: 'collectivex.channel.v1',
        channel: 'dev-latest',
        generated_at: '2026-07-04T00:00:00Z',
        dataset: {
          path: `datasets/${'b'.repeat(64)}/dataset.json`,
          sha256: digest,
          bytes: 10,
        },
      }),
    ).toThrow('digest-addressed');

    expect(() =>
      parseCollectiveXChannel({
        format: 'collectivex.channel.v1',
        channel: 'dev-latest',
        generated_at: '2026-07-04T00:00:00Z',
        dataset: {
          path: `datasets/${digest}/dataset.json`,
          sha256: digest,
          bytes: 32 * 1024 * 1024 + 1,
        },
      }),
    ).toThrow('33554432');
  });

  it('verifies exact bytes and SHA-256 before parsing', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify(makeCollectiveXDataset()));
    const digest = await sha256Hex(bytes);
    mockPublication(bytes, digest);

    const result = await fetchCollectiveXPublication();

    expect(result.digest).toBe(digest);
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      collectiveXChannelUrl('dev-latest'),
      expect.objectContaining({ cache: 'no-store', credentials: 'same-origin' }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      `/collectivex-data/v1/datasets/${digest}/dataset.json`,
      expect.objectContaining({ cache: 'force-cache', credentials: 'same-origin' }),
    );
  });

  it('distinguishes deployment and channel availability from rejected publication bytes', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503, headers: new Headers() });
    await expect(fetchCollectiveXPublication()).rejects.toMatchObject({
      name: 'CollectiveXDataError',
      availabilityReason: 'store-unavailable',
    });

    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      headers: new Headers({ 'X-CollectiveX-Status': 'source-unavailable' }),
    });
    await expect(fetchCollectiveXPublication()).rejects.toMatchObject({
      name: 'CollectiveXDataError',
      availabilityReason: 'source-unavailable',
    });

    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      headers: new Headers({ 'X-CollectiveX-Status': 'channel-unavailable' }),
    });
    await expect(fetchCollectiveXPublication()).rejects.toMatchObject({
      name: 'CollectiveXDataError',
      availabilityReason: 'channel-unavailable',
    });

    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, headers: new Headers() });
    await expect(fetchCollectiveXPublication()).rejects.toThrow(
      'CollectiveX publication rejected: channel request failed (404).',
    );
  });

  it('fails closed on byte, digest, and channel-name mismatch', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify(makeCollectiveXDataset()));
    const digest = await sha256Hex(bytes);
    mockPublication(bytes, digest, { byteLength: bytes.length + 1 });
    await expect(fetchCollectiveXPublication()).rejects.toThrow('byte count');

    mockFetch.mockReset();
    mockPublication(bytes, 'f'.repeat(64));
    await expect(fetchCollectiveXPublication()).rejects.toThrow('SHA-256');

    mockFetch.mockReset();
    mockPublication(bytes, digest, { pointerChannel: 'latest-attempt' });
    await expect(fetchCollectiveXPublication('dev-latest')).rejects.toThrow(
      'channel name does not match',
    );

    mockFetch.mockReset();
    mockPublication(bytes, digest, { pointerTimestamp: '2099-01-01T00:00:00Z' });
    await expect(fetchCollectiveXPublication()).rejects.toThrow('timestamp does not match');
  });

  it('requires a promoted dataset only on dev-latest', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify(makeCollectiveXDiagnosticDataset()));
    const digest = await sha256Hex(bytes);
    mockPublication(bytes, digest);
    await expect(fetchCollectiveXPublication('dev-latest')).rejects.toThrow(
      'does not reference a promoted dataset',
    );

    mockFetch.mockReset();
    mockPublication(bytes, digest, { pointerChannel: 'latest-attempt' });
    await expect(fetchCollectiveXPublication('latest-attempt')).resolves.toMatchObject({
      dataset: { promotion: { status: 'diagnostic' } },
    });
  });

  it('rejects duplicate JSON keys before schema validation', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () =>
        Promise.resolve(
          `{"format":"collectivex.channel.v1","format":"collectivex.channel.v1",` +
            `"channel":"dev-latest","generated_at":"2026-07-04T01:00:00Z",` +
            `"dataset":{"path":"datasets/${'a'.repeat(64)}/dataset.json",` +
            `"sha256":"${'a'.repeat(64)}","bytes":1}}`,
        ),
    });
    await expect(fetchCollectiveXPublication()).rejects.toThrow('duplicate key format');

    mockFetch.mockReset();
    const text = JSON.stringify(makeCollectiveXDataset()).replace(
      '"schema_version":1',
      '"schema_version":1,"schema_version":1',
    );
    const bytes = new TextEncoder().encode(text);
    const digest = await sha256Hex(bytes);
    mockPublication(bytes, digest);
    await expect(fetchCollectiveXPublication()).rejects.toThrow('duplicate key schema_version');
  });
});

function mockPublication(
  bytes: Uint8Array<ArrayBuffer>,
  digest: string,
  options: {
    byteLength?: number;
    pointerChannel?: 'dev-latest' | 'latest-attempt';
    pointerTimestamp?: string;
  } = {},
) {
  const channel = options.pointerChannel ?? 'dev-latest';
  mockFetch
    .mockResolvedValueOnce({
      ok: true,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            format: 'collectivex.channel.v1',
            channel,
            generated_at: options.pointerTimestamp ?? '2026-07-04T01:00:00Z',
            dataset: {
              path: `datasets/${digest}/dataset.json`,
              sha256: digest,
              bytes: options.byteLength ?? bytes.length,
            },
          }),
        ),
    })
    .mockResolvedValueOnce({ ok: true, arrayBuffer: () => Promise.resolve(bytes.buffer) });
}
