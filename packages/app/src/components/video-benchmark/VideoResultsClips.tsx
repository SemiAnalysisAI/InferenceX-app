'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { InfoHelp } from '@/components/ui/option-info';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { comparablePoints } from './compare';
import { hardwareLabel } from './hardware';
import type { MetricOptions, VideoPoint } from './metrics';
import {
  absoluteFrameDifference,
  publishedResultsSide,
  RESULTS_CLIP_HARDWARE,
  resultsClipGroups,
  type ResultsClipGroup,
  type ResultsClipSide,
} from './results-clips';
import type { StoredArtifact } from './stored';

const STRINGS = {
  en: {
    label: 'Comparison clips',
    unofficial: 'Unofficial run',
    approval: 'Approval',
    approved: 'Approved',
    unapproved: 'No matching receipt',
    prompt: 'Prompt',
    sources: 'Prompt & sources',
    source: 'Source',
    run: 'Run',
    runtime: 'Runtime',
    artifact: 'Artifact',
    media: 'Media',
    seed: 'seed',
    take: (n: number) => `take ${n}`,
    noPair: 'No published clips share a verified prompt, seed, take and generation configuration.',
    loading: 'Loading published clips…',
    missing: 'No matched clip',
    error: 'Published clips could not be loaded.',
    retry: 'Retry clips',
    play: 'Play',
    pause: 'Pause',
    scrub: 'Scrub all clips',
    clip: 'Clip',
    difference: 'Difference',
    view: 'Clip view',
    differenceNote:
      'Absolute RGB difference ×4 against the H200 50-step reference at the same playback time. This browser view is not a sealed quality measurement.',
    differenceLabel: 'RGB difference ×4 · preview',
    noReference: 'A matched H200 50-step reference is not available.',
    differenceUnavailable:
      'Difference unavailable: frames must have matching geometry and permit cross-origin pixel reads.',
    mediaError: 'This published clip could not be played.',
    reference: 'H200 50-step reference',
    wall: 'wall time',
    psnr: 'PSNR',
    energy: 'J / clip',
    costBasis: 'Modelled TCO · $/video-s',
    participatingCost: 'Participating',
    allocatedCost: 'Allocated',
    energyNote:
      'Mean GPU-board joules per valid clip in the selected measurement cell; not a per-clip energy trace.',
    psnrNote: 'Planned: no sealed paired PSNR result is available for this clip.',
    metricsHelp:
      'PSNR is planned until a sealed pair is available. J/clip is the selected cell mean, not a per-clip trace. Both TCO bases use the selected tier and recorded GPU count.',
    gpu: (n: number) => `${n} GPU`,
    seconds: 's',
  },
  zh: {
    label: '视频对比',
    unofficial: '非官方运行',
    approval: '发布批准',
    approved: '已批准',
    unapproved: '暂无匹配记录',
    prompt: 'Prompt',
    sources: 'Prompt 与来源',
    source: '来源',
    run: '运行',
    runtime: 'Runtime',
    artifact: '产物',
    media: '视频文件',
    seed: 'seed',
    take: (n: number) => `第 ${n} 次`,
    noPair: '没有 prompt、seed、重复次数和生成配置均已核实一致的已发布视频。',
    loading: '正在加载已发布视频…',
    missing: '没有匹配的视频',
    error: '无法加载已发布视频。',
    retry: '重试加载视频',
    play: '播放',
    pause: '暂停',
    scrub: '同步拖动全部视频',
    clip: '视频',
    difference: '差异',
    view: '视频视图',
    differenceNote:
      '与 H200 50-step 参考视频在相同播放时间的 RGB 绝对差异，放大 4 倍。浏览器预览不是已封存的质量测量结果。',
    differenceLabel: 'RGB 差异 ×4 · 预览',
    noReference: '没有匹配的 H200 50-step 参考视频。',
    differenceUnavailable: '无法显示差异：帧尺寸必须一致，且视频需允许跨域像素读取。',
    mediaError: '此已发布视频无法播放。',
    reference: 'H200 50-step 参考',
    wall: '出片时间',
    psnr: 'PSNR',
    energy: 'J / clip',
    costBasis: 'TCO 估算 · $/视频秒',
    participatingCost: '参与 GPU',
    allocatedCost: '分配 GPU',
    energyNote: '所选测量单元每条有效视频的平均 GPU 板卡能耗，不是单条视频的能耗轨迹。',
    psnrNote: '计划中：此视频尚无已封存的配对 PSNR 结果。',
    metricsHelp:
      'PSNR 需等待已封存的配对结果。J/clip 是所选测量单元的平均值，不是单条视频的能耗轨迹。两种 TCO 口径均使用所选成本档位和记录的 GPU 数量。',
    gpu: (n: number) => `${n} 张 GPU`,
    seconds: 's',
  },
};

