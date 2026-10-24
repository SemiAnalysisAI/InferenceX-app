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
 * the network or the zip. The window cut itself lives in the db package
 * (`power-series/power-audit-cut.ts`) so ingest precomputes identical series.
 */
import { parseNvidiaTimestamp } from '@semianalysisai/inferencex-db/etl/gpu-metrics-csv';
import { normalizePowerAuditValidations } from '@semianalysisai/inferencex-db/etl/power-audit-validations';
import {
  BUNDLE_MANIFEST_ENTRY,
  BUNDLE_SAMPLES_ENTRY,
  compareText,
  cutPowerAuditCsvs,
  cutPowerAuditSamples,
  isContextEntry,
  isSmiCsv,
  parseJsonObject,
  parseSamples,
} from '@semianalysisai/inferencex-db/power-series/power-audit-cut';
import type { GpuPowerSeries } from '@semianalysisai/inferencex-db/power-series/power-series';

import { parseCsvData, type GpuMetricRow } from './types';

export {
  BUNDLE_MANIFEST_ENTRY,
  BUNDLE_SAMPLES_ENTRY,
  BUNDLE_WINDOW_PAD_SECONDS,
  cutPowerAuditCsvs,
  cutPowerAuditSamples,
  isPowerAuditBundleEntry,
  isRecord,
  type PowerAuditDevice,
  type PowerAuditSample,
} from '@semianalysisai/inferencex-db/power-series/power-audit-cut';

/**
 * Normalize NVIDIA's unzoned wall-clock timestamps to ISO UTC, matching the ingest
 * parser: the adjacent collector context supplies the offset and missing or UTC
 * context means zero. Live and stored reads then agree, so a run does not shift by
 * the browser timezone before ingest. ISO and AMD timestamps pass through unchanged.
 */
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
  const validations = normalizePowerAuditValidations(artifact, files);
  const manifest = parseJsonObject(files.get(BUNDLE_MANIFEST_ENTRY));
  const contextFiles = [...files]
    .filter(([name]) => isContextEntry(name))
    .sort(([a], [b]) => compareText(a, b));
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
  return cutPowerAuditSamples(artifact, samples, devices, validations, manifest);
}
