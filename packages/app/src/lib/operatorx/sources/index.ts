/**
 * Picks the OperatorX source from the environment:
 *   OPERATORX_SOURCE=github (default) | local
 *   GITHUB_TOKEN                      github: Actions artifact read access
 *   OPERATORX_LOCAL_ARTIFACT_DIR      local: directory of <runId>.json bundles (development only)
 *   OPERATORX_CACHE_DIR               optional on-disk bundle cache for the github source
 * A database source slots in here as another case.
 */
import { type OperatorXSource, OperatorXSourceError } from '../source';
import { DiskCachedSource } from './disk-cache';
import { GithubActionsSource } from './github-actions';
import { LocalDirectorySource } from './local-directory';

let source: OperatorXSource | null = null;

export function getOperatorXSource(): OperatorXSource {
  if (source) return source;
  const kind = process.env.OPERATORX_SOURCE ?? 'github';
  if (kind === 'local') {
    const dir = process.env.OPERATORX_LOCAL_ARTIFACT_DIR;
    if (process.env.NODE_ENV !== 'development' || !dir)
      throw new OperatorXSourceError('The local OperatorX source is development-only', 503);
    source = new LocalDirectorySource(dir);
  } else if (kind === 'github') {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new OperatorXSourceError('GitHub access is not configured', 503);
    const github = new GithubActionsSource({ token });
    const cache = process.env.OPERATORX_CACHE_DIR;
    source = cache ? new DiskCachedSource(github, cache) : github;
  } else {
    throw new OperatorXSourceError(`Unknown OPERATORX_SOURCE: ${kind}`, 503);
  }
  return source;
}