type Costs = Record<string, { participating: number | null; allocated: number | null }>;
export interface VideoResultsClipsProps {
  points: VideoPoint[];
  colorFor: (key: string) => string;
  hidden: ReadonlySet<string>;
  options?: MetricOptions;
  costs?: Costs;
  unofficialRun?: string;
}

const HATCH = {
  backgroundImage:
    'repeating-linear-gradient(135deg, transparent, transparent 7px, color-mix(in srgb, currentColor 6%, transparent) 7px, color-mix(in srgb, currentColor 6%, transparent) 9px)',
};
const display = (value: number | null | undefined, digits = 1) =>
  typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString('en-US', { maximumFractionDigits: digits })
    : '—';

export default function VideoResultsClips({
  points,
  colorFor,
  hidden,
  costs,
  unofficialRun,
}: VideoResultsClipsProps) {
  const s = STRINGS[useLocale()];
  const selected = useMemo(
    () =>
      comparablePoints(points).filter((p) =>
        RESULTS_CLIP_HARDWARE.some((key) => p.hardwareKey === key),
      ),
    [points],
  );
  const cache = useRef(new Map<string, ResultsClipSide | null>());
  const [sides, setSides] = useState<ResultsClipSide[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(selected.length > 0);
    setFailed(false);
    setSides([]);
    void Promise.allSettled(
      selected.map(async (point) => {
        const sourceKey = JSON.stringify([point.runId, point.artifactId, point.id]);
        if (cache.current.has(sourceKey)) return cache.current.get(sourceKey)!;
        const response = await fetch(
          `/api/video-runs?run=${encodeURIComponent(point.runId)}&artifact=${encodeURIComponent(String(point.artifactId))}&format=published`,
          { signal: controller.signal },
        );
        if (response.status === 204) {
          cache.current.set(sourceKey, null);
          return null;
        }
        if (!response.ok) throw new Error('Published media read failed');
        const side = publishedResultsSide((await response.json()) as StoredArtifact, point);
        cache.current.set(sourceKey, side);
        return side;
      }),
    ).then((results) => {
      if (controller.signal.aborted) return;
      setSides(
        results.flatMap((result) =>
          result.status === 'fulfilled' && result.value ? [result.value] : [],
        ),
      );
      setFailed(results.some((result) => result.status === 'rejected'));
      setLoading(false);
    });
    return () => controller.abort();
  }, [selected, retry]);
  const group = useMemo(() => resultsClipGroups(sides)[0] ?? null, [sides]);
  return (
    <section aria-label={s.label} data-testid="video-results-clips" className="min-w-0 space-y-3">
      {loading && (
        <p role="status" className="text-sm text-muted-foreground">
          {s.loading}
        </p>
      )}
      {failed && (
        <div role="status" className="flex flex-wrap items-center gap-3 text-sm">
          <span>{s.error}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              track('video_results_clips_retry');
              cache.current.clear();
              setRetry((n) => n + 1);
            }}
          >
            {s.retry}
          </Button>
        </div>
      )}
      <SynchronizedClips
        key={group?.key ?? 'empty'}
        group={group}
        points={selected}
        colorFor={colorFor}
        hidden={hidden}
        costs={costs}
        unofficialRun={unofficialRun}
      />
    </section>
  );
}

