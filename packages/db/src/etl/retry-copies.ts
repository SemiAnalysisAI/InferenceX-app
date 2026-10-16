/**
 * Keep one job copy per benchmark point when a source run was re-run.
 *
 * GitHub keeps artifacts from every run attempt. A point that passed on more
 * than one attempt therefore arrives as several job copies, and the hashed
 * artifact names differ whenever the retry landed on another runner. Without
 * a choice, every copy writes the same benchmark row and links its own GPU
 * telemetry, so the stored point mixes attempts.
 *
 * The newest benchmark artifact wins. Attempts run one after another, so the
 * newest copy is the latest attempt that produced the point. Every sibling
 * artifact of an older copy (power audit, GPU telemetry, traces, server logs)
 * is removed before ingest reads the directory, so all consumers see the same
 * copy.
 */
import fs from 'node:fs';
import path from 'node:path';

import { readBenchmarkArtifacts, type BenchmarkArtifactFile } from './benchmark-artifacts.js';
import type { BenchmarkParams } from './benchmark-mapper.js';
import { configCacheKey } from './config-cache.js';
import { createSkipTracker } from './skip-tracker.js';

/** Artifact name prefixes produced by one benchmark job, longest first. */
const JOB_ARTIFACT_PREFIXES = [
  'multinode_server_logs_',
  'bmk_agentic_',
  'power_audit_',
  'gpu_metrics_',
  'server_logs_',
  'agentic_',
  'bmk_',
] as const;

const BENCHMARK_PREFIXES = ['bmk_agentic_', 'bmk_'] as const;

export interface RetryArtifactMeta {
  id?: number;
  name: string;
  created_at: string;
}

export interface SupersededCopy {
  /** Shared artifact-name suffix of the dropped job copy. */
  suffix: string;
  /** Suffix of the newer copy that replaced it. */
  keptSuffix: string;
  /** Artifact directories removed for the dropped copy. */
  removed: string[];
}

export interface RetryCopySelection {
  superseded: SupersededCopy[];
  /** Points with several copies that could not be ordered by artifact metadata. */
  unordered: string[];
}

/** Persisted point identity, using the config tuple instead of its DB id. */
export function benchmarkPointKey(row: BenchmarkParams): string {
  return JSON.stringify([
    configCacheKey(row.config),
    row.benchmarkType,
    row.isl,
    row.osl,
    row.conc,
    row.offloadMode,
    row.recipeFingerprint,
  ]);
}

/**
 * Points held by per-job `bmk_*` files. The `results_*` aggregate is a plain
 * concatenation of those files across every attempt, so its rows for these
 * points are skipped in favor of the selected per-job copy.
 */
export function perJobPointKeys(files: readonly BenchmarkArtifactFile[]): Set<string> {
  const keys = new Set<string>();
  for (const file of files) {
    if (!file.path.startsWith('bmk_')) continue;
    for (const { mapped } of file.rows) if (mapped) keys.add(benchmarkPointKey(mapped));
  }
  return keys;
}

function benchmarkSuffix(dir: string): string | null {
  const prefix = BENCHMARK_PREFIXES.find((candidate) => dir.startsWith(candidate));
  return prefix ? dir.slice(prefix.length) : null;
}

function jobSuffix(dir: string): string | null {
  const prefix = JOB_ARTIFACT_PREFIXES.find((candidate) => dir.startsWith(candidate));
  return prefix ? dir.slice(prefix.length) : null;
}

function newer(a: RetryArtifactMeta, b: RetryArtifactMeta): boolean {
  const at = Date.parse(a.created_at);
  const bt = Date.parse(b.created_at);
  return at === bt ? (a.id ?? 0) > (b.id ?? 0) : at > bt;
}

/**
 * Drop older job copies of every benchmark point found under `root`.
 * `artifacts` describes the downloaded directories (one per artifact name).
 * Copies without metadata are left in place and reported as unordered.
 */
