/**
 * Parser for the multinode power producer's `LOGS/power/samples.csv`.
 *
 * `benchmark-multinode-tmpl.yml` uploads no `gpu_metrics_` artifact; its
 * telemetry travels inside `power_audit_<suffix>` as one CSV for the whole
 * deployment, written by `srt-slurm.dcgm-power` (DCGM scraped on every host
 * once per second):
 *
 *   schema_version,timestamp_unix,scrape_seq,hostname,gpu_index,gpu_uuid,power_w
 *
 * Only power is scraped, so every other `GpuMetricSample` field stays null and
 * the digest carries `powerW` alone. Rows are regrouped per host so each host
 * becomes its own series, the shape the reader already uses for multinode
 * staging ("one CSV per node"). Pure module: no I/O.
 */

import { splitCsvLine, type GpuMetricSample, type GpuMetricsVendor } from './gpu-metrics-csv.js';

export interface MultinodePowerHost {
  hostname: string;
  /** Host-local GPU indices, as DCGM reports them. */
  samples: GpuMetricSample[];
  /** gpu_index → gpu_uuid for the identity sidecar. */
  gpuUuids: Record<number, string>;
}

const REQUIRED_COLUMNS = ['timestamp_unix', 'hostname', 'gpu_index', 'power_w'] as const;

/** `samples.csv` under `LOGS/` is the producer's only time-series file. */
export function isMultinodePowerSamplesPath(relativePath: string): boolean {
  const posix = relativePath.split('\\').join('/');
  return /^LOGS\/(?:[^/]+\/)*samples\.csv$/u.test(posix);
}

function powerOnlySample(timestampMs: number, gpuIndex: number, powerW: number): GpuMetricSample {
  return {
    timestampMs,
    gpuIndex,
    powerW,
    temperatureC: null,
    smClockMhz: null,
    memClockMhz: null,
    gpuUtilPct: null,
    memUtilPct: null,
    edgeTempC: null,
    memTempC: null,
    gfxVoltageMv: null,
    socVoltageMv: null,
    memVoltageMv: null,
    fclkMhz: null,
    socclkMhz: null,
    mmActivityPct: null,
  };
}

/**
 * Group the deployment-wide CSV by host. Returns null when the header is not
 * the multinode power schema; malformed rows are skipped. Hosts sort by name
 * so series order is stable across re-ingests.
 */
export function parseMultinodePowerSamples(csvText: string): MultinodePowerHost[] | null {
  const lines = csvText
    .split('\n')
    .map((line) => line.replace(/\r$/u, ''))
    .filter((line) => line.trim().length > 0);
  if (lines.length <= 1) return null;
  const header = splitCsvLine(lines[0]!).map((cell) => cell.trim().toLowerCase());
  const column = new Map(header.map((name, index) => [name, index] as const));
  if (REQUIRED_COLUMNS.some((name) => !column.has(name))) return null;
  const at = (cells: string[], name: string): string | undefined => cells[column.get(name)!];

  const hosts = new Map<string, MultinodePowerHost>();
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line).map((cell) => cell.trim());
    const hostname = at(cells, 'hostname');
    const seconds = Number.parseFloat(at(cells, 'timestamp_unix') ?? '');
    const gpuIndex = Number.parseInt(at(cells, 'gpu_index') ?? '', 10);
    const powerW = Number.parseFloat(at(cells, 'power_w') ?? '');
    if (
      !hostname ||
      !Number.isFinite(seconds) ||
      !Number.isSafeInteger(gpuIndex) ||
      gpuIndex < 0 ||
      !Number.isFinite(powerW)
    ) {
      continue;
    }
    let host = hosts.get(hostname);
    if (!host) {
      host = { hostname, samples: [], gpuUuids: {} };
      hosts.set(hostname, host);
    }
    host.samples.push(powerOnlySample(Math.round(seconds * 1000), gpuIndex, powerW));
    const uuid = at(cells, 'gpu_uuid');
    if (uuid && !(gpuIndex in host.gpuUuids)) host.gpuUuids[gpuIndex] = uuid;
  }
  if (hosts.size === 0) return null;
  return [...hosts.values()].toSorted((a, b) => a.hostname.localeCompare(b.hostname));
}

/**
 * The producer manifest names its source metric; DCGM means NVIDIA. Anything
 * naming AMD tooling maps to 'amd', and an absent manifest defaults to NVIDIA
 * because only the DCGM producer writes this layout today.
 */
export function multinodePowerVendor(manifest: Record<string, unknown> | null): GpuMetricsVendor {
  const source = [manifest?.source_metric, manifest?.producer]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
  // `amd-smi`, `rocm_smi`: the tool name may continue with `-` or `_`.
  if (/\b(?:amd|rocm)/u.test(source)) return 'amd';
  return 'nvidia';
}
