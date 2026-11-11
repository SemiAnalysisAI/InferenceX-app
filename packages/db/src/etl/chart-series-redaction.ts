import { gzipSync } from 'node:zlib';

import { decodeChartSeriesSummary } from './chart-series-summary';
import { redactText } from './log-redaction';

interface EngineSeries {
  engineLabel: string;
}

interface SourceIdentity {
  id: string;
  endpointUrl: string | null;
  workerId: string | null;
}

/** The fields shared by `chart_series` and its summary that can name a scrape endpoint. */
export interface RedactableChartSeries {
  kvCacheUsageByEngine?: EngineSeries[];
  metricSources?: { source: SourceIdentity; kvCacheUsageByEngine?: EngineSeries[] }[];
}

/**
 * Redact endpoint addresses in source identities and engine labels in place.
 * The series are computed from raw addresses first, so grouping and ordering
 * do not change. Returns the number of values that changed.
 */
export function redactChartSeriesSources(series: RedactableChartSeries, key: Uint8Array): number {
  let changed = 0;
  const redact = (value: string): string => {
    const redacted = redactText(value, key);
    if (redacted !== value) changed++;
    return redacted;
  };
  const redactEngines = (engines: EngineSeries[] | undefined) => {
    for (const engine of engines ?? []) engine.engineLabel = redact(engine.engineLabel);
  };
  redactEngines(series.kvCacheUsageByEngine);
  for (const { source, kvCacheUsageByEngine } of series.metricSources ?? []) {
    source.id = redact(source.id);
    if (typeof source.endpointUrl === 'string') source.endpointUrl = redact(source.endpointUrl);
    if (typeof source.workerId === 'string') source.workerId = redact(source.workerId);
    redactEngines(kvCacheUsageByEngine);
  }
  return changed;
}

/** Redacted `chart_series` JSON, or null when the stored text has nothing to redact. */
export function redactChartSeriesJson(json: string, key: Uint8Array): string | null {
  const series = JSON.parse(json) as RedactableChartSeries;
  return redactChartSeriesSources(series, key) > 0 ? JSON.stringify(series) : null;
}

/** Redacted `chart_series_summary_gz`, or null when the summary has nothing to redact. */
export function redactChartSeriesSummaryGz(gz: Uint8Array, key: Uint8Array): Buffer | null {
  const summary = decodeChartSeriesSummary(gz);
  return redactChartSeriesSources(summary, key) > 0 ? gzipSync(JSON.stringify(summary)) : null;
}
