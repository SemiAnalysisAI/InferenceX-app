'use client';

import { Pause, Play, RotateCcw, Video } from 'lucide-react';
import { flushSync } from 'react-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { sequenceToIslOsl } from '@semianalysisai/inferencex-constants';

import { useInference } from '@/components/inference/InferenceContext';
import ScatterGraph from '@/components/inference/ui/ScatterGraph';
import type { ChartDefinition } from '@/components/inference/types';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useBenchmarkHistory } from '@/hooks/api/use-benchmark-history';
import { track } from '@/lib/analytics';
import { cn } from '@/lib/utils';

import { buildReplayTimeline } from './buildReplayTimeline';
import type { Mp4ExportError, Mp4ExportStage } from './exportMp4';
import { buildFrameData, dateAtFraction, shouldCommitFraction, spanMs } from './replayFrameData';
import { useReducedMotion } from './useReducedMotion';

type Mp4ExportGuard = (value: unknown) => value is Mp4ExportError;

// Lowercase pipeline tokens like "mux"/"flush" are jargon in a user-facing
// banner. The raw stage still flows through telemetry — only the user copy
// is humanized.
const STAGE_LABELS: Partial<Record<Mp4ExportStage, string>> = {
  render: 'while rendering frames',
  encode: 'while encoding video',
  flush: 'while finalizing video',
  mux: 'while finalizing video',
};

interface ReplayPanelProps {
  parentChartId: string;
  chartDefinition: ChartDefinition;
  yLabel: string;
  xLabel: string;
}

const SPEED_OPTIONS: readonly number[] = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const REPLAY_BODY_MIN_HEIGHT = 480;

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
  const inference = useInference();
  const { selectedModel, selectedSequence } = inference;

  const { isl = 0, osl = 0 } = sequenceToIslOsl(selectedSequence) ?? {};
  const history = useBenchmarkHistory(selectedModel, isl, osl);

  const effectiveX =
    chartDefinition.chartType === 'e2e'
      ? inference.selectedE2eXAxisMetric
      : inference.selectedXAxisMetric;

  const timeline = useMemo(() => {
    if (!history.data) return null;
    return buildReplayTimeline(
      history.data,
      chartDefinition,
      inference.selectedYAxisMetric,
      effectiveX ?? null,
      inference.selectedPrecisions,
    );
  }, [
    history.data,
    chartDefinition,
    inference.selectedYAxisMetric,
    effectiveX,
    inference.selectedPrecisions,
  ]);

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

  const [fraction, setFraction] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
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
  const fractionRef = useRef(0);
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

  useEffect(() => {
    fractionRef.current = 0;
    setFraction(0);
    setPlaying(false);
  }, [timeline]);

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
        renderFrame: async (t) => {
          // flushSync forces React to commit synchronously; two RAFs let the
          // browser paint before the capture step reads back the DOM.
          flushSync(() => commitFraction(t, { force: true }));
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
      const message = error instanceof Error ? error.message : 'Export failed.';
      const errorName = error instanceof Error ? error.name : 'unknown';
      let encoderState: VideoEncoder['state'] | 'unknown' = 'unknown';
      let queuedFrames = 0;
      if (guard?.(error)) {
        stage = error.stage;
        encoderState = error.encoderState;
        queuedFrames = error.queuedFrames;
      }
      const elapsedSinceLastProgressMs = Math.round(performance.now() - lastProgressAt);
      const stageLabel = STAGE_LABELS[stage];
      setExportError(
        hasWebCodecs
          ? `${message}${stageLabel ? ` (${stageLabel})` : ''}`
          : 'MP4 export needs WebCodecs (Chrome, Edge, or Chromium). Your browser does not support it.',
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
  }, [chartDefinition.chartType, parentChartId, selectedModel, timeline, hasWebCodecs]);

  if (history.isLoading || !timeline) {
    return (
      <div
        className="p-4 sm:p-6 flex flex-col"
        data-testid={`replay-panel-${parentChartId}`}
        style={{ minHeight: REPLAY_BODY_MIN_HEIGHT + 140 }}
      >
        <h3 className="text-base font-semibold">Replay over time</h3>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading benchmark history…</p>
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
        <h3 className="text-base font-semibold">Replay over time</h3>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">
            Not enough history yet to replay this chart — at least two distinct benchmark dates are
            required.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={panelRef} className="p-4 sm:p-6" data-testid={`replay-panel-${parentChartId}`}>
      <div className="flex flex-wrap items-baseline gap-3 mb-3 pr-8">
        <h3 className="text-base font-semibold">Replay over time</h3>
        <p className="text-xs text-muted-foreground">
          {timeline.dates[0]} → {timeline.dates.at(-1)} • {timeline.dates.length} dates •{' '}
          {timeline.configs.length} configs
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
        />
        <div
          className="absolute -translate-y-full pointer-events-none text-2xl font-bold tabular-nums opacity-85 leading-none pb-1"
          style={{ top: svgOffset?.top ?? 24, right: svgOffset?.right ?? 10 }}
          data-testid="replay-date-overlay"
        >
          {currentDate}
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
          aria-label={playing ? 'Pause replay' : 'Play replay'}
          data-testid="replay-play-pause"
          className="gap-1"
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          {playing ? 'Pause' : 'Play'}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={handleReset}
          aria-label="Reset to start"
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
          aria-label="Replay timeline"
          aria-valuetext={currentDate || undefined}
          data-testid="replay-scrubber"
        />
        <span className="text-xs tabular-nums text-muted-foreground min-w-[5.5rem] text-right">
          {currentDate}
        </span>
        <Select value={String(speed)} onValueChange={(v) => handleSpeedChange(Number(v))}>
          <SelectTrigger
            className="h-8 w-[5.5rem]"
            aria-label="Playback speed"
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
        <Button
          size="sm"
          variant="default"
          onClick={handleExportMp4}
          disabled={isExporting || !hasWebCodecs}
          data-testid="replay-export-mp4"
          className="gap-1"
          title={
            hasWebCodecs
              ? undefined
              : 'MP4 export requires a Chromium-based browser (Chrome, Edge).'
          }
        >
          <Video className="size-4" />
          {isExporting
            ? exportProgress === null
              ? 'Exporting…'
              : `Exporting ${Math.round(exportProgress * 100)}%`
            : 'Export MP4'}
        </Button>
        {isExporting && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleCancelExport}
            data-testid="replay-export-cancel"
            className="pointer-events-auto"
          >
            Cancel
          </Button>
        )}
      </div>
      {exportError && (
        <div
          role="alert"
          data-testid="replay-export-error"
          className="no-export mt-3 flex items-start justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <span className="flex-1">MP4 export failed: {exportError}</span>
          <button
            onClick={() => setExportError(null)}
            className="text-destructive/70 hover:text-destructive cursor-pointer"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
