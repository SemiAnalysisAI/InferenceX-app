'use client';

import { Pause, Play, RotateCcw, Video } from 'lucide-react';
import { flushSync } from 'react-dom';
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type SetStateAction,
} from 'react';

import { sequenceToIslOsl } from '@semianalysisai/inferencex-constants';

import { useInferenceDisplay, useInferenceFilters } from '@/components/inference/InferenceContext';
import ScatterGraph from '@/components/inference/ui/ScatterGraph';
import type { ChartDefinition } from '@/components/inference/types';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useBenchmarkHistory } from '@/hooks/api/use-benchmark-history';
import { track } from '@/lib/analytics';
import { Sequence } from '@/lib/data-mappings';
import { cn } from '@/lib/utils';
import { useLocale } from '@/lib/use-locale';
import type { Locale } from '@/lib/i18n';

import {
  buildReplayTimeline,
  computeFullRunDomain,
  type ReplayTimeline,
  type StepDomain,
} from './buildReplayTimeline';
import type { Mp4ExportError, Mp4ExportStage } from './exportMp4';
import { buildFrameData, dateAtFraction, shouldCommitFraction, spanMs } from './replayFrameData';
import { useReducedMotion } from './useReducedMotion';

type Mp4ExportGuard = (value: unknown) => value is Mp4ExportError;

// Lowercase pipeline tokens like "mux"/"flush" are jargon in a user-facing
// banner. The raw stage still flows through telemetry — only the user copy
// is humanized.
const STAGE_LABELS: Record<Locale, Partial<Record<Mp4ExportStage, string>>> = {
  en: {
    render: 'while rendering frames',
    encode: 'while encoding video',
    flush: 'while finalizing video',
    mux: 'while finalizing video',
  },
  zh: {
    render: '渲染帧时',
    encode: '编码视频时',
    flush: '完成视频时',
    mux: '完成视频时',
  },
};

const REPLAY_STRINGS = {
  en: {
    heading: 'Replay over time',
    loading: 'Loading benchmark history…',
    loadError: 'Failed to load benchmark history.',
    retry: 'Retry',
    insufficient:
      'Not enough history yet to replay this chart — at least two distinct benchmark dates are required.',
    dates: (count: number) => `${count} dates`,
    configs: (count: number) => `${count} configs`,
    pauseReplay: 'Pause replay',
    playReplay: 'Play replay',
    pause: 'Pause',
    play: 'Play',
    reset: 'Reset to start',
    timeline: 'Replay timeline',
    speed: 'Playback speed',
    fixedAxes: 'Fixed axes',
    fixedAxesTitle:
      'Keep the axes fixed across the whole run so you can see the frontier improve over time, or let them refit to each frame.',
    chromiumRequired: 'MP4 export requires a Chromium-based browser (Chrome, Edge).',
    webCodecsRequired:
      'MP4 export needs WebCodecs (Chrome, Edge, or Chromium). Your browser does not support it.',
    exporting: 'Exporting…',
    exportingProgress: (percent: number) => `Exporting ${percent}%`,
    exportMp4: 'Export MP4',
    cancel: 'Cancel',
    exportFailed: 'MP4 export failed:',
    fallbackError: 'Export failed.',
    dismiss: 'Dismiss',
  },
  zh: {
    heading: '按时间回放',
    loading: '正在加载基准测试历史……',
    loadError: '基准测试历史加载失败。',
    retry: '重试',
    insufficient: '历史数据不足，暂时无法回放该图表——至少需要两个不同的基准测试日期。',
    dates: (count: number) => `${count} 个日期`,
    configs: (count: number) => `${count} 个配置`,
    pauseReplay: '暂停回放',
    playReplay: '播放回放',
    pause: '暂停',
    play: '播放',
    reset: '重置到起点',
    timeline: '回放时间线',
    speed: '播放速度',
    fixedAxes: '固定坐标轴',
    fixedAxesTitle:
      '在整次运行中固定坐标轴，以观察 Pareto 前沿随时间改善；也可关闭，让坐标轴随每一帧重新拟合。',
    chromiumRequired: 'MP4 导出需要基于 Chromium 的浏览器（Chrome、Edge）。',
    webCodecsRequired: 'MP4 导出需要 WebCodecs（Chrome、Edge 或 Chromium），当前浏览器不支持。',
    exporting: '正在导出……',
    exportingProgress: (percent: number) => `正在导出 ${percent}%`,
    exportMp4: '导出 MP4',
    cancel: '取消',
    exportFailed: 'MP4 导出失败：',
    fallbackError: '导出失败。',
    dismiss: '关闭',
  },
} as const;

