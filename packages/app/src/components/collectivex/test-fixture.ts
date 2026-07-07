import type {
  CollectiveXAttempt,
  CollectiveXCoverage,
  CollectiveXDataset,
  CollectiveXEligibility,
  CollectiveXMetric,
  CollectiveXMode,
  CollectiveXSeries,
} from './types';

function fixtureId(
  kind:
    | 'allocation'
    | 'attempt'
    | 'case'
    | 'cohort'
    | 'evidence'
    | 'point'
    | 'ranking'
    | 'recommendation'
    | 'sensitivity'
    | 'series'
    | 'work',
  value: number,
): string {
  return `cx${kind}-v1-${value.toString(16).padStart(64, '0')}`;
}

const qualificationIndices = [1] as const;
const allocations = qualificationIndices.map((value) => fixtureId('allocation', value));
const decisionIds = {
  libraryCohort: fixtureId('cohort', 1),
  routingCohort: fixtureId('cohort', 2),
  chipCohort: fixtureId('cohort', 3),
  systemCohort: fixtureId('cohort', 4),
  diagnosticLibraryCohort: fixtureId('cohort', 5),
  rankings: Array.from({ length: 24 }, (_, index) => fixtureId('ranking', index + 1)),
  recommendations: Array.from({ length: 24 }, (_, index) => fixtureId('recommendation', index + 1)),
  sensitivities: Array.from({ length: 12 }, (_, index) => fixtureId('sensitivity', index + 1)),
} as const;

function attemptId(caseIndex: number, allocationIndex: number, ordinal: number): string {
  return fixtureId('attempt', caseIndex * 100 + allocationIndex * 10 + ordinal);
}
function makeEligibility(): CollectiveXEligibility {
  return {
    decision_grade: true,
    allocation_ids: [...allocations],
    complete: true,
    correct: true,
    measured_roundtrip_p99: true,
    stable_ordering: true,
    reasons: [],
  };
}

function component(base: number) {
  const latency = { p50: base, p90: base + 10, p95: base + 15, p99: base + 20 };
  const activationBytes = 1_048_576;
  const scaleBytes = 16_384;
  const totalBytes = activationBytes + scaleBytes;
  const rate = (bytes: number) => ({
    p50: bytes / (latency.p50 * 1000),
    p90: bytes / (latency.p90 * 1000),
    p95: bytes / (latency.p95 * 1000),
    p99: bytes / (latency.p99 * 1000),
  });
  return {
    origin: 'measured' as const,
    latency_us: latency,
    byte_provenance: {
      accounting_contract: 'activation-data-plus-scales-v1' as const,
      activation_data_bytes: activationBytes,
      scale_bytes: scaleBytes,
      total_logical_bytes: totalBytes,
    },
    activation_data_rate_gbps_at_latency_percentile: rate(activationBytes),
    total_logical_data_rate_gbps_at_latency_percentile: rate(totalBytes),
    sample_count: 512,
  };
}

const bf16Precision = {
  alignment_contract: 'native-bf16-vector-alignment',
  api_input_dtype: 'bf16',
  api_output_dtype: 'bf16',
  communication_format: 'bf16',
  conversion_boundary: 'none',
  padding_contract: 'none',
  quantization_origin: 'none',
  scale_dtype: null,
  scale_group_size: null,
  scale_layout: 'none',
} as const;

function precisionEvidence() {
  return {
    dequantized_semantics: true,
    encoded_payload_valid: true,
    max_abs_error: 0,
    max_rel_error: 0,
    passed: true,
    saturation_count: 0,
    saturation_rate: 0,
    scales_finite: null,
    scales_positive: null,
  };
}

function decisionMetricValue(
  item: CollectiveXSeries,
  metric: CollectiveXDataset['rankings'][number]['metric'],
) {
  const roundtrip = item.points[0].components.roundtrip!;
  return metric.measure === 'latency_us'
    ? roundtrip.latency_us[metric.statistic]
    : metric.measure === 'activation_data_rate_gbps_at_latency_percentile'
      ? roundtrip.activation_data_rate_gbps_at_latency_percentile![metric.statistic]
      : roundtrip.total_logical_data_rate_gbps_at_latency_percentile![metric.statistic];
}

function metricLabel(metric: CollectiveXMetric): string {
  return metric.measure === 'latency_us'
    ? `${metric.statistic} latency`
    : `${metric.measure === 'activation_data_rate_gbps_at_latency_percentile' ? 'activation' : 'total logical'} rate at ${metric.statistic} latency`;
}

function coverageTopology(series: CollectiveXSeries): CollectiveXCoverage['topology'] {
  const system = series.system;
  return {
    ep_size: system.ep_size,
    nodes: system.nodes,
    gpus_per_node: system.gpus_per_node,
    scale_up_domain: system.scale_up_domain,
    scope: system.scope,
    scale_up_transport: system.scale_up_transport,
    scale_out_transport: system.scale_out_transport,
    transport: system.transport,
    topology_class: system.topology_class,
  };
}

