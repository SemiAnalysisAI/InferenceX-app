import type { ZodError } from 'zod';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import {
  collectiveXChannelSchema,
  collectiveXDatasetSchema,
  type CollectiveXChannel,
  type CollectiveXDataset,
  type CollectiveXMetric,
  type CollectiveXPoint,
  type CollectiveXResolvedDataset,
  type CollectiveXSeries,
  type CollectiveXVersion,
} from './types';

export type CollectiveXChannelName = CollectiveXChannel['channel'];

const collectiveXPublicRoot = (version: CollectiveXVersion) => `/collectivex-data/${version}/`;

export const collectiveXChannelUrl = (
  channel: CollectiveXChannelName,
  version: CollectiveXVersion = 'v1',
) => `${collectiveXPublicRoot(version)}channels/${channel}.json`;

export type CollectiveXAvailabilityReason = 'source-unavailable' | 'channel-unavailable';

class CollectiveXDataError extends Error {
  readonly availabilityReason: CollectiveXAvailabilityReason | null;

  constructor(message: string, availabilityReason: CollectiveXAvailabilityReason | null = null) {
    super(availabilityReason ? message : `CollectiveX publication rejected: ${message}`);
    this.name = 'CollectiveXDataError';
    this.availabilityReason = availabilityReason;
  }
}

export function collectiveXAvailabilityReason(
  error: unknown,
): CollectiveXAvailabilityReason | null {
  return error instanceof CollectiveXDataError ? error.availabilityReason : null;
}

function schemaError(error: ZodError): CollectiveXDataError {
  const issue = error.issues[0];
  const path = issue?.path.length ? `$.${issue.path.join('.')}` : '$';
  if (issue?.code === 'unrecognized_keys') {
    return new CollectiveXDataError(`${path} contains unknown field ${issue.keys[0]}.`);
  }
  return new CollectiveXDataError(`${path} ${issue?.message ?? 'is malformed'}.`);
}

function strictJson(text: string, name: string): unknown {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new CollectiveXDataError(`${name} is not valid JSON.`);
  }

  let offset = 0;
  const whitespace = () => {
    while (/\s/.test(text[offset] ?? '')) offset += 1;
  };
  const string = () => {
    const start = offset++;
    while (offset < text.length) {
      if (text[offset] === '"') {
        offset += 1;
        return JSON.parse(text.slice(start, offset)) as string;
      }
      if (text[offset] === '\\') offset += text[offset + 1] === 'u' ? 6 : 2;
      else offset += 1;
    }
    throw new CollectiveXDataError(`${name} contains an unterminated string.`);
  };
  const parseValue = (): void => {
    whitespace();
    if (text[offset] === '{') return object();
    if (text[offset] === '[') return array();
    if (text[offset] === '"') return void string();
    while (offset < text.length && !/[\s,\]}]/.test(text[offset])) offset += 1;
  };
  const object = (): void => {
    const keys = new Set<string>();
    offset += 1;
    whitespace();
    if (text[offset] === '}') return void (offset += 1);
    while (offset < text.length) {
      const key = string();
      if (keys.has(key)) throw new CollectiveXDataError(`${name} contains duplicate key ${key}.`);
      keys.add(key);
      whitespace();
      offset += 1;
      parseValue();
      whitespace();
      if (text[offset] === '}') return void (offset += 1);
      offset += 1;
      whitespace();
    }
  };
  const array = (): void => {
    offset += 1;
    whitespace();
    if (text[offset] === ']') return void (offset += 1);
    while (offset < text.length) {
      parseValue();
      whitespace();
      if (text[offset] === ']') return void (offset += 1);
      offset += 1;
    }
  };
  parseValue();
  return value;
}

export function parseCollectiveXDatasetText(text: string): CollectiveXDataset {
  return parseCollectiveXDataset(strictJson(text, 'dataset'));
}

