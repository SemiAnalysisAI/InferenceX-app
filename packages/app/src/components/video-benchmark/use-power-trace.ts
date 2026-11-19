'use client';

import { useEffect, useState } from 'react';
import type { VideoPoint } from './metrics';
import { readPointArtifact } from './point-artifact';
import { powerTrace, type PowerSample } from './results-evidence';
import { servingCells } from './serving';
import { storedBundle, type StoredArtifact } from './stored';

type TracePoint = Pick<VideoPoint, 'id' | 'cell' | 'runId' | 'artifactId'>;

/**
 * The power trace of one dashboard point inside its stored artifact: the source whose manifest
 * SHA the point id names. Empty when the artifact does not publish that cell.
 */
function publishedPowerTrace(
  saved: StoredArtifact,
  point: Pick<TracePoint, 'id' | 'cell'>,
): PowerSample[] {
  const manifestSha = point.id.split(':')[0];
  const source = saved.sources.find(
    (item) =>
      !item.kind &&
      item.checksums.some(([path, sha]) => path === 'manifest.json' && sha === manifestSha),
  );
  if (!source || point.cell === null) return [];
  const bundle = storedBundle(source);
  const cell = servingCells(bundle).find((item) => item.id === point.cell);
  return cell ? powerTrace(bundle, cell) : [];
}

type PowerTraceRead =
  | { status: 'loading' | 'failed' }
  | { status: 'ready'; samples: PowerSample[] };

/**
 * Reads a point's power trace from its artifact when the detail view opens. History carries
 * only the sample count, so `expected` false (no valid samples) skips the read.
 */
export function usePowerTrace(
  { id, cell, runId, artifactId }: TracePoint,
  unofficialRun: string | null,
  expected: boolean,
): PowerTraceRead {
  const key = JSON.stringify([runId, artifactId, id, cell]);
  const [read, setRead] = useState<{ key: string; samples: PowerSample[] | null } | null>(null);
  useEffect(() => {
    if (!expected) return;
    const controller = new AbortController();
    readPointArtifact({ runId, artifactId }, unofficialRun, controller.signal)
      .then((saved) => (saved ? publishedPowerTrace(saved, { id, cell }) : []))
      .catch(() => null)
      .then((samples) => {
        if (!controller.signal.aborted) setRead({ key, samples });
      });
    return () => controller.abort();
  }, [expected, key, id, cell, runId, artifactId, unofficialRun]);
  if (!expected) return { status: 'ready', samples: [] };
  if (read?.key !== key) return { status: 'loading' };
  return read.samples === null ? { status: 'failed' } : { status: 'ready', samples: read.samples };
}
