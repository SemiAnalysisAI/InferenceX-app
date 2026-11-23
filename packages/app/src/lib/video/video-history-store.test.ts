import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi, mock } from 'bun:test';
import { mocked, stubEnv, unstubAllEnvs } from '@/test/helpers';
import { BlobNotFoundError, del, head, list, put, type HeadBlobResult } from '@vercel/blob';
import type { StoredArtifact } from '@/components/video-benchmark/stored';
import { VIDEO_HISTORY_MAX_PAGES } from '@/components/video-benchmark/history';
import { dashboardCells, videoPoints } from '@/components/video-benchmark/points';
import { servingArtifact } from '../../../cypress/support/video-artifacts';
import {
  publishedVideoHistory as publishedVideoHistoryRead,
  recordVideoHistory,
  VIDEO_HISTORY_PROJECTION,
} from './video-history-store';
import { approvalPath, approveVideoPublication, storedArtifacts } from './video-storage';

/** The served page; `complete` is asserted where retention matters. */
const publishedVideoHistory = async (page: number, pages = 1) => {
  const read = await publishedVideoHistoryRead(page, pages);
  return read.page;
};

// The factory cannot import the module it replaces, so the real exports are captured first.
const actual = { ...(await import('@vercel/blob')) };
mock.module('@vercel/blob', () => ({
  ...actual,
  list: vi.fn(),
  head: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

const LIST_PAGE = 4;
const blobs = new Map<string, { url: string; uploadedAt: Date; body: string }>();
let clock = Date.UTC(2026, 8, 1);
let suffix = 0;
function save(pathname: string, body: string) {
  clock += 60_000;
  blobs.set(pathname, {
    url: `https://blob.test/${pathname}`,
    uploadedAt: new Date(clock),
    body,
  });
}
const indexPath = (saved: StoredArtifact) =>
  `h3-video-media/v1/runs/${saved.runId}/${saved.artifact.name}_${saved.artifact.id}.json`;
const ref = (saved: StoredArtifact) => ({
  id: saved.artifact.id,
  name: saved.artifact.name,
  expired: false,
  size_in_bytes: 0,
});
const snapshots = () => [...blobs.keys()].filter((path) => path.includes('/runs/history/'));
const artifactReads = () =>
  mocked(fetch).mock.calls.filter(
    ([url]) => /\/runs\/\d+\//u.test(String(url)) && !String(url).includes('/approvals/'),
  ).length;

async function publish(i: number, approve = true, hardware?: string, takes?: number) {
  const saved = servingArtifact(100 + i, 1000 + i, hardware, takes);
  save(indexPath(saved), JSON.stringify(saved));
  if (approve)
    await approveVideoPublication(
      saved.runId,
      ref(saved),
      saved,
      null,
      new AbortController().signal,
    );
  return saved;
}

/** The exact projection of every index, read with all History snapshots hidden. */
async function direct(page: number, pages = 1) {
  const hidden = snapshots().map((path) => [path, blobs.get(path)!] as const);
  for (const [path] of hidden) blobs.delete(path);
  const result = await publishedVideoHistory(page, pages);
  for (const [path, value] of hidden) blobs.set(path, value);
  return JSON.stringify(result);
}

function meta(pathname: string): HeadBlobResult {
  const { url, uploadedAt, body } = blobs.get(pathname)!;
  return {
    pathname,
    url,
    downloadUrl: `${url}?download=1`,
    size: body.length,
    uploadedAt,
    etag: 'synthetic',
    contentType: 'application/json',
    contentDisposition: 'inline',
    cacheControl: 'public',
  };
}

beforeEach(() => {
  stubEnv('BLOB_READ_WRITE_TOKEN', 'synthetic-test-token');
  blobs.clear();
  mocked(list).mockImplementation((options) => {
    const all = [...blobs.keys()]
      .filter((path) => path.startsWith(options?.prefix ?? ''))
      .toSorted((a, b) => a.localeCompare(b));
    const start = Number(options?.cursor ?? 0);
    const more = start + LIST_PAGE < all.length;
    return Promise.resolve({
      blobs: all.slice(start, start + LIST_PAGE).map(meta),
      hasMore: more,
      cursor: more ? String(start + LIST_PAGE) : undefined,
    });
  });
  mocked(head).mockImplementation((pathname) =>
    blobs.has(pathname) ? Promise.resolve(meta(pathname)) : Promise.reject(new BlobNotFoundError()),
  );
  mocked(put).mockImplementation((pathname, body, options) => {
    const path = options?.addRandomSuffix
      ? pathname.replace(/\.json$/u, `-${String(suffix++).padStart(6, '0')}.json`)
      : pathname;
    if (blobs.has(path) && !options?.allowOverwrite)
      return Promise.reject(new Error('Blob already exists'));
    save(path, String(body));
    const { contentType, contentDisposition, etag, url, downloadUrl } = meta(path);
    return Promise.resolve({
      contentType,
      contentDisposition,
      etag,
      url,
      downloadUrl,
      pathname: path,
    });
  });
  mocked(del).mockImplementation((urls) => {
    for (const url of [urls].flat()) blobs.delete(String(url).replace('https://blob.test/', ''));
    return Promise.resolve();
  });
  vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
    const value = blobs.get(String(url).replace('https://blob.test/', ''));
    return Promise.resolve(
      value ? new Response(value.body) : new Response('missing', { status: 404 }),
    );
  });
});
afterEach(() => {
  unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('published video history', () => {
  it('retains a legacy stored index in History without an approval receipt', async () => {
    await publish(1, false);
    const page = await publishedVideoHistory(1);
    expect(page.entries).toHaveLength(1);
    expect(page.entries[0].approved).toBe(false);
    expect(page.entries[0].sources[0].observations.length).toBeGreaterThan(0);
    expect(put).not.toHaveBeenCalled();
    // A legacy entry without a receipt is still an exact read, so the shared cache may keep it.
    const read = await publishedVideoHistoryRead(1);
    expect(read.complete).toBe(true);
  });

  it('marks a page with an unreadable index as incomplete so it is not retained', async () => {
    const saved = await publish(1, false);
    save(indexPath(servingArtifact(102, 1002)), 'not json');
    const { page, complete } = await publishedVideoHistoryRead(1);
    expect(page.entries.map((entry) => Boolean(entry.error))).toEqual([true, false]);
    expect(page.entries[1].runId).toBe(saved.runId);
    expect(complete).toBe(false);
  });

  it('keeps suffixed native matrix indexes discoverable and rejects a different run in the name', async () => {
    const name = `h3-results-10-2-${'a'.repeat(64)}`;
    const saved = { storageVersion: 1, runId: '10', artifact: { id: 20, name }, sources: [] };
    save(`h3-video-media/v1/runs/10/${name}_20.json`, JSON.stringify(saved));
    save(`h3-video-media/v1/runs/10/${name.replace('results-10', 'results-11')}_20.json`, '{}');
    const artifacts = await storedArtifacts('10');
    expect(artifacts.map((item) => item.name)).toEqual([name]);
    const history = await publishedVideoHistory(1);
    expect(history.entries.map((entry) => entry.artifact.name)).toEqual([name]);
    expect(put).not.toHaveBeenCalled();
  });

  it('keeps an older deployment on the dashboard when newer sources fill the first window', async () => {
    await publish(0, true, 'NVIDIA H100', 10);
    for (let i = 1; i <= 50; i++) await publish(i, true, 'NVIDIA H200', 10);
    const page = await publishedVideoHistory(1, VIDEO_HISTORY_MAX_PAGES);
    expect(page.nextPage).toBe(VIDEO_HISTORY_MAX_PAGES + 1);
    expect(page.entries.at(-1)?.runId).toBe('100');
    expect(
      new Set(dashboardCells(videoPoints([page])).cells.map((cell) => cell.hardwareKey)),
    ).toEqual(new Set(['h100', 'h200']));
  });

  it('lists every index page, orders by publication date, and reads only ten unapproved indexes', async () => {
    // An unreadable unapproved index past the window neither costs a read nor blocks retention.
    save(indexPath(servingArtifact(99, 999)), 'not json');
    for (let i = 0; i < 12; i++) await publish(i, false);
    mocked(fetch).mockClear();
    const { page, complete } = await publishedVideoHistoryRead(1);
    expect(complete).toBe(true);
    expect(page.entries.map((entry) => entry.runId)).toEqual([
      '111',
      '110',
      '109',
      '108',
      '107',
      '106',
      '105',
      '104',
      '103',
      '102',
    ]);
    expect(page.nextPage).toBe(2);
    expect(artifactReads()).toBe(10);
    expect(put).not.toHaveBeenCalled();
  });

  it('reads several pages in one call exactly as consecutive single pages', async () => {
    for (let i = 0; i < 30; i++) await publish(i, i % 3 !== 0);
    const single = await Promise.all([1, 2, 3].map((page) => publishedVideoHistory(page)));
    const joined = { entries: single.flatMap((page) => page.entries), nextPage: null };
    expect(await publishedVideoHistory(1, 5)).toEqual({ schemaVersion: 1, ...joined });
    expect(await publishedVideoHistory(1, 2)).toEqual({
      schemaVersion: 1,
      entries: [...single[0].entries, ...single[1].entries],
      nextPage: 3,
    });
    expect(await publishedVideoHistory(2, 2)).toEqual({
      schemaVersion: 1,
      entries: [...single[1].entries, ...single[2].entries],
      nextPage: null,
    });
  });
});

describe('recorded video history', () => {
  it('serves backfilled entries from one snapshot read and no artifact reads, byte-identical', async () => {
    for (let i = 0; i < 14; i++) await publish(i, i % 4 !== 1);
    const expected = [await direct(1, 5), await direct(2)];
    expect(await recordVideoHistory(null)).toEqual({ entries: 14, built: 14, skipped: 0 });
    mocked(fetch).mockClear();
    mocked(head).mockClear();
    expect(JSON.stringify(await publishedVideoHistory(1, 5))).toBe(expected[0]);
    expect(JSON.stringify(await publishedVideoHistory(2))).toBe(expected[1]);
    expect(artifactReads()).toBe(0);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(head).not.toHaveBeenCalled();
  });

  it('projects only drifted indexes directly and repairs them on the next record', async () => {
    const saved = await Promise.all([0, 1, 2, 3, 4].map((i) => publish(i, i !== 3)));
    await recordVideoHistory(null);
    save(indexPath(saved[2]), blobs.get(indexPath(saved[2]))!.body);
    blobs.delete(approvalPath(saved[0].runId, ref(saved[0])));
    await approveVideoPublication(
      saved[3].runId,
      ref(saved[3]),
      saved[3],
      null,
      new AbortController().signal,
    );
    const added = await publish(5);
    const expected = await direct(1);
    mocked(fetch).mockClear();
    expect(JSON.stringify(await publishedVideoHistory(1))).toBe(expected);
    expect(artifactReads()).toBe(4);
    expect(await recordVideoHistory(added)).toEqual({ entries: 3, built: 1, skipped: 0 });
    expect(await recordVideoHistory(null)).toEqual({ entries: 6, built: 3, skipped: 0 });
    mocked(fetch).mockClear();
    expect(JSON.stringify(await publishedVideoHistory(1))).toBe(expected);
    expect(artifactReads()).toBe(0);
  });

  it('records only the published artifact, prunes deleted indexes and skips unchanged writes', async () => {
    const first = await publish(0);
    await recordVideoHistory(null);
    const added = await publish(1);
    const sibling = servingArtifact(Number(added.runId), added.artifact.id + 1);
    save(indexPath(sibling), JSON.stringify(sibling));
    mocked(fetch).mockClear();
    expect(await recordVideoHistory(added)).toEqual({ entries: 2, built: 1, skipped: 0 });
    expect(artifactReads()).toBe(0);
    expect(await recordVideoHistory(null)).toEqual({ entries: 3, built: 1, skipped: 0 });
    const before = mocked(put).mock.calls.length;
    expect(await recordVideoHistory(added)).toEqual({ entries: 3, built: 0, skipped: 0 });
    expect(await recordVideoHistory(null)).toEqual({ entries: 3, built: 0, skipped: 0 });
    expect(put).toHaveBeenCalledTimes(before);
    blobs.delete(indexPath(sibling));
    expect(await recordVideoHistory(null)).toEqual({ entries: 2, built: 0, skipped: 0 });
    const written = Object.keys(JSON.parse(String(mocked(put).mock.calls.at(-1)![1])));
    expect(written.toSorted()).toEqual([indexPath(added), indexPath(first)].toSorted());
  });

  it('keeps only the newest and previous snapshots and ignores other projections', async () => {
    const saved = await publish(0);
    save(
      `h3-video-media/v1/runs/history/v${VIDEO_HISTORY_PROJECTION + 1}/9999999999999.json`,
      '{}',
    );
    const expected = await direct(1);
    expect(JSON.stringify(await publishedVideoHistory(1))).toBe(expected);
    await recordVideoHistory(null);
    await publish(1);
    await recordVideoHistory(null);
    await publish(2);
    await recordVideoHistory(null);
    const kept = snapshots();
    expect(kept).toHaveLength(2);
    expect(kept.every((path) => path.includes(`/v${VIDEO_HISTORY_PROJECTION}/`))).toBe(true);
    mocked(fetch).mockClear();
    const history = await publishedVideoHistory(1);
    expect(history.entries.map((entry) => entry.runId)).toEqual(['102', '101', saved.runId]);
    expect(artifactReads()).toBe(0);
  });

  it('never caches a transient receipt failure and never rewrites over an unreadable snapshot', async () => {
    const saved = await publish(0);
    const receiptUrl = blobs.get(approvalPath(saved.runId, ref(saved)))!.url;
    const read = mocked(fetch).getMockImplementation()!;
    mocked(fetch).mockImplementation((url, init) =>
      String(url) === receiptUrl
        ? Promise.resolve(new Response('', { status: 503 }))
        : read(url, init),
    );
    expect(await recordVideoHistory(null)).toEqual({ entries: 0, built: 0, skipped: 1 });
    mocked(fetch).mockImplementation(read);
    mocked(head).mockRejectedValueOnce(new BlobNotFoundError());
    expect(await recordVideoHistory(null)).toEqual({ entries: 0, built: 0, skipped: 1 });
    const healed = await publishedVideoHistory(1);
    expect(healed.entries[0].approved).toBe(true);
    await recordVideoHistory(null);
    const [snapshot] = snapshots();
    const added = await publish(1);
    mocked(fetch).mockImplementation((url, init) =>
      String(url).includes('/runs/history/')
        ? Promise.resolve(new Response('', { status: 500 }))
        : read(url, init),
    );
    const writes = mocked(put).mock.calls.length;
    await expect(recordVideoHistory(added)).rejects.toThrow('snapshot unavailable');
    expect(put).toHaveBeenCalledTimes(writes);
    expect(snapshots()).toEqual([snapshot]);
    expect(JSON.stringify(await publishedVideoHistory(1))).toBe(await direct(1));
  });
});

describe('history projection version', () => {
  // Snapshots store projected entries. When these sources change, bump VIDEO_HISTORY_PROJECTION
  // if recorded entries could differ, then re-pin. Otherwise old snapshots serve stale entries.
  it('pins the sources that produce recorded entries', () => {
    const root = resolve(import.meta.dirname, '../..');
    const seen = new Set<string>();
    const visit = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      for (const match of readFileSync(file, 'utf8').matchAll(
        /from '(?<spec>(?:\.{1,2}|@)\/[^']+)'/gu,
      )) {
        const spec = match.groups!.spec;
        const base = spec.startsWith('@/')
          ? join(root, spec.slice(2))
          : resolve(dirname(file), spec);
        const target = [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')].find(existsSync);
        if (target) visit(target);
      }
    };
    visit(join(root, 'lib/video/video-history-store.ts'));
    // hardware.ts names native GPUs from the shared registry.
    visit(resolve(root, '../../constants/src/gpu-keys.ts'));
    const hash = createHash('sha256');
    for (const file of [...seen].toSorted())
      hash.update(relative(root, file)).update(readFileSync(file));
    expect({ projection: VIDEO_HISTORY_PROJECTION, sources: hash.digest('hex') }).toEqual({
      projection: 6,
      // Re-pinned after the lazy power model loader gained failure and retry states (reached only
      // through type imports), fetchJson learned to take an early document-load response,
      // data_query_failed stopped reporting failed background refetches that keep their data,
      // dashboard-routes gained the default Inference model slug, inference topology labels
      // moved to one pass (the graph reaches that file only for the unchanged pointTopologyKey),
      // and the inference setSelectedGPUs action type now returns whether picks applied.
      // None of these feed recorded entries, so they are unchanged.
      sources: '3accfd3dae88a52f51455ebb1fcfe9c38c645fdcb49fc0fcef326deab1710716',
    });
  });
});