function makeSeries(
  index: number,
  backend: string,
  latency: number,
  { mode = 'normal', epSize = 8 }: { mode?: CollectiveXMode; epSize?: 8 | 16 } = {},
): CollectiveXSeries {
  const evidenceIds = allocations.map((_, allocationIndex) =>
    fixtureId('evidence', index * 10 + allocationIndex),
  );
  const roundtrip = component(latency);
  const globalTokens = 128 * epSize;
  const scaleOut = epSize > 8;
  const lowLatency = mode === 'low-latency';
  return {
    series_id: fixtureId('series', index),
    label: `H100 EP${epSize} · ${backend} · BF16 · uniform${lowLatency ? ' low-latency' : ''}`,
    status: 'decision-grade',
    case_ids: [fixtureId('case', index)],
    allocation_ids: [...allocations],
    model: 'deepseek-v3-v1',
    suite: lowLatency ? 'ep-low-latency-v1' : 'ep-core-v1',
    mode,
    publication_tier: 'official',
    phase: 'decode',
    backend: {
      id: backend,
      label: backend,
      role: backend === 'nccl-ep' ? 'reference' : 'library',
      generation: 'v1',
      version: '1.0.0',
    },
    build: {
      implementation_contract_sha256: backend === 'deepep' ? 'd'.repeat(64) : 'e'.repeat(64),
      public_config_sha256: backend === 'deepep' ? '4'.repeat(64) : '5'.repeat(64),
      routing_control_sha256: backend === 'deepep' ? 'a'.repeat(64) : 'b'.repeat(64),
      runtime_fingerprint_sha256: backend === 'deepep' ? '7'.repeat(64) : '8'.repeat(64),
      image_digest: `sha256:${backend === 'deepep' ? '1'.repeat(64) : '2'.repeat(64)}`,
      source_sha: 'a'.repeat(40),
      squash_sha256: backend === 'deepep' ? '3'.repeat(64) : '4'.repeat(64),
    },
    system: {
      sku: 'h100',
      label: 'NVIDIA H100 SXM',
      vendor: 'nvidia',
      topology_class: scaleOut ? 'h100-nvlink-rdma' : 'single-node-nvlink',
      transport: scaleOut ? 'nvlink-rdma' : 'nvlink',
      scale_up_transport: 'nvlink',
      scale_out_transport: scaleOut ? 'rdma' : null,
      scope: scaleOut ? 'scale-out' : 'scale-up',
      nodes: scaleOut ? 2 : 1,
      gpus_per_node: 8,
      scale_up_domain: 8,
      world_size: epSize,
      ep_size: epSize,
      placement: 'packed',
    },
    workload: {
      workload_id: fixtureId('work', 1),
      hidden: 7168,
      top_k: 8,
      experts: 256,
      routing: 'uniform',
      eplb: false,
      precision_profile: 'd-bf16.c-bf16',
      dispatch_precision: { ...bf16Precision },
      combine_precision: { ...bf16Precision },
      activation_profile: 'canonical-counter-source-v4',
    },
    eplb: {
      enabled: false,
      calibration_workload_id: null,
      calibration_trace_sha256: null,
      calibration_window: null,
      calibration_token_offset: null,
      planner: null,
      mapping_sha256: null,
      logical_experts: 256,
      physical_experts: 256,
      redundant_experts: 0,
      reference_tokens_per_rank: null,
      replicated_experts: 0,
      max_replicas: null,
      imbalance_before: null,
      imbalance_after: null,
    },
    resource: {
      mode: 'fixed-profile',
      profile: 'backend-default',
      comm_units_kind: 'sm',
      configured_units: 20,
    },
    measurement: {
      contract: lowLatency ? 'expert-packed-weighted-combine-v1' : 'layout-and-dispatch-v1',
      component_order_contract: 'qualification-hash-rotated-components-v1',
      combine_semantics: lowLatency ? 'gate-weighted' : 'activation-only',
      payload_unit: lowLatency ? 'token-expert' : 'token-rank',
      sampling_contract: 'fixed-512-v1',
      iters: 8,
      trials: 64,
      warmups: 32,
      samples_per_component: 512,
      qualification_indices: [...qualificationIndices],
      headline_component: 'roundtrip',
      headline_percentile: 'p99',
    },
    points: [
      {
        point_id: fixtureId('point', index),
        tokens_per_rank: 128,
        global_tokens: globalTokens,
        anomalies: [],
        correctness: {
          semantic_pass: true,
          precision: {
            dispatch: precisionEvidence(),
            combine: precisionEvidence(),
            passed: true,
            profile_id: 'd-bf16.c-bf16',
          },
        },
        trial_diagnostics: {
          flagged: false,
          reasons: [],
          components: {
            dispatch:
              index === 1
                ? {
                    drift_flagged: false,
                    first_last_median_ratio: 1.02,
                    outlier_flagged: false,
                    robust_outlier_fraction: 0,
                    trial_count: 64 as const,
                  }
                : null,
            stage:
              index === 1
                ? {
                    drift_flagged: false,
                    first_last_median_ratio: 1.01,
                    outlier_flagged: false,
                    robust_outlier_fraction: 0,
                    trial_count: 64 as const,
                  }
                : null,
            combine:
              index === 1
                ? {
                    drift_flagged: false,
                    first_last_median_ratio: 1.03,
                    outlier_flagged: false,
                    robust_outlier_fraction: 0,
                    trial_count: 64 as const,
                  }
                : null,
            roundtrip: {
              drift_flagged: false,
              first_last_median_ratio: 1.04,
              outlier_flagged: false,
              robust_outlier_fraction: 0,
              trial_count: 64 as const,
            },
          },
        },
        routing: {
          fanout_mean: 5.25,
          recv_tokens_max: 740,
          expert_load_cv: 0.12,
          payload_rank_cv: 0.08,
          hotspot_ratio: 1.4,
          empty_expert_count: 0,
          empty_rank_count: 0,
          routed_copies: 5376,
        },
        components: {
          dispatch: index === 1 ? component(30) : null,
          stage: index === 1 ? component(20) : null,
          combine: index === 1 ? component(40) : null,
          roundtrip,
          isolated_sum:
            index === 1
              ? {
                  origin: 'derived',
                  latency_us: { p50: 70, p90: 90, p95: 100, p99: 110 },
                  byte_provenance: {
                    accounting_contract: 'activation-data-plus-scales-v1',
                    activation_data_bytes: 0,
                    scale_bytes: 0,
                    total_logical_bytes: 0,
                  },
                  activation_data_rate_gbps_at_latency_percentile: null,
                  total_logical_data_rate_gbps_at_latency_percentile: null,
                  sample_count: null,
                }
              : null,
        },
        roundtrip_token_rate_at_latency_percentile: {
          p50: globalTokens / (roundtrip.latency_us.p50 * 1e-6),
          p90: globalTokens / (roundtrip.latency_us.p90 * 1e-6),
          p95: globalTokens / (roundtrip.latency_us.p95 * 1e-6),
          p99: globalTokens / (roundtrip.latency_us.p99 * 1e-6),
        },
        evidence_ids: evidenceIds,
      },
    ],
    eligibility: makeEligibility(),
  };
}

