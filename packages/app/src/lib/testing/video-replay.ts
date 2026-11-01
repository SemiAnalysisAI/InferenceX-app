import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { readVideoReplay } from '@/components/video-benchmark/replay';
import { videoHistoryEntry } from '@/components/video-benchmark/history';
import type { StoredArtifact } from '@/components/video-benchmark/stored';
import { readLocalVideoQuality } from './video-quality';
import type { Json } from '@/components/video-benchmark/bundle';
import type { NextRequest } from 'next/server';

const privateHeaders = {
  'Cache-Control': 'private, no-store',
  'X-VideoGenX-Replay': '1',
};

interface Snapshot {
  stored: StoredArtifact;
  history: ReturnType<typeof videoHistoryEntry>;
  media: Map<string, Map<string, Blob>>;
}

let cached: { manifest: string; value: Promise<Snapshot[]> } | null = null;

function active() {
  return (
    process.env.NODE_ENV === 'development' &&
    process.env.E2E_FIXTURES === '1' &&
    Boolean(process.env.E2E_VIDEO_REPLAY_MANIFEST)
  );
}

async function readSnapshot(config: unknown): Promise<Snapshot> {
  if (typeof config !== 'object' || config === null || Array.isArray(config))
    throw new Error('Replay artifact configuration must be an object');
  const { zipPath, metadataPath, expectedPlanSha256 } = config as Record<string, unknown>;
  if (
    typeof zipPath !== 'string' ||
    !isAbsolute(zipPath) ||
    typeof metadataPath !== 'string' ||
    !isAbsolute(metadataPath) ||
    typeof expectedPlanSha256 !== 'string'
  )
    throw new Error('Replay manifest needs absolute ZIP and metadata paths and a plan hash');
  const [zip, metadataText] = await Promise.all([
    readFile(zipPath),
    readFile(metadataPath, 'utf8'),
  ]);
  const replay = await readVideoReplay(
    new Blob([new Uint8Array(zip)]),
    JSON.parse(metadataText),
    expectedPlanSha256,
  );
  if (!replay.report.ok) throw new Error(replay.report.errors.join('; '));
  const { stored, media } = replay;
  for (const source of stored.sources) {
    source.assets = [...(media.get(source.id) ?? new Map())].map(([path]) => {
      const url = new URL('/api/video-runs', 'http://localhost');
      for (const [key, value] of Object.entries({
        format: 'replay-asset',
        run: stored.runId,
        artifact: String(stored.artifact.id),
        source: source.id,
        path,
      }))
        url.searchParams.set(key, value);
      return [
        path,
        { url: `${url.pathname}${url.search}`, downloadUrl: `${url.pathname}${url.search}` },
      ];
    });
  }
  const history = videoHistoryEntry(stored, null);
  history.approved = false;
  if (history.sources.some((source) => source.releaseQualified !== false))
    throw new Error('Replay source must retain its original releaseQualified=false verdict');
  return { stored, history, media };
}

function snapshot(): Promise<Snapshot[]> {
  const manifest = process.env.E2E_VIDEO_REPLAY_MANIFEST!;
  if (!cached || cached.manifest !== manifest) {
    cached = {
      manifest,
      value: (async () => {
        if (!isAbsolute(manifest)) throw new Error('Replay manifest must be an absolute path');
        const config: unknown = JSON.parse(await readFile(manifest, 'utf8'));
        const inputs =
          typeof config === 'object' && config !== null && 'artifacts' in config
            ? config.artifacts
            : [config];
        if (!Array.isArray(inputs) || inputs.length === 0)
          throw new Error('Replay manifest needs a nonempty artifacts array');
        const snapshots: Snapshot[] = [];
        const identities = new Set<string>();
        for (const input of inputs) {
          const replay = await readSnapshot(input);
          const identity = JSON.stringify([replay.stored.runId, replay.stored.artifact.id]);
          if (identities.has(identity)) throw new Error(`Duplicate replay artifact: ${identity}`);
          identities.add(identity);
          snapshots.push(replay);
        }
        if (typeof config === 'object' && config !== null && 'quality' in config) {
          const quality = await readLocalVideoQuality(
            config.quality as Json,
            snapshots.map((item) => item.stored),
          ).catch(() => {
            // Filesystem/decoder details belong to local diagnostics, never the HTTP response.
            throw new Error('Quality attachment failed verification');
          });
          for (const replay of snapshots) {
            replay.stored.quality = quality.pairs
              .filter(
                (pair) =>
                  pair.candidate.run_id === replay.stored.runId &&
                  pair.candidate.artifact_id === replay.stored.artifact.id,
              )
              .map((pair) => {
                const source = `reference:${pair.reference.receipt_sha256}`;
                const files = replay.media.get(source) ?? new Map<string, Blob>();
                files.set(
                  pair.reference.media_path,
                  quality.media.get(pair.reference.receipt_sha256)!.get(pair.reference.media_path)!,
                );
                replay.media.set(source, files);
                const query = new URLSearchParams({
                  format: 'replay-asset',
                  run: replay.stored.runId,
                  artifact: String(replay.stored.artifact.id),
                  source,
                  path: pair.reference.media_path,
                });
                return {
                  ...pair,
                  reference: { ...pair.reference, url: `/api/video-runs?${query}` },
                };
              });
          }
        }
        return snapshots;
      })(),
    };
  }
  return cached.value;
}

