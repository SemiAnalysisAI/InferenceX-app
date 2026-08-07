import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

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
    chartSeriesJson: sha256(prepared.chartSeriesJson),
    requestTimelineJson: sha256(prepared.requestTimelineJson),
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

const pool = new TraceReplayWorkerPool(2);
const job = {
  profileExportJsonl,
  serverMetricsCsv,
  serverMetricsJson,
  metricsContext: {},
};
let consumers = 0;
let release!: () => void;
const gate = new Promise<void>((resolve) => {
  release = resolve;
});

try {
  const direct = fingerprint(
    await prepareTraceReplay(profileExportJsonl, serverMetricsCsv, serverMetricsJson),
  );
  const tasks = Array.from({ length: 3 }, () =>
    pool.run(job, async (prepared) => {
      consumers += 1;
      await gate;
      return fingerprint(prepared);
    }),
  );
  await waitUntil(() => consumers === 2);
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
      recoveredTimelineRequests,
    }),
  );
} finally {
  await pool.close();
}
