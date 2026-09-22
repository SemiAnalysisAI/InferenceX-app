/**
 * Filesystem discovery for `gpu_metrics_<suffix>` artifacts.
 *
 * Layout uploaded by the producer (`benchmark-tmpl.yml` "Upload GPU metrics"):
 *   gpu_metrics.csv                         fixed-sequence jobs
 *   results/gpu_metrics.csv                 AgentX jobs (per-concurrency)
 *   results/gpu_metrics*.csv                multinode staging, one CSV per node
 *   gpu_metrics*_context.json               collector context (timestamp zone …)
 *   gpu_metrics_identity.{json,csv}         SKU / UUID / driver per GPU
 *   gpu_metrics_energy_{start,end}.csv      amd-smi energy counters
 *
 * Multinode jobs (`benchmark-multinode-tmpl.yml`) upload no `gpu_metrics_`
 * artifact; their telemetry travels inside `power_audit_<suffix>`:
 *   LOGS/power/samples.csv                  deployment-wide DCGM power, one row per (host, GPU, s)
 *   LOGS/power/manifest.json                producer, source metric, cadence
 * Single-node jobs upload a `power_audit_` bundle too, so it only stands in
 * for a point when no `gpu_metrics_<suffix>` sibling exists.
 *
 * `eval_gpu_metrics_<suffix>` (eval-only jobs) is deliberately ignored: those
 * jobs produce no benchmark point to attach the telemetry to.
 */

import fs from 'node:fs';
import path from 'node:path';

import { isMultinodePowerSamplesPath } from './multinode-power-samples.js';

export const GPU_METRICS_ARTIFACT_PREFIX = 'gpu_metrics_';
export const POWER_AUDIT_ARTIFACT_PREFIX = 'power_audit_';

export interface GpuMetricsArtifact {
  artifactName: string;
  artifactDir: string;
}

export interface GpuMetricsCsvFile {
  /** POSIX-style path relative to the artifact root. */
  fileName: string;
  path: string;
}

export interface GpuMetricsSidecars {
  context: Record<string, unknown> | null;
  /** Original per-window audit documents, keyed by their source filename. */
  validations?: Record<string, Record<string, unknown>>;
  /** Expected stored files and deduplicated row counts from this one artifact. */
  seriesInventory?: { fileName: string; sampleCount: number }[];
  /** Bundle manifest when the preferred CSV has its own collector context. */
  powerManifest?: Record<string, unknown> | null;
  identity: unknown | null;
  energyStart: Record<string, number> | null;
  energyEnd: Record<string, number> | null;
}

/** Return the shared suffix that pairs a telemetry artifact with bmk[_agentic]_<suffix>. */
export function gpuMetricsArtifactSuffix(artifactName: string): string | null {
  for (const prefix of [GPU_METRICS_ARTIFACT_PREFIX, POWER_AUDIT_ARTIFACT_PREFIX]) {
    if (artifactName.startsWith(prefix)) return artifactName.slice(prefix.length);
  }
  return null;
}

/** The nvidia-smi/amd-smi CSV carries clocks, utilization and temperature; the power bundle only power. */
export function isPowerAuditArtifact(artifactName: string): boolean {
  return artifactName.startsWith(POWER_AUDIT_ARTIFACT_PREFIX);
}

function isGpuMetricsCsvName(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  if (!lower.startsWith('gpu_metrics') || !lower.endsWith('.csv')) return false;
  // Sidecars share the prefix but are not time series.
  return !lower.includes('_identity') && !lower.includes('_energy_');
}

/** Recursively list every telemetry CSV under an extracted artifact root. */
export function listGpuMetricsCsvFiles(root: string): GpuMetricsCsvFile[] {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return [];
  const files: GpuMetricsCsvFile[] = [];
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const pathname = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(pathname);
      else if (entry.isFile() && isGpuMetricsCsvName(entry.name)) {
        files.push({
          fileName: path.relative(root, pathname).split(path.sep).join('/'),
          path: pathname,
        });
      }
    }
  };
  visit(root);
  return files.toSorted((a, b) => a.fileName.localeCompare(b.fileName));
}

/** Every multinode power CSV under an extracted `power_audit_` root. */
export function listMultinodePowerSampleFiles(root: string): GpuMetricsCsvFile[] {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return [];
  const files: GpuMetricsCsvFile[] = [];
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const pathname = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(pathname);
      else if (entry.isFile()) {
        const fileName = path.relative(root, pathname).split(path.sep).join('/');
        if (isMultinodePowerSamplesPath(fileName)) files.push({ fileName, path: pathname });
      }
    }
  };
  visit(root);
  return files.toSorted((a, b) => a.fileName.localeCompare(b.fileName));
}

/** The producer manifest next to `samples.csv`; null when absent or malformed. */
export function readMultinodePowerManifest(samplesPath: string): Record<string, unknown> | null {
  const parsed = readJsonIfPresent(path.join(path.dirname(samplesPath), 'manifest.json'));
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null;
}

