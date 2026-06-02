'use client';

import { flushSync } from 'react-dom';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { ChartDefinition } from '@/components/inference/types';
import { track } from '@/lib/analytics';

import type { Mp4ExportError, Mp4ExportStage } from './exportMp4';
import type { ReplayTimeline } from './buildReplayTimeline';
import { spanMs } from './replayFrameData';

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

interface UseReplayExportArgs {
  timeline: ReplayTimeline | null;
  selectedModel: string;
  chartDefinition: ChartDefinition;
  parentChartId: string;
  panelRef: React.RefObject<HTMLDivElement | null>;
  commitFraction: (next: number, opts?: { force?: boolean }) => void;
  setPlaying: (playing: boolean) => void;
}

interface UseReplayExportResult {
  isExporting: boolean;
  exportProgress: number | null;
  exportError: string | null;
  hasWebCodecs: boolean;
  setExportError: (message: string | null) => void;
  handleExportMp4: () => Promise<void>;
  handleCancelExport: () => void;
}

/**
 * Owns the MP4-export lifecycle for the replay panel: WebCodecs availability,
 * progress/error state, abort handling, and the full render → encode → mux
 * pipeline with its telemetry. Extracted verbatim from ReplayPanel so the
 * component body stays focused on playback.
 */
export function useReplayExport({
  timeline,
  selectedModel,
  chartDefinition,
  parentChartId,
  panelRef,
  commitFraction,
  setPlaying,
}: UseReplayExportArgs): UseReplayExportResult {
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Pre-flight feature detection so the Export button is disabled with a clear
  // reason on browsers that lack WebCodecs (Firefox today, older Safari).
  const hasWebCodecs = typeof VideoEncoder !== 'undefined';
  const unavailableReportedRef = useRef(false);
  useEffect(() => {
    if (!hasWebCodecs && !unavailableReportedRef.current) {
      unavailableReportedRef.current = true;
      track('inference_replay_export_unavailable', {
        userAgent: typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent.slice(0, 200),
      });
    }
  }, [hasWebCodecs]);

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

  return {
    isExporting,
    exportProgress,
    exportError,
    hasWebCodecs,
    setExportError,
    handleExportMp4,
    handleCancelExport,
  };
}
