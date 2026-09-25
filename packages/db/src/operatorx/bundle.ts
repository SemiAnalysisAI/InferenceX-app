/**
 * The raw OperatorX run bundle: one GitHub Actions run of operatorx-sweep.yml, as its
 * artifacts carry it. This is the storage contract between a data source (GitHub
 * artifacts, a local directory, the opx_runs table) and the normalizer, so every source
 * returns exactly this shape and nothing downstream knows where it came from.
 *
 * `docs` are the shard artifact's JSON documents verbatim (the operatorx results JSON
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
  /** Manifest cell id (`<pool>-<hash>`). */
  id: string;
  /** Actions attempt whose artifact supplied these documents. */
  attempt: number;
  docs: unknown[];
}

export interface OperatorXRawBundle {
  run: OperatorXRunMeta;
  /** operatorx-manifest.json: the planned shards (`include`) and their cases. */
  manifest: unknown;
  shards: OperatorXShardDocs[];
}

/** A run as a source lists it, before its shard artifacts are read. */
export interface OperatorXRunRef extends OperatorXRunMeta {
  /** Planned coverage from the manifest, when the source has it cheaply. */
  plan?: OperatorXRunPlan;
  /** The source can no longer produce the bundle (e.g. GitHub artifacts expired). */
  unavailable?: string;
}

export interface OperatorXRunPlan {
  pool: string;
  mode: 'timing' | 'counters';
  testlists: string[];
  backends: string[];
  shards: number;
  requested: number;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
    pool: String(cells[0].pool ?? ''),
    mode: cells[0].mode === 'counters' ? 'counters' : 'timing',
    testlists: [...testlists].sort(),
    backends: [...backends].sort(),
    shards: cells.length,
    requested,
  };
}
