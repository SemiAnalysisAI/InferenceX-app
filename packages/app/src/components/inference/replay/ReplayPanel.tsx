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
import { buildFrameData, dateAtFraction, spanMs } from './replayFrameData';

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
      setSvgOffset((prev) => {
        const next = {
          right: Math.max(0, wRect.right - sRect.right + 10),
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

  const [fraction, setFraction] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<number | null>(null);

  // rAF loop — keeps a ref to the current speed so changing speed doesn't
  // restart the loop.
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const playingRef = useRef(playing);
  playingRef.current = playing;

  useEffect(() => {
    if (!playing || !timeline) return;
    let rafId: number;
    let last = performance.now();
    const totalMs = spanMs(timeline.dates.length);
    const step = (now: number) => {
      if (!playingRef.current) return;
      const dt = now - last;
      last = now;
      setFraction((prev) => {
        const next = Math.min(1, prev + (dt / totalMs) * speedRef.current);
        if (next >= 1) {
          setPlaying(false);
        }
        return next;
      });
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [playing, timeline]);

  // Reset fraction when timeline rebuilds (model/sequence/metric switch).
  useEffect(() => {
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
      setFraction((f) => (f >= 1 ? 0 : f));
      setPlaying(true);
      track('inference_replay_started', { speed });
    }
  }, [playing, fraction, speed]);

  const handleScrub = useCallback((value: number) => {
    setFraction(value);
    setPlaying(false);
    track('inference_replay_scrubbed', { fraction: value });
  }, []);

  const handleSpeedChange = useCallback((v: number) => {
    setSpeed(v);
    track('inference_replay_speed_changed', { speed: v });
  }, []);

  const handleReset = useCallback(() => {
    setFraction(0);
    setPlaying(false);
  }, []);

  const handleExportMp4 = useCallback(async () => {
    if (!timeline) return;
    setPlaying(false);
    setIsExporting(true);
    setExportProgress(0);
    track('inference_replay_export_started', {
      model: selectedModel,
      chartType: chartDefinition.chartType,
    });
    try {
      const { exportReplayMp4 } = await import('./exportMp4');
      // Output duration tracks current playback speed: 1× → ~spanMs, 2× → half,
      // 0.25× → 4×. Capped at 60 s so extreme settings don't produce 100+ MB
      // files.
      const durationSec = Math.max(2, Math.min(60, spanMs(timeline.dates.length) / speed / 1000));
      await exportReplayMp4({
        captureRootId: `replay-panel-${parentChartId}`,
        fileName: `InferenceX_${selectedModel}_${chartDefinition.chartType}_replay`,
        durationSec,
        renderFrame: async (t) => {
          // flushSync forces React to commit synchronously; two RAFs let the
          // browser paint before the capture step reads back the DOM.
          flushSync(() => setFraction(t));
          await new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          });
        },
        onProgress: (p) => setExportProgress(p),
      });
      track('inference_replay_export_completed', {
        model: selectedModel,
        chartType: chartDefinition.chartType,
      });
    } catch (error) {
      console.error('MP4 export failed', error);
      const message = error instanceof Error ? error.message : 'Export failed.';
      alert(
        `MP4 export failed: ${message}\n\nIf you're not on Chrome, try Chrome. MP4 export uses WebCodecs, which may be unavailable in other browsers.`,
      );
      track('inference_replay_export_failed', { reason: message });
    } finally {
      setIsExporting(false);
      setExportProgress(null);
    }
  }, [chartDefinition.chartType, parentChartId, selectedModel, speed, timeline]);

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
    <div
      id={`replay-panel-${parentChartId}`}
      className="p-4 sm:p-6"
      data-testid={`replay-panel-${parentChartId}`}
    >
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
          className="flex-1 min-w-[120px] h-2 cursor-pointer accent-foreground"
          aria-label="Replay timeline"
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
          disabled={isExporting}
          data-testid="replay-export-mp4"
          className="gap-1"
        >
          <Video className="size-4" />
          {isExporting
            ? exportProgress === null
              ? 'Exporting…'
              : `Exporting ${Math.round(exportProgress * 100)}%`
            : 'Export MP4'}
        </Button>
      </div>
    </div>
  );
}