function successfulAttempts(item: CollectiveXSeries, caseIndex: number): CollectiveXAttempt[] {
  return allocations.map((allocationId, allocationIndex) => ({
    attempt_id: attemptId(caseIndex, allocationIndex + 1, 1),
    evidence: [
      {
        evidence_id: item.points[0].evidence_ids[allocationIndex],
        point_id: item.points[0].point_id,
      },
    ],
    case_id: item.case_ids[0],
    allocation_id: allocationId,
    run_id: String(1000 + allocationIndex),
    run_attempt: 1,
    qualification_index: qualificationIndices[allocationIndex],
    attempt_index: 1,
    outcome: 'success',
    failure_mode: null,
    reason: null,
    series_id: item.series_id,
    selected: true,
    completed_at: '2026-07-04T00:01:00Z',
  }));
}

function seriesCoverage(
  item: CollectiveXSeries,
  retained: CollectiveXAttempt[],
): CollectiveXCoverage {
  const selected = retained.at(-1);
  return {
    case_id: item.case_ids[0],
    label: `${item.backend.label} ${item.phase}`,
    required: true,
    disposition: 'runnable',
    sku: item.system.sku,
    suite: item.suite,
    workload: item.model,
    publication_tier: item.publication_tier,
    backend: item.backend.id,
    backend_generation: item.backend.generation,
    mode: item.mode,
    phase: item.phase,
    routing: item.workload.routing,
    eplb: item.workload.eplb,
    precision_profile: item.workload.precision_profile,
    dispatch_precision: structuredClone(item.workload.dispatch_precision),
    combine_precision: structuredClone(item.workload.combine_precision),
    resource: {
      mode: item.resource.mode,
      profile: item.resource.profile,
      comm_units_kind: item.resource.comm_units_kind,
      configured_units: item.resource.configured_units,
    },
    topology: coverageTopology(item),
    points: item.points.map((point) => ({
      point_id: point.point_id,
      series_id: item.series_id,
      tokens_per_rank: point.tokens_per_rank,
      global_tokens: point.global_tokens,
      terminal_status: 'measured' as const,
      reason: null,
    })),
    selected_attempt_id: selected?.attempt_id ?? null,
    outcome: selected?.outcome ?? 'invalid',
    failure_mode: selected?.failure_mode ?? null,
    reason: selected ? selected.reason : 'missing-selected-attempt',
    attempt_ids: retained.map((attempt) => attempt.attempt_id),
  };
}

