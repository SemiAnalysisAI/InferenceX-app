'use client';

import { Pause, Play, RotateCcw, Video } from 'lucide-react';
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
import { buildFrameData, dateAtFraction, shouldCommitFraction, spanMs } from './replayFrameData';
import { useReducedMotion } from './useReducedMotion';
import { useReplayExport } from './useReplayExport';
import { useReplaySvgOffset } from './useReplaySvgOffset';

interface ReplayPanelProps {
  parentChartId: string;
  chartDefinition: ChartDefinition;
  yLabel: string;
  xLabel: string;
}

const SPEED_OPTIONS: readonly number[] = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const REPLAY_BODY_MIN_HEIGHT = 480;

// Shared loading / "not enough history" wrapper for the two early-return states.
function ReplayPlaceholder({ parentChartId, message }: { parentChartId: string; message: string }) {
  return (
    <div
      className="p-4 sm:p-6 flex flex-col"
      data-testid={`replay-panel-${parentChartId}`}
      style={{ minHeight: REPLAY_BODY_MIN_HEIGHT + 140 }}
    >
      <h3 className="text-base font-semibold">Replay over time</h3>
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

interface ReplayControlsProps {
  playing: boolean;
  fraction: number;
  currentDate: string;
  speed: number;
  isExporting: boolean;
  exportProgress: number | null;
  hasWebCodecs: boolean;
  onPlayPause: () => void;
  onReset: () => void;
  onScrub: (value: number) => void;
  onScrubKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onSpeedChange: (v: number) => void;
  onExportMp4: () => void;
  onCancelExport: () => void;
}

// Playback toolbar: play/pause, reset, scrubber, speed select, export + cancel.
function ReplayControls({
  playing,
  fraction,
  currentDate,
  speed,
  isExporting,
  exportProgress,
  hasWebCodecs,
  onPlayPause,
  onReset,
  onScrub,
  onScrubKeyDown,
  onSpeedChange,
  onExportMp4,
  onCancelExport,
}: ReplayControlsProps) {
  return (
    <div
      className={cn(
        'no-export mt-4 flex flex-wrap items-center gap-3 px-1',
        isExporting && 'opacity-60 pointer-events-none',
      )}
    >
      <Button
        size="sm"
        variant="outline"
        onClick={onPlayPause}
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
        onClick={onReset}
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
        onChange={(e) => onScrub(Number(e.target.value) / 1000)}
        onKeyDown={onScrubKeyDown}
        className="flex-1 min-w-[120px] h-2 cursor-pointer accent-foreground"
        aria-label="Replay timeline"
        aria-valuetext={currentDate || undefined}
        data-testid="replay-scrubber"
      />
      <span className="text-xs tabular-nums text-muted-foreground min-w-[5.5rem] text-right">
        {currentDate}
      </span>
      <Select value={String(speed)} onValueChange={(v) => onSpeedChange(Number(v))}>
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
        onClick={onExportMp4}
        disabled={isExporting || !hasWebCodecs}
        data-testid="replay-export-mp4"
        className="gap-1"
        title={
          hasWebCodecs ? undefined : 'MP4 export requires a Chromium-based browser (Chrome, Edge).'
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
          onClick={onCancelExport}
          data-testid="replay-export-cancel"
          className="pointer-events-auto"
        >
          Cancel
        </Button>
      )}
    </div>
  );
}

// Dismissible MP4 export error banner.
function ReplayExportError({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div
      role="alert"
      data-testid="replay-export-error"
      className="no-export mt-3 flex items-start justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      <span className="flex-1">MP4 export failed: {message}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="text-destructive/70 hover:text-destructive cursor-pointer"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
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
  const inference = useInference();
  const { selectedModel, selectedSequence } = inference;

  const { isl = 0, osl = 0 } = sequenceToIslOsl(selectedSequence) ?? {};
  const historyQuery = useBenchmarkHistory(selectedModel, isl, osl);

  const effectiveX =
    chartDefinition.chartType === 'e2e'
      ? inference.selectedE2eXAxisMetric
      : inference.selectedXAxisMetric;

  const timeline = useMemo(() => {
    if (!historyQuery.data) return null;
    return buildReplayTimeline(
      historyQuery.data,
      chartDefinition,
      inference.selectedYAxisMetric,
      effectiveX ?? null,
      inference.selectedPrecisions,
    );
  }, [
    historyQuery.data,
    chartDefinition,
    inference.selectedYAxisMetric,
    effectiveX,
    inference.selectedPrecisions,
  ]);

  const { svgOffset, setChartWrapperEl } = useReplaySvgOffset();

  const panelRef = useRef<HTMLDivElement>(null);

  const [fraction, setFraction] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  const prefersReducedMotion = useReducedMotion();

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

  const {
    isExporting,
    exportProgress,
    exportError,
    hasWebCodecs,
    setExportError,
    handleExportMp4,
    handleCancelExport,
  } = useReplayExport({
    timeline,
    selectedModel,
    chartDefinition,
    parentChartId,
    panelRef,
    commitFraction,
    setPlaying,
  });

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

  // Reset playback to the start whenever the timeline changes. Done during
  // render (not in an effect) so the reset commits with the new timeline.
  const [prevTimeline, setPrevTimeline] = useState(timeline);
  if (timeline !== prevTimeline) {
    setPrevTimeline(timeline);
    fractionRef.current = 0;
    setFraction(0);
    setPlaying(false);
  }

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

  if (historyQuery.isLoading || !timeline) {
    return <ReplayPlaceholder parentChartId={parentChartId} message="Loading benchmark history…" />;
  }

  if (timeline.dates.length < 2) {
    return (
      <ReplayPlaceholder
        parentChartId={parentChartId}
        message="Not enough history yet to replay this chart; at least two distinct benchmark dates are required."
      />
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

      <ReplayControls
        playing={playing}
        fraction={fraction}
        currentDate={currentDate}
        speed={speed}
        isExporting={isExporting}
        exportProgress={exportProgress}
        hasWebCodecs={hasWebCodecs}
        onPlayPause={handlePlayPause}
        onReset={handleReset}
        onScrub={handleScrub}
        onScrubKeyDown={handleScrubKeyDown}
        onSpeedChange={handleSpeedChange}
        onExportMp4={handleExportMp4}
        onCancelExport={handleCancelExport}
      />
      {exportError && (
        <ReplayExportError message={exportError} onDismiss={() => setExportError(null)} />
      )}
    </div>
  );
}
