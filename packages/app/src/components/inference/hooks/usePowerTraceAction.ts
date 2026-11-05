'use client';

import { useCallback, type RefObject } from 'react';

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
    (tooltipEl: HTMLElement, d: InferenceData, overlay: boolean) => {
      const action = tooltipEl.querySelector('[data-action="view-power-trace"]');
      const traceKey = traceKeyForPoint(d);
      if (!action || !traceKey) return;
      action.addEventListener('click', (actionEvent) => {
        actionEvent.stopPropagation();
        const mouse = actionEvent as MouseEvent;
        if (
          mouse.button !== 0 ||
          mouse.metaKey ||
          mouse.ctrlKey ||
          mouse.shiftKey ||
          mouse.altKey
        ) {
          return;
        }
        actionEvent.preventDefault();
        requestPowerTraceFocus(traceKey);
        chartRef.current?.dismissTooltip();
        setSelectedYAxisMetric(POWER_TIMELINE_METRIC_KEY);
        track('inference_power_trace_opened', {
          gpu: String(d.hwKey),
          conc: d.conc,
          overlay,
        });
      });
    },
    [chartRef, setSelectedYAxisMetric],
  );
}