const formatReplayDate = (date: string, locale: Locale) => {
  if (locale === 'en' || !date) return date;
  const [year, month, day] = date.split('-').map(Number);
  return `${year}年${month}月${day}日`;
};

interface ReplayPanelProps {
  parentChartId: string;
  chartDefinition: ChartDefinition;
  yLabel: string;
  xLabel: string;
}

const SPEED_OPTIONS: readonly number[] = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const REPLAY_BODY_MIN_HEIGHT = 480;

interface ReplayPlaybackState {
  timeline: ReplayTimeline | null;
  fraction: number;
  playing: boolean;
}

type ReplayPlaybackAction =
  | { type: 'resetTimeline'; timeline: ReplayTimeline | null }
  | { type: 'setFraction'; value: SetStateAction<number> }
  | { type: 'setPlaying'; value: SetStateAction<boolean> };

function replayPlaybackReducer(
  state: ReplayPlaybackState,
  action: ReplayPlaybackAction,
): ReplayPlaybackState {
  if (action.type === 'resetTimeline') {
    return { timeline: action.timeline, fraction: 0, playing: false };
  }
  if (action.type === 'setFraction') {
    return {
      ...state,
      fraction: typeof action.value === 'function' ? action.value(state.fraction) : action.value,
    };
  }
  return {
    ...state,
    playing: typeof action.value === 'function' ? action.value(state.playing) : action.value,
  };
}

/**
 * Replay panel that drives the actual `<ScatterGraph>` with interpolated frame
 * data per tick. React re-renders every frame; ScatterGraph's `transitionDuration`
 * is forced to 0 so positions snap to the interpolation instead of being
 * smoothed by D3's tween. This trades raw render throughput for full parity
 * with the regular chart — every toggle and feature the scatter chart respects
 * automatically applies to replay because it IS the scatter chart.
 */
export default function ReplayPanel({
  parentChartId,
  chartDefinition,
  yLabel,
  xLabel,
}: ReplayPanelProps) {
  const { selectedModel, selectedSequence, selectedPrecisions, activeHwTypes } =
    useInferenceFilters();
  const { selectedE2eXAxisMetric, selectedXAxisMetric, selectedYAxisMetric } =
    useInferenceDisplay();

  const { isl = 0, osl = 0 } = sequenceToIslOsl(selectedSequence) ?? {};
  const history = useBenchmarkHistory(
    selectedModel,
    isl,
    osl,
    selectedSequence === Sequence.AgenticTraces ? { benchmarkType: 'agentic_traces' } : undefined,
  );

  const effectiveX =
    chartDefinition.chartType === 'e2e' ? selectedE2eXAxisMetric : selectedXAxisMetric;

  const timeline = useMemo(() => {
    if (!history.data) return null;
    return buildReplayTimeline(
      history.data,
      chartDefinition,
      selectedYAxisMetric,
      effectiveX ?? null,
      selectedPrecisions,
    );
  }, [history.data, chartDefinition, selectedYAxisMetric, effectiveX, selectedPrecisions]);

  // Fixed axes for the whole run: take the extent across every step (not just
  // the current frame) for the active hardware, so the axes stay put and the
  // frontier visibly expands toward them over time instead of the chart
  // refitting each frame. Recomputed when the legend's hw filter changes.
  const fixedExtent = useMemo(
    () => (timeline ? computeFullRunDomain(timeline, (hw) => activeHwTypes.has(hw)) : null),
    [timeline, activeHwTypes],
  );

  return (
    <ReplayPanelContent
      parentChartId={parentChartId}
      chartDefinition={chartDefinition}
      yLabel={yLabel}
      xLabel={xLabel}
      timeline={timeline}
      fixedExtent={fixedExtent}
      selectedModel={selectedModel}
      isLoading={history.isLoading}
      isError={history.isError}
      onRetry={() => void history.refetch()}
    />
  );
}

