/**
 * Skip/error tracking for ingest runs.
 * `createSkipTracker()` returns a stateful tracker that all ETL functions share.
 */

export interface Skips {
  badZip: number;
  unmappedModel: number;
  unmappedHw: number;
  noIslOsl: number;
  dbError: number;
}

export interface SkipSnapshot {
  model: number;
  hw: number;
  islOsl: number;
  models: Set<string>;
  hws: Set<string>;
}

export interface SkipTracker {
  skips: Skips;
  unmappedModels: Set<string>;
  unmappedHws: Set<string>;
  /**
   * Record a DB error, printing the first `MAX_DB_ERRORS` to stderr and
   * suppressing further output while still incrementing the count.
   *
   * @param context - Human-readable label for where the error occurred.
   * @param err - The caught error.
   */
  recordDbError(context: string, err: Error): void;
  /**
   * Capture a point-in-time snapshot of the current skip counters and
   * unmapped-name sets. Used together with `diff()` to report per-artifact drops.
   *
   * @returns A `SkipSnapshot` with copies of the current counts and name sets.
   */
  snapshot(): SkipSnapshot;
  /**
   * Compute the incremental change in skip counters since a previous snapshot.
   * Use this to emit per-artifact warnings without scanning the full totals.
   *
   * @param before - Snapshot taken before processing the artifact.
   * @returns Counts of newly dropped rows and arrays of newly seen unmapped names.
   */
  diff(before: SkipSnapshot): {
    droppedModel: number;
    droppedHw: number;
    droppedIslOsl: number;
    newModels: string[];
    newHws: string[];
  };
}

// Cap noisy DB errors: print first MAX_DB_ERRORS, then just count the rest.
const MAX_DB_ERRORS = 10;

/**
 * Create a shared skip/error tracker for a single ingest run.
 * All ETL functions accept a `SkipTracker` and mutate it in place, so the
 * top-level script has one consistent view of everything that was skipped.
 *
 * @returns A `SkipTracker` with zeroed counters and empty unmapped-name sets.
 */
export function createSkipTracker(): SkipTracker {
  const skips: Skips = { badZip: 0, unmappedModel: 0, unmappedHw: 0, noIslOsl: 0, dbError: 0 };
  const unmappedModels = new Set<string>();
  const unmappedHws = new Set<string>();
  let dbErrorsPrinted = 0;

  return {
    skips,
    unmappedModels,
    unmappedHws,

    recordDbError(context: string, err: Error): void {
      skips.dbError++;
      if (dbErrorsPrinted < MAX_DB_ERRORS) {
        console.error(`  [DB ERROR] ${context}: ${err.message}`);
        dbErrorsPrinted++;
        if (dbErrorsPrinted === MAX_DB_ERRORS) {
          console.error('  [DB ERROR] further DB errors suppressed; count included in summary');
        }
      }
    },

    snapshot(): SkipSnapshot {
      return {
        model: skips.unmappedModel,
        hw: skips.unmappedHw,
        islOsl: skips.noIslOsl,
        models: new Set(unmappedModels),
        hws: new Set(unmappedHws),
      };
    },

    diff(before: SkipSnapshot) {
      return {
        droppedModel: skips.unmappedModel - before.model,
        droppedHw: skips.unmappedHw - before.hw,
        droppedIslOsl: skips.noIslOsl - before.islOsl,
        newModels: [...unmappedModels].filter((m) => !before.models.has(m)),
        newHws: [...unmappedHws].filter((h) => !before.hws.has(h)),
      };
    },
  };
}
