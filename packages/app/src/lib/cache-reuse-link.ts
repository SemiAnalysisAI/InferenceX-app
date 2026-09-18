import { DB_MODEL_TO_DISPLAY } from '@semianalysisai/inferencex-constants';

import type { PointMeta } from '@/hooks/api/use-trace-server-metrics';
import type { AggDataEntry } from '@/components/inference/types';
import { getHardwareKey } from '@/lib/chart-utils';
import { Sequence } from '@/lib/data-mappings';
import { localePath, type Locale } from '@/lib/i18n';
import { withChartState } from '@/lib/url-state';

/**
 * In-app href for the Prefix Cache Reuse tab from an agentic chart or point.
 *
 * From the chart, the current filters ride along through `withChartState` so
 * the tab opens on the same model, scenario, and precisions. From a point
 * detail page the reader may have landed cold (no in-memory chart state), so
 * the point's own model and configuration are written explicitly; they win
 * over whatever the store still holds because `URLSearchParams.set` replaces.
 */
export function cacheReuseHref(locale: Locale, point?: PointMeta): string {
  const href = withChartState(localePath('/cache-reuse', locale));
  if (!point) return href;
  const [path, search = ''] = href.split('?');
  const params = new URLSearchParams(search);
  const model = DB_MODEL_TO_DISPLAY[point.model];
  if (model) params.set('g_model', model);
  params.set('i_seq', Sequence.AgenticTraces);
  params.set('c_cfg', pointHardwareKey(point));
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
