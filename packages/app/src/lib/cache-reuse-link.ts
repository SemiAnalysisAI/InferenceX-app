import { DB_MODEL_TO_DISPLAY } from '@semianalysisai/inferencex-constants';

import { cacheReuseRecipeKey } from '@/components/calculator/cache-reuse';
import type { PointMeta } from '@/hooks/api/use-trace-server-metrics';
import type { AggDataEntry } from '@/components/inference/types';
import { getHardwareKey } from '@/lib/chart-utils';
import { PRECISION_OPTIONS, Sequence } from '@/lib/data-mappings';
import { localePath, type Locale } from '@/lib/i18n';
import { withChartState } from '@/lib/url-state';

/**
 * In-app href for the Prefix Cache Reuse tab from an agentic chart or point.
 *
 * From the chart, the current filters ride along through `withChartState` so
 * the tab opens on the same model, scenario, and precisions. From a point
 * detail page the reader may have landed cold (no in-memory chart state), so
 * the point's own model, precision, and configuration are written explicitly;
 * they win over whatever the store still holds because `URLSearchParams.set`
 * replaces. The precision must be pinned to one value: with several selected,
 * the tab keys its groups as `hwKey__precision` and a bare `c_cfg` would miss.
 */
export function cacheReuseHref(
  locale: Locale,
  point?: PointMeta,
  run?: { date: string; id: string },
): string {
  const href = withChartState(localePath('/cache-reuse', locale));
  if (!point && !run) return href;
  const [path, search = ''] = href.split('?');
  const params = new URLSearchParams(search);
  if (run) {
    params.set('g_rundate', run.date);
    if (run.id) params.set('g_runid', run.id);
    else params.delete('g_runid');
  }
  if (!point) return `${path}?${params.toString()}`;
  const model = DB_MODEL_TO_DISPLAY[point.model];
  if (model) params.set('g_model', model);
  params.set('i_seq', Sequence.AgenticTraces);
  if ((PRECISION_OPTIONS as readonly string[]).includes(point.precision)) {
    params.set('i_prec', point.precision);
  }
  params.set('c_cfg', pointHardwareKey(point));
  params.set('c_recipe', cacheReuseRecipeKey(point));
  params.set('g_rundate', point.date);
  const runId = point.run_url?.match(/\/actions\/runs\/(?<runId>[1-9]\d*)(?:\/|$)/u)?.groups?.runId;
  if (runId) params.set('g_runid', runId);
  else params.delete('g_runid');
  return `${path}?${params.toString()}`;
}

/** The chart-series key of a point, as the calculator groups it. */
export function pointHardwareKey(point: PointMeta): string {
  return getHardwareKey({
    hw: point.hardware,
    framework: point.framework,
    disagg: point.disagg,
    benchmark_type: point.benchmark_type,
    spec_decoding: point.spec_method,
  } as unknown as AggDataEntry);
}
