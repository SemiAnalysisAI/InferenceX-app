import { at, number, rows, text, type Bundle } from './bundle';
import type { ServingCell } from './serving';

export interface ResultsEvidence {
  workloadHash: string | null;
  manifestHash: string;
  verified: boolean;
  engine: string | null;
  mode: string | null;
  attempted: number | null;
  notStarted: number | null;
  latencies: number[] | null;
  clientP50?: number | null;
  powerValid: boolean | null;
  powerSeries: { seconds: number; watts: number }[];
  peakPowerW: number | null;
  gpuMemoryMiB: number | null;
  warmupSeconds: number | null;
  failures: Record<'timeout' | 'oom' | 'engine' | 'transport' | 'other', number> | null;
}

export function resultsEvidence(
  bundle: Pick<Bundle, 'manifestSha256' | 'documents'>,
  cell: ServingCell,
): ResultsEvidence {
  const verified = at(cell.cell, 'verified') === true;
  const measured = rows(at(cell.run, 'records')).filter((r) => at(r, 'phase') === 'measurement');
  const valid = measured.filter(
    (r) => at(r, 'status') === 'succeeded' && at(r, 'media', 'valid') === true,
  );
  const latencies = valid.map((r) => number(at(r, 'submit_to_media_seconds')));
  const completeTimes =
    verified &&
    valid.length > 0 &&
    valid.length === number(at(cell.run, 'summary', 'valid')) &&
    latencies.every((n): n is number => n !== null && n > 0);
  const phase = at(cell.power, 'phases', 'measurement');
  const sidecars = [
    bundle.documents.get(`gpu/${cell.id}/aggregate.json`),
    bundle.documents.get(`gpu/${cell.id}/benchmark_concurrency_${cell.concurrency}.json`),
  ];
  const dissent = sidecars.some(
    (s) => at(s, 'power_valid') === false || at(s, 'power_valid') === 0,
  );
  const powerValid =
    verified &&
    at(phase, 'valid') === true &&
    at(cell.power, 'valid') !== false &&
    at(cell.job, 'power', 'valid') !== false &&
    !dissent;
  const start = number(at(cell.power, 'window', 'start_unix'));
  const end = number(at(cell.power, 'window', 'end_unix'));
  const series =
    powerValid && start !== null && end !== null
      ? rows(at(cell.power, 'sample_series')).flatMap((sample) => {
          const time = number(at(sample, 'unix_seconds'));
          const watts = number(at(sample, 'aggregate_watts'));
          return at(sample, 'valid') === true &&
            time !== null &&
            time >= start &&
            time <= end &&
            watts !== null &&
            watts >= 0
            ? [{ seconds: time - start, watts }]
            : [];
        })
      : [];
  const warmups = rows(at(cell.run, 'records')).filter((r) => at(r, 'phase') === 'warmup');
  const warmupTimes = warmups.map((r) => number(at(r, 'submit_to_media_seconds')));
  const failureRecords = measured.filter(
    (r) => at(r, 'attempted') === true && at(r, 'status') !== 'succeeded',
  );
  const categories: ResultsEvidence['failures'] = {
    timeout: 0,
    oom: 0,
    engine: 0,
    transport: 0,
    other: 0,
  };
  for (const record of failureRecords) {
    const category = text(at(record, 'failure_classification')) || text(at(record, 'error_type'));
    const key =
      category === 'timeout'
        ? 'timeout'
        : category === 'oom'
          ? 'oom'
          : category === 'engine_error'
            ? 'engine'
            : category === 'transport_error'
              ? 'transport'
              : 'other';
    categories[key]++;
  }
  return {
    workloadHash: text(at(cell.run, 'plan_sha256')) || null,
    manifestHash: bundle.manifestSha256,
    verified,
    engine:
      text(at(cell.run, 'configuration', 'runtime')) ||
      text(at(cell.spec, 'baseline', 'engine')) ||
      null,
    mode:
      text(at(cell.run, 'plan', 'generation', 'mode')) ||
      text(at(cell.run, 'plan', 'mode')) ||
      null,
    attempted:
      number(at(cell.cell, 'completion', 'attempted')) ??
      (measured.length > 0 && measured.every((r) => typeof at(r, 'attempted') === 'boolean')
        ? measured.filter((r) => at(r, 'attempted') === true).length
        : null),
    notStarted: number(at(cell.run, 'summary', 'not_started')),
    latencies: completeTimes ? latencies.toSorted((a, b) => a - b) : null,
    clientP50: verified
      ? number(at(cell.run, 'serving', 'client_ready_latency_seconds', 'p50'))
      : null,
    powerValid: at(cell.power, 'valid') === null && at(phase, 'valid') === null ? null : powerValid,
    powerSeries: series,
    peakPowerW: powerValid ? number(at(phase, 'aggregate', 'observed_peak_power_w')) : null,
    gpuMemoryMiB: null,
    warmupSeconds:
      verified &&
      warmups.length > 0 &&
      warmups.every((r) => at(r, 'status') === 'succeeded') &&
      warmupTimes.every((n): n is number => n !== null && n >= 0)
        ? warmupTimes.reduce((a, b) => a + b, 0)
        : null,
    failures:
      measured.length > 0 && measured.every((r) => typeof at(r, 'attempted') === 'boolean')
        ? categories
        : null,
  };
}
