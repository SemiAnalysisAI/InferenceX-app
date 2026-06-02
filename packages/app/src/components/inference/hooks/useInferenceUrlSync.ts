'use client';

import { useMemo } from 'react';

import { useUrlStateSync } from '@/hooks/useChartContext';

/**
 * Serializes inference chart state into URL params and keeps them in sync.
 * Extracted verbatim from InferenceProvider — same `i_active` omit-when-default
 * logic and the same useUrlStateSync key map + dependency array.
 */
export function useInferenceUrlSync(params: {
  activeHwTypes: Set<string>;
  hwTypesWithData: Set<string>;
  selectedYAxisMetric: string;
  selectedXAxisMetric: string | null;
  selectedE2eXAxisMetric: string | null;
  scaleType: 'auto' | 'linear' | 'log';
  selectedGPUs: string[];
  selectedDates: string[];
  selectedDateRange: { startDate: string; endDate: string };
  hideNonOptimal: boolean;
  hidePointLabels: boolean;
  highContrast: boolean;
  logScale: boolean;
  isLegendExpanded: boolean;
  useAdvancedLabels: boolean;
  showGradientLabels: boolean;
  showLineLabels: boolean;
  showSpeedOverlay: boolean;
  showMinecraftOverlay: boolean;
}) {
  const {
    activeHwTypes,
    hwTypesWithData,
    selectedYAxisMetric,
    selectedXAxisMetric,
    selectedE2eXAxisMetric,
    scaleType,
    selectedGPUs,
    selectedDates,
    selectedDateRange,
    hideNonOptimal,
    hidePointLabels,
    highContrast,
    logScale,
    isLegendExpanded,
    useAdvancedLabels,
    showGradientLabels,
    showLineLabels,
    showSpeedOverlay,
    showMinecraftOverlay,
  } = params;

  // Serialize the legend-active set, omitting (empty string → URL default) when
  // it equals the full set of items with data. Keeps share URLs short.
  const iActiveStr = useMemo(() => {
    if (activeHwTypes.size === 0) return '';
    if (activeHwTypes.size === hwTypesWithData.size) {
      let same = true;
      for (const k of activeHwTypes) {
        if (!hwTypesWithData.has(k)) {
          same = false;
          break;
        }
      }
      if (same) return '';
    }
    return [...activeHwTypes].toSorted().join(',');
  }, [activeHwTypes, hwTypesWithData]);

  useUrlStateSync(
    {
      i_metric: selectedYAxisMetric,
      i_gpus: selectedGPUs.join(','),
      i_dates: selectedDates.join(','),
      i_dstart: selectedDateRange.startDate,
      i_dend: selectedDateRange.endDate,
      i_optimal: hideNonOptimal ? '' : '0',
      i_nolabel: hidePointLabels ? '1' : '',
      i_hc: highContrast ? '1' : '',
      i_log: logScale ? '1' : '',
      i_xmetric: selectedXAxisMetric || '',
      i_e2e_xmetric: selectedE2eXAxisMetric || '',
      i_scale: scaleType,
      i_legend: isLegendExpanded ? '' : '0',
      i_advlabel: useAdvancedLabels ? '1' : '',
      i_gradlabel: showGradientLabels ? '1' : '',
      i_linelabel: showLineLabels ? '1' : '',
      i_speed: showSpeedOverlay ? '1' : '',
      i_mc: showMinecraftOverlay ? '1' : '',
      i_active: iActiveStr,
    },
    [
      selectedYAxisMetric,
      selectedXAxisMetric,
      selectedE2eXAxisMetric,
      scaleType,
      selectedGPUs,
      selectedDates,
      selectedDateRange,
      hideNonOptimal,
      hidePointLabels,
      highContrast,
      logScale,
      isLegendExpanded,
      useAdvancedLabels,
      showGradientLabels,
      showLineLabels,
      showSpeedOverlay,
      showMinecraftOverlay,
      iActiveStr,
    ],
  );
}
