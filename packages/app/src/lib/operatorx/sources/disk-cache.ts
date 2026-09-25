/**
 * Wraps any source with an on-disk cache of raw bundles, keyed by (run, attempt).
 * Bundles are immutable per attempt, so a cached copy stays valid; it also keeps runs
 * readable after their GitHub artifacts expire.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  OperatorXRawBundle,
  OperatorXRunRef,
} from '@semianalysisai/inferencex-db/operatorx/bundle';

import type { OperatorXSource } from '../source';

export class DiskCachedSource implements OperatorXSource {
  readonly name: string;
  private readonly inner: OperatorXSource;
  private readonly directory: string;
  constructor(inner: OperatorXSource, directory: string) {
    this.inner = inner;
    this.directory = directory;
    this.name = inner.name;
  }

  private file(runId: string) {
    return path.join(this.directory, `${runId}.json`);
  }

  private async cached(runId: string): Promise<OperatorXRawBundle | null> {
    try {
      return JSON.parse(await readFile(this.file(runId), 'utf8'));
    } catch {
      return null;
    }
  }

  async listRuns(): Promise<OperatorXRunRef[]> {
    const refs = await this.inner.listRuns();
    // a run whose artifacts expired stays available from the cache
    return Promise.all(
      refs.map(async (ref) => {
        if (!ref.unavailable) return ref;
        const hit = await this.cached(ref.run_id);
        return hit && hit.run.run_attempt >= ref.run_attempt
          ? { ...ref, unavailable: undefined }
          : ref;
      }),
    );
  }

  async getBundle(runId: string): Promise<OperatorXRawBundle> {
    const hit = await this.cached(runId);
    let bundle: OperatorXRawBundle;
    try {
      bundle = await this.inner.getBundle(runId);
    } catch (error) {
      if (hit) return hit;
      throw error;
    }
    if (hit && hit.run.run_attempt >= bundle.run.run_attempt) return hit;
    await mkdir(this.directory, { recursive: true });
    const tmp = `${this.file(runId)}.tmp`;
    await writeFile(tmp, JSON.stringify(bundle));
    await rename(tmp, this.file(runId));
    return bundle;
  }
}
