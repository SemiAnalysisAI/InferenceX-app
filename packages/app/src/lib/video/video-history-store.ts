import { del, list, put, type ListBlobResultBlob } from '@vercel/blob';
import { videoArtifactIdentity } from '@/components/video-benchmark/artifact-identity';
import type { CIArtifact } from '@/components/video-benchmark/archive';
import {
  VIDEO_HISTORY_PAGE_SIZE,
  videoHistoryEntry,
  type VideoHistoryEntry,
  type VideoHistoryPage,
} from '@/components/video-benchmark/history';
import type { StoredArtifact } from '@/components/video-benchmark/stored';
import {
  approvalPath,
  PREFIX,
  readStoredArtifact,
  readVideoPublication,
  videoStorageEnabled,
} from './video-storage';

/** Bump when projected entries can change, so snapshots written by older code are ignored. */
export const VIDEO_HISTORY_PROJECTION = 2;
const BUILD_BATCH = 8;
const HISTORY = `${PREFIX}/runs/history/`;
const SNAPSHOTS = `${HISTORY}v${VIDEO_HISTORY_PROJECTION}/`;
const INDEX =
  /^h3-video-media\/v1\/runs\/(?<run>[1-9]\d*)\/(?<name>[^/]+)_(?<artifact>[1-9]\d*)\.json$/u;

interface StoredIndex {
  pathname: string;
  runId: string;
  artifact: CIArtifact;
  publishedAt: string;
}
/** A projected entry with the upload time of the receipt it was verified against. */
interface HistoryRecord {
  receiptAt: string | null;
  entry: VideoHistoryEntry;
}

async function listAll(prefix: string) {
  const blobs: ListBlobResultBlob[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, cursor });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return blobs;
}

async function historyState() {
  const [runs, approvals] = await Promise.all([
    listAll(`${PREFIX}/runs/`),
    listAll(`${PREFIX}/approvals/`),
  ]);
  const indexes: StoredIndex[] = [];
  const snapshots: ListBlobResultBlob[] = [];
  let latest: ListBlobResultBlob | undefined;
  for (const blob of runs) {
    if (blob.pathname.startsWith(HISTORY)) {
      snapshots.push(blob);
      if (blob.pathname.startsWith(SNAPSHOTS) && (!latest || blob.pathname > latest.pathname))
        latest = blob;
      continue;
    }
    const match = INDEX.exec(blob.pathname)?.groups;
    if (!match || videoArtifactIdentity(match.name)?.run !== match.run) continue;
    indexes.push({
      pathname: blob.pathname,
      runId: match.run,
      publishedAt: blob.uploadedAt.toISOString(),
      artifact: {
        id: Number(match.artifact),
        name: match.name,
        expired: false,
        size_in_bytes: 0,
        stored: true,
        indexUrl: blob.url,
      },
    });
  }
  indexes.sort(
    (a, b) => b.publishedAt.localeCompare(a.publishedAt) || b.artifact.id - a.artifact.id,
  );
  const receipts = new Map(
    approvals.map((blob) => [blob.pathname, blob.uploadedAt.toISOString()] as const),
  );
  return { indexes, receipts, snapshots, latest };
}

