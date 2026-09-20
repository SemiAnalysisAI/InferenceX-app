'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { track } from '@/lib/analytics';
import { useLocale } from '@/lib/use-locale';
import {
  comparablePoints,
  compareMetrics,
  compareSide,
  pairCases,
  type CasePair,
  type CompareRow,
  type CompareSide,
} from './compare';
import {
  DEFAULT_VIDEO_COMPARE_SELECTION,
  defaultComparePair,
  readVideoCompareSelection,
  resolveCompareSelection,
  writeVideoCompareSelection,
  type VideoCompareSelection,
} from './compare-url-state';
import { layoutLabel } from './deployment';
import { hardwareLabel } from './hardware';
import {
  formatMetric,
  TIER_LABELS,
  VIDEO_METRICS,
  type MetricOptions,
  type VideoPoint,
} from './metrics';
import type { StoredArtifact } from './stored';
import VideoSelect from './VideoSelect';

const STRINGS = {
  en: {
    title: 'Compare',
    subtitle:
      'Arena-style: the same prompt and seed generated on two hardware, side by side. Pick a baseline and a candidate (each on its most efficient measured deployment); the metric deltas follow below the clips.',
    baseline: 'Baseline',
    candidate: 'Candidate',
    swap: 'Swap sides',
    blind: 'Blind mode',
    blindHint: 'Hide which hardware is which until you reveal it.',
    reveal: 'Reveal hardware',
    hidden: { baseline: 'A', candidate: 'B' },
    needTwo: 'Comparison needs at least two measured hardware.',
    metrics: 'Metric deltas',
    metricsHidden: 'Metric deltas are hidden in blind mode; reveal the hardware to see them.',
    metric: 'Metric',
    change: 'Change',
    assumptions: (tier: string, basis: string) => `Cost tier: ${tier} · GPU basis: ${basis}.`,
    participating: 'participating GPUs',
    allocated: 'allocated GPUs',
    better: 'Candidate better',
    worse: 'Candidate worse',
    neutral: 'No difference',
    loading: 'Loading clips…',
    loadingHint: 'Fetching the retained clips of both runs (two published artifacts).',
    error: 'Could not load clips',
    retry: 'Retry',
    noClips: 'Clips are not published for one of these runs; the metric deltas below still apply.',
    prompt: 'Prompt',
    seed: 'seed',
    take: (n: number) => `take ${n}`,
    caseOf: (i: number, n: number) => `Case ${i} of ${n}`,
    prev: 'Previous case',
    next: 'Next case',
    case: 'Case (prompt · seed)',
    playBoth: 'Play both',
    pauseBoth: 'Pause both',
    restart: 'Restart both',
    noPairs: 'No case with the same prompt and seed exists in both runs.',
    unmatched: (baseline: number, candidate: number) =>
      `${baseline} baseline and ${candidate} candidate records have no counterpart.`,
    noClip: 'Clip not published for this record.',
    mediaError: 'The clip could not be played.',
    timeToVideo: 'time to video',
    footnote:
      'Clips are the retained CI outputs of the same prompt and seed on each hardware; nothing is re-generated and nothing is voted on. Time to video is that record’s submit-to-downloaded-media seconds.',
  },
  zh: {
    title: '对比',
    subtitle:
      'Arena 式对比：同一 prompt 与 seed 在两种硬件上生成的视频并排播放。选择基线与候选硬件（各自取实测中最高效的部署），指标差异列在视频下方。',
    baseline: '基线',
    candidate: '候选',
    swap: '交换两侧',
    blind: '盲测模式',
    blindHint: '揭晓前隐藏两侧各是哪种硬件。',
    reveal: '揭晓硬件',
    hidden: { baseline: 'A', candidate: 'B' },
    needTwo: '至少需要两种已实测的硬件才能对比。',
    metrics: '指标差异',
    metricsHidden: '盲测模式下隐藏指标差异，揭晓硬件后显示。',
    metric: '指标',
    change: '变化',
    assumptions: (tier: string, basis: string) => `成本档位：${tier} · GPU 口径：${basis}。`,
    participating: '参与计算的 GPU',
    allocated: '已分配的 GPU',
    better: '候选更优',
    worse: '候选更差',
    neutral: '无差异',
    loading: '正在加载视频…',
    loadingHint: '正在读取两次运行保留的视频（两个已发布产物）。',
    error: '无法加载视频',
    retry: '重试',
    noClips: '其中一次运行没有发布视频；下方的指标差异仍然有效。',
    prompt: 'Prompt',
    seed: 'seed',
    take: (n: number) => `第 ${n} 次`,
    caseOf: (i: number, n: number) => `第 ${i} / ${n} 个用例`,
    prev: '上一个用例',
    next: '下一个用例',
    case: '用例（prompt · seed）',
    playBoth: '同时播放',
    pauseBoth: '同时暂停',
    restart: '从头同时播放',
    noPairs: '两次运行中没有 prompt 与 seed 均相同的用例。',
    unmatched: (baseline: number, candidate: number) =>
      `${baseline} 条基线记录与 ${candidate} 条候选记录没有对应项。`,
    noClip: '此记录的视频未发布。',
    mediaError: '视频无法播放。',
    timeToVideo: '出片时间',
    footnote:
      '视频为各硬件 CI 运行保留的原始输出，prompt 与 seed 相同；不重新生成，也不投票。出片时间为该记录从提交到下载完成的秒数。',
  },
};
type Strings = (typeof STRINGS)['en'];
type Role = 'baseline' | 'candidate';
const ROLES: readonly Role[] = ['baseline', 'candidate'];

