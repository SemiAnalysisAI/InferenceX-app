import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync, inflateSync } from 'node:zlib';

import { processRedactionKey } from './log-redaction';
import { prepareTraceReplay, type PreparedTraceReplay } from './trace-replay-ingest';
import { TraceReplayWorkerPool } from './trace-replay-worker-pool';

const [profileExportJsonl, serverMetricsCsv, serverMetricsJson] = process.argv.slice(2);
if (!profileExportJsonl || !serverMetricsCsv || !serverMetricsJson) {
  throw new Error('profile, csv, and metrics paths are required');
}

function sha256(buffer: Buffer | null): string | null {
  return buffer ? createHash('sha256').update(buffer).digest('hex') : null;
}

function fingerprint(prepared: PreparedTraceReplay) {
  return {
    profileGz: sha256(prepared.profileGz),
    profileRaw: prepared.profileGz ? sha256(gunzipSync(prepared.profileGz)) : null,
    profileSize: prepared.profileSize,
    serverMetricsCsv: sha256(prepared.serverMetricsCsv),
    serverMetricsCsvSize: prepared.serverMetricsCsvSize,
    serverMetricsJsonGz: sha256(prepared.serverMetricsJsonGz),
    serverMetricsJsonRaw: prepared.serverMetricsJsonGz
      ? sha256(gunzipSync(prepared.serverMetricsJsonGz))
      : null,
    serverMetricsJsonSize: prepared.serverMetricsJsonSize,
    aggregateStatsJson: sha256(prepared.aggregateStatsJson),
    sequenceLengthSketchesRaw: prepared.sequenceLengthSketches
      ? sha256(inflateSync(prepared.sequenceLengthSketches))
      : null,
    chartSeriesJson: sha256(prepared.chartSeriesJson),
    chartSeriesSummaryRaw: prepared.chartSeriesSummaryGz
      ? sha256(gunzipSync(prepared.chartSeriesSummaryGz))
      : null,
    requestTimelineGz: sha256(prepared.requestTimelineGz),
    requestTimelineRaw: prepared.requestTimelineGz
      ? sha256(gunzipSync(prepared.requestTimelineGz))
      : null,
    requestChartDataRaw: prepared.requestChartDataGz
      ? sha256(gunzipSync(prepared.requestChartDataGz))
      : null,
    chartWindows: prepared.chartWindows,
    timelineRequests: prepared.timelineRequests,
    cacheHitRates: prepared.cacheHitRates,
    fullResponseMetrics: prepared.fullResponseMetrics,
  };
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function waitUntil(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 10 * 60_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for worker consumers');
    await delay(10);
  }
}

const pool = new TraceReplayWorkerPool(2, 1);
const job = {
  profileExportJsonl,
  serverMetricsCsv,
  serverMetricsJson,
  metricsContext: {},
  redactionKey: processRedactionKey,
};
let consumers = 0;
let release!: () => void;
const gate = new Promise<void>((resolve) => {
  release = resolve;
});

try {
  const direct = fingerprint(
    await prepareTraceReplay(
      profileExportJsonl,
      serverMetricsCsv,
      serverMetricsJson,
      {},
      processRedactionKey,
    ),
  );
  const tasks = Array.from({ length: 5 }, () =>
    pool.run(job, async (prepared) => {
      consumers += 1;
      await gate;
      return fingerprint(prepared);
    }),
  );
  await waitUntil(() => consumers === 3);
  await delay(50);
  const consumersBeforeRelease = consumers;
  release();
  const results = await Promise.all(tasks);

  let rejectedMissingInput = false;
  try {
    await pool.run(
      { ...job, profileExportJsonl: join(tmpdir(), 'missing-trace-worker-profile.jsonl') },
      () => Promise.resolve(undefined),
    );
  } catch {
    rejectedMissingInput = true;
  }
  const consumeError = await pool
    .run(job, () => Promise.reject(new Error('persist failed')))
    .then(
      () => null,
      (error: Error) => error.message,
    );
  const recoveredTimelineRequests = await pool.run(job, (prepared) =>
    Promise.resolve(prepared.timelineRequests),
  );

  console.log(
    JSON.stringify({
      consumersBeforeRelease,
      totalConsumers: consumers,
      direct,
      results,
      rejectedMissingInput,
      consumeError,
      recoveredTimelineRequests,
    }),
  );
} finally {
  await pool.close();
}
