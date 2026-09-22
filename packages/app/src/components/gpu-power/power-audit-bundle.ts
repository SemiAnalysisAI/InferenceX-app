/**
 * Cuts per-config power series out of a `power_audit_<RESULT_FILENAME>` bundle.
 *
 * Slurm / Dynamo disaggregated runners do not publish one `gpu_metrics_*` CSV
 * per config. Their DCGM collector writes one bundle per concurrency sweep:
 * `LOGS/power/samples.csv` holds ~1 Hz watts for every GPU across the whole
 * sweep, `LOGS/power/manifest.json` names the devices and their worker role,
 * and one top-level `power_validation_*.json` per concurrency records the
 * validated measurement window. Each validation file becomes one
 * `GpuPowerSeries` whose `source` is that file's basename, so the timeline
 * joins it to the chart row carrying the same `power_audit.source`.
 *
 * Pure: the route hands over the extracted entry texts; nothing here reads
 * the network or the zip.
 */
import { parseNvidiaTimestamp } from '@semianalysisai/inferencex-db/etl/gpu-metrics-csv';

import {
  bucketPowerSeries,
  parseTelemetryTimestampUtc,
  type GpuPowerDevice,
  type GpuPowerRole,
  type GpuPowerSeries,
} from './power-series';
import { parseCsvData, type GpuMetricRow } from './types';

/** Seconds of telemetry kept on each side of a validated window (ramp-up / drain context). */
export const BUNDLE_WINDOW_PAD_SECONDS = 60;

export const BUNDLE_SAMPLES_ENTRY = 'LOGS/power/samples.csv';
export const BUNDLE_MANIFEST_ENTRY = 'LOGS/power/manifest.json';
/** Top-level `power_validation_<name>.json`; the `LOGS/` copies of results are not validations. */
const VALIDATION_ENTRY = /^power_validation_[^/]+\.json$/u;

/** Zip entries the route must extract for `cutPowerAuditBundle`; everything else stays compressed. */
export function isPowerAuditBundleEntry(entryName: string): boolean {
  return (
    entryName === BUNDLE_SAMPLES_ENTRY ||
    entryName === BUNDLE_MANIFEST_ENTRY ||
    VALIDATION_ENTRY.test(entryName) ||
    isSmiCsv(entryName) ||
    isContextEntry(entryName)
  );
}

function isSmiCsv(name: string): boolean {
  return /(?:^|\/)gpu_metrics[^/]*\.csv$/u.test(name) && !/_(?:identity|energy_)/u.test(name);
}

function isContextEntry(entryName: string): boolean {
  const name = basename(entryName);
  return name.includes('gpu_metrics') && name.toLowerCase().endsWith('_context.json');
}

export interface PowerAuditSample {
  /** Unix seconds. */
  time: number;
  deviceId: string;
  power: number;
}

export interface PowerAuditDevice {
  /** `<hostname>/<GPU-uuid>`, the form `power_audit.observed_gpu_ids` uses. */
  id: string;
  hostname: string;
  gpuIndex: number;
}

interface ParsedSamples {
  samples: PowerAuditSample[];
  /** Devices in first-seen order. */
  devices: Map<string, PowerAuditDevice>;
}

const SAMPLE_COLUMNS = ['timestamp_unix', 'hostname', 'gpu_index', 'gpu_uuid', 'power_w'] as const;

const NUMERIC_CELL = /^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/iu;

/** A CSV cell as a number, or NaN for anything that is not a plain numeral (`Number('')` is 0). */
function numericCell(cell: string): number {
  const text = cell.trim();
  return NUMERIC_CELL.test(text) ? Number(text) : Number.NaN;
}

function splitCsvLines(text: string): string[] {
  return text.split('\n').map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));
}

/** Header-driven parse of `samples.csv`; malformed rows are skipped. */
function parseSamples(csv: string): ParsedSamples {
  const lines = splitCsvLines(csv);
  const headerIndex = lines.findIndex((line) => line.trim().length > 0);
  const empty: ParsedSamples = { samples: [], devices: new Map() };
  if (headerIndex === -1) return empty;
  const header = lines[headerIndex].split(',').map((cell) => cell.trim());
  const columns = SAMPLE_COLUMNS.map((name) => header.indexOf(name));
  if (columns.includes(-1)) return empty;
  const [timeCol, hostCol, indexCol, uuidCol, powerCol] = columns;
  const width = Math.max(...columns) + 1;

  const samples: PowerAuditSample[] = [];
  const devices = new Map<string, PowerAuditDevice>();
  for (const line of lines.slice(headerIndex + 1)) {
    const cells = line.split(',');
    if (cells.length < width) continue;
    const time = numericCell(cells[timeCol]);
    const power = numericCell(cells[powerCol]);
    const gpuIndex = numericCell(cells[indexCol]);
    const hostname = cells[hostCol].trim();
    const uuid = cells[uuidCol].trim();
    if (
      !Number.isFinite(time) ||
      !Number.isFinite(power) ||
      !Number.isInteger(gpuIndex) ||
      hostname.length === 0 ||
      uuid.length === 0
    ) {
      continue;
    }
    const deviceId = `${hostname}/${uuid}`;
    if (!devices.has(deviceId)) devices.set(deviceId, { id: deviceId, hostname, gpuIndex });
    samples.push({ time, deviceId, power });
  }
  return { samples, devices };
}

