import { gunzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import type { ChartSeries } from './compute-chart-series';
import { prepareTraceReplay } from './trace-replay-ingest';

const KEY = Buffer.from('test-key');

function kvSeries(endpointUrl: string, mode: string, value: number) {
  return {
    endpoint_url: endpointUrl,
    labels: { disaggregation_mode: mode },
    timeslices: [
      { start_ns: 0, end_ns: 1e9, avg: value },
      { start_ns: 1e9, end_ns: 2e9, avg: value },
    ],
  };
}

describe('prepareTraceReplay endpoint redaction', () => {
  it('stores distinct tags for same-port exporters on different hosts', async () => {
    const metrics = {
      metrics: {
        trtllm_kv_cache_utilization: {
          series: [
            kvSeries('http://10.3.10.34:9405/metrics', 'prefill', 0.2),
            kvSeries('http://10.3.10.35:9405/metrics', 'decode', 0.6),
          ],
        },
      },
    };

    const prepared = await prepareTraceReplay(
      null,
      null,
      Buffer.from(JSON.stringify(metrics)),
      { framework: 'dynamo-trt', disagg: true },
      KEY,
    );

    const seriesJson = prepared.chartSeriesJson!.toString('utf8');
    const summaryJson = gunzipSync(prepared.chartSeriesSummaryGz!).toString('utf8');
    const series = JSON.parse(seriesJson) as ChartSeries;
    expect(series.metricSources.map(({ source }) => [source.role, source.endpointUrl])).toEqual([
      ['prefill', 'http://***REDACTED-51671e***:9405/metrics'],
      ['decode', 'http://***REDACTED-050a41***:9405/metrics'],
    ]);
    expect(series.metricSources.map(({ source }) => source.id)).toEqual([
      'trtllm|prefill|http://***REDACTED-51671e***:9405/metrics',
      'trtllm|decode|http://***REDACTED-050a41***:9405/metrics',
    ]);
    expect(JSON.parse(summaryJson).metricSources).toEqual(
      series.metricSources.map(({ source }) => ({ source })),
    );
    expect(seriesJson).not.toContain('10.3.10.');
    expect(summaryJson).not.toContain('10.3.10.');
  });
});
