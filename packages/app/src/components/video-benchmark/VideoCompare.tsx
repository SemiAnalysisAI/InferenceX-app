'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
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
      'Pick a baseline and a candidate hardware (each on its most efficient measured deployment): metric deltas side by side, then the same generated case from both runs.',
    baseline: 'Baseline',
    candidate: 'Candidate',
    needTwo: 'Comparison needs at least two measured hardware.',
    metric: 'Metric',
    change: 'Change',
    assumptions: (tier: string, basis: string) => `Cost tier: ${tier} · GPU basis: ${basis}.`,
    participating: 'participating GPUs',
    allocated: 'allocated GPUs',
    better: 'Candidate better',
    worse: 'Candidate worse',
    neutral: 'No difference',
    load: 'Load clips',
    loadHint: 'Fetches the retained clips of both runs on demand (two published artifacts).',
    loading: 'Loading clips…',
    error: 'Could not load clips',
    retry: 'Retry',
    case: 'Case (prompt · seed)',
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
      '选择基线与候选硬件（各取其实测中最高效的部署）：并排查看指标差异，再对照两次运行中同一 prompt 与 seed 生成的视频。',
    baseline: '基线',
    candidate: '候选',
    needTwo: '至少需要两种已实测的硬件才能对比。',
    metric: '指标',
    change: '变化',
    assumptions: (tier: string, basis: string) => `成本分档：${tier} · GPU 口径：${basis}。`,
    participating: '参与计算的 GPU',
    allocated: '已分配的 GPU',
    better: '候选更优',
    worse: '候选更差',
    neutral: '无差异',
    load: '加载视频',
    loadHint: '按需读取两次运行保留的视频（两个已发布产物）。',
    loading: '正在加载视频…',
    error: '无法加载视频',
    retry: '重试',
    case: '用例（prompt · seed）',
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

