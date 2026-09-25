'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Heading } from '@/components/ui/heading';
import { Input } from '@/components/ui/input';
import { useLocale } from '@/lib/use-locale';
import { track } from '@/lib/analytics';
import VideoSelect from './VideoSelect';
import type { VideoHistoryEntry, VideoHistoryPage } from './history';

const STRINGS = {
  en: {
    title: 'Performance history',
    intro:
      'Published H3 results, including older runs. Each entry keeps its original execution and artifact identity.',
    note: 'Recorded observations only; no matched version baseline has been selected. Media validity does not establish perceptual quality or serving capacity.',
    order:
      'Newest publication first. Execution time is shown separately; re-exporting a result does not make it a new measurement.',
    loading: 'Loading published results…',
    error: 'Could not load published history.',
    retry: 'Retry',
    older: 'More published results',
    empty: 'No matching entries among the loaded results.',
    loaded: 'Filters apply to loaded entries. Load more published results to search older pages.',
    all: 'All',
    hardware: 'Hardware',
    concurrency: 'Client concurrency',
    workload: 'Search workload or runtime',
    published: 'Published',
    execution: 'Original execution',
    source: 'Source run',
    sourceSha: 'Source SHA',
    exporter: 'Artifact run',
    observation: 'Recorded observation',
    fidelity: 'Paired fidelity',
    calibration: 'Calibration',
    qualification: 'Release qualification',
    no: 'Not qualified',
    yes: 'Qualified by recorded policy',
    unavailable: 'Unavailable',
    details: 'Evidence and limitations',
    counts: 'Valid / completed / scheduled',
    failed: 'Failed',
    latency: 'Client-ready latency (s)',
    p50: 'P50',
    p90: 'P90',
    throughput: 'Valid clips / GPU-hour',
    energy: 'GPU-board kJ / valid clip',
    status: 'Execution',
    open: 'Open result',
    missing:
      '— means unavailable, invalid or insufficient samples. P90 requires at least 10 valid samples per cell.',
    metricNote:
      'Latency and throughput cover submission to downloaded media. Energy uses the recorded generation window and participating GPU boards; lower is better. Failed attempts remain in the recorded measurement window.',
    samples: 'Valid latency samples',
    replay: 'Retained-data replay for local verification; no new measurements or publication.',
  },
  zh: {
    title: '性能历史',
    intro: '查看已发布的 H3 结果，包括较早运行；每条记录保留原始执行与产物标识。',
    note: '当前仅展示观测值，尚未选择匹配的版本基线。媒体有效性不代表感知质量或服务容量已通过验收。',
    order: '按发布时间从新到旧排列。执行时间单独列出；重新导出不代表重新测量。',
    loading: '正在加载已发布结果…',
    error: '无法加载性能历史。',
    retry: '重试',
    older: '更多已发布结果',
    empty: '已加载的结果中暂无匹配记录。',
    loaded: '筛选仅作用于已加载的记录；查看更早页面请加载更多已发布结果。',
    all: '全部',
    hardware: '硬件',
    concurrency: '客户端并发数',
    workload: '搜索工作负载或运行时版本',
    published: '发布时间',
    execution: '原始执行时间',
    source: '原始运行',
    sourceSha: '源码 SHA',
    exporter: '产物运行',
    observation: '观测记录',
    fidelity: '成对保真度',
    calibration: '阈值校准',
    qualification: '发布验收',
    no: '未经验证',
    yes: '已按记录策略通过',
    unavailable: '无数据',
    details: '证据与局限',
    counts: '有效 / 已完成 / 计划',
    failed: '失败',
    latency: '客户端就绪延迟（秒）',
    p50: 'P50',
    p90: 'P90',
    throughput: '有效视频数 / GPU 小时',
    energy: '每有效视频 GPU 板卡能耗（kJ）',
    status: '执行状态',
    open: '打开结果',
    missing: '— 表示无数据、数据无效或样本不足。每个配置至少有 10 个有效样本才显示 P90。',
    metricNote:
      '延迟与吞吐量涵盖提交到媒体下载完成。能耗使用记录的生成时间窗口，按参与计算的 GPU 板卡统计，越低越好；失败尝试的耗时仍计入对应测量窗口。',
    samples: '有效延迟样本数',
    replay: '本地验证使用保留数据回放，未重新测量或发布。',
  },
};
const STATUS: Record<string, { en: string; zh: string }> = {
  complete: { en: 'Complete', zh: '已完成' },
  completed: { en: 'Complete', zh: '已完成' },
  running: { en: 'Running', zh: '运行中' },
  not_started: { en: 'Not started', zh: '未开始' },
  interrupted: { en: 'Interrupted', zh: '已中断' },
  failed: { en: 'Failed', zh: '失败' },
  fail: { en: 'Failed', zh: '未通过' },
  pass: { en: 'Passed', zh: '已通过' },
  inconclusive: { en: 'Inconclusive', zh: '无法判定' },
  uncalibrated: { en: 'Uncalibrated', zh: '未校准' },
  calibrated: { en: 'Calibrated', zh: '已校准' },
};
const fmt = (value: number | null) =>
  value === null ? '—' : value.toLocaleString('en-US', { maximumFractionDigits: 3 });