const CHIP = {
  better: 'border-emerald-600/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  worse: 'border-red-600/40 bg-red-500/10 text-red-700 dark:text-red-300',
  neutral: 'border-border text-muted-foreground',
} as const;

const excerpt = (prompt: string, max = 60) =>
  prompt.length > max ? `${prompt.slice(0, max).trimEnd()}…` : prompt;

function caseLabel(pair: CasePair, repeated: boolean): string {
  const parts = [pair.prompt === null ? (pair.caseId ?? '—') : excerpt(pair.prompt)];
  if (pair.seed !== null) parts.push(`seed ${pair.seed}`);
  if (repeated) parts.push(`#${pair.repetition + 1}`);
  return parts.join(' · ');
}

/** The stored artifact of one side, or null when the deployment publishes no media (HTTP 204). */
async function fetchSide(point: VideoPoint, signal: AbortSignal): Promise<CompareSide | null> {
  const response = await fetch(
    `/api/video-runs?run=${encodeURIComponent(point.runId)}&artifact=${encodeURIComponent(String(point.artifactId))}&format=media`,
    { signal },
  );
  if (response.status === 204) return null;
  if (!response.ok) throw new Error(`Published media HTTP ${response.status}`);
  const saved = (await response.json()) as StoredArtifact;
  return compareSide(saved, point);
}

function DeltaChip({ row, s }: { row: CompareRow; s: Strings }) {
  if (row.deltaPercent === null || row.ratio === null)
    return <span className={`rounded border px-1.5 py-0.5 text-2xs ${CHIP.neutral}`}>—</span>;
  const tone = row.candidateBetter === null ? 'neutral' : row.candidateBetter ? 'better' : 'worse';
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span
        className={`rounded border px-1.5 py-0.5 text-2xs font-medium ${CHIP[tone]}`}
        title={s[tone]}
        data-tone={tone}
      >
        {row.deltaPercent.toLocaleString('en-US', {
          maximumFractionDigits: 1,
          signDisplay: 'exceptZero',
        })}
        %
      </span>
      <span className="text-2xs text-muted-foreground">
        ×{row.ratio.toLocaleString('en-US', { maximumFractionDigits: 2 })}
      </span>
    </span>
  );
}