export function makeCollectiveXDataset(): CollectiveXDataset {
  const routingVariant = makeSeries(4, 'deepep', 110);
  routingVariant.label = 'H100 EP8 · deepep · BF16 · zipf';
  routingVariant.suite = 'ep-routing-v1';
  routingVariant.publication_tier = 'comparable-experimental';
  routingVariant.workload.routing = 'zipf';
  routingVariant.points[0].routing = {
    ...routingVariant.points[0].routing,
    expert_load_cv: 0.72,
    payload_rank_cv: 0.41,
    hotspot_ratio: 4.8,
    empty_expert_count: 37,
  };
  const routingEplbVariant = makeSeries(7, 'deepep', 90);
  routingEplbVariant.label = 'H100 EP8 · deepep · BF16 · zipf+eplb';
  routingEplbVariant.suite = 'ep-routing-v1';
  routingEplbVariant.publication_tier = 'comparable-experimental';
  routingEplbVariant.workload.routing = 'zipf';
  routingEplbVariant.workload.eplb = true;
  routingEplbVariant.build.implementation_contract_sha256 = 'f'.repeat(64);
  routingEplbVariant.eplb = {
    enabled: true,
    calibration_workload_id: fixtureId('work', 70),
    calibration_trace_sha256: '7'.repeat(64),
    calibration_window: 'collectivex-eplb-calibration-window-v1',
    calibration_token_offset: 0,
    planner: 'greedy-rank-major-v1',
    mapping_sha256: 'f'.repeat(64),
    logical_experts: 256,
    physical_experts: 288,
    redundant_experts: 32,
    reference_tokens_per_rank: 2048,
    replicated_experts: 24,
    max_replicas: 3,
    imbalance_before: 4.8,
    imbalance_after: 1.2,
  };
  routingEplbVariant.points[0].routing = {
    ...routingEplbVariant.points[0].routing,
    expert_load_cv: 0.18,
    payload_rank_cv: 0.13,
    hotspot_ratio: 1.7,
    empty_expert_count: 3,
  };
  const chipVariant = makeSeries(5, 'deepep', 70);
  const systemVariant = makeSeries(6, 'nccl-ep', 130);
  for (const item of [chipVariant, systemVariant]) {
    item.label = `B200 EP8 · ${item.backend.id} · BF16 · uniform`;
    item.system = {
      ...item.system,
      sku: 'b200',
      label: 'NVIDIA B200 SXM',
    };
  }
  const series = [
    makeSeries(1, 'deepep', 80),
    makeSeries(2, 'mori', 100),
    makeSeries(3, 'nccl-ep', 150),
    routingVariant,
    chipVariant,
    systemVariant,
    routingEplbVariant,
  ];
  const metrics = (
    [
      'latency_us',
      'activation_data_rate_gbps_at_latency_percentile',
      'total_logical_data_rate_gbps_at_latency_percentile',
    ] as const
  ).flatMap((measure) =>
    (['p50', 'p99'] as const).map((statistic) => ({
      operation: 'roundtrip' as const,
      statistic,
      measure,
      objective: measure === 'latency_us' ? ('min' as const) : ('max' as const),
      tokens_per_rank: 128,
      phase: 'decode' as const,
    })),
  );
  const attempts = series.flatMap((item, seriesIndex) => successfulAttempts(item, seriesIndex + 1));
  const unsupportedCaseId = fixtureId('case', 8);
  const unsupportedAttempts: CollectiveXAttempt[] = allocations.map(
    (allocationId, allocationIndex) => ({
      attempt_id: attemptId(8, allocationIndex + 1, 1),
      evidence: [],
      case_id: unsupportedCaseId,
      allocation_id: allocationId,
      run_id: String(1000 + allocationIndex),
      run_attempt: 1,
      qualification_index: qualificationIndices[allocationIndex],
      attempt_index: 1,
      outcome: 'unsupported',
      failure_mode: 'capability',
      reason: 'backend-platform-unsupported',
      series_id: null,
      selected: true,
      completed_at: '2026-07-04T00:01:00Z',
    }),
  );
  attempts.push(...unsupportedAttempts);
  const cohortId = decisionIds.libraryCohort;
  const routingCohortId = decisionIds.routingCohort;
  const cohortMembers = [
    series.slice(0, 2),
    [series[0], routingVariant, routingEplbVariant],
    [series[0], chipVariant],
    [series[2], systemVariant],
  ];
  const cohortIds = [
    cohortId,
    routingCohortId,
    decisionIds.chipCohort,
    decisionIds.systemCohort,
  ] as const;
  const cohortLabels = ['Library', 'Routing', 'Chip', 'System'];
  const rankings: CollectiveXDataset['rankings'] = cohortMembers
    .flatMap((members, cohortIndex) =>
      metrics.map((metric, metricIndex) => ({
        ranking_id: decisionIds.rankings[cohortIndex * metrics.length + metricIndex],
        cohort_id: cohortIds[cohortIndex],
        label: `${cohortLabels[cohortIndex]} ${metricLabel(metric)} T=128`,
        publication_tier:
          cohortIndex === 1 ? ('comparable-experimental' as const) : ('official' as const),
        metric,
        entries: members
          .toSorted((left, right) => {
            const delta = decisionMetricValue(left, metric) - decisionMetricValue(right, metric);
            return metric.objective === 'min' ? delta : -delta;
          })
          .map((item, index) => ({
            rank: index + 1,
            series_id: item.series_id,
            point_id: item.points[0].point_id,
            value: decisionMetricValue(item, metric),
            unit: metric.measure === 'latency_us' ? ('us' as const) : ('GB/s' as const),
          })),
        eligibility: makeEligibility(),
      })),
    )
    .toSorted((left, right) => left.ranking_id.localeCompare(right.ranking_id));
  const recommendations: CollectiveXDataset['recommendations'] = rankings
    .filter(
      (
        ranking,
      ): ranking is CollectiveXDataset['rankings'][number] & {
        publication_tier: 'official';
      } =>
        ranking.publication_tier === 'official' &&
        ranking.metric.measure === 'latency_us' &&
        ranking.metric.statistic === 'p99',
    )
    .map((ranking) => {
      const idIndex = cohortIds.indexOf(ranking.cohort_id as (typeof cohortIds)[number]);
      const metricIndex = metrics.findIndex(
        (metric) =>
          metric.measure === ranking.metric.measure &&
          metric.statistic === ranking.metric.statistic,
      );
      const top = ranking.entries[0];
      return {
        recommendation_id: decisionIds.recommendations[idIndex * metrics.length + metricIndex],
        cohort_id: ranking.cohort_id,
        label: `Best ${metricLabel(ranking.metric)} at T=128`,
        objective: 'min-p99-latency' as const,
        publication_tier: ranking.publication_tier,
        series_id: top.series_id,
        point_id: top.point_id,
        value: top.value,
        unit: top.unit,
        rationale: 'Top stable measured roundtrip result in a controlled cohort',
        eligibility: makeEligibility(),
      };
    })
    .toSorted((left, right) => left.recommendation_id.localeCompare(right.recommendation_id));
  const sensitivities: CollectiveXDataset['sensitivities'] = [routingVariant, routingEplbVariant]
    .flatMap((candidate, candidateIndex) =>
      metrics.map((metric, metricIndex) => ({
        sensitivity_id: decisionIds.sensitivities[candidateIndex * metrics.length + metricIndex],
        cohort_id: routingCohortId,
        label: `Routing sensitivity: ${metricLabel(metric)} T=128`,
        publication_tier: 'comparable-experimental' as const,
        baseline_series_id: series[0].series_id,
        candidate_series_id: candidate.series_id,
        metric,
        signed_change_ratio:
          (decisionMetricValue(candidate, metric) - decisionMetricValue(series[0], metric)) /
          decisionMetricValue(series[0], metric),
        eligibility: makeEligibility(),
      })),
    )
    .toSorted((left, right) => left.sensitivity_id.localeCompare(right.sensitivity_id));
  const coverage = series.map((item) =>
    seriesCoverage(
      item,
      attempts.filter((attempt) => attempt.case_id === item.case_ids[0]),
    ),
  );
  coverage.push({
    case_id: unsupportedCaseId,
    label: 'MI355X / DeepEP / unsupported',
    required: true,
    disposition: 'unsupported',
    sku: 'mi355x',
    suite: 'ep-core-v1',
    workload: 'deepseek-v3-v1',
    publication_tier: 'official',
    backend: 'deepep',
    backend_generation: 'v1',
    mode: 'normal',
    phase: 'decode',
    routing: 'uniform',
    eplb: false,
    precision_profile: 'd-bf16.c-bf16',
    dispatch_precision: { ...bf16Precision },
    combine_precision: { ...bf16Precision },
    resource: {
      mode: 'fixed-profile',
      profile: null,
      comm_units_kind: null,
      configured_units: null,
    },
    topology: {
      ep_size: 16,
      nodes: 2,
      gpus_per_node: 8,
      scale_up_domain: 8,
      scope: 'scale-out',
      scale_up_transport: 'xgmi',
      scale_out_transport: 'rdma',
      transport: 'xgmi-rdma',
      topology_class: 'mi355x-xgmi-rdma',
    },
    points: [
      {
        point_id: null,
        series_id: null,
        tokens_per_rank: 128,
        global_tokens: 2048,
        terminal_status: 'unsupported',
        reason: 'backend-platform-unsupported',
      },
    ],
    selected_attempt_id: unsupportedAttempts.at(-1)!.attempt_id,
    outcome: 'unsupported',
    failure_mode: 'capability',
    reason: 'backend-platform-unsupported',
    attempt_ids: unsupportedAttempts.map((attempt) => attempt.attempt_id),
  });
  const orderedAttempts = attempts.toSorted((left, right) =>
    left.attempt_id.localeCompare(right.attempt_id),
  );
  return {
    format: 'collectivex.public.v1',
    schema_version: 1,
    generated_at: '2026-07-04T01:00:00Z',
    source_bundle_ids: ['a'.repeat(64)],
    promotion: {
      status: 'promoted',
      matrix_id: '5'.repeat(64),
      allocation_ids: [...allocations],
      required_allocations: 1,
      qualification_indices: [...qualificationIndices],
      requested_cases: 8,
      terminal_cases: 8,
      measured_cases: 7,
      unsupported_cases: 1,
      requested_points: 8,
      terminal_points: 8,
      measured_points: 7,
      unsupported_points: 1,
      policy: 'collectivex-decision-grade-v1',
      reason: null,
    },
    coverage,
    attempts: orderedAttempts,
    series,
    cohorts: [
      {
        cohort_id: cohortId,
        kind: 'library' as const,
        label: 'H100 EP8 library comparison',
        description: 'Matched H100 EP8 uniform-routing library contrast',
        publication_tier: 'official' as const,
        series_ids: series.slice(0, 2).map((item) => item.series_id),
        controlled_factors: [
          'system',
          'workload',
          'mode',
          'phase',
          'measurement',
          'resource.mode',
          'source',
        ],
        varying_factors: ['backend', 'resource'],
        eligibility: makeEligibility(),
      },
      {
        cohort_id: routingCohortId,
        kind: 'routing' as const,
        label: 'H100 EP8 routing comparison',
        description: 'Matched H100 EP8 routing contrast',
        publication_tier: 'comparable-experimental' as const,
        series_ids: [series[0].series_id, routingVariant.series_id, routingEplbVariant.series_id],
        controlled_factors: [
          'backend',
          'implementation-static-build',
          'system',
          'model-shape',
          'mode',
          'phase',
          'measurement',
          'resource',
        ],
        varying_factors: ['workload.routing', 'workload.eplb', 'implementation-config'],
        eligibility: makeEligibility(),
      },
      {
        cohort_id: decisionIds.chipCohort,
        kind: 'chip' as const,
        label: 'NVIDIA chip comparison',
        description: 'Matched H100 and B200 DeepEP contrast',
        publication_tier: 'official' as const,
        series_ids: [series[0].series_id, chipVariant.series_id],
        controlled_factors: [
          'backend',
          'source',
          'workload',
          'mode',
          'phase',
          'measurement',
          'resource.mode',
        ],
        varying_factors: ['system', 'resource'],
        eligibility: makeEligibility(),
      },
      {
        cohort_id: decisionIds.systemCohort,
        kind: 'system' as const,
        label: 'NVIDIA reference system comparison',
        description: 'Matched H100 and B200 NCCL reference contrast',
        publication_tier: 'official' as const,
        series_ids: [series[2].series_id, systemVariant.series_id],
        controlled_factors: ['workload', 'mode', 'phase', 'measurement', 'source'],
        varying_factors: ['system', 'backend', 'resource'],
        eligibility: makeEligibility(),
      },
    ].toSorted((left, right) => left.cohort_id.localeCompare(right.cohort_id)),
    rankings,
    recommendations,
    sensitivities,
  };
}