const date = (value: string | null) =>
  value ? `${value.slice(0, 10)} ${value.slice(11, 16)} UTC` : '—';

const filter = (key: string, value: string, setter: (value: string) => void) => {
  setter(value);
  const url = new URL(location.href);
  if (value) url.searchParams.set(`history-${key}`, value);
  else url.searchParams.delete(`history-${key}`);
  history.replaceState(null, '', url);
  track('video_history_filter_changed', { filter: key });
};

export default function VideoHistory({
  onOpen,
}: {
  onOpen: (run: string, artifact: string, source?: string, cell?: string) => void;
}) {
  const locale = useLocale();
  const s = STRINGS[locale];
  const status = (value: string | null) =>
    value ? (STATUS[value]?.[locale] ?? value) : s.unavailable;
  const [entries, setEntries] = useState<VideoHistoryEntry[]>([]);
  const [nextPage, setNextPage] = useState<number | null>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [replay, setReplay] = useState(false);
  const [hardware, setHardware] = useState('');
  const [concurrency, setConcurrency] = useState('');
  const [query, setQuery] = useState('');
  async function load(page: number, signal?: AbortSignal) {
    setLoading(true);
    setError(false);
    try {
      const response = await fetch(`/api/video-runs?format=history&page=${page}`, {
        signal,
        cache: 'no-store',
      });
      const data: VideoHistoryPage = await response.json();
      if (!response.ok || data.schemaVersion !== 1 || !Array.isArray(data.entries))
        throw new Error('History unavailable');
      if (signal?.aborted) return;
      setEntries((old) =>
        page === 1
          ? data.entries
          : [...old, ...data.entries.filter((entry) => !old.some((item) => item.id === entry.id))],
      );
      setNextPage(data.nextPage);
      setReplay(response.headers.get('x-videogenx-replay') === '1');
    } catch {
      if (!signal?.aborted) setError(true);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setHardware(params.get('history-hardware') ?? '');
    setConcurrency(params.get('history-concurrency') ?? '');
    setQuery(params.get('history-query') ?? '');
    const controller = new AbortController();
    void load(1, controller.signal);
    return () => controller.abort();
  }, []);
  const observations = entries.flatMap((entry) =>
    entry.sources.flatMap((source) => source.observations),
  );
  const visible = entries.flatMap((entry) => {
    const sources = entry.sources.flatMap((source) => {
      const selected = source.observations.filter(
        (point) =>
          (!hardware || point.hardware === hardware) &&
          (!concurrency || String(point.concurrency) === concurrency) &&
          (!query ||
            `${point.workload} ${point.runtime}`.toLowerCase().includes(query.toLowerCase())),
      );
      return selected.length > 0 ||
        (source.observations.length === 0 && !hardware && !concurrency && !query)
        ? [{ ...source, observations: selected }]
        : [];
    });
    return sources.length > 0 || (entry.error && !hardware && !concurrency && !query)
      ? [{ ...entry, sources }]
      : [];
  });
  return (
    <section className="min-w-0 space-y-4" data-testid="video-history">
      <div className="space-y-2">
        <Heading as="h1" level="section">
          {s.title}
        </Heading>
        <p className="text-sm text-muted-foreground">{s.intro}</p>
        <p className="text-xs text-muted-foreground">{s.order}</p>
        {replay && (
          <p role="note" className="text-sm">
            {s.replay}
          </p>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <VideoSelect
          label={s.hardware}
          value={hardware || 'all'}
          onValueChange={(value) => filter('hardware', value === 'all' ? '' : value, setHardware)}
          options={[
            { value: 'all', label: s.all },
            ...[...new Set(observations.map((point) => point.hardware).filter(Boolean))]
              .sort()
              .map((value) => ({ value, label: value })),
          ]}
        />
        <VideoSelect
          label={s.concurrency}
          value={concurrency || 'all'}
          onValueChange={(value) =>
            filter('concurrency', value === 'all' ? '' : value, setConcurrency)
          }
          options={[
            { value: 'all', label: s.all },
            ...[
              ...new Set(
                observations.map((point) => point.concurrency).filter((value) => value !== null),
              ),
            ]
              .sort((a, b) => a - b)
              .map((value) => ({ value: String(value), label: `C${value}` })),
          ]}
        />
        <label className="space-y-1 text-sm">
          <span>{s.workload}</span>
          <Input
            value={query}
            onChange={(event) => filter('query', event.target.value, setQuery)}
          />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">{s.loaded}</p>
      <p className="text-sm text-muted-foreground">{s.note}</p>
      {!loading && !error && visible.length === 0 && <p role="status">{s.empty}</p>}
      {visible.map((entry) => (
        <Card key={entry.id} className="min-w-0 space-y-4 p-4" data-testid="video-history-entry">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <a
              className="text-primary underline"
              href={`https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${entry.runId}`}
              target="_blank"
              rel="noreferrer"
            >
              {s.exporter} #{entry.runId}
            </a>
            <span className="text-xs text-muted-foreground">
              {s.published}: {date(entry.publishedAt)}
            </span>
          </div>
          {entry.error && <p role="alert">{entry.error}</p>}
          {entry.sources.map((source) => (
            <div key={source.id} className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm">
                  <strong>{source.kind === 'fidelity' ? s.fidelity : s.observation}</strong> ·{' '}
                  {s.source} #{source.id}
                  {source.hardware && ` · ${source.hardware}`}
                  <p className="text-xs text-muted-foreground">
                    {s.execution}: {date(source.observedAt)}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onOpen(entry.runId, String(entry.artifact.id), source.id)}
                >
                  {s.open}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {s.status}: {status(source.execution)} · {s.fidelity}: {status(source.fidelity)} ·{' '}
                {s.calibration}: {status(source.calibration)} · {s.qualification}:{' '}
                {source.releaseQualified === null
                  ? s.unavailable
                  : source.releaseQualified
                    ? s.yes
                    : s.no}
              </p>
              {source.error && (
                <p role="alert" className="break-words text-sm">
                  {source.error}
                </p>
              )}
              {source.observations.length > 0 && (
                <div className="max-w-full overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="p-2">{s.hardware} / C</th>
                        <th className="p-2">{s.counts}</th>
                        <th className="p-2">{s.status}</th>
                        <th className="p-2">
                          {s.latency}
                          <br />
                          {s.p50} / {s.p90}
                        </th>
                        <th className="p-2">{s.throughput}</th>
                        <th className="p-2">{s.energy}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {source.observations.map((point) => (
                        <tr
                          key={point.id}
                          className="border-b border-border/40 align-top"
                          data-testid="video-history-observation"
                        >
                          <th className="p-2 font-normal">
                            <button
                              className="cursor-pointer text-left text-primary underline"
                              onClick={() =>
                                onOpen(
                                  entry.runId,
                                  String(entry.artifact.id),
                                  source.id,
                                  point.cell ?? undefined,
                                )
                              }
                            >
                              {point.hardware || s.unavailable} · C{point.concurrency ?? '—'}
                            </button>
                            <p className="text-xs text-muted-foreground">
                              {point.runtime.slice(0, 12) || '—'}
                            </p>
                          </th>
                          <td className="whitespace-nowrap p-2">
                            {fmt(point.valid)} / {fmt(point.completed)} / {fmt(point.scheduled)}
                            <p className="text-xs">
                              {s.failed}: {fmt(point.failed)}
                            </p>
                          </td>
                          <td className="p-2">{status(point.status)}</td>
                          <td className="p-2">
                            {fmt(point.p50)} / {fmt(point.p90)}
                            <p className="text-xs text-muted-foreground">n={point.samples}</p>
                          </td>
                          <td className="p-2">{fmt(point.clipsGpuHour)}</td>
                          <td className="p-2">{fmt(point.energyKj)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">{s.details}</summary>
                <div className="space-y-2 break-words pt-2">
                  <p>{s.missing}</p>
                  <p>{s.metricNote}</p>
                  <p>{source.observations[0]?.workload}</p>
                  <p>
                    {s.sourceSha}: {source.sourceSha || '—'}
                  </p>
                  <p>SHA256: {source.sha256 ?? '—'}</p>
                </div>
              </details>
            </div>
          ))}
        </Card>
      ))}
      {loading && <p role="status">{s.loading}</p>}
      {error && (
        <div role="alert" className="space-y-2">
          <p>{s.error}</p>
          <Button variant="outline" onClick={() => void load(nextPage ?? 1)}>
            {s.retry}
          </Button>
        </div>
      )}
      {nextPage && !loading && !error && (
        <Button variant="outline" onClick={() => void load(nextPage)}>
          {s.older}
        </Button>
      )}
    </section>
  );
}
