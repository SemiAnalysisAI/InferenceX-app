/**
 * Rows that InferenceX collectors quarantined. Collectors leave them out of the
 * `results_<prefix>` and `eval_results_<prefix>` aggregates and list them in
 * `rejected_rows_<prefix>` and `rejected_rows_eval_<prefix>`, but the per-config
 * `bmk_*` and `eval_*` artifacts still contain them.
 */

import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

const REJECTED_ROWS_FILE = 'rejected_rows.json';

export interface RejectedRowsArtifact {
  /** Artifact name, e.g. `rejected_rows_bmk`. */
  name: string;
  /** Parsed `rejected_rows.json`. */
  data: unknown;
}

export interface RejectedRows {
  /** Number of listed benchmark and eval rows. */
  size: number;
  /** Whether InferenceX rejected the per-config benchmark file `<artifact>/<file>` with this content. */
  hasBenchmarkFile: (source: string, content: unknown) => boolean;
  /** Whether InferenceX rejected `task` from the per-config eval results file `<artifact>/<file>`. */
  hasEvalTask: (source: string, task: string) => boolean;
}

/** Run stats publish only accepted entries, so only benchmark and eval rejections need skips. */
export function isRejectedRowsArtifact(name: string): boolean {
  return name.startsWith('rejected_rows_') && name !== 'rejected_rows_run_stats';
}

/**
 * Eval rows record the collector's path to their results file,
 * `<download dir>/<artifact>/<file>`. Per-config eval files sit at the artifact
 * root, so the last two segments identify the file in any download layout.
 */
function evalTaskKey(source: string, task: string): string {
  return JSON.stringify([source.split('/').slice(-2).join('/'), task.toLowerCase()]);
}

/**
 * Index parsed `rejected_rows.json` lists. A list that cannot identify its rows
 * throws, because ingesting rows it meant to exclude is worse than failing.
 */
export function indexRejectedRows(artifacts: readonly RejectedRowsArtifact[]): RejectedRows {
  const benchmarkRows = new Map<string, unknown[]>();
  const evalTasks = new Set<string>();
  let size = 0;
  for (const { name, data } of artifacts) {
    const label = `${name}/${REJECTED_ROWS_FILE}`;
    if (!Array.isArray(data)) throw new Error(`${label} must be a JSON array of rejected rows`);
    const entries: unknown[] = data;
    for (const [index, entry] of entries.entries()) {
      if (
        typeof entry !== 'object' ||
        entry === null ||
        !('source' in entry) ||
        typeof entry.source !== 'string' ||
        !('row' in entry)
      ) {
        throw new Error(`${label} entry ${index} has no source or row`);
      }
      if (name.startsWith('rejected_rows_eval_')) {
        const { row } = entry;
        if (
          typeof row !== 'object' ||
          row === null ||
          !('source' in row) ||
          typeof row.source !== 'string' ||
          !('task' in row) ||
          typeof row.task !== 'string'
        ) {
          throw new Error(`${label} entry ${index} has no eval source or task`);
        }
        evalTasks.add(evalTaskKey(row.source, row.task));
      } else {
        // Benchmark sources are `<artifact>/<file>` relative to the collector's download directory.
        benchmarkRows.set(entry.source, [...(benchmarkRows.get(entry.source) ?? []), entry.row]);
      }
      size++;
    }
  }
  return {
    size,
    // Content must match too, so a stale list cannot hide a file re-uploaded by a later attempt.
    hasBenchmarkFile: (source, content) =>
      benchmarkRows.get(source)?.some((row) => isDeepStrictEqual(row, content)) ?? false,
    hasEvalTask: (source, task) => evalTasks.has(evalTaskKey(source, task)),
  };
}

/** Index the `rejected_rows_*` artifacts downloaded into `root` (one directory per artifact). */
export function readRejectedRows(root: string): RejectedRows {
  return indexRejectedRows(
    fs
      .readdirSync(root)
      .filter(isRejectedRowsArtifact)
      .map((name) => {
        try {
          const text = fs.readFileSync(path.join(root, name, REJECTED_ROWS_FILE), 'utf8');
          return { name, data: JSON.parse(text) };
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          throw new Error(`Unreadable ${name}/${REJECTED_ROWS_FILE}: ${reason}`, { cause: error });
        }
      }),
  );
}