async function readRecords(latest: ListBlobResultBlob | undefined) {
  if (!latest) return new Map<string, HistoryRecord>();
  const response = await fetch(latest.url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error('Video history snapshot unavailable');
  const records: Record<string, HistoryRecord> = await response.json();
  return new Map(Object.entries(records));
}

/** A record stays exact while its index and approval receipt are the blobs it was built from. */
function current(
  record: HistoryRecord | undefined,
  index: StoredIndex,
  receipts: ReadonlyMap<string, string>,
): record is HistoryRecord {
  return (
    record?.entry.publishedAt === index.publishedAt &&
    record.receiptAt === (receipts.get(approvalPath(index.runId, index.artifact)) ?? null)
  );
}

async function projectIndex({
  runId,
  artifact,
  publishedAt,
}: StoredIndex): Promise<VideoHistoryEntry> {
  try {
    const saved = await readStoredArtifact(runId, artifact);
    if (!saved) throw new Error('Published artifact unavailable');
    const approved = await readVideoPublication(runId, artifact, saved)
      .then((receipt) => receipt !== null)
      .catch(() => false);
    return { ...videoHistoryEntry(saved, publishedAt), approved };
  } catch (error) {
    return {
      id: `${runId}.${artifact.id}`,
      runId,
      publishedAt,
      artifact,
      approved: false,
      sources: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Read `pages` History pages from `page` with one index listing and one snapshot read. Indexes the
 * snapshot does not cover are projected from their stored artifact. This path never writes.
 */
export async function publishedVideoHistory(page: number, pages = 1): Promise<VideoHistoryPage> {
  if (!videoStorageEnabled()) return { schemaVersion: 1, entries: [], nextPage: null };
  const { indexes, receipts, latest } = await historyState();
  const records = await readRecords(latest).catch(() => new Map<string, HistoryRecord>());
  const end = (page - 1 + pages) * VIDEO_HISTORY_PAGE_SIZE;
  const entries = await Promise.all(
    indexes.slice((page - 1) * VIDEO_HISTORY_PAGE_SIZE, end).map((index) => {
      const record = records.get(index.pathname);
      return current(record, index, receipts) ? record.entry : projectIndex(index);
    }),
  );
  return { schemaVersion: 1, entries, nextPage: end < indexes.length ? page + pages : null };
}

/**
 * Write a new History snapshot. Records still bound to their index and receipt are kept. `saved` is
 * projected from the published artifact in hand, and `null` backfills every index without a record.
 * Indexes that cannot be projected exactly stay out of the snapshot, so reads project them directly.
 */
export async function recordVideoHistory(saved: StoredArtifact | null) {
  const { indexes, receipts, snapshots, latest } = await historyState();
  const previous = await readRecords(latest);
  const records: Record<string, HistoryRecord> = {};
  const pending: StoredIndex[] = [];
  for (const index of indexes) {
    const record = previous.get(index.pathname);
    if (current(record, index, receipts)) records[index.pathname] = record;
    else if (!saved || (saved.runId === index.runId && saved.artifact.id === index.artifact.id))
      pending.push(index);
  }
  const kept = Object.keys(records).length;
  for (let start = 0; start < pending.length; start += BUILD_BATCH) {
    await Promise.allSettled(
      pending.slice(start, start + BUILD_BATCH).map(async (index) => {
        const source = saved ?? (await readStoredArtifact(index.runId, index.artifact));
        if (!source) throw new Error('Published artifact unavailable');
        const receiptAt = receipts.get(approvalPath(index.runId, index.artifact)) ?? null;
        const receipt =
          receiptAt === null
            ? null
            : await readVideoPublication(index.runId, index.artifact, source);
        if (receiptAt !== null && !receipt) throw new Error('Approval receipt unavailable');
        records[index.pathname] = {
          receiptAt,
          entry: { ...videoHistoryEntry(source, index.publishedAt), approved: receipt !== null },
        };
      }),
    );
  }
  const entries = Object.keys(records).length;
  const result = { entries, built: entries - kept, skipped: pending.length - (entries - kept) };
  if (entries === kept && kept === previous.size) return result;
  await put(`${SNAPSHOTS}${Date.now()}.json`, JSON.stringify(records), {
    access: 'public',
    addRandomSuffix: true,
    contentType: 'application/json',
    cacheControlMaxAge: 31536000,
  });
  // Keep the snapshot a concurrent reader may have just listed. Older ones only cost listings.
  const obsolete = snapshots.filter((blob) => blob !== latest).map((blob) => blob.url);
  if (obsolete.length > 0) await del(obsolete);
  return result;
}