async function fetchSide(point: VideoPoint, signal: AbortSignal): Promise<CompareSide> {
  const response = await fetch(
    `/api/video-runs?run=${encodeURIComponent(point.runId)}&artifact=${encodeURIComponent(String(point.artifactId))}&format=media`,
    { signal },
  );
  if (!response.ok || response.status === 204)
    throw new Error(`Published media HTTP ${response.status}`);
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

/**
 * Arena-style baseline vs candidate: metric deltas between each hardware's lead deployment, then the
 * retained clips of the same prompt and seed from both CI runs. Media is fetched
 * only on request, one stored artifact per side.
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
  const [selection, setSelection] = useState<VideoCompareSelection>(
    DEFAULT_VIDEO_COMPARE_SELECTION,
  );
  const [sides, setSides] = useState<ReadonlyMap<string, CompareSide>>(() => new Map());
  const [pending, setPending] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [failedMedia, setFailedMedia] = useState<ReadonlySet<string>>(() => new Set());
  const request = useRef(0);
  const download = useRef<AbortController | null>(null);
  useEffect(() => {
    setSelection(readVideoCompareSelection(location.search));
    return () => download.current?.abort();
  }, []);

  const measured = useMemo(() => comparablePoints(points), [points]);
  const defaults = useMemo(() => defaultComparePair(points), [points]);
  const { baseline, candidate, caseIndex } = resolveCompareSelection(selection, points);
  const pairKey = baseline && candidate ? `${baseline.id}|${candidate.id}` : null;
  const rows = baseline && candidate ? compareMetrics(baseline, candidate, options) : [];
  const loaded =
    baseline && candidate && sides.has(baseline.id) && sides.has(candidate.id)
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
  const choose = (side: 'baseline' | 'candidate', hardware: string) => {
    const own = side === 'baseline' ? baseline : candidate;
    const other = side === 'baseline' ? candidate : baseline;
    const patch: Partial<VideoCompareSelection> = { [side]: hardware };
    // Picking the other side's hardware swaps the two instead of comparing a hardware with itself.
    if (other?.hardwareKey === hardware && own)
      patch[side === 'baseline' ? 'candidate' : 'baseline'] = own.hardwareKey;
    update(patch);
    track(`video_compare_${side}_changed`, { hardware });
  };
  const load = async () => {
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
      const fetched = await Promise.all(
        missing.map(
          async (point) => [point.id, await fetchSide(point, controller.signal)] as const,
        ),
      );
      if (attempt !== request.current) return;
      setSides((old) => new Map([...old, ...fetched]));
    } catch (error) {
      if (controller.signal.aborted) return;
      setFailure({ key: pairKey, message: error instanceof Error ? error.message : String(error) });
    } finally {
      if (attempt === request.current) setPending(null);
    }
  };

  return (
    <section
      className="space-y-4 rounded-xl border px-4 py-4"
      data-testid="video-compare"
      aria-labelledby={headingId}
    >
      <div>
        <Heading as="h2" level="card" id={headingId}>
          {s.title}
        </Heading>
        <p className="mt-1 max-w-4xl text-xs text-muted-foreground">{s.subtitle}</p>
      </div>
      <fieldset
        disabled={measured.length < 2}
        className="grid max-w-2xl gap-3 sm:grid-cols-2"
        data-testid="video-compare-controls"
      >
        <VideoSelect
          label={s.baseline}
          value={baseline?.hardwareKey ?? ''}
          onValueChange={(value) => choose('baseline', value)}
          options={hardwareOptions}
        />
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
          <div className="overflow-x-auto">
            <table className="w-full min-w-xl text-left text-sm" data-testid="video-compare-table">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    {s.metric}
                  </th>
                  {(
                    [
                      ['baseline', baseline],
                      ['candidate', candidate],
                    ] as const
                  ).map(([role, point]) => (
                    <th
                      key={role}
                      scope="col"
                      className="px-3 py-2 font-medium"
                      data-testid={`video-compare-${role}`}
                    >
                      <span className="inline-flex items-center gap-1.5 text-foreground">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: colorFor(point.hardwareKey ?? '') }}
                        />
                        {hardwareLabel(point.hardwareKey ?? '')}
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
          <div className="space-y-3" data-testid="video-compare-clips">
            {loaded && matched ? (
              pairs.length === 0 || !current ? (
                <p role="status" className="text-sm text-muted-foreground">
                  {s.noPairs}
                </p>
              ) : (
                <>
                  <div className="max-w-2xl">
                    <VideoSelect
                      label={s.case}
                      value={String(index)}
                      onValueChange={(value) => {
                        const next = Number(value);
                        update({ caseIndex: next });
                        track('video_compare_case_changed', {
                          index: next,
                          seed: pairs[next]?.seed ?? null,
                        });
                      }}
                      options={pairs.map((pair, i) => ({
                        value: String(i),
                        label: caseLabel(pair, repeated.has(pair.key)),
                      }))}
                    />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    {(
                      [
                        ['baseline', baseline, current.baseline, loaded.baseline],
                        ['candidate', candidate, current.candidate, loaded.candidate],
                      ] as const
                    ).map(([role, point, record, side]) => {
                      const url =
                        record.mediaPath === null ? undefined : side.urls.get(record.mediaPath);
                      const label = hardwareLabel(point.hardwareKey ?? '');
                      return (
                        <figure
                          key={role}
                          className="min-w-0 space-y-2"
                          data-testid="video-compare-clip"
                          data-role={role}
                        >
                          {url ? (
                            <video
                              key={url}
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
                          <figcaption className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                            <span
                              className="size-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: colorFor(point.hardwareKey ?? '') }}
                            />
                            <span className="font-medium">{label}</span>
                            <span className="text-muted-foreground">· {s[role]}</span>
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
                        </figure>
                      );
                    })}
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
            ) : pending === pairKey ? (
              <p role="status" className="text-sm text-muted-foreground">
                {s.loading}
              </p>
            ) : failure?.key === pairKey ? (
              <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
                <p>
                  {s.error}: {failure.message}
                </p>
                <Button variant="outline" size="sm" onClick={load}>
                  {s.retry}
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm" onClick={load} data-testid="video-compare-load">
                  {s.load}
                </Button>
                <span className="text-xs text-muted-foreground">{s.loadHint}</span>
              </div>
            )}
            <p className="text-xs text-muted-foreground">{s.footnote}</p>
          </div>
        </>
      )}
    </section>
  );
}
