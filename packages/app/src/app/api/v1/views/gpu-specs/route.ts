import { validateParams as validateViewParams, parseFormatParam } from '@/lib/views-api/params';
import { VIEW_QUERY_PARAMS } from '@/lib/views-api/registry';
import type { NextRequest } from 'next/server';

import { cachedJson } from '@/lib/cache/api-cache';
import {
  getScaleUpDomainMemoryBwNumeric,
  getScaleUpDomainMemoryNumeric,
  GPU_CHART_METRICS,
  GPU_SPECS,
  parseNumericFromString,
  type GpuSpec,
} from '@/lib/catalog/gpu-specs';
import { csvResponse } from '@/lib/views-api/csv';
import { runViewsRoute, ViewsApiParamError } from '@/lib/views-api/errors';

export const dynamic = 'force-dynamic';

const METRIC_KEYS = GPU_CHART_METRICS.map((metric) => metric.key);

function chipKey(spec: GpuSpec): string {
  return spec.name.toLowerCase().replaceAll(/\s+/gu, '-');
}

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

    const chips = GPU_SPECS.map(buildChip);
    const metrics = GPU_CHART_METRICS.map(({ key, label, unit }) => ({ key, label, unit }));

    const ranking = metric
      ? GPU_SPECS.map((spec) => ({
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
        params: { metric: metric?.key ?? null, format },
        chips,
        metrics,
        ...(ranking ? { ranking } : {}),
      }),
    );
  });
}
