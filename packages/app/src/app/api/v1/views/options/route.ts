import {
  FW_REGISTRY,
  getModelReleaseDate,
  HW_REGISTRY,
  sequenceToIslOsl,
  SPEC_METHOD_KEYS,
} from '@semianalysisai/inferencex-constants';

import type { NextRequest } from 'next/server';

import { X_AXIS_MODES } from '@/components/inference/hooks/chart-data-core';
import {
  DEFAULT_METRIC_CONFIG_KEY,
  METRIC_CONTROL_GROUPS,
  METRIC_REGISTRY,
  type MetricKey,
} from '@/components/inference/metric-registry';
import { FRAMEWORK_FAMILIES } from '@/components/inference/utils/quickFilters';
import { DEFAULT_RELIABILITY_RANGE, RELIABILITY_RANGES } from '@/components/reliability/aggregate';
import { cachedJson } from '@/lib/api-cache';
import { COMPARE_MODEL_SLUGS } from '@/lib/compare-slug';
import { scenarioSegmentForSequence } from '@/lib/compare-scenario-route';
import { frameworkFamily } from '@/lib/framework-family';
import {
  getModelCategory,
  getSequenceLabel,
  isSequenceDeprecated,
  Model,
  MODEL_OPTIONS,
  PERCENTILE_OPTIONS,
  PRECISION_OPTIONS,
  sequenceKind,
  Sequence,
  SEQUENCE_OPTIONS,
} from '@/lib/data-mappings';
import { runViewsRoute, ViewsApiParamError } from '@/lib/views-api/errors';
import { resolveModelParam } from '@/lib/views-api/params';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/views/options
 *
 * Static discovery endpoint for the views API: every option domain the other
 * `/api/v1/views/*` endpoints accept, straight from the same registries the
 * dashboard renders its controls from. No database access, JSON only.
 */

/** Trailing parenthesized unit from a registry label, e.g. `(tok/s/gpu)`. */
function unitFromLabel(label: string): string | null {
  const match = /\((?<unit>[^()]+)\)\s*$/u.exec(label);
  return match?.groups?.unit ?? null;
}

const COMPARE_SLUG_BY_DISPLAY = new Map(
  COMPARE_MODEL_SLUGS.map((entry) => [entry.displayName, entry.slug]),
);

const METRIC_GROUP_BY_CONFIG_KEY = new Map<string, string>();
for (const group of METRIC_CONTROL_GROUPS) {
  for (const configKey of group.metrics) {
    METRIC_GROUP_BY_CONFIG_KEY.set(configKey, group.label);
  }
}

function buildOptionsPayload() {
  const models = MODEL_OPTIONS.map((model) => {
    const { dbModelKeys } = resolveModelParam(model);
    return {
      name: model as string,
      dbKeys: dbModelKeys,
      category: getModelCategory(model),
      releaseDate: getModelReleaseDate(model),
      compareSlug: COMPARE_SLUG_BY_DISPLAY.get(model) ?? null,
    };
  });

  const sequences = SEQUENCE_OPTIONS.map((sequence) => {
    const islOsl = sequenceToIslOsl(sequence);
    return {
      key: sequence as string,
      label: getSequenceLabel(sequence),
      labelZh: getSequenceLabel(sequence, 'zh'),
      urlSegment: scenarioSegmentForSequence(sequence),
      isl: islOsl?.isl ?? null,
      osl: islOsl?.osl ?? null,
      kind: sequenceKind(sequence),
      deprecated: isSequenceDeprecated(sequence),
    };
  });

  const hardware = Object.entries(HW_REGISTRY).map(([key, entry]) => ({
    key,
    label: entry.label,
    vendor: entry.vendor,
    arch: entry.arch,
    tdpW: entry.tdp,
    costPerHour: { h: entry.costh, n: entry.costn, r: entry.costr },
  }));

  const frameworks = Object.entries(FW_REGISTRY).map(([key, entry]) => ({
    key,
    label: entry.label,
    family: frameworkFamily(key) ?? null,
  }));

  const metrics = (Object.keys(METRIC_REGISTRY) as MetricKey[]).map((key) => {
    const entry = METRIC_REGISTRY[key];
    const configKey = `y_${key}`;
    return {
      key,
      configKey,
      label: entry.label,
      labelZh: entry.labelZh,
      unit: unitFromLabel(entry.label),
      polarity: 'polarity' in entry ? entry.polarity : null,
      group: METRIC_GROUP_BY_CONFIG_KEY.get(configKey) ?? null,
      source: 'source' in entry ? entry.source : 'benchmark',
    };
  });

  return {
    models,
    sequences,
    precisions: PRECISION_OPTIONS,
    hardware,
    frameworks,
    specMethods: [...SPEC_METHOD_KEYS].toSorted(),
    percentiles: PERCENTILE_OPTIONS,
    xAxisModes: X_AXIS_MODES,
    scaleModes: ['auto', 'linear', 'log'],
    metrics,
    quickFilters: {
      vendors: ['NVIDIA', 'AMD'],
      frameworkFamilies: FRAMEWORK_FAMILIES.map((family) => family.key),
      deployments: ['single-node', 'multi-node', 'disagg'],
      specModes: ['mtp', 'stp'],
    },
    reliabilityRanges: RELIABILITY_RANGES,
    overview: {
      tiers: [30, 50, 75, 100, 150, 200],
      hardware: ['b200', 'mi355x', 'b300', 'gb200', 'gb300'],
      engines: ['all', 'community'],
      windows: ['hardware', '7d', '30d', '60d', '90d'],
      scenarios: ['single_turn_8k1k', 'agentx'],
    },
    calculator: {
      modes: ['interactivity-to-throughput', 'throughput-to-interactivity'],
      costProviders: ['costh', 'costn', 'costr'],
      costTypes: ['total', 'input', 'output'],
      defaults: {
        target: 35,
        mode: 'interactivity-to-throughput',
        costProvider: 'costh',
        costType: 'total',
        rampMonths: 3,
        cachedInputPricePercent: 10,
        mtbiDays: 24,
        recoveryHours: 12,
      },
    },
    fleet: {
      metrics: ['margin', 'marginPerMw', 'revenue', 'revenuePerMw', 'cumulativeRevenue'],
      defaults: { rampMonths: 3, cachedInputPricePercent: 10, mtbiDays: 24, recoveryHours: 12 },
    },
    defaults: {
      model: Model.DeepSeek_V4_Pro as string,
      sequence: Sequence.EightK_OneK as string,
      metric: DEFAULT_METRIC_CONFIG_KEY,
      percentile: 'p90',
      xmode: 'interactivity',
      xmetric: 'p90_ttft',
      scale: 'auto',
      precisions: 'auto',
      target: 35,
      optimal: false,
      best: false,
      reliabilityRange: DEFAULT_RELIABILITY_RANGE,
    },
  };
}

export function GET(request: NextRequest) {
  return runViewsRoute('options', () => {
    const format = request.nextUrl.searchParams.get('format');
    if (format !== null && format !== 'json') {
      throw new ViewsApiParamError('format', `Unsupported format: ${format}`, ['json']);
    }

    return Promise.resolve(
      cachedJson({
        view: 'options',
        apiVersion: 'v1',
        params: { format: 'json' },
        ...buildOptionsPayload(),
      }),
    );
  });
}
