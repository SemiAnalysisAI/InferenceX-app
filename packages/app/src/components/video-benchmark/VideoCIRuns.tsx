'use client';

import { useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { Input } from '@/components/ui/input';
import { useLocale } from '@/lib/use-locale';
import VideoBenchmark from './VideoBenchmark';
import type { StoredArtifact, StoredSource } from './stored';
import { archiveSources, type CIArtifact, type CIRun } from './archive';

const STRINGS = {
  en: {
    title: 'H3 video benchmark',
    preparing: 'Loading results and preparing media. The first publication of a run takes longer.',
    downloading: 'Downloading CI archive',
    advanced: 'Run details and artifact selection',
    error: 'Could not load CI results',
    details: 'Technical details',
    select: 'CI run',
    refresh: 'Refresh',
    older: 'Older runs',
    browse: 'Browse CI runs',
    loading: 'Loading CI results…',
    source: 'Original GPU execution',
    artifact: 'Result artifact',
    none: 'No result artifact for this run yet. Failed runs may have only CI logs.',
    empty: 'No H3 runs in this page of GitHub history. Load older runs or enter a run ID.',
    retry: 'Retry',
    direct: 'GitHub run ID',
    open: 'Open run',
    local: 'Local artifact tools',
    note: 'Results preserve their original GitHub CI identities. Stored media loads separately from the benchmark data; unpublished artifacts use the CI archive fallback.',
    expired: 'Expired',
    noMedia: 'Artifact unavailable',
  },
  zh: {
    title: 'H3 视频基准测试',
    preparing: '正在加载结果并准备媒体。首次发布该运行的产物需要更多时间。',
    downloading: '正在下载 CI 产物',
    advanced: '运行详情与产物选择',
    error: '无法加载 CI 结果',
    details: '技术详情',
    select: 'CI 运行',
    refresh: '刷新',
    older: '更早的运行',
    browse: '浏览 CI 运行',
    loading: '正在加载 CI 结果…',
    source: '原始 GPU 运行',
    artifact: '结果产物',
    none: '此次运行尚无结果产物。失败的运行可能仅保留 CI 日志。',
    empty: '本页 GitHub 历史中没有 H3 运行。可加载更早的运行或输入运行 ID。',
    retry: '重试',
    direct: 'GitHub 运行 ID',
    open: '查看运行',
    local: '本地产物工具',
    note: '结果保留原始 GitHub CI 运行标识。已存储的媒体与基准测试数据分别加载；尚未发布的产物则回退为下载 CI 产物压缩包。',
    expired: '已过期',
    noMedia: '产物不可用',
  },
};

async function json(url: string) {
  const response = await fetch(url, { cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data;
}

function share(runId: number, artifactId?: number, source?: string) {
  const url = new URL(location.href);
  url.search = '';
  url.searchParams.set('run', String(runId));
  if (artifactId) url.searchParams.set('artifact', String(artifactId));
  if (source) url.searchParams.set('source', source);
  history.replaceState(null, '', url);
}

export default function VideoCIRuns() {
  const s = STRINGS[useLocale()];
  const [runs, setRuns] = useState<CIRun[]>([]);
  const [run, setRun] = useState<CIRun | null>(null);
  const [artifacts, setArtifacts] = useState<CIArtifact[]>([]);
  const [artifact, setArtifact] = useState<CIArtifact | null>(null);
  const [sources, setSources] = useState<
    { id: string; read?: (path: string) => Promise<Blob>; stored?: StoredSource }[]
  >([]);
  const [sourceId, setSourceId] = useState('');
  const [nextPage, setNextPage] = useState<number | null>(1);
  const [loadError, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [direct, setDirect] = useState('');
  const [manual, setManual] = useState(false);
  const request = useRef(0);
  const download = useRef<AbortController | null>(null);

  async function loadArtifact(
    selectedRun: CIRun,
    selected: CIArtifact,
    current: number,
    source?: string,
  ) {
    setArtifact(selected);
    setSources([]);
    const controller = new AbortController();
    download.current = controller;
    setProgress(s.preparing);
    const endpoint = `/api/video-runs?run=${selectedRun.id}&artifact=${selected.id}`;
    let found:
      | { id: string; read?: (path: string) => Promise<Blob>; stored?: StoredSource }[]
      | null = null;
    try {
      const response = await fetch(`${endpoint}&format=media`, { signal: controller.signal });
      if (response.ok && response.status !== 204) {
        const saved: StoredArtifact = await response.json();
        if (
          saved.storageVersion !== 1 ||
          saved.runId !== String(selectedRun.id) ||
          saved.artifact.id !== selected.id
        )
          throw new Error('Stored artifact identity mismatch');
        found = saved.sources.map((item) => ({ id: item.id, stored: item }));
      }
    } catch (error) {
      if (controller.signal.aborted) throw error;
    }
    if (!found) {
      if (selected.expired) throw new Error(s.expired);
      const response = await fetch(endpoint, { signal: controller.signal });
      if (!response.ok) {
        const failure = await response.json();
        throw new Error(failure.error ?? s.noMedia);
      }
      const stream = response.body?.getReader();
      if (!stream) throw new Error(s.noMedia);
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      let bytes = 0;
      for (;;) {
        const chunk = await stream.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 256 * 1024 ** 2) {
          await stream.cancel();
          throw new Error('Archive exceeds 256 MiB');
        }
        chunks.push(new Uint8Array(chunk.value));
        if (current === request.current)
          setProgress(`${s.downloading} · ${(bytes / 1024 ** 2).toFixed(1)} MiB`);
      }
      found = await archiveSources(new Blob(chunks), selected);
    }
    if (current !== request.current) return;
    const chosen =
      found.find((item) => item.id === source) ??
      found.toSorted((a, b) => Number(b.id) - Number(a.id))[0];
    if (!chosen) throw new Error(s.none);
    setSources(found);
    setSourceId(chosen.id);
    share(selectedRun.id, selected.id, chosen.id);
  }
  async function selectRun(runId: string, artifactId?: string | null, source?: string | null) {
    const current = ++request.current;
    download.current?.abort();
    setLoading(true);
    setProgress('');
    setError('');
    setRun(null);
    setSources([]);
    setArtifact(null);
    setArtifacts([]);
    try {
      const data: { run: CIRun; artifacts: CIArtifact[] } = await json(
        `/api/video-runs?run=${encodeURIComponent(runId)}`,
      );
      if (current !== request.current) return;
      setRun(data.run);
      setArtifacts(data.artifacts);
      setRuns((old) => (old.some((r) => r.id === data.run.id) ? old : [data.run, ...old]));
      const selected =
        data.artifacts.find((a) => String(a.id) === artifactId) ??
        data.artifacts
          .filter((a) => a.name.endsWith(`-${data.run.run_attempt}`))
          .toSorted(
            (a, b) =>
              Number(b.name.startsWith('h3-results-')) - Number(a.name.startsWith('h3-results-')) ||
              b.id - a.id,
          )[0];
      share(data.run.id);
      if (selected) await loadArtifact(data.run, selected, current, source ?? undefined);
    } catch (error) {
      if (current === request.current)
        setError(error instanceof Error ? error.message : String(error));
    } finally {
      if (current === request.current) setLoading(false);
    }
  }
  async function list(page: number, auto = false) {
    const current = ++request.current;
    download.current?.abort();
    setLoading(true);
    setProgress('');
    setError('');
    try {
      const data: { runs: CIRun[]; nextPage: number | null } = await json(
        `/api/video-runs?page=${page}`,
      );
      if (current !== request.current) return;
      setRuns((old) =>
        page === 1
          ? [...(run && !data.runs.some((r) => r.id === run.id) ? [run] : []), ...data.runs]
          : [...old, ...data.runs.filter((r) => !old.some((o) => o.id === r.id))],
      );
      setNextPage(data.nextPage);
      if (
        auto &&
        data.runs.length === 0 &&
        data.nextPage &&
        page < 10 &&
        !new URLSearchParams(location.search).has('run')
      ) {
        await list(data.nextPage, true);
        return;
      }
      if (auto) {
        const params = new URLSearchParams(location.search);
        const selected = params.get('run') ?? (data.runs[0] ? String(data.runs[0].id) : null);
        if (selected) await selectRun(selected, params.get('artifact'), params.get('source'));
      }
    } catch (error) {
      if (current === request.current)
        setError(error instanceof Error ? error.message : String(error));
    } finally {
      if (current === request.current) setLoading(false);
    }
  }
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const directRun = params.get('run');
    if (directRun) void selectRun(directRun, params.get('artifact'), params.get('source'));
    else void list(1, true);
    return () => {
      request.current++;
      download.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const selectedSource = sources.find((item) => item.id === sourceId);
  return (
    <div className="mx-auto min-w-0 w-full max-w-7xl space-y-4 py-6" data-testid="video-ci-runs">
      <Card className="gap-3 p-4">
        <Heading as="h1" level="section">
          {s.title}
        </Heading>

        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-0 flex-1 space-y-1 text-sm">
            {s.select}
            <select
              aria-label={s.select}
              className="w-full rounded border bg-background p-2"
              value={run?.id ?? ''}
              onChange={(e) => void selectRun(e.target.value)}
            >
              <option value="" disabled>
                —
              </option>
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  #{r.id} · {r.name} · {r.conclusion ?? r.status}
                </option>
              ))}
            </select>
          </label>
          {sources.length > 1 && (
            <label className="w-full min-w-0 space-y-1 text-sm sm:w-52">
              {s.source}
              <select
                aria-label={s.source}
                className="w-full rounded border bg-background p-2"
                value={sourceId}
                onChange={(e) => {
                  setSourceId(e.target.value);
                  if (run && artifact) share(run.id, artifact.id, e.target.value);
                }}
              >
                {sources.map((item) => (
                  <option key={item.id} value={item.id}>
                    #{item.id}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Button variant="outline" disabled={loading} onClick={() => void list(1, true)}>
            {s.refresh}
          </Button>
          {nextPage && (
            <Button variant="outline" disabled={loading} onClick={() => void list(nextPage)}>
              {nextPage === 1 ? s.browse : s.older}
            </Button>
          )}
        </div>
        {runs.length === 0 && !loading && <p>{s.empty}</p>}
        <details>
          <summary className="cursor-pointer text-sm text-muted-foreground">{s.advanced}</summary>
          <p className="my-3 text-xs text-muted-foreground">{s.note}</p>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void selectRun(direct);
            }}
          >
            <Input
              className="max-w-xs"
              aria-label={s.direct}
              placeholder={s.direct}
              value={direct}
              onChange={(e) => setDirect(e.target.value)}
              pattern="[0-9]+"
              required
            />
            <Button type="submit" variant="outline">
              {s.open}
            </Button>
          </form>
          {run && (
            <a
              className="break-all text-sm text-primary underline"
              href={`https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${run.id}`}
              target="_blank"
              rel="noreferrer"
            >
              #{run.id} · {run.status} / {run.conclusion ?? '—'} · {run.created_at} ·{' '}
              {run.head_sha.slice(0, 10)}
            </a>
          )}
          {artifacts.length > 0 && (
            <label className="text-sm">
              {s.artifact}
              <select
                aria-label={s.artifact}
                className="mt-1 w-full rounded border bg-background p-2"
                value={artifact?.id ?? ''}
                onChange={(e) => run && void selectRun(String(run.id), e.target.value)}
              >
                <option value="" disabled>
                  —
                </option>
                {artifacts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.expired ? ` · ${s.expired}` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
        </details>
        {loading && (
          <div role="status" className="space-y-2">
            <p className="text-sm">{progress || s.loading}</p>
            <progress className="h-1 w-full" aria-label={s.loading} />
          </div>
        )}
        {loadError && (
          <div role="alert">
            <p>{s.error}</p>
            <details>
              <summary className="cursor-pointer text-sm">{s.details}</summary>
              <pre className="mt-2 whitespace-pre-wrap break-all text-xs">{loadError}</pre>
            </details>
            <Button
              variant="outline"
              onClick={() =>
                run
                  ? void selectRun(String(run.id), artifact ? String(artifact.id) : null)
                  : void list(1, true)
              }
            >
              {s.retry}
            </Button>
          </div>
        )}
        {run && !loading && !loadError && artifacts.length === 0 && <p>{s.none}</p>}
      </Card>
      {selectedSource && (
        <VideoBenchmark
          key={`${artifact?.id}-${sourceId}`}
          reader={selectedSource.read}
          published={selectedSource.stored}
        />
      )}
      <details onToggle={(event) => setManual(event.currentTarget.open)}>
        <summary className="cursor-pointer text-sm text-muted-foreground">{s.local}</summary>
        {manual && <VideoBenchmark />}
      </details>
    </div>
  );
}
