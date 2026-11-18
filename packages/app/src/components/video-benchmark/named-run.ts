import { VIDEO_HISTORY_MAX_PAGES, type VideoHistoryEntry, type VideoHistoryPage } from './history';
import { namedRunPoints } from './points';

export interface NamedVideoRun {
  runId: string;
  source: 'history' | 'live' | 'none' | 'incomplete';
  points: ReturnType<typeof namedRunPoints>;
}

function result(
  runId: string,
  entries: VideoHistoryEntry[],
  source: NamedVideoRun['source'],
): NamedVideoRun {
  const incomplete = entries.some((e) => e.error || e.sources.some((s) => s.error));
  const points = namedRunPoints([{ schemaVersion: 1, entries, nextPage: null }], runId);
  return { runId, source: incomplete ? 'incomplete' : source, points };
}

export function cachedNamedVideoRun(
  pages: VideoHistoryPage[],
  runId: string,
  complete = true,
): NamedVideoRun | null {
  if (complete && (pages.length === 0 || pages.at(-1)?.nextPage !== null)) return null;
  const entries = pages.flatMap((p) => p.entries.filter((e) => e.runId === runId));
  if (!complete) return result(runId, entries, 'incomplete');
  return entries.length > 0 ? result(runId, entries, 'history') : null;
}

/** A bounded cohort can omit an entire stored run or some of its deployments. */
export async function resolveNamedVideoRun(
  pages: VideoHistoryPage[],
  runId: string,
  read: (params: Record<string, string>) => Promise<Response>,
): Promise<NamedVideoRun> {
  const cached = cachedNamedVideoRun(pages, runId);
  if (cached && cached.source !== 'incomplete') return cached;
  const seen = new Map(
    pages.flatMap((p) => p.entries.filter((e) => e.runId === runId).map((e) => [e.id, e] as const)),
  );
  const readPage = async (params: Record<string, string>) => {
    const response = await read({ run: runId, ...params });
    if (!response.ok) throw new Error('Named run unavailable');
    const page: VideoHistoryPage = await response.json();
    if (
      page.schemaVersion !== 1 ||
      !Array.isArray(page.entries) ||
      page.entries.some((entry) => entry.runId !== runId)
    )
      throw new Error('Unsupported named run projection');
    for (const entry of page.entries) seen.set(entry.id, entry);
    if (response.headers.get('x-videogenx-incomplete') === '1')
      throw new Error('Named run incomplete');
    return page;
  };
  try {
    if (cached || typeof pages.at(-1)?.nextPage === 'number') {
      // A clean exact listing is authoritative, including removals since the cohort was read.
      const exact: VideoHistoryEntry[] = [];
      let cursor = 1;
      for (;;) {
        const page = await readPage({
          format: 'history',
          page: String(cursor),
          pages: String(VIDEO_HISTORY_MAX_PAGES),
        });
        exact.push(...page.entries);
        if (page.nextPage === null) break;
        if (!Number.isSafeInteger(page.nextPage) || page.nextPage <= cursor)
          throw new Error('Invalid history cursor');
        cursor = page.nextPage;
      }
      if (exact.length > 0) return result(runId, exact, 'history');
      seen.clear();
    }
    const live = await readPage({ format: 'live' });
    return result(runId, live.entries, live.entries.length > 0 ? 'live' : 'none');
  } catch {
    return result(runId, [...seen.values()], 'incomplete');
  }
}