function SynchronizedClips({
  group,
  points,
  colorFor,
  hidden,
  costs,
  unofficialRun,
}: Omit<VideoResultsClipsProps, 'options'> & { group: ResultsClipGroup | null }) {
  const s = STRINGS[useLocale()];
  const videos = useRef(new Map<string, HTMLVideoElement>());
  const canvases = useRef(new Map<string, HTMLCanvasElement>());
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [view, setView] = useState<'clip' | 'difference'>('clip');
  const [durations, setDurations] = useState<Record<string, number>>({});
  const [errors, setErrors] = useState<ReadonlySet<string>>(new Set());
  const [differenceErrors, setDifferenceErrors] = useState<ReadonlySet<string>>(new Set());
  const visible = RESULTS_CLIP_HARDWARE.filter((key) => !hidden.has(key));
  const visibleKey = visible.join(',');
  const playable = visible.filter((key) => group?.clips.has(key) && !errors.has(key));
  const reference =
    !hidden.has('h200') &&
    !errors.has('h200') &&
    group?.clips.get('h200')?.side.h200FiftyStepReference === true;
  const knownDurations = playable.flatMap((key) => (durations[key] > 0 ? [durations[key]] : []));
  const duration = knownDurations.length > 0 ? Math.min(...knownDurations) : 0;

  useEffect(() => {
    const pause = () => {
      for (const video of videos.current.values()) video.pause();
      setPlaying(false);
    };
    const onVisibility = () => {
      if (document.hidden) pause();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      for (const video of videos.current.values()) video.pause();
    };
  }, []);

  useEffect(() => {
    for (const [key, video] of videos.current)
      if (!visibleKey.split(',').includes(key)) video.pause();
    setPlaying(false);
    for (const video of videos.current.values()) video.pause();
  }, [visibleKey]);

  useEffect(() => {
    let frame = 0;
    let lastDraw = -Infinity;
    const buffer = document.createElement('canvas');
    const context = buffer.getContext('2d', { willReadFrequently: true });
    const failDifference = (key: string) =>
      setDifferenceErrors((previous) =>
        previous.has(key) ? previous : new Set([...previous, key]),
      );
    const tick = (now: number) => {
      const active = visibleKey.split(',').flatMap((key) => {
        const video = videos.current.get(key);
        return video && !errors.has(key) ? [video] : [];
      });
      const leader = active.find((video) => video.readyState >= 2);
      if (playing && leader) {
        setTime(leader.currentTime);
        for (const video of active)
          if (
            video !== leader &&
            video.readyState >= 2 &&
            Math.abs(video.currentTime - leader.currentTime) > 0.12
          )
            video.currentTime = leader.currentTime;
        if (duration > 0 && leader.currentTime >= duration - 0.02) {
          for (const video of active) video.pause();
          setPlaying(false);
        }
      }
      if (view === 'difference' && reference && context && now - lastDraw >= 100) {
        lastDraw = now;
        const ref = videos.current.get('h200');
        if (ref && ref.readyState >= 2 && ref.videoWidth > 0) {
          buffer.width = ref.videoWidth;
          buffer.height = ref.videoHeight;
          try {
            context.drawImage(ref, 0, 0);
            const base = context.getImageData(0, 0, buffer.width, buffer.height);
            for (const key of visibleKey.split(',')) {
              const video = videos.current.get(key),
                canvas = canvases.current.get(key);
              if (!video || !canvas || video.readyState < 2) continue;
              if (video.videoWidth !== ref.videoWidth || video.videoHeight !== ref.videoHeight) {
                failDifference(key);
                continue;
              }
              if (Math.abs(video.currentTime - ref.currentTime) > 0.12) continue;
              try {
                context.drawImage(video, 0, 0);
                const candidate = context.getImageData(0, 0, buffer.width, buffer.height);
                canvas.width = buffer.width;
                canvas.height = buffer.height;
                const target = canvas.getContext('2d');
                if (target) {
                  const difference = target.createImageData(buffer.width, buffer.height);
                  difference.data.set(absoluteFrameDifference(base.data, candidate.data));
                  target.putImageData(difference, 0, 0);
                }
              } catch {
                failDifference(key);
              }
            }
          } catch {
            for (const key of visibleKey.split(',')) failDifference(key);
          }
        }
      }
      frame = requestAnimationFrame(tick);
    };
    if (playing || view === 'difference') frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, view, reference, visibleKey, errors, duration]);

  const togglePlay = async () => {
    track(playing ? 'video_results_clips_pause' : 'video_results_clips_play');
    if (playing) {
      for (const video of videos.current.values()) video.pause();
      setPlaying(false);
      return;
    }
    if (duration > 0 && time >= duration - 0.02) {
      for (const video of videos.current.values()) video.currentTime = 0;
      setTime(0);
    }
    const outcomes = await Promise.allSettled(
      playable.map(async (key) => {
        await videos.current.get(key)?.play();
        return key;
      }),
    );
    const rejected = outcomes.flatMap((result, index) =>
      result.status === 'rejected' ? [playable[index]] : [],
    );
    if (rejected.length > 0) setErrors((previous) => new Set([...previous, ...rejected]));
    setPlaying(outcomes.some((result) => result.status === 'fulfilled'));
  };

  return (
    <>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <span>{s.label}</span>
        <InfoHelp label={s.label} value="clip-metrics" triggerTestId="video-results-metrics-help">
          {s.metricsHelp}
        </InfoHelp>
      </div>
      <details
        data-testid="video-results-sources"
        className="text-xs"
        onToggle={(event) =>
          track('video_results_sources_toggled', { enabled: event.currentTarget.open })
        }
      >
        <summary className="cursor-pointer" tabIndex={0}>
          {s.sources}
        </summary>
        <div data-testid="video-results-prompt" className="mt-3 space-y-1">
          <p className="break-words">
            <span className="text-muted-foreground">{s.prompt} </span>
            {group?.prompt ?? s.noPair}
          </p>
          {group && (
            <p className="font-mono text-muted-foreground">
              {s.seed} {group.seed} · {s.take(group.take)}
            </p>
          )}
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left">
            <thead className="whitespace-nowrap text-muted-foreground">
              <tr>
                <th className="pr-3 font-medium">{s.source}</th>
                <th className="pr-3 font-medium">{s.run}</th>
                <th className="pr-3 font-medium">{s.artifact}</th>
                <th className="pr-3 font-medium">{s.runtime}</th>
                <th className="pr-3 font-medium">{s.approval}</th>
                <th className="font-medium">{s.media}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((key) => {
                const point = points.find((item) => item.hardwareKey === key);
                const clip = group?.clips.get(key);
                return (
                  <tr key={key} className="border-t align-top">
                    <td className="pr-3 whitespace-nowrap">{hardwareLabel(key)}</td>
                    <td className="pr-3">{point?.runId ?? '—'}</td>
                    <td className="pr-3">{point?.artifactId ?? '—'}</td>
                    <td className="pr-3 break-all">{point?.runtime || '—'}</td>
                    <td className="pr-3 whitespace-nowrap">
                      {point ? (point.approved === true ? s.approved : s.unapproved) : '—'}
                    </td>
                    <td className="whitespace-nowrap">
                      {clip ? (
                        <a
                          className="underline"
                          href={clip.url}
                          onClick={() => track('video_results_media_source_opened', { gpu: key })}
                        >
                          {s.media}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
      <div className="grid min-w-0 grid-cols-1 gap-3 min-[360px]:grid-cols-2 lg:grid-cols-4 lg:gap-4">
        {visible.map((key) => {
          const point = points.find((item) => item.hardwareKey === key);
          const clip = group?.clips.get(key);
          const unavailable = errors.has(key)
            ? s.mediaError
            : clip
              ? view === 'difference' && !reference
                ? s.noReference
                : view === 'difference' && differenceErrors.has(key)
                  ? s.differenceUnavailable
                  : null
              : s.missing;
          return (
            <article
              key={key}
              data-testid="video-results-clip"
              data-hardware={key}
              className="min-w-0 space-y-2"
            >
              <div className="flex h-12 min-w-0 flex-col justify-center text-sm font-semibold">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: colorFor(key) }}
                  />
                  <span className="min-w-0 truncate">{hardwareLabel(key)}</span>
                </div>
                <span className="pl-[18px] text-xs font-normal text-muted-foreground">
                  {typeof point?.participating === 'number' ? s.gpu(point.participating) : '—'}
                </span>
              </div>
              <div className="relative aspect-video overflow-hidden bg-black">
                {clip && (
                  <video
                    ref={(element) => {
                      if (element) videos.current.set(key, element);
                      else videos.current.delete(key);
                    }}
                    src={clip.url}
                    crossOrigin="anonymous"
                    muted
                    playsInline
                    preload="metadata"
                    aria-label={`${hardwareLabel(key)} ${s.clip}`}
                    className={
                      view === 'clip' && !unavailable
                        ? 'size-full object-contain'
                        : 'invisible absolute size-full'
                    }
                    onLoadedMetadata={(event) => {
                      const value = event.currentTarget.duration;
                      if (Number.isFinite(value) && value > 0)
                        setDurations((previous) => ({ ...previous, [key]: value }));
                    }}
                    onError={() => setErrors((previous) => new Set([...previous, key]))}
                    onEnded={() => {
                      for (const video of videos.current.values()) video.pause();
                      setPlaying(false);
                    }}
                  />
                )}
                {view === 'difference' && clip && (
                  <canvas
                    ref={(element) => {
                      if (element) canvases.current.set(key, element);
                      else canvases.current.delete(key);
                    }}
                    aria-label={`${hardwareLabel(key)} ${s.difference}`}
                    className="absolute inset-0 size-full object-contain"
                  />
                )}
                {unavailable && (
                  <div
                    data-testid="video-results-media-empty"
                    className="absolute inset-0 grid place-content-center border border-dashed border-border bg-muted p-2 text-center text-xs text-muted-foreground"
                    style={HATCH}
                  >
                    {unavailable}
                  </div>
                )}
                {point && unofficialRun && point.runId === unofficialRun && (
                  <span className="absolute left-1 top-1 bg-black/70 px-1 text-3xs text-white">
                    {s.unofficial}
                  </span>
                )}
                {!unavailable && clip?.side.h200FiftyStepReference && (
                  <span className="absolute bottom-1 right-1 bg-black/60 px-1 text-3xs text-white">
                    {s.reference}
                  </span>
                )}
              </div>
              <dl className="space-y-1 text-xs tabular-nums">
                {[
                  [
                    s.wall,
                    !clip || clip.record.seconds === null
                      ? '—'
                      : `${display(clip.record.seconds)} ${s.seconds}`,
                    '',
                  ],
                  [s.psnr, '—', s.psnrNote],
                  [
                    s.energy,
                    display(!point || point.energyKj === null ? null : point.energyKj * 1000, 0),
                    s.energyNote,
                  ],
                ].map(([label, value, title]) => (
                  <div
                    key={label}
                    title={title || undefined}
                    className="flex min-w-0 flex-wrap justify-between gap-x-2 border-b border-border/40 py-0.5"
                  >
                    <dt className="min-w-0 text-muted-foreground">{label}</dt>
                    <dd className="m-0 font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="text-xs tabular-nums">
                <p className="text-2xs text-muted-foreground">{s.costBasis}</p>
                <dl className="space-y-1">
                  {[
                    [
                      s.participatingCost,
                      display(point ? costs?.[point.id]?.participating : null, 4),
                    ],
                    [s.allocatedCost, display(point ? costs?.[point.id]?.allocated : null, 4)],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="flex min-w-0 flex-wrap justify-between gap-x-2 border-b border-border/40 py-0.5"
                    >
                      <dt className="min-w-0 text-muted-foreground">{label}</dt>
                      <dd className="m-0 font-medium">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </article>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          data-testid="video-results-play"
          variant="outline"
          size="sm"
          disabled={playable.length === 0}
          aria-pressed={playing}
          onClick={() => {
            void togglePlay();
          }}
        >
          {playing ? s.pause : s.play}
        </Button>
        <input
          data-testid="video-results-scrub"
          type="range"
          min={0}
          max={duration || 1}
          step={0.02}
          value={Math.min(time, duration || 1)}
          disabled={duration === 0}
          aria-label={s.scrub}
          className="h-11 min-w-0 flex-1 basis-28 accent-primary md:h-8"
          onInput={(event) => {
            const next = Number(event.currentTarget.value);
            setTime(next);
            setDifferenceErrors(new Set());
            for (const video of videos.current.values())
              if (video.readyState >= 1) video.currentTime = next;
            track('video_results_clips_scrub', { seconds: next });
          }}
        />
        <span className="font-mono text-xs text-muted-foreground">
          {time.toFixed(2)} / {duration > 0 ? duration.toFixed(2) : '—'} {s.seconds}
        </span>
        <div role="group" aria-label={s.view} className="inline-flex gap-1 rounded-lg border p-1">
          {(['clip', 'difference'] as const).map((mode) => (
            <Button
              key={mode}
              data-testid="video-results-view"
              data-view={mode}
              variant={view === mode ? 'secondary' : 'ghost'}
              size="sm"
              aria-pressed={view === mode}
              onClick={() => {
                track('video_results_clips_view', { view: mode });
                setDifferenceErrors(new Set());
                setView(mode);
              }}
            >
              {s[mode]}
            </Button>
          ))}
        </div>
      </div>
      {view === 'difference' && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span>{reference ? s.differenceLabel : s.noReference}</span>
          {reference && (
            <InfoHelp label={s.differenceLabel} value="difference-preview">
              {s.differenceNote}
            </InfoHelp>
          )}
        </div>
      )}
    </>
  );
}