interface ReplayPanelContentProps extends ReplayPanelProps {
  timeline: ReplayTimeline | null;
  fixedExtent: StepDomain | null;
  selectedModel: string;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

function ReplayPanelContent({
  parentChartId,
  chartDefinition,
  yLabel,
  xLabel,
  timeline,
  fixedExtent,
  selectedModel,
  isLoading,
  isError,
  onRetry,
}: ReplayPanelContentProps) {
  const locale = useLocale();
  const t = REPLAY_STRINGS[locale];
  // Track the SVG's position inside our relative wrapper so the date overlay
  // can anchor its bottom-right to the chart plot's top-right (the wrapper
  // also contains the legend, so we can't anchor to the wrapper edge).
  // Callback ref — fires when the wrapper element mounts/unmounts, including
  // after the panel transitions out of the loading state. A useEffect with
  // [] deps would have run before the wrapper existed and never re-fired.
  const [svgOffset, setSvgOffset] = useState<{ right: number; top: number } | null>(null);
  const observersRef = useRef<{ size: ResizeObserver; mutation: MutationObserver } | null>(null);
  const setChartWrapperEl = useCallback((wrapper: HTMLDivElement | null) => {
    if (observersRef.current) {
      observersRef.current.size.disconnect();
      observersRef.current.mutation.disconnect();
      observersRef.current = null;
    }
    if (!wrapper) {
      setSvgOffset(null);
      return;
    }
    let svgEl: SVGSVGElement | null = null;
    const measure = () => {
      const svg = wrapper.querySelector('svg');
      if (!svg) return;
      const wRect = wrapper.getBoundingClientRect();
      const sRect = svg.getBoundingClientRect();
      // When the legend sits to the right of the SVG, anchor the date's right
      // edge to the legend's left edge (with a small gap) so wide dates like
      // "2026-05-13" can't bleed into the legend column. Fall back to the
      // SVG's right edge when no legend column is present (mobile/stacked).
      // The legend container is positioned over the right edge of the SVG, so
      // its bounding rect overlaps the SVG horizontally — anchor the date's
      // right edge to the legend's left edge whenever it's present rather
      // than checking for non-overlap.
      const legend = wrapper.querySelector<HTMLElement>('[data-testid="chart-legend"]');
      const legendRect = legend?.getBoundingClientRect();
      const rightAnchor = legendRect
        ? wRect.right - legendRect.left + 12
        : wRect.right - sRect.right + 10;
      setSvgOffset((prev) => {
        const next = {
          right: Math.max(0, rightAnchor),
          top: sRect.top - wRect.top + 24,
        };
        if (prev && prev.right === next.right && prev.top === next.top) return prev;
        return next;
      });
      if (svgEl !== svg) {
        sizeRO.observe(svg);
        svgEl = svg;
      }
    };
    const sizeRO = new ResizeObserver(measure);
    sizeRO.observe(wrapper);
    const mo = new MutationObserver(measure);
    mo.observe(wrapper, { childList: true, subtree: true });
    observersRef.current = { size: sizeRO, mutation: mo };
    measure();
  }, []);
  useEffect(
    () => () => {
      observersRef.current?.size.disconnect();
      observersRef.current?.mutation.disconnect();
      observersRef.current = null;
    },
    [],
  );

  const panelRef = useRef<HTMLDivElement>(null);

  const [playback, dispatchPlayback] = useReducer(replayPlaybackReducer, {
    timeline,
    fraction: 0,
    playing: false,
  });
  let { fraction, playing } = playback;
  const timelineChanged = playback.timeline !== timeline;
  if (timelineChanged) {
    fraction = 0;
    playing = false;
    dispatchPlayback({ type: 'resetTimeline', timeline });
  }
  const setFraction = useCallback((value: SetStateAction<number>) => {
    dispatchPlayback({ type: 'setFraction', value });
  }, []);
  const setPlaying = useCallback((value: SetStateAction<boolean>) => {
    dispatchPlayback({ type: 'setPlaying', value });
  }, []);
  const [speed, setSpeed] = useState(1);
  // Fixed axes (default) freeze the coordinate space to the whole run so the
  // frontier visibly expands over time; turning this off lets the axes refit to
  // each frame's points.
  const [fixedAxes, setFixedAxes] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const prefersReducedMotion = useReducedMotion();

  // Pre-flight feature detection so the Export button is disabled with a clear
  // reason on browsers that lack WebCodecs (Firefox today, older Safari).
  const hasWebCodecs = useMemo(() => typeof VideoEncoder !== 'undefined', []);
  const unavailableReportedRef = useRef(false);
  useEffect(() => {
    if (!hasWebCodecs && !unavailableReportedRef.current) {
      unavailableReportedRef.current = true;
      track('inference_replay_export_unavailable', {
        userAgent: typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent.slice(0, 200),
      });
    }
  }, [hasWebCodecs]);

  const speedRef = useRef(speed);
  speedRef.current = speed;
  const playingRef = useRef(playing);
  playingRef.current = playing;

  // Accumulator decoupled from React state so the rAF loop doesn't trigger a
  // commit on every tick. Snapshot the previous ref value *before* mutating
  // so the predicate compares like-with-like — comparing against the
  // React-committed value lags by a frame and would no-op a backward scrub
  // that crosses a quantum boundary.
  const fractionRef = useRef(fraction);
  if (timelineChanged) fractionRef.current = 0;
  const commitFraction = useCallback((next: number, opts?: { force?: boolean }) => {
    const clamped = next < 0 ? 0 : Math.min(1, next);
    const prev = fractionRef.current;
    fractionRef.current = clamped;
    const force = opts?.force ?? false;
    if (force || shouldCommitFraction(prev, clamped)) setFraction(clamped);
  }, []);

  useEffect(() => {
    if (!playing || !timeline) return;
    // Reduced motion: advance one observed step per ~1.2s without per-frame
    // interpolation, so users get a slideshow rather than continuous motion.
    if (prefersReducedMotion) {
      const stepMs = 1200 / Math.max(0.1, speedRef.current);
      const n = timeline.dates.length;
      const intervalId = window.setInterval(() => {
        if (!playingRef.current) return;
        const cur = Math.round(fractionRef.current * (n - 1));
        const nextStep = Math.min(n - 1, cur + 1);
        const next = nextStep / (n - 1);
        commitFraction(next, { force: true });
        if (nextStep === n - 1) setPlaying(false);
      }, stepMs);
      return () => window.clearInterval(intervalId);
    }
    let rafId = 0;
    let last = performance.now();
    const totalMs = spanMs(timeline.dates.length);
    const step = (now: number) => {
      if (!playingRef.current) return;
      const dt = now - last;
      last = now;
      const next = Math.min(1, fractionRef.current + (dt / totalMs) * speedRef.current);
      commitFraction(next);
      if (next >= 1) setPlaying(false);
      rafId = requestAnimationFrame(step);
    };
    // When the tab is hidden the browser throttles rAF to ~1Hz, so resuming
    // without rebasing produces a multi-second `dt` that jumps the playhead.
    // Cancel on hide, rebase + resume on show.
    const onVisibility = () => {
      if (document.hidden) {
        if (rafId !== 0) {
          cancelAnimationFrame(rafId);
          rafId = 0;
        }
        return;
      }
      if (playingRef.current && rafId === 0) {
        last = performance.now();
        rafId = requestAnimationFrame(step);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    rafId = requestAnimationFrame(step);
    return () => {
      if (rafId !== 0) cancelAnimationFrame(rafId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [playing, timeline, prefersReducedMotion]);

  const frameData = useMemo(
    () => (timeline ? buildFrameData(timeline, fraction) : []),
    [timeline, fraction],
  );

  const currentDate = useMemo(
    () => (timeline ? dateAtFraction(timeline, fraction) : ''),
    [timeline, fraction],
  );

  const handlePlayPause = useCallback(() => {
    if (playing) {
      setPlaying(false);
      track('inference_replay_paused', { fraction });
    } else {
      if (fractionRef.current >= 1) commitFraction(0, { force: true });
      setPlaying(true);
      track('inference_replay_started', { speed });
    }
  }, [playing, fraction, speed, commitFraction]);

  const handleScrub = useCallback(
    (value: number) => {
      commitFraction(value, { force: true });
      setPlaying(false);
      track('inference_replay_scrubbed', { fraction: value });
    },
    [commitFraction],
  );

  const handleScrubKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!timeline) return;
      const n = timeline.dates.length;
      if (n <= 1) return;
      const cur = Math.round(fraction * (n - 1));
      let nextStep: number;
      switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowDown': {
          nextStep = Math.max(0, cur - 1);
          break;
        }
        case 'ArrowRight':
        case 'ArrowUp': {
          nextStep = Math.min(n - 1, cur + 1);
          break;
        }
        case 'Home': {
          nextStep = 0;
          break;
        }
        case 'End': {
          nextStep = n - 1;
          break;
        }
        default: {
          return;
        }
      }
      if (nextStep === cur) return;
      e.preventDefault();
      handleScrub(nextStep / (n - 1));
    },
    [timeline, fraction, handleScrub],
  );

  const handleSpeedChange = useCallback((v: number) => {
    setSpeed(v);
    track('inference_replay_speed_changed', { speed: v });
  }, []);

  const handleReset = useCallback(() => {
    commitFraction(0, { force: true });
    setPlaying(false);
  }, [commitFraction]);

  const handleCancelExport = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleExportMp4 = useCallback(async () => {
    if (!timeline) return;
    setPlaying(false);
    setIsExporting(true);
    setExportProgress(0);
    setExportError(null);
    const ac = new AbortController();
    abortRef.current = ac;
    const startedAt = performance.now();
    track('inference_replay_export_started', {
      model: selectedModel,
      chartType: chartDefinition.chartType,
      hasWebCodecs,
    });
    let stage: Mp4ExportStage = 'init';
    let frameCount = 0;
    let lastProgressAt = startedAt;
    // Late-bound so the catch can narrow the error after the module loads.
    let guard: Mp4ExportGuard | null = null;
    try {
      const mod = await import('./exportMp4');
      const { exportReplayMp4 } = mod;
      guard = mod.isMp4ExportError;
      // Export duration is deterministic from timeline length, NOT playback speed
      // — the MP4 is an artifact of the dataset, not a recording of the current
      // UI session. Capped at 60s.
      const durationSec = Math.max(2, Math.min(60, spanMs(timeline.dates.length) / 1000));
      const root = panelRef.current;
      if (!root) throw new Error('Replay panel element is not mounted.');
      await exportReplayMp4({
        captureRoot: root,
        fileName: `InferenceX_${selectedModel}_${chartDefinition.chartType}_replay`,
        durationSec,
        signal: ac.signal,
        renderFrame: async (frameFraction) => {
          // flushSync forces React to commit synchronously; two RAFs let the
          // browser paint before the capture step reads back the DOM.
          flushSync(() => commitFraction(frameFraction, { force: true }));
          await new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          });
        },
        onStage: (s) => {
          stage = s;
        },
        onProgress: (p) => {
          lastProgressAt = performance.now();
          frameCount = Math.round(p * durationSec * 30);
          setExportProgress(p);
        },
      });
      track('inference_replay_export_completed', {
        model: selectedModel,
        chartType: chartDefinition.chartType,
        durationMs: Math.round(performance.now() - startedAt),
      });
    } catch (error) {
      if (ac.signal.aborted) {
        track('inference_replay_export_cancelled', {
          model: selectedModel,
          chartType: chartDefinition.chartType,
          frameCount,
          stage,
          durationMs: Math.round(performance.now() - startedAt),
        });
        return;
      }
      console.error('MP4 export failed', error);
      const message = error instanceof Error ? error.message : t.fallbackError;
      const errorName = error instanceof Error ? error.name : 'unknown';
      let encoderState: VideoEncoder['state'] | 'unknown' = 'unknown';
      let queuedFrames = 0;
      if (guard?.(error)) {
        stage = error.stage;
        encoderState = error.encoderState;
        queuedFrames = error.queuedFrames;
      }
      const elapsedSinceLastProgressMs = Math.round(performance.now() - lastProgressAt);
      const stageLabel = STAGE_LABELS[locale][stage];
      setExportError(
        hasWebCodecs ? `${message}${stageLabel ? ` (${stageLabel})` : ''}` : t.webCodecsRequired,
      );
      track('inference_replay_export_failed', {
        reason: message.slice(0, 500),
        errorName,
        userAgent: typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent.slice(0, 200),
        hasWebCodecs,
        frameCount,
        durationMs: Math.round(performance.now() - startedAt),
        stage,
        encoderState,
        queuedFrames,
        elapsedSinceLastProgressMs,
      });
    } finally {
      setIsExporting(false);
      setExportProgress(null);
      abortRef.current = null;
    }
  }, [chartDefinition.chartType, selectedModel, timeline, hasWebCodecs, locale, t]);

  if (isError) {
    return (
      <div
        className="p-4 sm:p-6 flex flex-col"
        data-testid={`replay-panel-${parentChartId}`}
        style={{ minHeight: REPLAY_BODY_MIN_HEIGHT + 140 }}
      >
        <h3 className="text-base font-semibold">{t.heading}</h3>
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <p className="text-sm text-destructive">{t.loadError}</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              track('inference_replay_history_retry_clicked');
              onRetry();
            }}
          >
            {t.retry}
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading || !timeline) {
    return (
      <div
        className="p-4 sm:p-6 flex flex-col"
        data-testid={`replay-panel-${parentChartId}`}
        style={{ minHeight: REPLAY_BODY_MIN_HEIGHT + 140 }}
      >
        <h3 className="text-base font-semibold">{t.heading}</h3>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">{t.loading}</p>
        </div>
      </div>
    );
  }

  if (timeline.dates.length < 2) {
    return (
      <div
        className="p-4 sm:p-6 flex flex-col"
        data-testid={`replay-panel-${parentChartId}`}
        style={{ minHeight: REPLAY_BODY_MIN_HEIGHT + 140 }}
      >
        <h3 className="text-base font-semibold">{t.heading}</h3>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">{t.insufficient}</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={panelRef} className="p-4 sm:p-6" data-testid={`replay-panel-${parentChartId}`}>
      <div className="flex flex-wrap items-baseline gap-3 mb-3 pr-8">
        <h3 className="text-base font-semibold">{t.heading}</h3>
        <p className="text-xs text-muted-foreground">
          {formatReplayDate(timeline.dates[0], locale)} →{' '}
          {formatReplayDate(timeline.dates.at(-1) ?? '', locale)} • {t.dates(timeline.dates.length)}{' '}
          • {t.configs(timeline.configs.length)}
        </p>
      </div>

      <div className="relative" ref={setChartWrapperEl}>
        <ScatterGraph
          chartId={`replay-${parentChartId}`}
          modelLabel={selectedModel}
          data={frameData}
          xLabel={xLabel}
          yLabel={yLabel}
          chartDefinition={chartDefinition}
          transitionDuration={0}
          niceAxes={false}
          pinLineLabels
          xExtentOverride={fixedAxes ? fixedExtent?.x : undefined}
          yExtentOverride={fixedAxes ? fixedExtent?.y : undefined}
        />
        <div
          className="absolute -translate-y-full pointer-events-none text-2xl font-bold tabular-nums opacity-85 leading-none pb-1"
          style={{ top: svgOffset?.top ?? 24, right: svgOffset?.right ?? 10 }}
          data-testid="replay-date-overlay"
        >
          {formatReplayDate(currentDate, locale)}
        </div>
      </div>

      <div
        className={cn(
          'no-export mt-4 flex flex-wrap items-center gap-3 px-1',
          isExporting && 'opacity-60 pointer-events-none',
        )}
      >
        <Button
          size="sm"
          variant="outline"
          onClick={handlePlayPause}
          aria-label={playing ? t.pauseReplay : t.playReplay}
          data-testid="replay-play-pause"
          className="gap-1"
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          {playing ? t.pause : t.play}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={handleReset}
          aria-label={t.reset}
          data-testid="replay-reset"
        >
          <RotateCcw className="size-4" />
        </Button>
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(fraction * 1000)}
          step={1}
          onChange={(e) => handleScrub(Number(e.target.value) / 1000)}
          onKeyDown={handleScrubKeyDown}
          className="flex-1 min-w-[120px] h-2 cursor-pointer accent-foreground"
          aria-label={t.timeline}
          aria-valuetext={formatReplayDate(currentDate, locale) || undefined}
          data-testid="replay-scrubber"
        />
        <span className="text-xs tabular-nums text-muted-foreground min-w-[5.5rem] text-right">
          {formatReplayDate(currentDate, locale)}
        </span>
        <Select value={String(speed)} onValueChange={(v) => handleSpeedChange(Number(v))}>
          <SelectTrigger
            className="h-8 w-[5.5rem]"
            aria-label={t.speed}
            data-testid="replay-speed-select"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SPEED_OPTIONS.map((v) => (
              <SelectItem key={v} value={String(v)} data-testid={`replay-speed-${v}x`}>
                {v}×
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Switch
            id="replay-fixed-axes"
            data-testid="replay-fixed-axes"
            checked={fixedAxes}
            onCheckedChange={(checked) => {
              setFixedAxes(checked);
              track('inference_replay_fixed_axes_toggled', { enabled: checked });
            }}
          />
          <Label
            htmlFor="replay-fixed-axes"
            className="text-xs text-muted-foreground hover:text-foreground cursor-pointer whitespace-nowrap"
            title={t.fixedAxesTitle}
          >
            {t.fixedAxes}
          </Label>
        </div>
        <Button
          size="sm"
          variant="default"
          onClick={handleExportMp4}
          disabled={isExporting || !hasWebCodecs}
          data-testid="replay-export-mp4"
          className="gap-1"
          title={hasWebCodecs ? undefined : t.chromiumRequired}
        >
          <Video className="size-4" />
          {isExporting
            ? exportProgress === null
              ? t.exporting
              : t.exportingProgress(Math.round(exportProgress * 100))
            : t.exportMp4}
        </Button>
        {isExporting && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleCancelExport}
            data-testid="replay-export-cancel"
            className="pointer-events-auto"
          >
            {t.cancel}
          </Button>
        )}
      </div>
      {exportError && (
        <div
          role="alert"
          data-testid="replay-export-error"
          className="no-export mt-3 flex items-start justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <span className="flex-1">
            {t.exportFailed} {exportError}
          </span>
          <button
            type="button"
            onClick={() => setExportError(null)}
            className="text-destructive/70 hover:text-destructive cursor-pointer"
            aria-label={t.dismiss}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