export function makeCollectiveXDatasetWithPrefillCohort(): CollectiveXDataset {
  const dataset = makeCollectiveXDataset();
  const decode = dataset.cohorts.find((item) => item.cohort_id === decisionIds.libraryCohort)!;
  const byId = new Map(dataset.series.map((item) => [item.series_id, item]));
  const prefill = decode.series_ids.map((seriesId, index) => {
    const item = structuredClone(byId.get(seriesId)!);
    item.series_id = fixtureId('series', 20 + index);
    item.case_ids = [fixtureId('case', 20 + index)];
    item.label = item.label.replace('uniform', 'uniform prefill');
    item.phase = 'prefill';
    item.points[0].point_id = fixtureId('point', 20 + index);
    item.points[0].tokens_per_rank = 512;
    item.points[0].global_tokens = 4096;
    item.points[0].evidence_ids = allocations.map((_, allocationIndex) =>
      fixtureId('evidence', 200 + index * 10 + allocationIndex),
    );
    return item;
  });
  dataset.series.push(...prefill);
  const prefillCohort = {
    ...structuredClone(decode),
    cohort_id: fixtureId('cohort', 20),
    label: 'H100 EP8 prefill library comparison',
    description: 'Matched H100 EP8 prefill library contrast',
    series_ids: prefill.map((item) => item.series_id),
  };
  dataset.cohorts.push(prefillCohort);
  for (const [index, item] of prefill.entries()) {
    const retained = successfulAttempts(item, 20 + index);
    dataset.attempts.push(...retained);
    dataset.coverage.push(seriesCoverage(item, retained));
  }
  const decodeRankings = dataset.rankings.filter((item) => item.cohort_id === decode.cohort_id);
  const prefillRankings = decodeRankings.map((ranking, index) => {
    const metric = { ...ranking.metric, tokens_per_rank: 512, phase: 'prefill' as const };
    return {
      ...structuredClone(ranking),
      ranking_id: fixtureId('ranking', 100 + index),
      cohort_id: prefillCohort.cohort_id,
      label: ranking.label.replace('T=128', 'T=512').replace('Library', 'Prefill library'),
      metric,
      entries: prefill
        .toSorted((left, right) => {
          const delta = decisionMetricValue(left, metric) - decisionMetricValue(right, metric);
          return metric.objective === 'min' ? delta : -delta;
        })
        .map((item, entryIndex) => ({
          rank: entryIndex + 1,
          series_id: item.series_id,
          point_id: item.points[0].point_id,
          value: decisionMetricValue(item, metric),
          unit: metric.measure === 'latency_us' ? ('us' as const) : ('GB/s' as const),
        })),
    };
  });
  dataset.rankings.push(...prefillRankings);
  dataset.recommendations.push(
    ...prefillRankings
      .filter(
        (ranking) => ranking.metric.measure === 'latency_us' && ranking.metric.statistic === 'p99',
      )
      .map((ranking, index) => {
        const top = ranking.entries[0];
        return {
          recommendation_id: fixtureId('recommendation', 100 + index),
          cohort_id: prefillCohort.cohort_id,
          label: `Best ${metricLabel(ranking.metric)} at T=512`,
          objective: 'min-p99-latency' as const,
          publication_tier: 'official' as const,
          series_id: top.series_id,
          point_id: top.point_id,
          value: top.value,
          unit: top.unit,
          rationale: 'Top stable measured roundtrip result in a controlled cohort',
          eligibility: makeEligibility(),
        };
      }),
  );
  dataset.promotion.requested_cases += prefill.length;
  dataset.promotion.terminal_cases += prefill.length;
  dataset.promotion.measured_cases += prefill.length;
  dataset.promotion.requested_points += prefill.length;
  dataset.promotion.terminal_points += prefill.length;
  dataset.promotion.measured_points += prefill.length;
  return dataset;
}

