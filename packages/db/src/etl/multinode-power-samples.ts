import {
  emptySample,
  splitCsvLine,
  type GpuMetricSample,
  type GpuMetricsVendor,
} from './gpu-metrics-csv';

export interface MultinodePowerHost {
  hostname: string;
  samples: GpuMetricSample[];
  gpuUuids: Record<number, string>;
}

/** One CPU exporter socket reading; the rails are null when the source does not report them. */
export interface CpuPowerSample {
  timestampMs: number;
  socketId: number;
  powerW: number;
  cpuRailW: number | null;
  socW: number | null;
  dramW: number | null;
  moduleW: number | null;
}

export interface CpuPowerHost {
  hostname: string;
  source: string;
  samples: CpuPowerSample[];
}

const REQUIRED_COLUMNS = ['timestamp_unix', 'hostname', 'gpu_index', 'power_w'] as const;
const CPU_REQUIRED_COLUMNS = [
  'schema_version',
  'timestamp_unix',
  'hostname',
  'source',
  'socket_id',
  'power_w',
] as const;

const toPosix = (relativePath: string): string => relativePath.split('\\').join('/');

/** srt-slurm's CPU exporter writes `cpu/samples.csv` beside the GPU `samples.csv`. */
export function isCpuPowerSamplesPath(relativePath: string): boolean {
  return /^LOGS\/(?:[^/]+\/)*cpu\/samples\.csv$/u.test(toPosix(relativePath));
}

export function isMultinodePowerSamplesPath(relativePath: string): boolean {
  const posix = toPosix(relativePath);
  return /^LOGS\/(?:[^/]+\/)*samples\.csv$/u.test(posix) && !isCpuPowerSamplesPath(posix);
}

function readCsvTable(csvText: string, required: readonly string[]) {
  const lines = csvText
    .split('\n')
    .map((line) => line.replace(/\r$/u, ''))
    .filter((line) => line.trim().length > 0);
  if (lines.length <= 1) return null;
  const header = splitCsvLine(lines[0]!).map((cell) => cell.trim().toLowerCase());
  const column = new Map(header.map((name, index) => [name, index] as const));
  if (required.some((name) => !column.has(name))) return null;
  return {
    at: (cells: string[], name: string): string | undefined => cells[column.get(name)!],
    *rows(): Generator<string[]> {
      for (const line of lines.slice(1)) yield splitCsvLine(line).map((cell) => cell.trim());
    },
  };
}

export function parseMultinodePowerSamples(csvText: string): MultinodePowerHost[] | null {
  const table = readCsvTable(csvText, REQUIRED_COLUMNS);
  if (!table) return null;
  const { at } = table;
  const readInRange = (cells: string[], name: string, min: number, max: number): number | null => {
    const text = at(cells, name);
    const value = text ? Number(text) : Number.NaN;
    return Number.isFinite(value) && value < 2147483632 && value >= min && value <= max
      ? value
      : null;
  };

  const hosts = new Map<string, MultinodePowerHost>();
  for (const cells of table.rows()) {
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
    const sample = {
      ...emptySample(Math.round(seconds * 1000), gpuIndex),
      powerW,
      temperatureC: readInRange(cells, 'temperature_c', -273.15, 2147483632),
      gpuUtilPct: readInRange(cells, 'gpu_util_pct', 0, 100),
    };
    host.samples.push(sample);
    const uuid = at(cells, 'gpu_uuid');
    if (uuid && !(gpuIndex in host.gpuUuids)) host.gpuUuids[gpuIndex] = uuid;
  }
  if (hosts.size === 0) return null;
  return [...hosts.values()].toSorted((a, b) => a.hostname.localeCompare(b.hostname));
}

/**
 * Parse the wide `cpu/samples.csv` (schema v2/v3): one row per scrape, host and socket.
 * Schema v1 rows hold one rail each rather than the socket meter, so they are skipped, as
 * are rows with an invalid timestamp, socket or meter reading. The first row wins a
 * repeated (socket, timestamp).
 */
export function parseCpuPowerSamples(csvText: string): CpuPowerHost[] | null {
  const table = readCsvTable(csvText, CPU_REQUIRED_COLUMNS);
  if (!table) return null;
  const { at } = table;
  const watts = (cells: string[], name: string): number | null => {
    const text = at(cells, name);
    const value = text ? Number(text) : Number.NaN;
    return Number.isFinite(value) && value >= 0 ? value : null;
  };

  const hosts = new Map<string, CpuPowerHost>();
  const seen = new Set<string>();
  for (const cells of table.rows()) {
    const hostname = at(cells, 'hostname');
    const source = at(cells, 'source');
    const seconds = Number(at(cells, 'timestamp_unix') || Number.NaN);
    const socketId = Number(at(cells, 'socket_id') || Number.NaN);
    const powerW = watts(cells, 'power_w');
    if (
      !hostname ||
      !source ||
      !(Number(at(cells, 'schema_version')) >= 2) ||
      !Number.isFinite(seconds) ||
      !Number.isSafeInteger(socketId) ||
      socketId < 0 ||
      socketId > 32_767 ||
      powerW === null
    ) {
      continue;
    }
    const timestampMs = Math.round(seconds * 1000);
    const key = `${hostname}:${socketId}:${timestampMs}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let host = hosts.get(hostname);
    if (!host) {
      host = { hostname, source, samples: [] };
      hosts.set(hostname, host);
    }
    host.samples.push({
      timestampMs,
      socketId,
      powerW,
      cpuRailW: watts(cells, 'cpu_rail_w'),
      socW: watts(cells, 'soc_w'),
      dramW: watts(cells, 'dram_w'),
      moduleW: watts(cells, 'module_w'),
    });
  }
  if (hosts.size === 0) return null;
  return [...hosts.values()].toSorted((a, b) => a.hostname.localeCompare(b.hostname));
}

export function multinodePowerVendor(manifest: Record<string, unknown> | null): GpuMetricsVendor {
  if (manifest?.source_metric === 'gpu_power_usage') return 'amd';
  const source = [manifest?.source_metric, manifest?.producer]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
  if (/\b(?:amd|rocm)/u.test(source)) return 'amd';
  return 'nvidia';
}
