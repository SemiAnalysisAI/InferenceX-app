/**
 * OperatorX runs from a directory of raw bundles (`<runId>.json`), for development and
 * offline review. Files are the same shape every source returns.
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import {
  type OperatorXRawBundle,
  type OperatorXRunRef,
  planFromManifest,
} from '@semianalysisai/inferencex-db/operatorx/bundle';

import { type OperatorXSource, OperatorXSourceError } from '../source';

export class LocalDirectorySource implements OperatorXSource {
  readonly name = 'local-directory';
  private readonly directory: string;
  constructor(directory: string) {
    this.directory = directory;
  }

  async listRuns(): Promise<OperatorXRunRef[]> {
    const refs: OperatorXRunRef[] = [];
    for (const file of await readdir(this.directory)) {
      if (!/^[1-9][0-9]*\.json$/u.test(file)) continue;
      const bundle = await this.getBundle(file.slice(0, -5));
      refs.push({ ...bundle.run, plan: planFromManifest(bundle.manifest) ?? undefined });
    }
    return refs.sort((a, b) => Number(b.run_id) - Number(a.run_id));
  }

  async getBundle(runId: string): Promise<OperatorXRawBundle> {
    if (!/^[1-9][0-9]*$/u.test(runId)) throw new OperatorXSourceError('Invalid run ID', 400);
    try {
      return JSON.parse(await readFile(path.join(this.directory, `${runId}.json`), 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        throw new OperatorXSourceError('Run not found', 404);
      throw error;
    }
  }
}