export function makeCollectiveXContractDataset(): CollectiveXDataset {
  const dataset = makeCollectiveXDataset();
  const series = makeSeries(30, 'deepep', 60, { mode: 'low-latency', epSize: 16 });
  const attempts = successfulAttempts(series, 30);
  dataset.series.push(series);
  dataset.attempts.push(...attempts);
  dataset.coverage.push(seriesCoverage(series, attempts));
  dataset.promotion.requested_cases += 1;
  dataset.promotion.terminal_cases += 1;
  dataset.promotion.measured_cases += 1;
  dataset.promotion.requested_points += 1;
  dataset.promotion.terminal_points += 1;
  dataset.promotion.measured_points += 1;
  return dataset;
}

export function makeCollectiveXDiagnosticDataset(): CollectiveXDataset {
  const dataset = makeCollectiveXDataset();
  const series = dataset.series.find((item) => item.backend.role === 'reference')!;
  series.status = 'diagnostic';
  const allocationId = series.allocation_ids[0];
  const evidenceId = series.points[0].evidence_ids[0];
  series.allocation_ids = [allocationId];
  series.points[0].evidence_ids = [evidenceId];
  series.measurement.qualification_indices = [1];
  series.eligibility = {
    decision_grade: false,
    allocation_ids: [allocationId],
    complete: false,
    correct: true,
    measured_roundtrip_p99: true,
    stable_ordering: false,
    reasons: ['incomplete-repeat-coverage'],
  };
  const attempt = dataset.attempts.find(
    (item) => item.series_id === series.series_id && item.allocation_id === allocationId,
  )!;
  attempt.attempt_id = attemptId(3, 1, 2);
  attempt.attempt_index = 2;
  const failedAttempt: CollectiveXAttempt = {
    attempt_id: attemptId(3, 1, 1),
    evidence: [],
    case_id: attempt.case_id,
    allocation_id: attempt.allocation_id,
    run_id: attempt.run_id,
    run_attempt: attempt.run_attempt,
    qualification_index: attempt.qualification_index,
    attempt_index: 1,
    outcome: 'failed',
    failure_mode: 'timeout',
    reason: 'execution-timeout',
    series_id: null,
    selected: false,
    completed_at: '2026-07-04T00:00:30Z',
  };
  const coverage = dataset.coverage.find((item) => item.case_id === series.case_ids[0])!;
  coverage.attempt_ids = [failedAttempt.attempt_id, attempt.attempt_id].toSorted();
  coverage.selected_attempt_id = attempt.attempt_id;
  dataset.promotion = {
    ...dataset.promotion,
    status: 'diagnostic',
    allocation_ids: [allocationId],
    qualification_indices: [1],
    requested_cases: 1,
    terminal_cases: 1,
    measured_cases: 1,
    unsupported_cases: 0,
    requested_points: 1,
    terminal_points: 1,
    measured_points: 1,
    unsupported_points: 0,
  };
  dataset.source_bundle_ids = [dataset.source_bundle_ids[0]];
  dataset.coverage = [coverage];
  dataset.attempts = [failedAttempt, attempt].toSorted((left, right) =>
    left.attempt_id.localeCompare(right.attempt_id),
  );
  dataset.series = [series];
  dataset.cohorts = [];
  dataset.rankings = [];
  dataset.recommendations = [];
  dataset.sensitivities = [];
  return dataset;
}