export function dropSupersededJobCopies(
  root: string,
  artifacts: Iterable<RetryArtifactMeta>,
  runId: number | string | null = null,
): RetryCopySelection {
  const metaByName = new Map<string, RetryArtifactMeta>();
  for (const artifact of artifacts) metaByName.set(artifact.name, artifact);

  // suffix -> point keys produced by that job copy
  const pointsBySuffix = new Map<string, Set<string>>();
  const metaBySuffix = new Map<string, RetryArtifactMeta>();
  for (const file of readBenchmarkArtifacts(root, { runId, tracker: createSkipTracker() })) {
    const dir = file.path.split('/')[0]!;
    const suffix = benchmarkSuffix(dir);
    if (suffix === null) continue;
    const meta = metaByName.get(dir);
    if (meta) metaBySuffix.set(suffix, meta);
    const points = pointsBySuffix.get(suffix) ?? new Set<string>();
    for (const row of file.rows) if (row.mapped) points.add(benchmarkPointKey(row.mapped));
    pointsBySuffix.set(suffix, points);
  }

  // point key -> suffixes that produced it
  const suffixesByPoint = new Map<string, string[]>();
  for (const [suffix, points] of pointsBySuffix) {
    for (const point of points) {
      const suffixes = suffixesByPoint.get(point) ?? [];
      suffixes.push(suffix);
      suffixesByPoint.set(point, suffixes);
    }
  }

  const winnerByPoint = new Map<string, string>();
  const unordered: string[] = [];
  for (const [point, suffixes] of suffixesByPoint) {
    if (suffixes.length === 1) {
      winnerByPoint.set(point, suffixes[0]!);
      continue;
    }
    if (suffixes.some((suffix) => !metaBySuffix.has(suffix))) {
      unordered.push(point);
      continue;
    }
    let winner = suffixes[0]!;
    for (const suffix of suffixes.slice(1)) {
      if (newer(metaBySuffix.get(suffix)!, metaBySuffix.get(winner)!)) winner = suffix;
    }
    winnerByPoint.set(point, winner);
  }

  // A copy is dropped only when a newer copy won every point it produced.
  const dropped = new Map<string, string>();
  for (const [suffix, points] of pointsBySuffix) {
    if (points.size === 0) continue;
    const winners = [...points].map((point) => winnerByPoint.get(point));
    if (winners.some((winner) => winner === undefined || winner === suffix)) continue;
    dropped.set(suffix, winners[0]!);
  }
  if (dropped.size === 0) return { superseded: [], unordered };

  const removedBySuffix = new Map<string, string[]>();
  for (const dir of fs.readdirSync(root).toSorted()) {
    const suffix = jobSuffix(dir);
    if (suffix === null || !dropped.has(suffix)) continue;
    fs.rmSync(path.join(root, dir), { recursive: true, force: true });
    const removed = removedBySuffix.get(suffix) ?? [];
    removed.push(dir);
    removedBySuffix.set(suffix, removed);
  }

  const superseded = [...dropped]
    .map(([suffix, keptSuffix]) => ({
      suffix,
      keptSuffix,
      removed: removedBySuffix.get(suffix) ?? [],
    }))
    .toSorted((a, b) => a.suffix.localeCompare(b.suffix));
  return { superseded, unordered };
}

/** Log lines describing a selection, for CI output. */
export function describeRetryCopySelection(selection: RetryCopySelection): string[] {
  const lines = selection.superseded.map(
    (copy) =>
      `  Superseded retry copy ${copy.suffix} by newer ${copy.keptSuffix}` +
      ` (removed ${copy.removed.length} artifact(s))`,
  );
  if (selection.unordered.length > 0) {
    lines.push(
      `  WARNING: ${selection.unordered.length} point(s) have several copies without artifact` +
        ' metadata; kept every copy',
    );
  }
  return lines;
}
