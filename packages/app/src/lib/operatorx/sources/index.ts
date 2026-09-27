/**
 * Picks the OperatorX source from the environment:
 *   OPERATORX_SOURCE=database (default) | local
 *   DATABASE_OPERATORX_READONLY_URL   database: read-only OperatorX database connection
 *   OPERATORX_LOCAL_ARTIFACT_DIR      local: directory of <runId>.json bundles (development only)
 */
import { type OperatorXSource, OperatorXSourceError } from '../source';
import { DatabaseSource } from './database';
import { LocalDirectorySource } from './local-directory';

let source: OperatorXSource | null = null;

export function getOperatorXSource(): OperatorXSource {
  if (source) return source;
  const kind = process.env.OPERATORX_SOURCE ?? 'database';
  if (kind === 'local') {
    const dir = process.env.OPERATORX_LOCAL_ARTIFACT_DIR;
    if (process.env.NODE_ENV !== 'development' || !dir)
      throw new OperatorXSourceError('The local OperatorX source is development-only', 503);
    source = new LocalDirectorySource(dir);
  } else if (kind === 'database') {
    if (!process.env.DATABASE_OPERATORX_READONLY_URL)
      throw new OperatorXSourceError('The OperatorX database is not configured', 503);
    source = new DatabaseSource();
  } else {
    throw new OperatorXSourceError(`Unknown OPERATORX_SOURCE: ${kind}`, 503);
  }
  return source;
}
