import { DB_MODEL_TO_DISPLAY } from '@semianalysisai/inferencex-constants';

import { cacheReuseRecipeKey } from '@/components/calculator/cache-reuse';
import type { PointMeta } from '@/hooks/api/use-trace-server-metrics';
import type { AggDataEntry } from '@/components/inference/types';
import { getHardwareKey } from '@/lib/charts/chart-utils';
import { PRECISION_OPTIONS, Sequence } from '@/lib/catalog/data-mappings';
import { localePath, type Locale } from '@/lib/i18n/i18n';
import { withChartState } from '@/lib/routing/url-state';
import { getDashboardRoute } from '@/lib/routing/dashboard-routes';

export function cacheReuseHref(
  locale: Locale,
  point?: PointMeta,
  run?: { date: string; id: string },
): string {
  const href = withChartState(localePath(getDashboardRoute('cache-reuse').path, locale));
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

export function pointHardwareKey(point: PointMeta): string {
  return getHardwareKey({
    hw: point.hardware,
    framework: point.framework,
    disagg: point.disagg,
    benchmark_type: point.benchmark_type,
    spec_decoding: point.spec_method,
  } as unknown as AggDataEntry);
}
