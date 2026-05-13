'use client';

import { Pause, Play, RotateCcw, Video } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { sequenceToIslOsl } from '@semianalysisai/inferencex-constants';

import { useInference } from '@/components/inference/InferenceContext';
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
import { useThemeColors } from '@/hooks/useThemeColors';
import { track } from '@/lib/analytics';
import { getHardwareConfig, getModelSortIndex } from '@/lib/constants';
import { cn, getDisplayLabel } from '@/lib/utils';

import { buildReplayTimeline } from './buildReplayTimeline';
import ReplayLegend, { type ReplayLegendItem } from './ReplayLegend';
import { ReplayController, type RooflineDirection } from './ReplayController';

interface ReplayPanelProps {
  parentChartId: string;
  chartDefinition: ChartDefinition;
  yLabel: string;
  xLabel: string;
}

const SPEED_OPTIONS: readonly number[] = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

const REPLAY_HEIGHT = 480;
const REPLAY_MARGIN = { top: 20, right: 20, bottom: 56, left: 64 };

/**
 * Lazy-loaded replay panel. The SVG is fully driven by `ReplayController` —
 * React only manages the controls bar, fetch state, and the small legend.
 * Filter values are read by the controller through ref-based getters every
 * tick so toggles take effect immediately without rebuilding the chart.
 */
