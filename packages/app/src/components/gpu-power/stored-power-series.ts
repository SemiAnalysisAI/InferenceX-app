import type { GpuMetricSeries } from '@semianalysisai/inferencex-db/queries/gpu-metrics';

import {
  cutPowerAuditSamples,
  cutPowerAuditCsvs,
  type PowerAuditDevice,
  type PowerAuditSample,
} from './power-audit-bundle';
import { bucketPowerFiles, type GpuPowerSeries } from './power-series';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export class StoredTelemetryIncompleteError extends Error {
  readonly artifact: string;

  constructor(artifact: string, reason: string) {
    super(`${artifact}: ${reason}. Re-ingest this artifact for the same run and attempt.`);
    this.name = 'StoredTelemetryIncompleteError';
    this.artifact = artifact;
  }
}

/** Compare storage against the original parsed artifact, not only surviving host rows. */
function checkSeriesInventory(artifact: string, series: readonly GpuMetricSeries[]): void {
  for (const entry of series) {
    const inventory = entry.sidecars.seriesInventory;
    if (!Array.isArray(inventory)) continue;
    for (const expected of inventory) {
      if (
        !isRecord(expected) ||
        typeof expected.fileName !== 'string' ||
        typeof expected.sampleCount !== 'number'
      )
        continue;
      const actual = series.find((candidate) => candidate.fileName === expected.fileName);
      if (!actual || actual.data.length !== expected.sampleCount) {
        throw new StoredTelemetryIncompleteError(
          artifact,
          `stored file/sample coverage is incomplete for ${expected.fileName}`,
        );
      }
    }
  }
}

/** Reconstruct only source/window evidence retained by the pre-validation ingest. */
function storedValidations(series: readonly GpuMetricSeries[]) {
  const validations = new Map<string, Record<string, unknown>>();
  for (const entry of series) {
    if (!isRecord(entry.sidecars.validations)) continue;
    for (const [name, validation] of Object.entries(entry.sidecars.validations)) {
      if (/^power_validation_[^/]+\.json$/u.test(name) && isRecord(validation)) {
        validations.set(name, validation);
      }
    }
  }
  // New ingests carry the complete original documents, including role overrides.
  // The legacy path has source + the selected serving window and manifest roles.
  if (validations.size > 0) return validations;
  for (const entry of series) {
    for (const audit of entry.powerAudits ?? []) {
      const { source, window_start_unix: start, window_end_unix: end } = audit;
      if (
        typeof source !== 'string' ||
        typeof start !== 'number' ||
        typeof end !== 'number' ||
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        end < start
      )
        continue;
      const name = source.slice(source.lastIndexOf('/') + 1);
      if (!/^power_validation_[^/]+\.json$/u.test(name)) continue;
      validations.set(name, { selected_window: { start_time_unix: start, end_time_unix: end } });
    }
  }
  return validations;
}

function storedBundle(artifact: string, series: readonly GpuMetricSeries[]): GpuPowerSeries[] {
  const validations = storedValidations(series);
  if (validations.size === 0)
    throw new StoredTelemetryIncompleteError(artifact, 'validation window provenance is missing');
  const smiFiles = series.filter((entry) => /(?:^|\/)gpu_metrics[^/]*\.csv$/u.test(entry.fileName));
  if (smiFiles.length > 0) {
    const manifest = smiFiles.find((entry) => isRecord(entry.sidecars.powerManifest))?.sidecars
      .powerManifest;
    return cutPowerAuditCsvs(
      artifact,
      smiFiles.map((entry) => ({ name: entry.fileName, data: entry.data })),
      validations,
      isRecord(manifest) ? manifest : null,
    );
  }
  const devices = new Map<string, PowerAuditDevice>();
  const samples: PowerAuditSample[] = [];
  for (const entry of series) {
    const identity = entry.sidecars.identity;
    if (!Array.isArray(identity)) continue;
    const ids = new Map<number, string>();
    for (const item of identity) {
      if (!isRecord(item)) continue;
      const { hostname, gpu_index: gpuIndex, gpu_uuid: uuid } = item;
      if (typeof hostname !== 'string' || typeof gpuIndex !== 'number' || typeof uuid !== 'string')
        continue;
      const id = `${hostname}/${uuid}`;
      ids.set(gpuIndex, id);
      devices.set(id, { id, hostname, gpuIndex });
    }
    for (const row of entry.data) {
      const deviceId = ids.get(row.index);
      if (!deviceId)
        throw new StoredTelemetryIncompleteError(
          artifact,
          `device identity is missing for ${entry.fileName} GPU ${row.index}`,
        );
      samples.push({ deviceId, time: Date.parse(row.timestamp) / 1000, power: row.power });
    }
  }
  const manifest = series.find((entry) => isRecord(entry.sidecars.context))?.sidecars.context;
  const expectedDevices = isRecord(manifest) ? manifest.expected_devices : null;
  if (Array.isArray(expectedDevices)) {
    const slots = new Set(
      [...devices.values()].map((device) => `${device.hostname}#${device.gpuIndex}`),
    );
    for (const expected of expectedDevices) {
      if (
        isRecord(expected) &&
        typeof expected.hostname === 'string' &&
        typeof expected.gpu_index === 'number' &&
        !slots.has(`${expected.hostname}#${expected.gpu_index}`)
      ) {
        throw new StoredTelemetryIncompleteError(
          artifact,
          `expected device ${expected.hostname} GPU ${expected.gpu_index} is not stored`,
        );
      }
    }
  }
  return cutPowerAuditSamples(
    artifact,
    samples,
    devices,
    validations,
    isRecord(manifest) ? manifest : null,
  );
}

/** Apply the artifact path's existing cuts and one-second means to persisted rows. */
export function storedPowerSeries(series: readonly GpuMetricSeries[]): GpuPowerSeries[] {
  const groups = new Map<string, GpuMetricSeries[]>();
  for (const entry of series) {
    const group = groups.get(entry.artifactName) ?? [];
    group.push(entry);
    groups.set(entry.artifactName, group);
  }
  return [...groups].flatMap(([artifact, entries]) => {
    checkSeriesInventory(artifact, entries);
    if (artifact.startsWith('power_audit_')) return storedBundle(artifact, entries);
    const bucketed = bucketPowerFiles(
      artifact,
      entries.map((entry) => ({ name: entry.fileName, data: entry.data })),
    );
    return bucketed ? [bucketed] : [];
  });
}
