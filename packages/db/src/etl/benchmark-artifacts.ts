import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { mapBenchmarkRow, type BenchmarkParams } from './benchmark-mapper.js';
import type { SkipTracker } from './skip-tracker.js';

export function isBenchmarkArtifactDir(name: string): boolean {
  return name.startsWith('bmk_') || name.startsWith('results_');
}

export function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

export interface BenchmarkArtifactRow {
  raw: Record<string, unknown>;
  mapped: BenchmarkParams | null;
  failed: boolean;
}

export interface BenchmarkArtifactFile {
  path: string;
  sha256: string;
  bytes: number;
  rows: BenchmarkArtifactRow[];
  nonObjectRows: number;
  unreadable?: string;
}

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
