'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { InfoHelp } from '@/components/ui/option-info';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import {
  clipGroupActive,
  stepClipGroup,
  type ClipEvent,
  type ClipGroupStep,
  type ClipPhase,
  type ClipSnapshot,
} from './clip-sync';
import { comparablePoints } from './compare';
import { hardwareLabel } from './hardware';
import type { MetricOptions, VideoPoint } from './metrics';
import {
  absoluteFrameDifference,
  publishedResultsSide,
  resultsClipGroups,
  resultsClipReference,
  type ResultsClipGroup,
  type ResultsClipSide,
} from './results-clips';
import { RESULTS_HARDWARE } from './results';
import type { StoredArtifact } from './stored';
import { videoClipSourceKey as sourceKey, type VideoInitialData } from './initial-data';
import VideoSelect from './VideoSelect';

const STRINGS = {
  en: {
    label: 'Comparison clips',
    unofficial: 'Unofficial run',
    approval: 'Approval',
    approved: 'Approved',
    unapproved: 'No matching receipt',
    prompt: 'Prompt',
    case: 'Case',
    sources: 'Prompt & sources',
    source: 'Source',
    run: 'Run',
    runtime: 'Runtime',
    artifact: 'Artifact',
    receipt: 'Receipt',
    diagnostic: 'Matched-noise rerun',
    diagnosticNote:
      'Single-clip rerun with fixed noise and parallelism. Charts below use the original 20-clip run.',
    diagnosticMetric: 'Not provided for this diagnostic.',
    media: 'Media',
    seed: 'seed',
    take: (n: number) => `take ${n}`,
    noPair: 'No retained clips share a verified prompt, seed, take and generation configuration.',
    loading: 'Loading retained clips…',
    missing: 'No matched clip',
    error: 'Retained clips could not be loaded.',
    retry: 'Retry clips',
    play: 'Play',
    pause: 'Pause',
    buffering: (percent: number) => `Buffering ${percent}%`,
    downloading: (percent: number) => `Loading ${percent}%`,
    audio: 'Audio',
    muted: 'Muted',
    listen: (hardware: string) => `Listen to ${hardware}`,
    scrub: 'Scrub all clips',
    clip: 'Clip',
    difference: 'Difference',
    view: 'Clip view',
    differenceNote:
      'Absolute RGB difference ×4 against the matched Diffusers reference at the same playback time. This browser preview is separate from the all-frame PSNR measurement.',
    differenceLabel: 'RGB difference ×4 · preview',
    noReference: 'No sealed reference pair for this clip.',
    differenceUnavailable:
      'Difference unavailable: frames must have matching geometry and permit cross-origin pixel reads.',
    mediaError: 'This clip could not be played.',
    reference: 'Official Diffusers reference',
    schedule: (updates: number, sigmas: number) => `${updates} updates · ${sigmas} sigma points`,
    exactMatch: 'Exact match',
    incompatible: 'Paired media are incompatible; PSNR is unavailable.',
    psnrMeasured: (frames: number) =>
      `Decoded RGB24 · all ${frames} frames · full-stream MSE. Descriptive cross-engine comparison; no quality pass/fail threshold.`,
    referenceNote:
      'Encoded reference MP4. PSNR compares every decoded RGB pixel and frame; it does not measure semantic quality.',
    wall: 'wall time',
    psnr: 'PSNR',
    energy: 'J / clip',
    costBasis: 'Modelled TCO · $/video-s',
    participatingCost: 'Participating',
    allocatedCost: 'Allocated',
    energyNote:
      'Mean GPU-board joules per valid clip in the selected measurement cell; not a per-clip energy trace.',
    psnrNote: 'No sealed paired PSNR result is available for this clip.',
    metricsHelp:
      'PSNR uses a sealed Diffusers reference pair and every decoded RGB frame. J/clip is the selected cell mean. Both TCO bases use the selected tier, recorded GPU count and valid decoded output duration.',
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
    case: '用例',
    sources: 'Prompt 与来源',
    source: '来源',
    run: '运行',
    runtime: 'Runtime',
    artifact: '产物',
    receipt: '回执',
    diagnostic: '相同初始噪声重跑',
    diagnosticNote:
      '单条视频重跑，使用固定的初始噪声和并行配置。下方图表仍展示原始 20 条视频的测试结果。',
    diagnosticMetric: '此次重跑未提供该指标。',
    media: '视频文件',
    seed: 'seed',
    take: (n: number) => `第 ${n} 次`,
    noPair: '没有 prompt、seed、重复次数和生成配置均已核实一致的保留视频。',
    loading: '正在加载保留视频…',
    missing: '没有匹配的视频',
    error: '无法加载保留视频。',
    retry: '重试加载视频',
    play: '播放',
    pause: '暂停',
    buffering: (percent: number) => `缓冲中 ${percent}%`,
    downloading: (percent: number) => `加载中 ${percent}%`,
    audio: '音频',
    muted: '静音',
    listen: (hardware: string) => `收听 ${hardware}`,
    scrub: '同步拖动全部视频',
    clip: '视频',
    difference: '差异',
    view: '视频视图',
    differenceNote:
      '与匹配的 Diffusers 参考视频在相同播放时间的 RGB 绝对差异，放大 4 倍。浏览器预览与全帧 PSNR 测量分别展示。',
    differenceLabel: 'RGB 差异 ×4 · 预览',
    noReference: '此视频暂无已封存的参考配对。',
    differenceUnavailable: '无法显示差异：帧尺寸必须一致，且视频需允许跨域像素读取。',
    mediaError: '此视频无法播放。',
    reference: '官方 Diffusers 参考',
    schedule: (updates: number, sigmas: number) => `${updates} 次更新 · ${sigmas} 个 sigma 点`,
    exactMatch: '完全一致',
    incompatible: '配对媒体不兼容，无法提供 PSNR。',
    psnrMeasured: (frames: number) =>
      `解码后 RGB24 · 全部 ${frames} 帧 · 全流 MSE。仅作跨引擎数值对比，不设质量合格阈值。`,
    referenceNote: '已编码的参考 MP4。PSNR 对比全部解码 RGB 像素和帧，不衡量语义质量。',
    wall: '出片时间',
    psnr: 'PSNR',
    energy: 'J / clip',
    costBasis: 'TCO 估算 · $/视频秒',
    participatingCost: '参与 GPU',
    allocatedCost: '分配 GPU',
    energyNote: '所选测量单元每条有效视频的平均 GPU 板卡能耗，不是单条视频的能耗轨迹。',
    psnrNote: '此视频尚无已封存的配对 PSNR 结果。',
    metricsHelp:
      'PSNR 使用已封存的 Diffusers 参考配对，比较全部解码 RGB 帧。J/clip 是所选测量单元的平均值。两种 TCO 口径均使用所选成本档位、记录的 GPU 数量和有效输出的实际时长。',
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
  initialSides?: VideoInitialData['sides'];
}

const HATCH = {
  backgroundImage:
    'repeating-linear-gradient(135deg, transparent, transparent 7px, color-mix(in srgb, currentColor 6%, transparent) 7px, color-mix(in srgb, currentColor 6%, transparent) 9px)',
};
const display = (value: number | null | undefined, digits = 1) =>
  typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString('en-US', { maximumFractionDigits: digits })
    : '—';
/** Display refresh cap for the transport time and buffering share. */
const DISPLAY_INTERVAL_MS = 100;

function clipSnapshot(key: string, video: HTMLVideoElement): ClipSnapshot {
  const time = video.currentTime;
  let bufferedEnd = 0;
  for (let index = 0; index < video.buffered.length; index += 1)
    if (video.buffered.start(index) <= time + 0.1 && video.buffered.end(index) >= time) {
      bufferedEnd = video.buffered.end(index);
      break;
    }
  return {
    key,
    currentTime: time,
    duration: Number.isFinite(video.duration) ? video.duration : 0,
    bufferedEnd,
    readyState: video.readyState,
    seeking: video.seeking,
    ended: video.ended,
    playbackRate: video.playbackRate,
  };
}

export default function VideoResultsClips({
  points,
  colorFor,
  hidden,
  costs,
  unofficialRun,
  initialSides = {},
}: VideoResultsClipsProps) {
  const s = STRINGS[useLocale()];
  const selected = useMemo(
    () =>
      comparablePoints(points).filter((p) => RESULTS_HARDWARE.some((key) => p.hardwareKey === key)),
    [points],
  );
  const cache = useRef(new Map<string, ResultsClipSide | null>(Object.entries(initialSides)));
  const [revision, setRevision] = useState(0);
  const sides = useMemo(
    () =>
      selected.flatMap((point) => {
        const side = cache.current.get(sourceKey(point));
        return side ? [side] : [];
      }),
    [selected, revision],
  );
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const missing = selected.filter((point) => !cache.current.has(sourceKey(point)));
    setLoading(missing.length > 0);
    setFailed(false);
    void Promise.allSettled(
      missing.map(async (point) => {
        const response = await fetch(
          `/api/video-runs?run=${encodeURIComponent(point.runId)}&artifact=${encodeURIComponent(String(point.artifactId))}&format=published`,
          { signal: controller.signal },
        );
        if (response.status === 204) {
          if (controller.signal.aborted) return null;
          cache.current.set(sourceKey(point), null);
          return null;
        }
        if (!response.ok) throw new Error('Published media read failed');
        const side = publishedResultsSide((await response.json()) as StoredArtifact, point);
        if (controller.signal.aborted) return null;
        cache.current.set(sourceKey(point), side);
        setRevision((n) => n + 1);
        return side;
      }),
    ).then((results) => {
      if (controller.signal.aborted) return;
      setFailed(results.some((result) => result.status === 'rejected'));
      setLoading(false);
    });
    return () => controller.abort();
  }, [selected, retry]);
  const groups = useMemo(() => resultsClipGroups(sides), [sides]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const group = groups.find((item) => item.key === selectedGroup) ?? groups[0] ?? null;
  return (
    <section
      id="comparison-clips"
      aria-label={s.label}
      data-testid="video-results-clips"
      className="min-w-0 scroll-mt-24 space-y-3"
    >
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
              setRetry((n) => n + 1);
            }}
          >
            {s.retry}
          </Button>
        </div>
      )}
      {groups.length > 1 && (
        <div className="max-w-sm">
          <VideoSelect
            label={s.case}
            value={group?.key ?? ''}
            testId="video-results-case"
            options={groups.map((item, index) => ({
              value: item.key,
              label: `${index + 1}. ${[...item.clips.values()][0]?.record.caseId ?? s.case} · ${item.scope === 'matched-noise-diagnostic' ? s.diagnostic : s.take(item.take)}`,
            }))}
            onValueChange={(value) => {
              track('video_results_case_changed', {
                index: groups.findIndex((item) => item.key === value),
              });
              setSelectedGroup(value);
            }}
          />
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
  const diagnostic = group?.scope === 'matched-noise-diagnostic';
  const videos = useRef(new Map<string, HTMLVideoElement>());
  const canvases = useRef(new Map<string, HTMLCanvasElement>());
  const [shown, setShown] = useState<Pick<ClipGroupStep, 'time' | 'buffered' | 'ready'>>({
    time: 0,
    buffered: 0,
    ready: false,
  });
  const { time, buffered, ready } = shown;
  const [phase, setPhase] = useState<ClipPhase>('paused');
  const phaseRef = useRef<ClipPhase>('paused');
  const [audioSource, setAudioSource] = useState<string | null>(null);
  const [view, setView] = useState<'clip' | 'difference'>('clip');
  const [durations, setDurations] = useState<Record<string, number>>({});
  const [errors, setErrors] = useState<ReadonlySet<string>>(new Set());
  const [differenceErrors, setDifferenceErrors] = useState<ReadonlySet<string>>(new Set());
  // One tile per measured hardware, like the chart legend; roster entries without a cell get none.
  const visible = RESULTS_HARDWARE.filter(
    (key) => !hidden.has(key) && points.some((point) => point.hardwareKey === key),
  );
  const referenceClip = resultsClipReference(group, hidden);
  const reference = referenceClip && !errors.has('reference') ? referenceClip : null;
  const visibleKey = [...visible, ...(referenceClip ? ['reference'] : [])].join(',');
  const playable = [
    ...visible.filter((key) => group?.clips.has(key) && !errors.has(key)),
    ...(reference ? ['reference'] : []),
  ];
  const audioSources = playable.filter((key) => key !== 'reference');
  const audibleSource = audioSource && audioSources.includes(audioSource) ? audioSource : null;
  const knownDurations = playable.flatMap((key) => (durations[key] > 0 ? [durations[key]] : []));
  const duration = knownDurations.length > 0 ? Math.min(...knownDurations) : 0;

  useLayoutEffect(() => {
    // SSR media can finish loading before React attaches loadedmetadata listeners.
    const loaded = [...videos.current].flatMap(([key, video]) =>
      video.readyState >= 1 && Number.isFinite(video.duration) && video.duration > 0
        ? [[key, video.duration] as const]
        : [],
    );
    setDurations((previous) =>
      loaded.some(([key, recordedDuration]) => previous[key] !== recordedDuration)
        ? { ...previous, ...Object.fromEntries(loaded) }
        : previous,
    );
  }, [group, visibleKey]);

  useLayoutEffect(() => {
    if (audioSource !== audibleSource) setAudioSource(null);
    const video = audibleSource ? videos.current.get(audibleSource) : null;
    return () => {
      if (video) video.muted = true;
    };
  }, [audioSource, audibleSource]);

  // The frame loop reads group inputs through this ref so it never re-subscribes mid-playback.
  const live = useRef({ visibleKey, errors, audibleSource, duration });
  live.current = { visibleKey, errors, audibleSource, duration };

  const dispatch = (event: ClipEvent): ClipGroupStep => {
    const current = live.current;
    const clips = current.visibleKey.split(',').flatMap((key) => {
      const video = videos.current.get(key);
      return video && !current.errors.has(key) ? [clipSnapshot(key, video)] : [];
    });
    const step = stepClipGroup(
      {
        phase: phaseRef.current,
        clips,
        audible: current.audibleSource,
        duration: current.duration,
      },
      event,
    );
    const setPhaseNow = (next: ClipPhase) => {
      phaseRef.current = next;
      setPhase(next);
    };
    const playAll = () =>
      Promise.allSettled(clips.map((clip) => videos.current.get(clip.key)?.play())).then(
        (outcomes) => {
          // pause() interrupting play() rejects with AbortError; that is group control, not a media failure.
          const rejected = clips.flatMap((clip, index) => {
            const outcome = outcomes[index];
            return outcome.status === 'rejected' &&
              (outcome.reason as { name?: string } | null)?.name !== 'AbortError'
              ? [clip.key]
              : [];
          });
          if (rejected.length > 0) setErrors((previous) => new Set([...previous, ...rejected]));
          if (
            phaseRef.current === 'playing' &&
            !outcomes.some((outcome) => outcome.status === 'fulfilled')
          )
            setPhaseNow('paused');
        },
      );
    for (const action of step.actions) {
      switch (action.type) {
        case 'play-all': {
          void playAll();
          break;
        }
        case 'pause-all': {
          for (const clip of clips) videos.current.get(clip.key)?.pause();
          break;
        }
        case 'prime': {
          void playAll();
          for (const clip of clips) videos.current.get(clip.key)?.pause();
          break;
        }
        case 'seek': {
          const video = videos.current.get(action.key);
          if (video) video.currentTime = action.time;
          break;
        }
        case 'rate': {
          const video = videos.current.get(action.key);
          if (video) video.playbackRate = action.rate;
          break;
        }
        default: {
          break;
        }
      }
    }
    if (step.phase !== phaseRef.current) setPhaseNow(step.phase);
    return step;
  };
  const show = ({ time: at, buffered: share, ready: loaded }: ClipGroupStep) =>
    setShown({ time: at, buffered: share, ready: loaded });
  /** Keeps the loaded share current while idle; the frame loop covers the active phases. */
  const refresh = () => {
    if (!clipGroupActive(phaseRef.current)) show(dispatch('tick'));
  };

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) show(dispatch('pause'));
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
    show(dispatch('pause'));
  }, [visibleKey]);

  useEffect(() => {
    if (!clipGroupActive(phase)) return undefined;
    let frame = 0;
    let displayed = -Infinity;
    const tick = (now: number) => {
      const step = dispatch('tick');
      const running = clipGroupActive(step.phase);
      if (!running || now - displayed >= DISPLAY_INTERVAL_MS) {
        displayed = now;
        show(step);
      }
      if (running) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  useEffect(() => {
    if (view !== 'difference' || !reference) return undefined;
    let frame = 0;
    let lastDraw = -Infinity;
    const buffer = document.createElement('canvas');
    const context = buffer.getContext('2d', { willReadFrequently: true });
    const failDifference = (key: string) =>
      setDifferenceErrors((previous) =>
        previous.has(key) ? previous : new Set([...previous, key]),
      );
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (!context || now - lastDraw < 100) return;
      lastDraw = now;
      const ref = videos.current.get('reference');
      if (!ref || ref.readyState < 2 || ref.videoWidth === 0) return;
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
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [view, reference, visibleKey]);

  const changeAudio = (value: string) => {
    const next = audioSources.includes(value) ? value : null;
    for (const video of videos.current.values()) video.muted = true;
    setAudioSource(next);
    track('video_results_audio_changed', { enabled: next !== null, gpu: next });
    const video = next ? videos.current.get(next) : null;
    if (video) {
      video.muted = false;
      if (phaseRef.current === 'playing')
        void video.play().catch(() => {
          video.muted = true;
          setAudioSource((current) => (current === next ? null : current));
        });
    }
  };

  const active = clipGroupActive(phase);
  const togglePlay = () => {
    const pausing = clipGroupActive(phaseRef.current);
    track(pausing ? 'video_results_clips_pause' : 'video_results_clips_play');
    show(dispatch(pausing ? 'pause' : 'play'));
  };
  const progress =
    phase === 'buffering'
      ? s.buffering
      : !ready && playable.length > 0 && (phase === 'paused' || phase === 'loading')
        ? s.downloading
        : null;

  return (
    <>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <span>{diagnostic ? s.diagnostic : s.label}</span>
        <InfoHelp label={s.label} value="clip-metrics" triggerTestId="video-results-metrics-help">
          {diagnostic ? s.diagnosticNote : s.metricsHelp}
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
              {s.seed} {group.seed} · {diagnostic ? s.diagnostic : s.take(group.take)}
            </p>
          )}
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left">
            <thead className="whitespace-nowrap text-muted-foreground">
              <tr>
                <th className="pr-3 font-medium">{s.source}</th>
                <th className="pr-3 font-medium">{s.run}</th>
                <th className="pr-3 font-medium">{diagnostic ? s.receipt : s.artifact}</th>
                <th className="pr-3 font-medium">{s.runtime}</th>
                <th className="pr-3 font-medium">{s.approval}</th>
                <th className="font-medium">{s.media}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((key) => {
                const point = diagnostic
                  ? undefined
                  : points.find((item) => item.hardwareKey === key);
                const clip = group?.clips.get(key);
                const native =
                  clip?.quality && 'scope' in clip.quality ? clip.quality.candidate : null;
                return (
                  <tr key={key} className="border-t align-top">
                    <td className="pr-3 whitespace-nowrap">{hardwareLabel(key)}</td>
                    <td className="pr-3 break-all">{native?.run_id ?? point?.runId ?? '—'}</td>
                    <td className="pr-3 break-all" title={native?.receipt_sha256}>
                      {native ? native.receipt_sha256.slice(0, 12) : (point?.artifactId ?? '—')}
                    </td>
                    <td className="pr-3 break-all">
                      {native
                        ? `${native.runtime_name} ${native.runtime_revision.slice(0, 12)}`
                        : point?.runtime || '—'}
                    </td>
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
      {referenceClip && (
        <figure
          data-testid="video-results-reference"
          className="grid min-w-0 gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] sm:items-center"
        >
          <div className="relative aspect-video overflow-hidden bg-black">
            <video
              ref={(element) => {
                if (element) videos.current.set('reference', element);
                else videos.current.delete('reference');
              }}
              src={referenceClip.url}
              muted
              playsInline
              crossOrigin="anonymous"
              preload="auto"
              aria-label={s.reference}
              className="size-full object-contain"
              onProgress={refresh}
              onCanPlayThrough={refresh}
              onLoadedMetadata={(event) => {
                const value = event.currentTarget.duration;
                if (Number.isFinite(value) && value > 0)
                  setDurations((previous) => ({ ...previous, reference: value }));
              }}
              onError={() => setErrors((previous) => new Set([...previous, 'reference']))}
            />
            {errors.has('reference') && (
              <p
                role="status"
                className="absolute inset-0 grid place-content-center bg-muted p-2 text-xs text-muted-foreground"
              >
                {s.mediaError}
              </p>
            )}
          </div>
          <figcaption className="min-w-0 space-y-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1 text-sm font-medium text-foreground">
              <span>{s.reference}</span>
              <InfoHelp label={s.reference} value="reference-method">
                {s.referenceNote}
              </InfoHelp>
            </div>
            <p>{s.schedule(referenceClip.denoising_updates, referenceClip.sigma_points)}</p>
            <p className="break-all font-mono">
              Diffusers {referenceClip.diffusers_revision.slice(0, 12)}
            </p>
            <a
              href={referenceClip.url}
              className="underline"
              onClick={() => track('video_results_reference_opened')}
            >
              {s.media}
            </a>
          </figcaption>
        </figure>
      )}
      <div
        className={`grid min-w-0 grid-cols-1 gap-3 min-[360px]:grid-cols-2 lg:grid-cols-4 lg:gap-4 ${visible.length > 4 ? 'xl:grid-cols-5' : ''}`}
      >
        {visible.map((key) => {
          const point = diagnostic ? undefined : points.find((item) => item.hardwareKey === key);
          const clip = group?.clips.get(key);
          const native = clip?.quality && 'scope' in clip.quality ? clip.quality.candidate : null;
          const pairedReference =
            reference &&
            clip?.quality &&
            clip.quality.status !== 'incompatible' &&
            clip.quality.reference.receipt_sha256 === reference.receipt_sha256 &&
            clip.quality.reference.media_sha256 === reference.media_sha256;
          const unavailable = errors.has(key)
            ? s.mediaError
            : clip
              ? view === 'difference' && !pairedReference
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
                  {native
                    ? s.gpu(native.gpu_count)
                    : typeof point?.participating === 'number'
                      ? s.gpu(point.participating)
                      : '—'}
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
                    muted={audibleSource !== key}
                    playsInline
                    preload="auto"
                    aria-label={`${hardwareLabel(key)} ${s.clip}`}
                    className={
                      view === 'clip' && !unavailable
                        ? 'size-full object-contain'
                        : 'invisible absolute size-full'
                    }
                    onProgress={refresh}
                    onCanPlayThrough={refresh}
                    onLoadedMetadata={(event) => {
                      const value = event.currentTarget.duration;
                      if (Number.isFinite(value) && value > 0)
                        setDurations((previous) => ({ ...previous, [key]: value }));
                    }}
                    onError={() => setErrors((previous) => new Set([...previous, key]))}
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
              </div>
              <dl className="space-y-1 text-xs tabular-nums">
                {[
                  [
                    s.wall,
                    diagnostic || !clip || clip.record.seconds === null
                      ? '—'
                      : `${display(clip.record.seconds)} ${s.seconds}`,
                    diagnostic ? s.diagnosticMetric : '',
                  ],
                  [
                    s.psnr,
                    clip?.quality?.status === 'identical'
                      ? s.exactMatch
                      : clip?.quality?.status === 'measured'
                        ? `${display(clip.quality.psnrDb, 2)} dB`
                        : '—',
                    clip?.quality
                      ? clip.quality.status === 'incompatible'
                        ? s.incompatible
                        : s.psnrMeasured(clip.quality.totalFrames)
                      : s.psnrNote,
                  ],
                  [
                    s.energy,
                    display(!point || point.energyKj === null ? null : point.energyKj * 1000, 0),
                    diagnostic ? s.diagnosticMetric : s.energyNote,
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
          aria-pressed={active}
          onClick={togglePlay}
        >
          {active ? s.pause : s.play}
        </Button>
        <div className="w-40 min-w-0">
          <VideoSelect
            label={s.audio}
            value={audibleSource ?? 'muted'}
            testId="video-results-audio"
            options={[
              { value: 'muted', label: s.muted },
              ...audioSources.map((key) => ({ value: key, label: s.listen(hardwareLabel(key)) })),
            ]}
            onValueChange={changeAudio}
          />
        </div>
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
            setDifferenceErrors(new Set());
            show(dispatch({ type: 'seek', time: next }));
            track('video_results_clips_scrub', { seconds: next });
          }}
        />
        <span className="font-mono text-xs text-muted-foreground">
          {time.toFixed(2)} / {duration > 0 ? duration.toFixed(2) : '—'} {s.seconds}
        </span>
        {progress && (
          <span
            data-testid="video-results-buffering"
            className="font-mono text-xs text-muted-foreground"
          >
            {progress(Math.round(buffered * 100))}
          </span>
        )}
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