function ClipPlaceholders() {
  return (
    <div className="grid gap-4 md:grid-cols-2" aria-hidden="true">
      {ROLES.map((role) => (
        <Skeleton key={role} className="aspect-video w-full rounded-lg" />
      ))}
    </div>
  );
}

/**
 * Arena-style baseline vs candidate: the same prompt and seed from both CI runs
 * play side by side (blind mode hides which hardware is which), with the metric
 * deltas between each hardware's lead deployment below. Media is fetched once
 * the panel scrolls into view, one stored artifact per side.
 */
export default function VideoCompare({
  points,
  options,
  colorFor,
}: {
  points: VideoPoint[];
  options: MetricOptions;
  colorFor: (hardwareKey: string) => string;
}) {
  const locale = useLocale();
  const s = STRINGS[locale];
  const headingId = useId();
  const blindId = useId();
  const sectionRef = useRef<HTMLElement | null>(null);
  const videos = useRef<Record<Role, HTMLVideoElement | null>>({ baseline: null, candidate: null });
  const [selection, setSelection] = useState<VideoCompareSelection>(
    DEFAULT_VIDEO_COMPARE_SELECTION,
  );
  const [sides, setSides] = useState<ReadonlyMap<string, CompareSide | null>>(() => new Map());
  const [pending, setPending] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [failedMedia, setFailedMedia] = useState<ReadonlySet<string>>(() => new Set());
  const [visible, setVisible] = useState(false);
  const [blind, setBlind] = useState(false);
  const [revealedFor, setRevealedFor] = useState<string | null>(null);
  const request = useRef(0);
  const download = useRef<AbortController | null>(null);
  useEffect(() => {
    setSelection(readVideoCompareSelection(location.search));
    return () => download.current?.abort();
  }, []);
  // Two stored artifacts are several MB each: fetch them once the panel is near the viewport.
  useEffect(() => {
    const node = sectionRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '240px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const measured = useMemo(() => comparablePoints(points), [points]);
  const defaults = useMemo(() => defaultComparePair(points), [points]);
  const { baseline, candidate, caseIndex } = resolveCompareSelection(selection, points);
  const pairKey = baseline && candidate ? `${baseline.id}|${candidate.id}` : null;
  const rows = baseline && candidate ? compareMetrics(baseline, candidate, options) : [];
  const fetched = baseline && candidate && sides.has(baseline.id) && sides.has(candidate.id);
  const loaded =
    fetched && sides.get(baseline.id) && sides.get(candidate.id)
      ? { baseline: sides.get(baseline.id)!, candidate: sides.get(candidate.id)! }
      : null;
  const matched = loaded ? pairCases(loaded.baseline.records, loaded.candidate.records) : null;
  const pairs = matched?.pairs ?? [];
  const index = Math.min(caseIndex, Math.max(pairs.length - 1, 0));
  const current = pairs[index];
  const repeated = new Set(
    pairs
      .filter((pair) => pairs.some((other) => other !== pair && other.key === pair.key))
      .map((pair) => pair.key),
  );
  const hardwareOptions = measured.map((point) => ({
    value: point.hardwareKey ?? '',
    label: hardwareLabel(point.hardwareKey ?? ''),
  }));
  const masked = blind && revealedFor !== `${pairKey}:${index}`;
  const sideOf = { baseline, candidate } as Record<Role, VideoPoint | null>;
  const paneLabel = (role: Role) =>
    masked ? s.hidden[role] : hardwareLabel(sideOf[role]?.hardwareKey ?? '');
  const paneColor = (role: Role) =>
    masked ? 'var(--muted-foreground)' : colorFor(sideOf[role]?.hardwareKey ?? '');

  const update = (patch: Partial<VideoCompareSelection>) => {
    const next = { ...selection, ...patch };
    setSelection(next);
    const resolved = resolveCompareSelection(next, points);
    history.replaceState(
      null,
      '',
      writeVideoCompareSelection(
        new URL(location.href),
        {
          baseline: resolved.baseline?.hardwareKey ?? null,
          candidate: resolved.candidate?.hardwareKey ?? null,
          caseIndex: next.caseIndex,
        },
        defaults,
      ),
    );
  };
  const choose = (side: Role, hardware: string) => {
    const own = sideOf[side];
    const other = sideOf[side === 'baseline' ? 'candidate' : 'baseline'];
    const patch: Partial<VideoCompareSelection> = { [side]: hardware };
    // Picking the other side's hardware swaps the two instead of comparing a hardware with itself.
    if (other?.hardwareKey === hardware && own)
      patch[side === 'baseline' ? 'candidate' : 'baseline'] = own.hardwareKey;
    update(patch);
    track(`video_compare_${side}_changed`, { hardware });
  };
  const swap = () => {
    if (!baseline || !candidate) return;
    update({ baseline: candidate.hardwareKey, candidate: baseline.hardwareKey });
    track('video_compare_swapped', {
      baseline: candidate.hardwareKey,
      candidate: baseline.hardwareKey,
    });
  };
  const goTo = (next: number) => {
    update({ caseIndex: next });
    track('video_compare_case_changed', { index: next, seed: pairs[next]?.seed ?? null });
  };
  const load = useCallback(async () => {
    if (!baseline || !candidate || pairKey === null) return;
    download.current?.abort();
    const controller = new AbortController();
    download.current = controller;
    const attempt = ++request.current;
    setPending(pairKey);
    setFailure(null);
    track('video_compare_clips_load', {
      baseline: baseline.hardwareKey,
      candidate: candidate.hardwareKey,
    });
    try {
      const missing = [baseline, candidate].filter((point) => !sides.has(point.id));
      const results = await Promise.all(
        missing.map(
          async (point) => [point.id, await fetchSide(point, controller.signal)] as const,
        ),
      );
      if (attempt !== request.current) return;
      setSides((old) => new Map([...old, ...results]));
    } catch (error) {
      if (controller.signal.aborted) return;
      setFailure({ key: pairKey, message: error instanceof Error ? error.message : String(error) });
    } finally {
      if (attempt === request.current) setPending(null);
    }
  }, [baseline, candidate, pairKey, sides]);
  useEffect(() => {
    if (!visible || pairKey === null || fetched) return;
    if (pending === pairKey || failure?.key === pairKey) return;
    void load();
  }, [visible, pairKey, fetched, pending, failure, load]);

  const eachVideo = (fn: (video: HTMLVideoElement) => void) => {
    for (const video of Object.values(videos.current)) if (video) fn(video);
  };
  const playback = (action: 'play' | 'pause' | 'restart') => {
    eachVideo((video) => {
      if (action === 'pause') {
        video.pause();
        return;
      }
      if (action === 'restart') video.currentTime = 0;
      void video.play().catch(() => {});
    });
    track('video_compare_playback', { action });
  };
  const reveal = () => {
    setRevealedFor(`${pairKey}:${index}`);
    track('video_compare_revealed', {
      baseline: baseline?.hardwareKey ?? null,
      candidate: candidate?.hardwareKey ?? null,
    });
  };

  return (
    <section
      ref={sectionRef}
      className="space-y-4 rounded-xl border px-4 py-4"
      data-testid="video-compare"
      aria-labelledby={headingId}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Heading as="h2" level="card" id={headingId}>
            {s.title}
          </Heading>
          <p className="mt-1 max-w-4xl text-xs text-muted-foreground">{s.subtitle}</p>
        </div>
        <label
          htmlFor={blindId}
          className="flex shrink-0 items-center gap-2 text-xs"
          title={s.blindHint}
        >
          <Switch
            id={blindId}
            checked={blind}
            onCheckedChange={(checked) => {
              setBlind(checked);
              setRevealedFor(null);
              track('video_compare_blind_toggled', { value: String(checked) });
            }}
            data-testid="video-compare-blind"
          />
          <span>{s.blind}</span>
        </label>
      </div>
      <fieldset
        disabled={measured.length < 2}
        className="grid max-w-3xl gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-end"
        data-testid="video-compare-controls"
      >
        <VideoSelect
          label={s.baseline}
          value={baseline?.hardwareKey ?? ''}
          onValueChange={(value) => choose('baseline', value)}
          options={hardwareOptions}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={swap}
          aria-label={s.swap}
          title={s.swap}
          data-testid="video-compare-swap"
        >
          ⇄
        </Button>
        <VideoSelect
          label={s.candidate}
          value={candidate?.hardwareKey ?? ''}
          onValueChange={(value) => choose('candidate', value)}
          options={hardwareOptions}
        />
      </fieldset>
      {measured.length < 2 && (
        <p role="status" className="text-sm text-muted-foreground">
          {s.needTwo}
        </p>
      )}
      {baseline && candidate && (
        <>
          <div className="space-y-3" data-testid="video-compare-clips">
            {loaded && matched ? (
              pairs.length === 0 || !current ? (
                <p role="status" className="text-sm text-muted-foreground">
                  {s.noPairs}
                </p>
              ) : (
                <>
                  <div
                    className="rounded-lg border bg-muted/30 px-3 py-2"
                    data-testid="video-compare-prompt"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{s.prompt}</span>
                      <span className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => goTo(index - 1)}
                          disabled={index === 0}
                          aria-label={s.prev}
                          title={s.prev}
                          data-testid="video-compare-prev"
                        >
                          ‹
                        </Button>
                        <span className="px-1 tabular-nums" data-testid="video-compare-case-of">
                          {s.caseOf(index + 1, pairs.length)}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => goTo(index + 1)}
                          disabled={index >= pairs.length - 1}
                          aria-label={s.next}
                          title={s.next}
                          data-testid="video-compare-next"
                        >
                          ›
                        </Button>
                      </span>
                    </div>
                    <p className="mt-1 text-sm">{current.prompt ?? current.caseId ?? '—'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {current.seed !== null && `${s.seed} ${current.seed}`}
                      {repeated.has(current.key) && ` · ${s.take(current.repetition + 1)}`}
                    </p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    {ROLES.map((role) => {
                      const point = sideOf[role]!;
                      const record = current[role];
                      const side = loaded[role];
                      const url =
                        record.mediaPath === null ? undefined : side.urls.get(record.mediaPath);
                      const label = paneLabel(role);
                      return (
                        <figure
                          key={role}
                          className="min-w-0 space-y-2"
                          data-testid="video-compare-clip"
                          data-role={role}
                        >
                          <figcaption className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                            <span
                              className="size-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: paneColor(role) }}
                            />
                            <span className="font-medium" data-testid="video-compare-pane-label">
                              {label}
                            </span>
                            <span className="text-muted-foreground">· {s[role]}</span>
                            {!masked && (
                              <span className="text-muted-foreground">
                                · {layoutLabel(point, locale)}
                              </span>
                            )}
                            {record.seconds !== null && (
                              <span className="tabular-nums text-muted-foreground">
                                · {s.timeToVideo}{' '}
                                {record.seconds.toLocaleString('en-US', {
                                  maximumFractionDigits: 1,
                                })}{' '}
                                s
                              </span>
                            )}
                          </figcaption>
                          {url ? (
                            <video
                              key={url}
                              ref={(element) => {
                                videos.current[role] = element;
                              }}
                              src={url}
                              controls
                              playsInline
                              preload="metadata"
                              aria-label={`${label} · ${record.slotId}`}
                              className="aspect-video w-full rounded-lg bg-black"
                              onError={() => setFailedMedia((old) => new Set(old).add(url))}
                            />
                          ) : (
                            <div className="flex aspect-video items-center justify-center rounded-lg bg-muted p-5 text-sm text-muted-foreground">
                              {s.noClip}
                            </div>
                          )}
                          {url && failedMedia.has(url) && (
                            <p role="alert" className="text-sm text-destructive">
                              {s.mediaError}
                            </p>
                          )}
                        </figure>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="flex flex-wrap gap-2" role="group" aria-label={s.playBoth}>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => playback('play')}
                        data-testid="video-compare-play"
                      >
                        {s.playBoth}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => playback('pause')}
                        data-testid="video-compare-pause"
                      >
                        {s.pauseBoth}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => playback('restart')}
                        data-testid="video-compare-restart"
                      >
                        {s.restart}
                      </Button>
                      {masked && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={reveal}
                          data-testid="video-compare-reveal"
                        >
                          {s.reveal}
                        </Button>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 sm:max-w-md">
                      <VideoSelect
                        label={s.case}
                        value={String(index)}
                        onValueChange={(value) => goTo(Number(value))}
                        options={pairs.map((pair, i) => ({
                          value: String(i),
                          label: caseLabel(pair, repeated.has(pair.key)),
                        }))}
                      />
                    </div>
                  </div>
                  {(matched.unmatched.baseline > 0 || matched.unmatched.candidate > 0) && (
                    <p
                      className="text-xs text-muted-foreground"
                      data-testid="video-compare-unmatched"
                    >
                      {s.unmatched(matched.unmatched.baseline, matched.unmatched.candidate)}
                    </p>
                  )}
                </>
              )
            ) : fetched ? (
              <p role="status" className="text-sm text-muted-foreground">
                {s.noClips}
              </p>
            ) : pending === pairKey ? (
              <div className="space-y-3" role="status" aria-busy="true">
                <p className="text-sm text-muted-foreground">
                  {s.loading} <span className="text-xs">{s.loadingHint}</span>
                </p>
                <ClipPlaceholders />
              </div>
            ) : failure?.key === pairKey ? (
              <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
                <p>
                  {s.error}: {failure.message}
                </p>
                <Button variant="outline" size="sm" onClick={() => void load()}>
                  {s.retry}
                </Button>
              </div>
            ) : (
              <ClipPlaceholders />
            )}
          </div>
          {masked ? (
            <p className="text-xs text-muted-foreground" data-testid="video-compare-metrics-hidden">
              {s.metricsHidden}
            </p>
          ) : (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">{s.metrics}</h3>
              <div className="overflow-x-auto">
                <table
                  className="w-full min-w-xl text-left text-sm"
                  data-testid="video-compare-table"
                >
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-medium">
                        {s.metric}
                      </th>
                      {ROLES.map((role) => (
                        <th
                          key={role}
                          scope="col"
                          className="px-3 py-2 font-medium"
                          data-testid={`video-compare-${role}`}
                        >
                          <span className="inline-flex items-center gap-1.5 text-foreground">
                            <span
                              className="size-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: paneColor(role) }}
                            />
                            {paneLabel(role)}
                            <span className="font-normal text-muted-foreground">· {s[role]}</span>
                          </span>
                        </th>
                      ))}
                      <th scope="col" className="px-3 py-2 font-medium">
                        {s.change}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {rows.map((row) => (
                      <tr key={row.id} className="border-t" data-metric={row.id}>
                        <th scope="row" className="px-3 py-2 font-normal text-muted-foreground">
                          {locale === 'zh'
                            ? VIDEO_METRICS[row.id].labelZh
                            : VIDEO_METRICS[row.id].label}
                        </th>
                        <td className="px-3 py-2">{formatMetric(row.baseline, row.id)}</td>
                        <td className="px-3 py-2">{formatMetric(row.candidate, row.id)}</td>
                        <td className="px-3 py-2">
                          <DeltaChip row={row} s={s} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">
                {s.assumptions(
                  TIER_LABELS[options.tier][locale],
                  options.basis === 'allocated' ? s.allocated : s.participating,
                )}
              </p>
            </div>
          )}
          <p className="text-xs text-muted-foreground">{s.footnote}</p>
        </>
      )}
    </section>
  );
}