export default function ReplayPanel({
  parentChartId,
  chartDefinition,
  yLabel,
  xLabel,
}: ReplayPanelProps) {
  const inference = useInference();
  const {
    selectedModel,
    selectedSequence,
    selectedYAxisMetric,
    selectedXAxisMetric,
    selectedE2eXAxisMetric,
    selectedPrecisions,
    activeHwTypes,
    toggleHwType,
    highContrast,
    logScale,
    hideNonOptimal,
    hidePointLabels,
    useAdvancedLabels,
    showLineLabels,
  } = inference;

  const { isl = 0, osl = 0 } = sequenceToIslOsl(selectedSequence) ?? {};
  const history = useBenchmarkHistory(selectedModel, isl, osl);

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

  const hwKeys = useMemo(
    () => (timeline ? [...new Set(timeline.configs.map((c) => c.hwKey))] : []),
    [timeline],
  );
  const { resolveColor, getCssColor } = useThemeColors({
    highContrast,
    identifiers: hwKeys,
    activeKeys: hwKeys,
  });
  const getColor = useCallback(
    (hwKey: string) => getCssColor(resolveColor(hwKey)),
    [getCssColor, resolveColor],
  );

  // Refs — controller reads these every tick.
  const activeHwTypesRef = useRef(activeHwTypes);
  const hideNonOptimalRef = useRef(hideNonOptimal);
  const logScaleRef = useRef(logScale);
  const selectedPrecisionsRef = useRef(selectedPrecisions);
  const hidePointLabelsRef = useRef(hidePointLabels);
  const useAdvancedLabelsRef = useRef(useAdvancedLabels);
  const showLineLabelsRef = useRef(showLineLabels);
  const getColorRef = useRef(getColor);
  activeHwTypesRef.current = activeHwTypes;
  hideNonOptimalRef.current = hideNonOptimal;
  logScaleRef.current = logScale;
  selectedPrecisionsRef.current = selectedPrecisions;
  hidePointLabelsRef.current = hidePointLabels;
  useAdvancedLabelsRef.current = useAdvancedLabels;
  showLineLabelsRef.current = showLineLabels;
  getColorRef.current = getColor;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const controllerRef = useRef<ReplayController | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const [width, setWidth] = useState(0);

  const [playing, setPlaying] = useState(false);
  const [fraction, setFraction] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [currentDate, setCurrentDate] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<number | null>(null);

  // Callback ref — runs whenever the chart container element mounts/unmounts,
  // including after the panel transitions out of its loading state. A plain
  // useEffect with `[]` deps would have fired before the chart div existed.
  const setContainerEl = useCallback((el: HTMLDivElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    if (!el) {
      setWidth(0);
      return;
    }
    const initial = el.getBoundingClientRect().width;
    if (initial > 0) setWidth(Math.floor(initial));
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = entry.contentRect.width;
      if (w > 0) setWidth(Math.floor(w));
    });
    ro.observe(el);
    observerRef.current = ro;
  }, []);

  useEffect(
    () => () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    },
    [],
  );

  const rooflineDirection =
    (chartDefinition[
      `${selectedYAxisMetric}_roofline` as keyof ChartDefinition
    ] as RooflineDirection) ?? 'upper_left';

  // Reset playhead state when the timeline changes (model/sequence/metric switch).
  useEffect(() => {
    setFraction(0);
    setCurrentDate(timeline?.dates[0] ?? '');
    setPlaying(false);
  }, [timeline]);

  // Build / rebuild the controller when timeline or width changes. Filter
  // values flow through refs so mid-playback toggles never reach this effect.
  useEffect(() => {
    if (!timeline || timeline.configs.length === 0) return;
    if (!svgRef.current || width <= 0) return;

    const controller = new ReplayController({
      svg: svgRef.current,
      width,
      height: REPLAY_HEIGHT,
      margin: REPLAY_MARGIN,
      xLabel,
      yLabel,
      timeline,
      rooflineDirection,
      getColor: (hw) => getColorRef.current(hw),
      isHwActive: (hw) => activeHwTypesRef.current.has(hw),
      isHideNonOptimal: () => hideNonOptimalRef.current,
      isLogScale: () => logScaleRef.current,
      selectedPrecisions: () => selectedPrecisionsRef.current,
      hidePointLabels: () => hidePointLabelsRef.current,
      useAdvancedLabels: () => useAdvancedLabelsRef.current,
      showLineLabels: () => showLineLabelsRef.current,
      chartType: chartDefinition.chartType === 'e2e' ? 'e2e' : 'interactivity',
      onFrame: (date, frac) => {
        setCurrentDate(date);
        setFraction(frac);
      },
      onComplete: () => setPlaying(false),
    });
    controllerRef.current = controller;
    controller.setSpeed(speed);
    controller.renderFrame(fraction);
    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
    // We deliberately exclude `speed`, `fraction`, and `getColor` — speed/fraction
    // live on the controller, getColor is read through a ref each tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeline, width, xLabel, yLabel, rooflineDirection]);

  useEffect(() => {
    controllerRef.current?.setSpeed(speed);
  }, [speed]);

  // Repaint after a filter toggle when paused (controller already picks up
  // refs on the next tick when playing).
  useEffect(() => {
    const c = controllerRef.current;
    if (!c) return;
    if (!c.isPlaying()) c.renderFrame(c.getFraction());
  }, [
    activeHwTypes,
    hideNonOptimal,
    logScale,
    hidePointLabels,
    useAdvancedLabels,
    showLineLabels,
    selectedPrecisions,
  ]);

  const handlePlayPause = useCallback(() => {
    const c = controllerRef.current;
    if (!c) return;
    if (c.isPlaying()) {
      c.pause();
      setPlaying(false);
      track('inference_replay_paused', { fraction: c.getFraction() });
    } else {
      c.play();
      setPlaying(true);
      track('inference_replay_started', { speed });
    }
  }, [speed]);

  const handleScrub = useCallback((value: number) => {
    const c = controllerRef.current;
    if (!c) return;
    c.seekToFraction(value);
    setFraction(value);
    setPlaying(false);
    track('inference_replay_scrubbed', { fraction: value });
  }, []);

  const handleSpeedChange = useCallback((v: number) => {
    setSpeed(v);
    track('inference_replay_speed_changed', { speed: v });
  }, []);

  const handleReset = useCallback(() => {
    const c = controllerRef.current;
    if (!c) return;
    c.seekToFraction(0);
    setFraction(0);
    setPlaying(false);
    setCurrentDate(timeline?.dates[0] ?? '');
  }, [timeline]);

  const handleExportMp4 = useCallback(async () => {
    if (!timeline || !controllerRef.current) return;
    setIsExporting(true);
    setExportProgress(0);
    track('inference_replay_export_started', {
      model: selectedModel,
      chartType: chartDefinition.chartType,
    });
    try {
      const { exportReplayMp4 } = await import('./exportMp4');
      // Output duration tracks the controller's current playback speed: 1× → ~spanMs,
      // 2× → half that, 0.25× → 4×. Capped at 60 s so rare extreme settings don't
      // produce hundred-megabyte files.
      const durationSec = Math.max(2, Math.min(60, controllerRef.current.getDurationMs() / 1000));
      await exportReplayMp4({
        captureRootId: `replay-panel-${parentChartId}`,
        controller: controllerRef.current,
        fileName: `InferenceX_${selectedModel}_${chartDefinition.chartType}_replay`,
        durationSec,
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
        `MP4 export failed: ${message}\n\nIf you're not on Chrome, try Chrome — MP4 export uses WebCodecs, which may be unavailable in other browsers.`,
      );
      track('inference_replay_export_failed', { reason: message });
    } finally {
      setIsExporting(false);
      setExportProgress(null);
      controllerRef.current?.renderFrame(controllerRef.current.getFraction());
    }
  }, [chartDefinition.chartType, parentChartId, selectedModel, timeline]);

  const legendItems = useMemo<ReplayLegendItem[]>(() => {
    if (!timeline) return [];
    const seen = new Set<string>();
    const items: ReplayLegendItem[] = [];
    for (const c of timeline.configs) {
      if (seen.has(c.hwKey)) continue;
      seen.add(c.hwKey);
      const hwConfig = getHardwareConfig(c.hwKey);
      items.push({
        hwKey: c.hwKey,
        label: getDisplayLabel(hwConfig),
        color: getCssColor(resolveColor(c.hwKey)),
        active: activeHwTypes.has(c.hwKey),
      });
    }
    return items.toSorted(
      (a, b) =>
        getModelSortIndex(a.hwKey) - getModelSortIndex(b.hwKey) || a.label.localeCompare(b.label),
    );
  }, [timeline, activeHwTypes, resolveColor, getCssColor]);

  if (history.isLoading || !timeline) {
    return (
      <div
        className="p-4 sm:p-6 flex flex-col"
        data-testid={`replay-panel-${parentChartId}`}
        style={{ minHeight: REPLAY_HEIGHT + 140 }}
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
        style={{ minHeight: REPLAY_HEIGHT + 140 }}
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

      <div className="flex flex-col lg:flex-row gap-4 items-start">
        <div ref={setContainerEl} className="flex-1 min-w-0 self-stretch">
          <svg
            ref={svgRef}
            width={width || '100%'}
            height={REPLAY_HEIGHT}
            style={{ display: 'block' }}
          />
        </div>
        {legendItems.length > 0 && (
          <div className="w-full lg:w-44 lg:shrink-0 max-h-[480px] overflow-y-auto">
            <ReplayLegend items={legendItems} onToggle={(hw) => toggleHwType(hw)} />
          </div>
        )}
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