function asRole(value: unknown): GpuPowerRole | undefined {
  return value === 'prefill' || value === 'decode' ? value : undefined;
}

function parseJsonObject(text: string | undefined): Record<string, unknown> | null {
  if (text === undefined) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function manifestSlot(hostname: string, gpuIndex: number): string {
  return `${hostname}#${gpuIndex}`;
}

/** `expected_devices[].assignments[0].worker_role`, keyed by hostname + gpu_index. */
function manifestRoles(manifest: Record<string, unknown> | null): Map<string, GpuPowerRole> {
  const roles = new Map<string, GpuPowerRole>();
  const expected = manifest?.expected_devices;
  if (!Array.isArray(expected)) return roles;
  for (const device of expected) {
    if (!isRecord(device)) continue;
    const { hostname, gpu_index: gpuIndex, assignments } = device;
    if (
      typeof hostname !== 'string' ||
      typeof gpuIndex !== 'number' ||
      !Array.isArray(assignments)
    ) {
      continue;
    }
    const first: unknown = assignments[0];
    const role = isRecord(first) ? asRole(first.worker_role) : undefined;
    if (role) roles.set(manifestSlot(hostname, gpuIndex), role);
  }
  return roles;
}

interface TimeWindow {
  start: number;
  end: number;
}

/** `selected_window`, else `benchmark_window`; `null` when neither has a finite range. */
function validationWindow(validation: Record<string, unknown>): TimeWindow | null {
  for (const key of ['selected_window', 'benchmark_window']) {
    const window = validation[key];
    if (!isRecord(window)) continue;
    const start = window.start_time_unix;
    const end = window.end_time_unix;
    if (
      typeof start === 'number' &&
      typeof end === 'number' &&
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      end >= start
    ) {
      return { start, end };
    }
  }
  return null;
}

const ROLE_ORDER: Record<GpuPowerRole, number> = { prefill: 0, decode: 1 };

function roleRank(role: GpuPowerRole | undefined): number {
  return role ? ROLE_ORDER[role] : 2;
}

function compareText(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/** Prefill, then decode, then unassigned; within a role by hostname, then gpu_index. */
function orderDevices(
  devices: readonly GpuPowerDevice[],
  byId: ReadonlyMap<string, PowerAuditDevice>,
) {
  return devices.toSorted((a, b) => {
    const rank = roleRank(a.role) - roleRank(b.role);
    if (rank !== 0) return rank;
    const deviceA = byId.get(a.id)!;
    const deviceB = byId.get(b.id)!;
    return compareText(deviceA.hostname, deviceB.hostname) || deviceA.gpuIndex - deviceB.gpuIndex;
  });
}

function basename(entryName: string): string {
  return entryName.slice(entryName.lastIndexOf('/') + 1);
}

/** Apply the adjacent collector context only to NVIDIA's unzoned wall-clock timestamps. */
export function parsePowerCsvData(
  text: string,
  context: Record<string, unknown> | null,
): GpuMetricRow[] {
  const zone = context?.timestamp_timezone;
  const offset =
    typeof zone === 'string'
      ? /^(?<sign>[+-])(?<h>\d{2}):?(?<m>\d{2})$/u.exec(zone.trim())?.groups
      : null;
  const offsetMinutes = offset
    ? (offset.sign === '-' ? -1 : 1) * (Number(offset.h) * 60 + Number(offset.m))
    : 0;
  return parseCsvData(text).map((row) => {
    if (!offsetMinutes) return row;
    const timestamp = parseNvidiaTimestamp(row.timestamp, offsetMinutes);
    return timestamp === null ? row : { ...row, timestamp: new Date(timestamp).toISOString() };
  });
}

/**
 * One series per validation file that has a window and samples within
 * `BUNDLE_WINDOW_PAD_SECONDS` of it. Rows follow `devices`, ordered prefill,
 * decode, unassigned (hostname, then gpu_index inside a role); `gpus` are the
 * row indices `0..n-1`. Roles come from the validation's `per_gpu_role`, else
 * the manifest's `expected_devices`. Malformed JSON skips that file; a
 * missing or empty `samples.csv` yields `[]`. Output is ordered by window start.
 */
export function cutPowerAuditBundle(
  artifact: string,
  files: ReadonlyMap<string, string>,
): GpuPowerSeries[] {
  const validations = new Map<string, Record<string, unknown>>();
  for (const [entryName, text] of files) {
    if (!VALIDATION_ENTRY.test(entryName)) continue;
    const validation = parseJsonObject(text);
    if (validation) validations.set(entryName, validation);
  }
  const manifest = parseJsonObject(files.get(BUNDLE_MANIFEST_ENTRY));
  const contextFiles = [...files]
    .filter(([name]) => isContextEntry(name))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const smiFiles = [...files]
    .filter(([name]) => isSmiCsv(name))
    .map(([name, text]) => {
      const directory = name.slice(0, name.lastIndexOf('/') + 1);
      let context: Record<string, unknown> | null = null;
      for (const [entry, contents] of contextFiles) {
        if (entry.slice(0, entry.lastIndexOf('/') + 1) !== directory) continue;
        context = parseJsonObject(contents);
        if (context) break;
      }
      const data = parsePowerCsvData(text, context);
      return { name, data };
    })
    .filter((file) => file.data.length > 0);
  // Ingest prefers the richer SMI CSV when the bundle carries both collectors.
  if (smiFiles.length > 0) return cutPowerAuditCsvs(artifact, smiFiles, validations, manifest);
  const samplesText = files.get(BUNDLE_SAMPLES_ENTRY);
  if (samplesText === undefined) return [];
  const { samples, devices } = parseSamples(samplesText);
  if (samples.length === 0) return [];
  return cutPowerAuditSamples(
    artifact,
    samples,
    devices,
    validations,
    parseJsonObject(files.get(BUNDLE_MANIFEST_ENTRY)),
  );
}

/** Apply bundle window cuts to the richer SMI CSVs without requiring DCGM UUID sidecars. */
export function cutPowerAuditCsvs(
  artifact: string,
  files: readonly { name: string; data: readonly GpuMetricRow[] }[],
  validations: ReadonlyMap<string, Record<string, unknown>>,
  manifest: Record<string, unknown> | null,
): GpuPowerSeries[] {
  const populated = files.filter((file) => file.data.length > 0);
  const devices = new Map<string, PowerAuditDevice>();
  const samples: PowerAuditSample[] = [];
  for (const file of populated) {
    for (const row of file.data) {
      const id = populated.length === 1 ? String(row.index) : `${file.name}/${row.index}`;
      devices.set(id, { id, hostname: file.name, gpuIndex: row.index });
      const time = parseTelemetryTimestampUtc(row.timestamp);
      if (time !== null) samples.push({ deviceId: id, time: time / 1000, power: row.power });
    }
  }
  return cutPowerAuditSamples(artifact, samples, devices, validations, manifest);
}

/** The same window/device/bucketing transform for persisted samples and artifact CSVs. */
export function cutPowerAuditSamples(
  artifact: string,
  samples: readonly PowerAuditSample[],
  devices: ReadonlyMap<string, PowerAuditDevice>,
  validations: ReadonlyMap<string, Record<string, unknown>>,
  manifest: Record<string, unknown> | null,
): GpuPowerSeries[] {
  const fallbackRoles = manifestRoles(manifest);
  const cut: { start: number; series: GpuPowerSeries }[] = [];
  for (const [entryName, validation] of validations) {
    const window = validationWindow(validation);
    if (!window) continue;

    const lo = window.start - BUNDLE_WINDOW_PAD_SECONDS;
    const hi = window.end + BUNDLE_WINDOW_PAD_SECONDS;
    const inRange = samples.filter((sample) => sample.time >= lo && sample.time <= hi);
    if (inRange.length === 0) continue;

    const explicitRoles = isRecord(validation.per_gpu_role) ? validation.per_gpu_role : {};
    const present = [...new Set(inRange.map((sample) => sample.deviceId))].map((id) => {
      const device = devices.get(id)!;
      const role =
        asRole(explicitRoles[id]) ??
        fallbackRoles.get(manifestSlot(device.hostname, device.gpuIndex));
      return role ? { id, role } : { id };
    });
    const ordered = orderDevices(present, devices);
    const rowOf = new Map(ordered.map((device, row) => [device.id, row]));

    const rows: GpuMetricRow[] = inRange.map((sample) => ({
      timestamp: String(sample.time),
      index: rowOf.get(sample.deviceId)!,
      power: sample.power,
    }));
    const series = bucketPowerSeries(artifact, rows);
    if (!series) continue;
    // The synthetic `index` is the device's position in `ordered`, so each
    // bucketed row maps back to its device; `gpus` becomes plain row indices.
    cut.push({
      start: window.start,
      series: {
        ...series,
        artifact,
        source: basename(entryName),
        gpus: series.gpus.map((_, row) => row),
        devices: series.gpus.map((row) => ordered[row]),
      },
    });
  }
  return cut
    .toSorted((a, b) => a.start - b.start || compareText(a.series.source!, b.series.source!))
    .map((entry) => entry.series);
}