export function makeCollectiveXDatasetWithDiagnosticCohort(): CollectiveXDataset {
  const dataset = makeCollectiveXDataset();
  const eligible = dataset.cohorts.find((item) => item.kind === 'library')!;
  const cohort = {
    ...eligible,
    cohort_id: decisionIds.diagnosticLibraryCohort,
    series_ids: eligible.series_ids.toReversed(),
    eligibility: {
      ...eligible.eligibility,
      decision_grade: false,
      stable_ordering: false,
      reasons: ['unstable-ordering'],
    },
  };
  dataset.cohorts.push(cohort);
  dataset.cohorts.sort((left, right) => left.cohort_id.localeCompare(right.cohort_id));
  return dataset;
}

export function makeCollectiveXDatasetWithPrecisionCohorts(): CollectiveXDataset {
  const dataset = makeCollectiveXDataset();
  const routing = dataset.cohorts.find((item) => item.kind === 'routing')!;
  const routingRankings = dataset.rankings.filter((item) => item.cohort_id === routing.cohort_id);
  const routingSensitivity = dataset.sensitivities.find(
    (item) => item.cohort_id === routing.cohort_id,
  )!;
  const kinds = ['dispatch-precision', 'combine-precision', 'precision-pair'] as const;
  for (const [index, kind] of kinds.entries()) {
    const cohortId = fixtureId('cohort', 100 + index);
    dataset.cohorts.push({
      ...structuredClone(routing),
      cohort_id: cohortId,
      kind,
      label: `${kind} / normal / fixture comparison`,
      description: `Publisher-declared ${kind} comparison`,
      controlled_factors:
        kind === 'dispatch-precision'
          ? ['system', 'combine-precision']
          : kind === 'combine-precision'
            ? ['system', 'dispatch-precision']
            : ['system'],
      varying_factors:
        kind === 'precision-pair'
          ? ['dispatch-precision', 'combine-precision', 'precision-profile']
          : [kind],
    });
    if (kind !== 'precision-pair') {
      dataset.rankings.push(
        ...routingRankings.map((ranking, rankingIndex) => ({
          ...structuredClone(ranking),
          ranking_id: fixtureId('ranking', 200 + index * 10 + rankingIndex),
          cohort_id: cohortId,
          label: `${kind} publisher ranking`,
        })),
      );
      dataset.sensitivities.push({
        ...structuredClone(routingSensitivity),
        sensitivity_id: fixtureId('sensitivity', 100 + index),
        cohort_id: cohortId,
        label: `${kind} publisher sensitivity`,
      });
    }
  }
  return dataset;
}

export function makeCollectiveXInventoryDataset(): CollectiveXDataset {
  const dataset = makeCollectiveXDataset();
  const unsupported = dataset.coverage.find((item) => item.disposition === 'unsupported');
  if (!unsupported) throw new Error('Inventory fixture requires an unsupported case');
  unsupported.label = unsupported.label.replace('BF16', 'FP8 dispatch');
  unsupported.precision_profile = 'd-fp8-e4m3fn-b128-f32-prequantized.c-bf16';
  unsupported.dispatch_precision = {
    alignment_contract: 'hidden-block-128',
    api_input_dtype: 'fp8-e4m3fn-with-f32-scale',
    api_output_dtype: 'fp8-e4m3fn-with-f32-scale',
    communication_format: 'fp8-e4m3fn',
    conversion_boundary: 'before-dispatch-timing',
    padding_contract: 'right-zero-pad-hidden-to-128',
    quantization_origin: 'caller-prequantized',
    scale_dtype: 'f32',
    scale_group_size: 128,
    scale_layout: 'per-token-hidden-block',
  };
  return dataset;
}
