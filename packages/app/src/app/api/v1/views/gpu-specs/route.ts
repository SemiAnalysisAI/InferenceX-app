import {
  validateParams as validateViewParams,
  parseFormatParam,
  parseListParam,
} from '@/lib/views-api/params';
import { VIEW_QUERY_PARAMS } from '@/lib/views-api/registry';
import type { NextRequest } from 'next/server';

import { cachedJson } from '@/lib/api-cache';
import { normalizeGpuValues, RADAR_METRICS } from '@/lib/gpu-specs-radar';
import {
  getScaleUpDomainMemoryBwNumeric,
  getScaleUpDomainMemoryNumeric,
  GPU_CHART_METRICS,
  GPU_SPECS,
  parseNumericFromString,
  type GpuSpec,
} from '@/lib/gpu-specs';
import { csvResponse } from '@/lib/views-api/csv';
import { runViewsRoute, ViewsApiParamError } from '@/lib/views-api/errors';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/views/gpu-specs
 *
 * Static chip specifications behind the `/gpu-specs` page (`lib/gpu-specs.ts`:
 * `GPU_SPECS`) plus the chartable metric metadata (`GPU_CHART_METRICS`).
 * No database read — the payload is compiled-in.
 *
 * Query params:
 * - metric — optional `GPU_CHART_METRICS` key (`memory`, `memoryBandwidth`,
 *            `fp4`, ...). When set, adds a `ranking` array of chips ordered
 *            by that metric (descending; chips without a value omitted).
 * - format — `json` (default) or `csv` (one flat row per chip).
 */

const METRIC_KEYS = GPU_CHART_METRICS.map((metric) => metric.key);

/** URL-safe chip key derived from the display name, e.g. `H100 SXM` → `h100-sxm`. */
function chipKey(spec: GpuSpec): string {
  return spec.name.toLowerCase().replaceAll(/\s+/gu, '-');
}

/** Raw spec fields plus the numeric projections used by the page's charts. */
function buildChip(spec: GpuSpec) {
  return {
    key: chipKey(spec),
    label: spec.name,
    ...spec,
    memoryGB: parseNumericFromString(spec.memory),
    memoryBandwidthTBs: parseNumericFromString(spec.memoryBandwidth),
    fp4Tflops: spec.fp4,
    fp8Tflops: spec.fp8,
    bf16Tflops: spec.bf16,
    scaleUpBandwidthGBs: parseNumericFromString(spec.scaleUpBandwidth),
    domainMemoryTB: getScaleUpDomainMemoryNumeric(spec),
    domainMemoryBandwidthTBs: getScaleUpDomainMemoryBwNumeric(spec),
    scaleOutBandwidthGbits: parseNumericFromString(spec.scaleOutBandwidth),
  };
}

export function GET(request: NextRequest) {
  return runViewsRoute('gpu-specs', () => {
    validateViewParams(request.nextUrl.searchParams, VIEW_QUERY_PARAMS['gpu-specs']);
    const search = request.nextUrl.searchParams;
    const format = parseFormatParam(search.get('format'));

    const metricParam = search.get('metric');
    const metric = metricParam
      ? GPU_CHART_METRICS.find((entry) => entry.key.toLowerCase() === metricParam.toLowerCase())
      : undefined;
    if (metricParam && !metric) {
      throw new ViewsApiParamError('metric', `Unknown metric: ${metricParam}`, METRIC_KEYS);
    }

    const selected = search.has('chips')
      ? parseListParam(search.get('chips'), 'chips', GPU_SPECS.map(chipKey))
      : null;
    const selectedSpecs = GPU_SPECS.filter(
      (spec) => selected === null || selected.includes(chipKey(spec)),
    );
    const chips = selectedSpecs.map(buildChip);
    const metrics = GPU_CHART_METRICS.map(({ key, label, unit }) => ({ key, label, unit }));

    const ranking = metric
      ? selectedSpecs
          .map((spec) => ({
            chip: chipKey(spec),
            label: spec.name,
            value: metric.getValue(spec),
          }))
          .filter(
            (entry): entry is { chip: string; label: string; value: number } =>
              entry.value !== null,
          )
          .toSorted((a, b) => b.value - a.value)
          .map((entry, index) => ({ ...entry, rank: index + 1 }))
      : undefined;

    if (format === 'csv') {
      const rankByChip = new Map(ranking?.map((entry) => [entry.chip, entry]));
      return Promise.resolve(
        csvResponse(
          chips.map((chip) => ({
            ...chip,
            ...(metric
              ? {
                  metric: metric.key,
                  metricValue: rankByChip.get(chip.key)?.value ?? null,
                  metricRank: rankByChip.get(chip.key)?.rank ?? null,
                }
              : {}),
          })),
        ),
      );
    }

    return Promise.resolve(
      cachedJson({
        view: 'gpu-specs',
        apiVersion: 'v1',
        params: { metric: metric?.key ?? null, format, chips: selected },
        chips,
        metrics,
        radar: {
          normalization: 'all-chips',
          metrics: RADAR_METRICS.map(({ key, label, unit }) => ({ key, label, unit })),
          series: normalizeGpuValues(GPU_SPECS)
            .filter(({ gpu }) => selected === null || selected.includes(chipKey(gpu)))
            .map(({ gpu, values }) => ({ chip: chipKey(gpu), values })),
        },
        ...(ranking ? { ranking } : {}),
      }),
    );
  });
}
