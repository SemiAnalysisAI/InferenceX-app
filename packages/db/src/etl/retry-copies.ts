import fs from 'node:fs';
import path from 'node:path';

import { readBenchmarkArtifacts, type BenchmarkArtifactFile } from './benchmark-artifacts.js';
import type { BenchmarkParams } from './benchmark-mapper.js';
import { configCacheKey } from './config-cache.js';
import { createSkipTracker } from './skip-tracker.js';

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
  suffix: string;
  keptSuffix: string;
  removed: string[];
}

export interface RetryCopySelection {
  superseded: SupersededCopy[];
  unordered: string[];
}

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

interface CopyOrder extends RetryArtifactMeta {
  runAttempt?: number;
}

function newer(a: CopyOrder, b: CopyOrder): boolean {
  if (a.runAttempt !== undefined && b.runAttempt !== undefined && a.runAttempt !== b.runAttempt)
    return a.runAttempt > b.runAttempt;
  const at = Date.parse(a.created_at);
  const bt = Date.parse(b.created_at);
  return at === bt ? (a.id ?? 0) > (b.id ?? 0) : at > bt;
}

export function dropSupersededJobCopies(
  root: string,
  artifacts: Iterable<RetryArtifactMeta>,
  runId: number | string | null = null,
): RetryCopySelection {
  const metaByName = new Map<string, RetryArtifactMeta>();
  for (const artifact of artifacts) metaByName.set(artifact.name, artifact);

  const pointsBySuffix = new Map<string, Set<string>>();
  const metaBySuffix = new Map<string, CopyOrder>();
  for (const file of readBenchmarkArtifacts(root, { runId, tracker: createSkipTracker() })) {
    const dir = file.path.split('/')[0]!;
    const suffix = benchmarkSuffix(dir);
    if (suffix === null) continue;
    const meta = metaByName.get(dir);
    const attempts = file.rows.map(({ raw }) => raw.run_attempt);
    const runAttempt =
      attempts.length > 0 && attempts.every((value) => Number.isInteger(value))
        ? Math.max(...(attempts as number[]))
        : undefined;
    if (meta) metaBySuffix.set(suffix, { ...meta, runAttempt });
    const points = pointsBySuffix.get(suffix) ?? new Set<string>();
    for (const row of file.rows) if (row.mapped) points.add(benchmarkPointKey(row.mapped));
    pointsBySuffix.set(suffix, points);
  }

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

  const dropped = new Map<string, string>();
  for (const [suffix, points] of pointsBySuffix) {
    const winners = [...points]
      .map((point) => winnerByPoint.get(point))
      .filter((winner) => winner !== undefined);
    const lost = winners.filter((winner) => winner !== suffix);
    if (lost.length === 0) continue;
    if (lost.length !== points.size) {
      throw new Error(
        `Retry copy ${suffix} lost only some of its points to newer copies; ` +
          'cannot choose one attempt for the whole file',
      );
    }
    dropped.set(suffix, lost[0]!);
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