export function parseCollectiveXChannel(value: unknown): CollectiveXChannel {
  const parsed = collectiveXChannelSchema.safeParse(value);
  if (!parsed.success) throw schemaError(parsed.error);
  const { dataset } = parsed.data;
  if (dataset.path !== `datasets/${dataset.sha256}/dataset.json`) {
    throw new CollectiveXDataError('$.dataset.path must be the digest-addressed dataset path.');
  }
  return parsed.data;
}

function uniqueIndex<T>(items: T[], id: (item: T) => string, path: string): Map<string, T> {
  const indexed = new Map<string, T>();
  for (const item of items) {
    const value = id(item);
    if (indexed.has(value))
      throw new CollectiveXDataError(`${path} contains duplicate ID ${value}.`);
    indexed.set(value, item);
  }
  return indexed;
}

function sameIds(actual: string[], expected: Iterable<string>): boolean {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  return (
    actual.length === actualSet.size &&
    actualSet.size === expectedSet.size &&
    [...actualSet].every((id) => expectedSet.has(id))
  );
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

const RECOMMENDATION_METRICS = {
  'min-p50-latency': ['latency_us', 'p50'],
  'min-p99-latency': ['latency_us', 'p99'],
  'max-activation-data-rate-at-p50-latency': [
    'activation_data_rate_gbps_at_latency_percentile',
    'p50',
  ],
  'max-activation-data-rate-at-p99-latency': [
    'activation_data_rate_gbps_at_latency_percentile',
    'p99',
  ],
  'max-total-logical-data-rate-at-p50-latency': [
    'total_logical_data_rate_gbps_at_latency_percentile',
    'p50',
  ],
  'max-total-logical-data-rate-at-p99-latency': [
    'total_logical_data_rate_gbps_at_latency_percentile',
    'p99',
  ],
} as const;

function closeEnough(left: number, right: number): boolean {
  return (
    left === right || Math.abs(left - right) <= 1e-12 * Math.max(Math.abs(left), Math.abs(right))
  );
}

function rankingMetricKey(cohortId: string, metric: CollectiveXMetric): string {
  return [
    cohortId,
    metric.operation,
    metric.phase,
    metric.tokens_per_rank,
    metric.measure,
    metric.statistic,
    metric.objective,
  ].join('\0');
}

function metricValue(
  owner: CollectiveXSeries,
  metric: CollectiveXMetric,
): { point: CollectiveXPoint; value: number; unit: 'us' | 'GB/s' } | null {
  if (owner.phase !== metric.phase) return null;
  const point = owner.points.find((item) => item.tokens_per_rank === metric.tokens_per_rank);
  const component = point?.components.roundtrip;
  if (!point || !component) return null;
  if (metric.measure === 'latency_us') {
    return { point, value: component.latency_us[metric.statistic], unit: 'us' };
  }
  const value = component[metric.measure]?.[metric.statistic];
  return value === null || value === undefined ? null : { point, value, unit: 'GB/s' };
}

function validateDatasetReferences(dataset: CollectiveXDataset): void {
  const coverage = uniqueIndex(dataset.coverage, (item) => item.case_id, '$.coverage');
  const attempts = uniqueIndex(dataset.attempts, (item) => item.attempt_id, '$.attempts');
  const series = uniqueIndex(dataset.series, (item) => item.series_id, '$.series');
  const cohorts = uniqueIndex(dataset.cohorts, (item) => item.cohort_id, '$.cohorts');
  uniqueIndex(dataset.rankings, (item) => item.ranking_id, '$.rankings');
  uniqueIndex(dataset.recommendations, (item) => item.recommendation_id, '$.recommendations');
  uniqueIndex(dataset.sensitivities, (item) => item.sensitivity_id, '$.sensitivities');

  const points = new Map<string, { point: CollectiveXPoint; series: CollectiveXSeries }>();
  for (const owner of dataset.series) {
    for (const point of owner.points) {
      if (points.has(point.point_id)) {
        throw new CollectiveXDataError(`$.series contains duplicate point ID ${point.point_id}.`);
      }
      points.set(point.point_id, { point, series: owner });
    }
  }

  const allocationIds = new Set(dataset.promotion.allocation_ids);
  const seenEvidenceIds = new Set<string>();
  const attemptGroups = new Map<string, CollectiveXDataset['attempts']>();
  for (const attempt of dataset.attempts) {
    if (!coverage.has(attempt.case_id)) {
      throw new CollectiveXDataError(`attempt ${attempt.attempt_id} references unknown coverage.`);
    }
    if (!allocationIds.has(attempt.allocation_id)) {
      throw new CollectiveXDataError(
        `attempt ${attempt.attempt_id} references unknown allocation.`,
      );
    }
    for (const evidence of attempt.evidence) {
      if (seenEvidenceIds.has(evidence.evidence_id)) {
        throw new CollectiveXDataError(
          `$.attempts contains duplicate evidence ID ${evidence.evidence_id}.`,
        );
      }
      seenEvidenceIds.add(evidence.evidence_id);
    }
    if (
      (attempt.outcome === 'success' && attempt.selected) !== (attempt.series_id !== null) ||
      (attempt.outcome === 'success') !== (attempt.reason === null) ||
      (attempt.outcome === 'success' && attempt.failure_mode !== null)
    ) {
      throw new CollectiveXDataError(`attempt ${attempt.attempt_id} has contradictory status.`);
    }
    const groupKey = `${attempt.case_id}\0${attempt.allocation_id}`;
    attemptGroups.set(groupKey, [...(attemptGroups.get(groupKey) ?? []), attempt]);
    if (attempt.series_id === null) continue;
    const owner = series.get(attempt.series_id);
    if (!owner) {
      throw new CollectiveXDataError(`attempt ${attempt.attempt_id} references unknown series.`);
    }
    if (
      !owner.case_ids.includes(attempt.case_id) ||
      !owner.allocation_ids.includes(attempt.allocation_id)
    ) {
      throw new CollectiveXDataError(
        `attempt ${attempt.attempt_id} is outside its series catalog.`,
      );
    }
    for (const evidence of attempt.evidence) {
      const pointOwner = points.get(evidence.point_id);
      if (
        pointOwner?.series.series_id !== owner.series_id ||
        !pointOwner.point.evidence_ids.includes(evidence.evidence_id)
      ) {
        throw new CollectiveXDataError(`attempt ${attempt.attempt_id} has invalid point evidence.`);
      }
    }
  }
  for (const group of attemptGroups.values()) {
    const ordered = group.toSorted((left, right) => left.attempt_index - right.attempt_index);
    const selected = ordered.filter((attempt) => attempt.selected);
    if (
      ordered.some((attempt, index) => attempt.attempt_index !== index + 1) ||
      selected.length !== 1
    ) {
      throw new CollectiveXDataError('retained retries have an invalid allocation selection.');
    }
  }
  if (
    !sameIds(
      dataset.promotion.allocation_ids,
      dataset.attempts.map((item) => item.allocation_id),
    )
  ) {
    throw new CollectiveXDataError('$.promotion.allocation_ids differs from retained attempts.');
  }
  if (
    !sameIds(
      dataset.promotion.qualification_indices.map(String),
      [
        ...new Set(
          dataset.attempts.filter((item) => item.selected).map((item) => item.qualification_index),
        ),
      ].map(String),
    )
  ) {
    throw new CollectiveXDataError(
      '$.promotion.qualification_indices differs from retained attempts.',
    );
  }

  for (const item of dataset.coverage) {
    const expectedAttempts = dataset.attempts
      .filter((attempt) => attempt.case_id === item.case_id)
      .map((attempt) => attempt.attempt_id);
    if (!sameIds(item.attempt_ids, expectedAttempts)) {
      throw new CollectiveXDataError(
        `coverage ${item.case_id} has an inconsistent attempt catalog.`,
      );
    }
    if (item.selected_attempt_id === null) continue;
    const selected = attempts.get(item.selected_attempt_id);
    if (
      !selected ||
      !item.attempt_ids.includes(selected.attempt_id) ||
      !selected.selected ||
      selected.outcome !== item.outcome ||
      selected.failure_mode !== item.failure_mode ||
      selected.reason !== item.reason
    ) {
      throw new CollectiveXDataError(`coverage ${item.case_id} has an invalid selected attempt.`);
    }
  }
  const coveragePoints = dataset.coverage.flatMap((item) => item.points);
  for (const item of dataset.coverage) {
    for (const coveragePoint of item.points) {
      if (coveragePoint.point_id === null || coveragePoint.series_id === null) continue;
      const owner = points.get(coveragePoint.point_id);
      if (
        owner?.series.series_id !== coveragePoint.series_id ||
        !owner.series.case_ids.includes(item.case_id) ||
        owner.point.tokens_per_rank !== coveragePoint.tokens_per_rank ||
        owner.point.global_tokens !== coveragePoint.global_tokens
      ) {
        throw new CollectiveXDataError(
          `coverage ${item.case_id} has an invalid point catalog entry.`,
        );
      }
    }
  }
  const measuredCases = dataset.coverage.filter((item) =>
    item.points.every((point) => point.terminal_status === 'measured'),
  ).length;
  const unsupportedCases = dataset.coverage.filter((item) =>
    item.points.every((point) => point.terminal_status === 'unsupported'),
  ).length;
  if (
    dataset.promotion.requested_cases !== dataset.coverage.length ||
    dataset.promotion.terminal_cases !==
      dataset.coverage.filter((item) => item.selected_attempt_id !== null).length ||
    dataset.promotion.measured_cases !== measuredCases ||
    dataset.promotion.unsupported_cases !== unsupportedCases ||
    dataset.promotion.requested_points !== coveragePoints.length ||
    dataset.promotion.terminal_points !== coveragePoints.length ||
    dataset.promotion.measured_points !==
      coveragePoints.filter((item) => item.terminal_status === 'measured').length ||
    dataset.promotion.unsupported_points !==
      coveragePoints.filter((item) => item.terminal_status === 'unsupported').length
  ) {
    throw new CollectiveXDataError('$.promotion coverage counters differ from coverage.');
  }

  for (const item of dataset.series) {
    if (
      item.status !== (item.eligibility.decision_grade ? 'decision-grade' : 'diagnostic') ||
      !sameIds(item.eligibility.allocation_ids, item.allocation_ids) ||
      item.eligibility.correct !==
        item.points.every(
          (point) => point.correctness.semantic_pass && point.correctness.precision.passed,
        )
    ) {
      throw new CollectiveXDataError(`series ${item.series_id} has inconsistent eligibility.`);
    }
    if (item.case_ids.some((id) => !coverage.has(id))) {
      throw new CollectiveXDataError(`series ${item.series_id} references unknown coverage.`);
    }
    if (item.allocation_ids.some((id) => !allocationIds.has(id))) {
      throw new CollectiveXDataError(`series ${item.series_id} references unknown allocation.`);
    }
    const selected = dataset.attempts.filter(
      (attempt) => attempt.selected && attempt.series_id === item.series_id,
    );
    const selectedQualificationIndices = [
      ...new Set(selected.map((attempt) => attempt.qualification_index)),
    ];
    if (
      !sameIds(
        item.case_ids,
        selected.map((attempt) => attempt.case_id),
      ) ||
      !sameIds(
        item.allocation_ids,
        selected.map((attempt) => attempt.allocation_id),
      ) ||
      !sameIds(
        item.measurement.qualification_indices.map(String),
        selectedQualificationIndices.map(String),
      )
    ) {
      throw new CollectiveXDataError(
        `series ${item.series_id} has an inconsistent attempt catalog.`,
      );
    }
    for (const point of item.points) {
      const pointAttempts = selected.filter((attempt) =>
        attempt.evidence.some((evidence) => evidence.point_id === point.point_id),
      );
      const linkedEvidenceIds = pointAttempts.flatMap((attempt) =>
        attempt.evidence
          .filter((evidence) => evidence.point_id === point.point_id)
          .map((evidence) => evidence.evidence_id),
      );
      if (!sameIds(point.evidence_ids, linkedEvidenceIds)) {
        throw new CollectiveXDataError(`point ${point.point_id} has inconsistent evidence links.`);
      }
      if (
        point.correctness.precision.profile_id !== item.workload.precision_profile ||
        (point.correctness.semantic_pass && !point.correctness.precision.passed)
      ) {
        throw new CollectiveXDataError(
          `point ${point.point_id} has inconsistent precision correctness.`,
        );
      }
      for (const [name, component] of Object.entries(point.components)) {
        if (component === null) continue;
        const bytes = component.byte_provenance;
        const derived = name === 'isolated_sum';
        if (
          bytes.total_logical_bytes !== bytes.activation_data_bytes + bytes.scale_bytes ||
          (derived &&
            (component.activation_data_rate_gbps_at_latency_percentile !== null ||
              component.total_logical_data_rate_gbps_at_latency_percentile !== null)) ||
          (!derived &&
            (component.activation_data_rate_gbps_at_latency_percentile === null ||
              component.total_logical_data_rate_gbps_at_latency_percentile === null))
        ) {
          throw new CollectiveXDataError(
            `point ${point.point_id} has inconsistent ${name} byte accounting.`,
          );
        }
      }
    }
    if (
      item.eligibility.decision_grade &&
      !sameIds(
        selectedQualificationIndices.map(String),
        dataset.promotion.qualification_indices.map(String),
      )
    ) {
      throw new CollectiveXDataError(
        `series ${item.series_id} lacks the required qualification indices.`,
      );
    }
  }

  for (const cohort of dataset.cohorts) {
    if (cohort.series_ids.some((id) => !series.has(id))) {
      throw new CollectiveXDataError(`cohort ${cohort.cohort_id} references unknown series.`);
    }
    const members = cohort.series_ids.map((id) => series.get(id)!);
    const memberAllocations = members.flatMap((item) => item.allocation_ids);
    const expectedTier = members.some((item) => item.publication_tier === 'comparable-experimental')
      ? 'comparable-experimental'
      : 'official';
    if (
      cohort.publication_tier !== expectedTier ||
      !sameIds(cohort.eligibility.allocation_ids, memberAllocations)
    ) {
      throw new CollectiveXDataError(`cohort ${cohort.cohort_id} has inconsistent eligibility.`);
    }
  }

  const declaredRankingLeaders = new Map<
    string,
    CollectiveXDataset['rankings'][number]['entries'][number]
  >();
  const expectedRankingMetrics = new Set<string>();
  for (const cohort of dataset.cohorts) {
    if (!cohort.eligibility.decision_grade || cohort.kind === 'precision-pair') continue;
    const members = cohort.series_ids.map((id) => series.get(id)!);
    const commonTokens = members
      .map((item) => new Set(item.points.map((point) => point.tokens_per_rank)))
      .reduce((left, right) => new Set([...left].filter((token) => right.has(token))));
    for (const tokens of commonTokens) {
      for (const measure of [
        'latency_us',
        'activation_data_rate_gbps_at_latency_percentile',
        'total_logical_data_rate_gbps_at_latency_percentile',
      ] as const) {
        for (const statistic of ['p50', 'p99'] as const) {
          expectedRankingMetrics.add(
            rankingMetricKey(cohort.cohort_id, {
              operation: 'roundtrip',
              phase: members[0].phase,
              tokens_per_rank: tokens,
              measure,
              statistic,
              objective: measure === 'latency_us' ? 'min' : 'max',
            }),
          );
        }
      }
    }
  }
  const rankingMetrics = new Set<string>();
  for (const ranking of dataset.rankings) {
    const cohort = cohorts.get(ranking.cohort_id);
    if (!cohort) {
      throw new CollectiveXDataError(`ranking ${ranking.ranking_id} references unknown cohort.`);
    }
    if (
      !sameIds(
        ranking.entries.map((entry) => entry.series_id),
        cohort.series_ids,
      )
    ) {
      throw new CollectiveXDataError(
        `ranking ${ranking.ranking_id} does not reference its cohort.`,
      );
    }
    const expectedObjective = ranking.metric.measure === 'latency_us' ? 'min' : 'max';
    const expectedUnit = ranking.metric.measure === 'latency_us' ? 'us' : 'GB/s';
    const p99Latency =
      ranking.metric.measure === 'latency_us' && ranking.metric.statistic === 'p99';
    if (
      ranking.publication_tier !== cohort.publication_tier ||
      cohort.kind === 'precision-pair' ||
      !cohort.eligibility.decision_grade ||
      !sameValue(ranking.eligibility, cohort.eligibility) ||
      ranking.metric.objective !== expectedObjective ||
      ranking.entries.some(
        (entry, index) =>
          entry.unit !== expectedUnit ||
          (p99Latency ? entry.rank !== 1 && entry.rank !== index + 1 : entry.rank !== index + 1),
      )
    ) {
      throw new CollectiveXDataError(`ranking ${ranking.ranking_id} has invalid metric metadata.`);
    }
    const metricKey = rankingMetricKey(ranking.cohort_id, ranking.metric);
    if (rankingMetrics.has(metricKey)) {
      throw new CollectiveXDataError(`ranking ${ranking.ranking_id} duplicates a decision metric.`);
    }
    rankingMetrics.add(metricKey);
    for (const entry of ranking.entries) {
      const pointOwner = points.get(entry.point_id);
      const measured = pointOwner ? metricValue(pointOwner.series, ranking.metric) : null;
      if (
        pointOwner?.series.series_id !== entry.series_id ||
        !measured ||
        measured.point.point_id !== entry.point_id
      ) {
        throw new CollectiveXDataError(
          `ranking ${ranking.ranking_id} references an invalid point.`,
        );
      }
      if (measured.unit !== entry.unit || !closeEnough(measured.value, entry.value)) {
        throw new CollectiveXDataError(
          `ranking ${ranking.ranking_id} differs from measured series data.`,
        );
      }
    }
    const expectedEntries = ranking.entries.toSorted((left, right) => {
      const valueOrder = left.value - right.value;
      if (valueOrder !== 0) {
        return ranking.metric.objective === 'min' ? valueOrder : -valueOrder;
      }
      return ranking.metric.objective === 'min'
        ? left.series_id.localeCompare(right.series_id)
        : right.series_id.localeCompare(left.series_id);
    });
    const tiedFirst = p99Latency ? ranking.entries.filter((entry) => entry.rank === 1).length : 0;
    const expectedRanks = p99Latency
      ? ranking.entries.map((_, index) => (index < tiedFirst ? 1 : index + 1))
      : ranking.entries.map((_, index) => index + 1);
    if (
      !sameValue(ranking.entries, expectedEntries) ||
      !sameValue(
        ranking.entries.map((entry) => entry.rank),
        expectedRanks,
      )
    ) {
      throw new CollectiveXDataError(`ranking ${ranking.ranking_id} has invalid ordering.`);
    }
    const rankOne = ranking.entries.filter((entry) => entry.rank === 1);
    if (rankOne.length === 1) {
      const declaredWinner = rankOne[0];
      const winnerKey = [
        ranking.cohort_id,
        ranking.metric.measure,
        ranking.metric.statistic,
        declaredWinner.point_id,
      ].join('\0');
      declaredRankingLeaders.set(winnerKey, declaredWinner);
    }
  }
  if (!sameIds([...rankingMetrics], expectedRankingMetrics)) {
    throw new CollectiveXDataError('rankings do not cover every eligible cohort metric.');
  }

  const recommendationKeys = new Set<string>();
  const expectedRecommendationKeys = new Set<string>();
  for (const ranking of dataset.rankings) {
    const cohort = cohorts.get(ranking.cohort_id)!;
    const rankOne = ranking.entries.filter((entry) => entry.rank === 1);
    if (
      cohort.publication_tier === 'official' &&
      !['routing', 'dispatch-precision', 'combine-precision', 'precision-pair'].includes(
        cohort.kind,
      ) &&
      ranking.metric.measure === 'latency_us' &&
      ranking.metric.statistic === 'p99' &&
      rankOne.length === 1
    ) {
      expectedRecommendationKeys.add(
        [ranking.cohort_id, 'min-p99-latency', rankOne[0].point_id].join('\0'),
      );
    }
  }
  for (const recommendation of dataset.recommendations) {
    const cohort = cohorts.get(recommendation.cohort_id);
    const [measure, statistic] = RECOMMENDATION_METRICS[recommendation.objective];
    const declaredWinner = declaredRankingLeaders.get(
      [recommendation.cohort_id, measure, statistic, recommendation.point_id].join('\0'),
    );
    const recommendationKey = [
      recommendation.cohort_id,
      recommendation.objective,
      recommendation.point_id,
    ].join('\0');
    if (
      recommendationKeys.has(recommendationKey) ||
      recommendation.objective !== 'min-p99-latency' ||
      !cohort ||
      ['routing', 'dispatch-precision', 'combine-precision', 'precision-pair'].includes(
        cohort.kind,
      ) ||
      cohort.publication_tier !== 'official' ||
      !cohort.eligibility.decision_grade ||
      !sameValue(recommendation.eligibility, cohort.eligibility) ||
      !cohort.series_ids.includes(recommendation.series_id) ||
      points.get(recommendation.point_id)?.series.series_id !== recommendation.series_id ||
      declaredWinner?.series_id !== recommendation.series_id ||
      declaredWinner.value !== recommendation.value ||
      declaredWinner.unit !== recommendation.unit
    ) {
      throw new CollectiveXDataError(
        `recommendation ${recommendation.recommendation_id} has invalid publication links.`,
      );
    }
    recommendationKeys.add(recommendationKey);
  }
  if (!sameIds([...recommendationKeys], expectedRecommendationKeys)) {
    throw new CollectiveXDataError('recommendations do not cover every actionable ranking.');
  }

  const sensitivityKeys = new Set<string>();
  for (const sensitivity of dataset.sensitivities) {
    const cohort = cohorts.get(sensitivity.cohort_id);
    const expectedObjective = sensitivity.metric.measure === 'latency_us' ? 'min' : 'max';
    const sensitivityKey = [
      sensitivity.cohort_id,
      sensitivity.baseline_series_id,
      sensitivity.candidate_series_id,
      sensitivity.metric.operation,
      sensitivity.metric.phase,
      sensitivity.metric.tokens_per_rank,
      sensitivity.metric.measure,
      sensitivity.metric.statistic,
      sensitivity.metric.objective,
    ].join('\0');
    if (
      sensitivityKeys.has(sensitivityKey) ||
      !cohort ||
      !['routing', 'dispatch-precision', 'combine-precision'].includes(cohort.kind) ||
      !cohort.eligibility.decision_grade ||
      sensitivity.publication_tier !== cohort.publication_tier ||
      !sameValue(sensitivity.eligibility, cohort.eligibility) ||
      sensitivity.metric.objective !== expectedObjective ||
      sensitivity.baseline_series_id === sensitivity.candidate_series_id ||
      !cohort.series_ids.includes(sensitivity.baseline_series_id) ||
      !cohort.series_ids.includes(sensitivity.candidate_series_id) ||
      ![sensitivity.baseline_series_id, sensitivity.candidate_series_id].every((seriesId) => {
        const owner = series.get(seriesId);
        return (
          owner?.phase === sensitivity.metric.phase &&
          owner.points.some((point) => point.tokens_per_rank === sensitivity.metric.tokens_per_rank)
        );
      })
    ) {
      throw new CollectiveXDataError(
        `sensitivity ${sensitivity.sensitivity_id} has invalid publication links.`,
      );
    }
    sensitivityKeys.add(sensitivityKey);
  }
  if (
    dataset.promotion.status === 'quarantined' &&
    [
      dataset.source_bundle_ids,
      dataset.promotion.allocation_ids,
      dataset.coverage,
      dataset.attempts,
      dataset.series,
      dataset.cohorts,
      dataset.rankings,
      dataset.recommendations,
      dataset.sensitivities,
    ].some((items) => items.length > 0)
  ) {
    throw new CollectiveXDataError('quarantined dataset exposes publication evidence.');
  }
  if (
    dataset.promotion.status === 'promoted' &&
    (dataset.rankings.length === 0 || dataset.recommendations.length === 0)
  ) {
    throw new CollectiveXDataError('promoted dataset lacks a complete decision graph.');
  }
}

export function parseCollectiveXDataset(value: unknown): CollectiveXDataset {
  const parsed = collectiveXDatasetSchema.safeParse(value);
  if (!parsed.success) throw schemaError(parsed.error);
  validateDatasetReferences(parsed.data);
  return parsed.data;
}

async function responseOrThrow(url: string, options: RequestInit, name: string): Promise<Response> {
  const response = await fetch(url, options);
  if (response.ok) return response;
  if (response.status === 503) {
    throw new CollectiveXDataError('source-unavailable', 'source-unavailable');
  }
  if (
    name === 'channel' &&
    response.status === 404 &&
    response.headers.get('x-collectivex-status') === 'channel-unavailable'
  ) {
    throw new CollectiveXDataError('channel-unavailable', 'channel-unavailable');
  }
  throw new CollectiveXDataError(`${name} request failed (${response.status}).`);
}

export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return bytesToHex(new Uint8Array(digest));
  }
  return bytesToHex(sha256(bytes));
}

