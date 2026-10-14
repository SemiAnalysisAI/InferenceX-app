/**
 * The walker for a run's `bmk_*` / `results_*` benchmark JSON: listing,
 * hashing and row mapping. The ingest process reads once (`ingest-ci-run.ts`)
 * and lends that read to the required-power verifier and the curve preflight;
 * the standalone commands read for themselves. Sidecar backfills read one
 * downloaded artifact recursively through `lib/benchmark-result-lookup.ts`.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { mapBenchmarkRow, type BenchmarkParams } from './benchmark-mapper.js';
import type { SkipTracker } from './skip-tracker.js';

/** Per-job `bmk_*` artifacts and every `results_*` aggregate, `results_bmk` included. */
export function isBenchmarkArtifactDir(name: string): boolean {
  return name.startsWith('bmk_') || name.startsWith('results_');
}

export function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

export interface BenchmarkArtifactRow {
  raw: Record<string, unknown>;
  /** Null when the mapper rejected the row; `failed` says whether it was a known failed run. */
  mapped: BenchmarkParams | null;
  failed: boolean;
}

export interface BenchmarkArtifactFile {
  /** POSIX path relative to the artifacts root, e.g. `bmk_agentic_golden/agg.json`. */
  path: string;
  sha256: string;
  bytes: number;
  rows: BenchmarkArtifactRow[];
  /** Entries that were not JSON objects; the file's expectations are then unknown. */
  nonObjectRows: number;
  /** Set when the file is not valid JSON; `rows` is then empty. */
  unreadable?: string;
}

/**
 * Walk the direct `*.json` children of every benchmark artifact directory under
 * `root`, in sorted order, hashing each file once and mapping each row once
 * with the given tracker and run id.
 */
export function readBenchmarkArtifacts(
  root: string,
  options: { runId: number | string | null; tracker: SkipTracker },
): BenchmarkArtifactFile[] {
  const files: BenchmarkArtifactFile[] = [];
  if (!fs.existsSync(root)) return files;
  for (const dir of fs.readdirSync(root).toSorted()) {
    if (!isBenchmarkArtifactDir(dir) || !fs.statSync(path.join(root, dir)).isDirectory()) continue;
    for (const name of fs.readdirSync(path.join(root, dir)).toSorted()) {
      if (!name.endsWith('.json')) continue;
      const contents = fs.readFileSync(path.join(root, dir, name));
      const file: BenchmarkArtifactFile = {
        path: path.posix.join(dir, name),
        sha256: sha256Hex(contents),
        bytes: contents.length,
        rows: [],
        nonObjectRows: 0,
      };
      files.push(file);
      let data: unknown;
      try {
        data = JSON.parse(contents.toString('utf8'));
      } catch (error) {
        file.unreadable = error instanceof Error ? error.message : String(error);
        continue;
      }
      for (const value of Array.isArray(data) ? data : [data]) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          file.nonObjectRows++;
          continue;
        }
        const raw = value as Record<string, unknown>;
        const failedBefore = options.tracker.skips.failedRun;
        const mapped = mapBenchmarkRow(raw, options.tracker, undefined, options.runId);
        file.rows.push({ raw, mapped, failed: options.tracker.skips.failedRun !== failedBefore });
      }
    }
  }
  return files;
}
