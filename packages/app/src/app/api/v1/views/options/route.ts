import {
  validateParams as validateViewParams,
  CALCULATOR_DEFAULT_TARGET,
  CALCULATOR_MODE_VALUES,
  COST_PROVIDER_VALUES,
  COST_TYPE_VALUES,
  DEFAULT_COST_PROVIDER,
  DEFAULT_COST_TYPE,
  DEPLOYMENT_MODES,
  resolveModelParam,
  SPEC_MODES,
  VENDOR_VALUES,
} from '@/lib/views-api/params';
import { VIEW_QUERY_PARAMS } from '@/lib/views-api/registry';
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
import { LIFECYCLE_DEFAULTS, LIFECYCLE_METRICS } from '@/components/calculator/lifecycle';
import { FRAMEWORK_FAMILIES } from '@/components/inference/utils/quickFilters';
import { DEFAULT_RELIABILITY_RANGE, RELIABILITY_RANGES } from '@/components/reliability/aggregate';
import { cachedJson } from '@/lib/api-cache';
import { scenarioSegmentForSequence } from '@/lib/compare-scenario-route';
import { COMPARE_MODEL_SLUGS } from '@/lib/compare-slug';
import {
  getModelCategory,
  getSequenceLabel,
  isSequenceDeprecated,
  Model,
  MODEL_OPTIONS,
  PERCENTILE_OPTIONS,
  PRECISION_OPTIONS,
  Sequence,
  SEQUENCE_OPTIONS,
  sequenceKind,
} from '@/lib/data-mappings';
import { frameworkFamily } from '@/lib/framework-family';
import {
  OVERVIEW_ENGINE_SCOPES,
  OVERVIEW_HARDWARE,
  OVERVIEW_HISTORY_WINDOWS,
  OVERVIEW_SCENARIOS,
  OVERVIEW_TIERS,
} from '@/lib/overview-data';
import { runViewsRoute, ViewsApiParamError } from '@/lib/views-api/errors';

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

/** Fleet-lifecycle defaults as the views expose them (cache ratio as a percent). */
const lifecycleDefaults = {
  rampMonths: LIFECYCLE_DEFAULTS.rampMonths,
  cachedInputPricePercent: LIFECYCLE_DEFAULTS.cachedInputPct,
  mtbiDays: LIFECYCLE_DEFAULTS.mtbiDays,
  recoveryHours: LIFECYCLE_DEFAULTS.recoveryHours,
};

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
    costPerHour: { h: entry.costh, r: entry.costr },
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
      vendors: VENDOR_VALUES,
      frameworkFamilies: FRAMEWORK_FAMILIES.map((family) => family.key),
      deployments: DEPLOYMENT_MODES,
      specModes: SPEC_MODES,
    },
    reliabilityRanges: RELIABILITY_RANGES,
    overview: {
      tiers: OVERVIEW_TIERS,
      hardware: OVERVIEW_HARDWARE,
      engines: OVERVIEW_ENGINE_SCOPES,
      windows: ['hardware', ...OVERVIEW_HISTORY_WINDOWS],
      scenarios: OVERVIEW_SCENARIOS,
    },
    calculator: {
      modes: CALCULATOR_MODE_VALUES,
      costProviders: COST_PROVIDER_VALUES,
      costTypes: COST_TYPE_VALUES,
      defaults: {
        target: CALCULATOR_DEFAULT_TARGET,
        mode: CALCULATOR_MODE_VALUES[0],
        costProvider: DEFAULT_COST_PROVIDER,
        costType: DEFAULT_COST_TYPE,
        ...lifecycleDefaults,
      },
    },
    fleet: {
      metrics: LIFECYCLE_METRICS,
      defaults: lifecycleDefaults,
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
      target: CALCULATOR_DEFAULT_TARGET,
      optimal: true,
      best: 'model-and-sequence-dependent',
      reliabilityRange: DEFAULT_RELIABILITY_RANGE,
    },
  };
}

export function GET(request: NextRequest) {
  return runViewsRoute('options', () => {
    validateViewParams(request.nextUrl.searchParams, VIEW_QUERY_PARAMS['options']);
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