export async function fetchCollectiveXPublication(
  channelName: CollectiveXChannelName = 'dev-latest',
  signal?: AbortSignal,
  version: CollectiveXVersion = 'v1',
): Promise<CollectiveXResolvedDataset> {
  const channelResponse = await responseOrThrow(
    collectiveXChannelUrl(channelName, version),
    { cache: 'no-store', credentials: 'same-origin', signal },
    'channel',
  );
  const channel = parseCollectiveXChannel(strictJson(await channelResponse.text(), 'channel'));
  if (channel.channel !== channelName) {
    throw new CollectiveXDataError('channel name does not match its path.');
  }

  const datasetResponse = await responseOrThrow(
    `${collectiveXPublicRoot(version)}${channel.dataset.path}`,
    { cache: 'force-cache', credentials: 'same-origin', signal },
    'dataset',
  );
  const bytes = new Uint8Array(await datasetResponse.arrayBuffer());
  if (bytes.byteLength !== channel.dataset.bytes) {
    throw new CollectiveXDataError('dataset byte count does not match the channel pointer.');
  }
  const digest = await sha256Hex(bytes);
  if (digest !== channel.dataset.sha256) {
    throw new CollectiveXDataError('dataset SHA-256 does not match the channel pointer.');
  }

  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new CollectiveXDataError('dataset is not valid UTF-8 JSON.');
  }
  const dataset = parseCollectiveXDataset(strictJson(text, 'dataset'));
  if (dataset.generated_at !== channel.generated_at) {
    throw new CollectiveXDataError('dataset timestamp does not match the channel pointer.');
  }
  if (channelName === 'dev-latest' && dataset.promotion.status !== 'promoted') {
    throw new CollectiveXDataError('dev-latest does not reference a promoted dataset.');
  }
  return { channel, dataset, digest };
}
