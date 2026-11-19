'use client';

import { useCallback, type MouseEvent, type RefObject } from 'react';

import { useInferenceActions } from '@/components/inference/InferenceContext';
import type { InferenceData } from '@/components/inference/types';
import {
  POWER_TIMELINE_METRIC_KEY,
  requestPowerTraceFocus,
  traceKeyForPoint,
} from '@/components/inference/utils/powerTimeline';
import { track } from '@/lib/analytics/analytics';
import type { D3ChartHandle } from '@/lib/d3-chart/D3Chart/types';

export function usePowerTraceAction(chartRef: RefObject<D3ChartHandle | null>) {
  const { setSelectedYAxisMetric } = useInferenceActions();
  return useCallback(
    (event: MouseEvent<HTMLElement>, d: InferenceData, overlay: boolean) => {
      const traceKey = traceKeyForPoint(d);
      if (!traceKey) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      event.preventDefault();
      requestPowerTraceFocus(traceKey);
      chartRef.current?.dismissTooltip();
      setSelectedYAxisMetric(POWER_TIMELINE_METRIC_KEY);
      track('inference_power_trace_opened', {
        gpu: String(d.hwKey),
        conc: d.conc,
        overlay,
      });
    },
    [chartRef, setSelectedYAxisMetric],
  );
}
