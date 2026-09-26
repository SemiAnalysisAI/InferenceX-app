/**
 * The raw OperatorX run bundle: one run's manifest and the operatorx results JSON of
 * each of its shards. This is the storage contract between a data source (the OperatorX
 * database, a local directory) and the normalizer, so every source returns exactly this
 * shape and nothing downstream knows where it came from.
 *
 * `docs` are the shard's JSON documents verbatim (the operatorx results JSON
 * files). Nothing is interpreted here; see normalize.ts.
 */

export interface OperatorXRunMeta {
  run_id: string;
  run_attempt: number;
  source_sha: string;
  source_branch: string | null;
  generated_at: string;
  conclusion: string | null;
}

export interface OperatorXShardDocs {
  /** Manifest cell id (`<runner>-<hash>`). */
  id: string;
  /** Run attempt that produced these documents. */
  attempt: number;
  docs: unknown[];
}

export interface OperatorXRawBundle {
  run: OperatorXRunMeta;
  /** operatorx-manifest.json: the planned shards (`include`) and their cases. */
  manifest: unknown;
  shards: OperatorXShardDocs[];
}

/** A run as a source lists it, before its documents are read. */
export interface OperatorXRunRef extends OperatorXRunMeta {
  /** Planned coverage from the manifest, when the source has it cheaply. */
  plan?: OperatorXRunPlan;
}

export interface OperatorXRunPlan {
  /** Runner label without its `cluster:` prefix: `h200-dgxc`, `mi300x-amd`. */
  runner: string;
  mode: 'timing' | 'counters';
  testlists: string[];
  backends: string[];
  shards: number;
  requested: number;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A manifest cell's runner: `runner` (`cluster:h200-dgxc`), or `pool` in runs before it. */
function runnerLabel(cell: Record<string, unknown>): string {
  return String(cell.runner ?? cell.pool ?? '').replace(/^cluster:/u, '');
}

/** Planned coverage from a manifest document; null when it is not an OperatorX manifest. */
export function planFromManifest(manifest: unknown): OperatorXRunPlan | null {
  if (!isObject(manifest) || !Array.isArray(manifest.include)) return null;
  const cells = manifest.include.filter(isObject);
  if (cells.length === 0) return null;
  const testlists = new Set<string>();
  const backends = new Set<string>();
  let requested = 0;
  for (const cell of cells) {
    for (const b of Array.isArray(cell.backends) ? cell.backends : []) backends.add(String(b));
    const cases = Array.isArray(cell.cases) ? cell.cases : [];
    requested +=
      cases.length * Math.max(1, Array.isArray(cell.backends) ? cell.backends.length : 1);
    for (const c of cases)
      if (isObject(c) && typeof c.testlist === 'string') testlists.add(c.testlist);
  }
  return {
    runner: runnerLabel(cells[0]),
    mode: cells[0].mode === 'counters' ? 'counters' : 'timing',
    testlists: [...testlists].sort(),
    backends: [...backends].sort(),
    shards: cells.length,
    requested,
  };
}