function assetResponse(request: NextRequest, replay: Snapshot): Response {
  const q = request.nextUrl.searchParams;
  const source = q.get('source') ?? '';
  const path = q.get('path') ?? '';
  const blob = replay.media.get(source)?.get(path);
  if (!blob || !path.endsWith('.mp4'))
    return new Response(null, { status: 404, headers: privateHeaders });
  const size = blob.size;
  const range = request.headers.get('range');
  let start = 0;
  let end = size - 1;
  if (range !== null) {
    const match = /^bytes=(?<start>\d*)-(?<end>\d*)$/u.exec(range);
    if (match && (match.groups!.start || match.groups!.end)) {
      if (match.groups!.start) {
        start = Number(match.groups!.start);
        end = match.groups!.end ? Number(match.groups!.end) : end;
      } else {
        const suffix = Number(match.groups!.end);
        start = Math.max(size - suffix, 0);
      }
    } else start = size;
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start >= size ||
      start > end ||
      end < 0
    )
      return new Response(null, {
        status: 416,
        headers: {
          ...privateHeaders,
          'Accept-Ranges': 'bytes',
          'Content-Range': `bytes */${size}`,
        },
      });
    end = Math.min(end, size - 1);
  }
  const headers = {
    ...privateHeaders,
    'Content-Type': 'video/mp4',
    'X-Content-Type-Options': 'nosniff',
    'Accept-Ranges': 'bytes',
    'Content-Length': String(end - start + 1),
    ...(range === null ? {} : { 'Content-Range': `bytes ${start}-${end}/${size}` }),
  };
  return new Response(request.method === 'HEAD' ? null : blob.slice(start, end + 1), {
    status: range === null ? 200 : 206,
    headers,
  });
}

/** Null means the fixture adapter is disabled; active reads never reach an external source. */
export async function localVideoReplayResponse(request: NextRequest): Promise<Response | null> {
  if (!active()) return null;
  let snapshots: Snapshot[];
  try {
    snapshots = await snapshot();
  } catch (error) {
    return Response.json(
      {
        error: `Local replay unavailable: ${error instanceof Error ? error.message : String(error)}`,
      },
      { status: 503, headers: privateHeaders },
    );
  }
  const q = request.nextUrl.searchParams;
  const format = q.get('format');
  if (format === 'history' && !q.has('run') && !q.has('artifact')) {
    return Response.json(
      Number(q.get('page') ?? '1') === 1
        ? { schemaVersion: 1, entries: snapshots.map((replay) => replay.history), nextPage: null }
        : { schemaVersion: 1, entries: [], nextPage: null },
      { headers: privateHeaders },
    );
  }
  const replay = snapshots.find(
    ({ stored }) =>
      q.get('run') === stored.runId && q.get('artifact') === String(stored.artifact.id),
  );
  if (!replay) return new Response(null, { status: 404, headers: privateHeaders });
  if (format === 'replay-asset') return assetResponse(request, replay);
  if (format === 'published' || format === 'media')
    return Response.json(replay.stored, { headers: privateHeaders });
  return new Response(null, { status: 404, headers: privateHeaders });
}