/** Preserve window boundaries and role overrides before GitHub artifact expiry. */
export function readPowerAuditValidations(root: string): Record<string, Record<string, unknown>> {
  const validations: Record<string, Record<string, unknown>> = {};
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return validations;
  for (const name of fs.readdirSync(root).sort()) {
    if (!/^power_validation_[^/]+\.json$/u.test(name)) continue;
    const parsed = readJsonIfPresent(path.join(root, name));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      validations[name] = parsed as Record<string, unknown>;
    }
  }
  return validations;
}

function readJsonIfPresent(pathname: string): unknown | null {
  if (!fs.existsSync(pathname)) return null;
  try {
    return JSON.parse(fs.readFileSync(pathname, 'utf8')) as unknown;
  } catch {
    return null;
  }
}

/** `gpu,total_energy_consumption` two-column CSV → { "<gpu>": joules }. */
export function parseEnergyCsv(text: string): Record<string, number> | null {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length <= 1) return null;
  const out: Record<string, number> = {};
  for (const line of lines.slice(1)) {
    const [gpu, value] = line.split(',');
    const parsed = Number.parseFloat(value ?? '');
    if (gpu !== undefined && gpu !== '' && Number.isFinite(parsed)) out[gpu.trim()] = parsed;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Identity CSV (nvidia-smi) → array of column objects; JSON identity passes through. */
function readIdentity(csvDir: string): unknown | null {
  const json = readJsonIfPresent(path.join(csvDir, 'gpu_metrics_identity.json'));
  if (json !== null) return json;
  const csvPath = path.join(csvDir, 'gpu_metrics_identity.csv');
  if (!fs.existsSync(csvPath)) return null;
  const lines = fs
    .readFileSync(csvPath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length <= 1) return null;
  const header = lines[0]!.split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(',').map((c) => c.trim());
    return Object.fromEntries(header.map((key, i) => [key, cells[i] ?? '']));
  });
}

/**
 * Sidecars live next to the CSV they describe. The context file is either
 * `gpu_metrics_context.json` or `<result>_gpu_metrics_context.json`.
 */
export function readGpuMetricsSidecars(csvPath: string): GpuMetricsSidecars {
  const dir = path.dirname(csvPath);
  let context: Record<string, unknown> | null = null;
  // Match live ZIP reads even when filesystem/central-directory orders differ.
  const contextFiles = fs
    .readdirSync(dir)
    .filter(
      (entry) => entry.toLowerCase().endsWith('_context.json') && entry.includes('gpu_metrics'),
    )
    .sort();
  for (const entry of contextFiles) {
    const parsed = readJsonIfPresent(path.join(dir, entry));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      context = parsed as Record<string, unknown>;
      break;
    }
  }
  const energyStartPath = path.join(dir, 'gpu_metrics_energy_start.csv');
  const energyEndPath = path.join(dir, 'gpu_metrics_energy_end.csv');
  return {
    context,
    identity: readIdentity(dir),
    energyStart: fs.existsSync(energyStartPath)
      ? parseEnergyCsv(fs.readFileSync(energyStartPath, 'utf8'))
      : null,
    energyEnd: fs.existsSync(energyEndPath)
      ? parseEnergyCsv(fs.readFileSync(energyEndPath, 'utf8'))
      : null,
  };
}

/**
 * Collector clock offset in minutes east of UTC, from the context sidecar.
 * The producer writes `{"timestamp_timezone":"UTC"}`; anything else that is
 * not a fixed `±HH:MM` offset is treated as UTC because nvidia-smi timestamps
 * carry no zone of their own.
 */
export function contextUtcOffsetMinutes(context: Record<string, unknown> | null): number {
  const zone = context?.timestamp_timezone;
  if (typeof zone !== 'string') return 0;
  const match = /^(?<sign>[+-])(?<h>\d{2}):?(?<m>\d{2})$/u.exec(zone.trim());
  if (!match?.groups) return 0;
  const minutes = Number(match.groups.h) * 60 + Number(match.groups.m);
  return match.groups.sign === '-' ? -minutes : minutes;
}

/**
 * Index every extracted telemetry artifact by its shared suffix. A
 * `gpu_metrics_` upload wins over the `power_audit_` bundle for the same
 * suffix; the bundle only fills in for multinode jobs that have no other.
 */
export function discoverGpuMetricsArtifacts(artifactsDir: string): Map<string, GpuMetricsArtifact> {
  const discovered = new Map<string, GpuMetricsArtifact>();
  if (!fs.existsSync(artifactsDir)) return discovered;
  const names = fs
    .readdirSync(artifactsDir)
    .filter((artifactName) => fs.statSync(path.join(artifactsDir, artifactName)).isDirectory());
  for (const preferred of [false, true]) {
    for (const artifactName of names) {
      if (isPowerAuditArtifact(artifactName) !== preferred) continue;
      const suffix = gpuMetricsArtifactSuffix(artifactName);
      if (!suffix || discovered.has(suffix)) continue;
      discovered.set(suffix, { artifactName, artifactDir: path.join(artifactsDir, artifactName) });
    }
  }
  return discovered;
}
