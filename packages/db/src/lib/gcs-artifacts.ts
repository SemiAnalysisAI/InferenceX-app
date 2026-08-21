/** Public GCS backup discovery and download helpers. */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { GCS_BUCKET_BASE } from '@semianalysisai/inferencex-constants';

import type { ArtifactMeta } from './github-artifacts.js';

const GCS_BUCKET = 'inferencemax-gha-backup';
const GCS_LIST_URL = `https://storage.googleapis.com/storage/v1/b/${GCS_BUCKET}/o`;
const ARTIFACT_OBJECT_RE =
  /^(?<date>\d{4}-\d{2}-\d{2})\/(?<workflow>.+)_(?<runId>\d{10,})\/artifacts\/(?<artifactName>.+)_(?<artifactId>\d+)\.zip$/u;

export interface GcsArtifactMeta extends ArtifactMeta {
  objectName: string;
  size: number;
}

interface GcsObject {
  name?: unknown;
  size?: unknown;
  updated?: unknown;
}

interface GcsListResponse {
  items?: GcsObject[];
  nextPageToken?: string;
}

export function publicGcsObjectUrl(objectName: string): string {
  return `${GCS_BUCKET_BASE}/${objectName.split('/').map(encodeURIComponent).join('/')}`;
}

/** Parse one backed-up GitHub artifact ZIP path into its original artifact metadata. */
export function parseGcsArtifactObject(object: GcsObject): {
  runId: number;
  artifact: GcsArtifactMeta;
} | null {
  if (typeof object.name !== 'string') return null;
  const match = ARTIFACT_OBJECT_RE.exec(object.name);
  if (!match?.groups) return null;

  const artifactName = match.groups.artifactName!;
  if (
    !artifactName.startsWith('bmk_') &&
    !artifactName.startsWith('server_logs_') &&
    !artifactName.startsWith('multinode_server_logs_')
  ) {
    return null;
  }

  const artifactId = Number(match.groups.artifactId);
  const runId = Number(match.groups.runId);
  const size = Number(object.size ?? 0);
  if (!Number.isSafeInteger(artifactId) || !Number.isSafeInteger(runId)) return null;

  return {
    runId,
    artifact: {
      id: artifactId,
      name: artifactName,
      // Backup upload timestamps do not preserve GitHub creation order. Leave
      // this empty so pairing uses the monotonically increasing artifact id.
      created_at: '',
      archive_download_url: publicGcsObjectUrl(object.name),
      expired: false,
      objectName: object.name,
      size: Number.isFinite(size) && size >= 0 ? size : 0,
    },
  };
}

/**
 * Build a run-id index using GCS's public JSON API. Only benchmark and
 * server-log ZIPs are retained in memory; the other backup objects are ignored.
 */
export async function listGcsServerLogArtifacts(
  fetchImpl: typeof fetch = fetch,
): Promise<Map<number, GcsArtifactMeta[]>> {
  const byRun = new Map<number, GcsArtifactMeta[]>();
  let pageToken: string | undefined;

  do {
    const url = new URL(GCS_LIST_URL);
    url.searchParams.set('maxResults', '1000');
    url.searchParams.set('fields', 'items(name,size,updated),nextPageToken');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const response = await fetchImpl(url);
    if (!response.ok) {
      throw new Error(`GCS artifact listing failed (${response.status} ${response.statusText})`);
    }
    const page = (await response.json()) as GcsListResponse;
    for (const object of page.items ?? []) {
      const parsed = parseGcsArtifactObject(object);
      if (!parsed) continue;
      const artifacts = byRun.get(parsed.runId) ?? [];
      artifacts.push(parsed.artifact);
      byRun.set(parsed.runId, artifacts);
    }
    pageToken = page.nextPageToken;
  } while (pageToken);

  return byRun;
}

/** Download and extract one public GCS artifact into a temporary run directory. */
export function downloadGcsArtifact(artifact: GcsArtifactMeta, destRoot: string): string {
  const safeName = path.basename(artifact.name);
  if (safeName !== artifact.name || safeName === '.' || safeName === '..') {
    throw new Error(`Unsafe GCS artifact name: ${artifact.name}`);
  }

  const zipPath = path.join(destRoot, `${artifact.id ?? 'artifact'}.zip`);
  const destDir = path.join(destRoot, safeName);
  execFileSync(
    'curl',
    [
      '-fsSL',
      '--retry',
      '3',
      '--retry-all-errors',
      '--output',
      zipPath,
      artifact.archive_download_url,
    ],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  );
  try {
    fs.mkdirSync(destDir, { recursive: true });
    execFileSync('unzip', ['-oq', zipPath, '-d', destDir], { stdio: 'ignore' });
    return destDir;
  } finally {
    fs.rmSync(zipPath, { force: true });
  }
}
