'use client';

import {
  useInferenceActions,
  useInferenceAnalyticsContext,
  useInferenceData,
  useInferenceDisplay,
  useInferenceFilters,
} from '@/components/inference/InferenceContext';
import {
  METRIC_CONTROL_GROUPS,
  isMetricKey,
  metricOptionTitle,
} from '@/components/inference/metric-registry';
import { ScenarioSelector } from '@/components/ui/chart-selectors';
import { track } from '@/lib/analytics/analytics';

export function InferenceScenarioSelector({
  variant = 'field',
  id = 'scenario-select',
}: {
  variant?: 'field' | 'caption';
  id?: string;
}) {
  const { selectedSequence, selectedModel, selectedPrecisions } = useInferenceFilters();
  const { availableSequences } = useInferenceData();
  const { selectedYAxisMetric } = useInferenceDisplay();
  const { setSelectedSequence } = useInferenceActions();
  const analyticsContext = useInferenceAnalyticsContext();
  const metricKey = selectedYAxisMetric.replace(/^y_/u, '');

  return (
    <ScenarioSelector
      id={id}
      variant={variant}
      value={selectedSequence}
      availableSequences={availableSequences}
      model={selectedModel}
      data-testid="scenario-selector"
      onChange={(sequence) => {
        setSelectedSequence(sequence);
        track('inference_sequence_selected', { ...analyticsContext, sequence });
        if (selectedModel && selectedPrecisions.length > 0 && selectedYAxisMetric) {
          track('inference_filters_changed', {
            model: selectedModel,
            sequence,
            precision: selectedPrecisions.join(','),
            metric: selectedYAxisMetric,
            metric_label: isMetricKey(metricKey)
              ? metricOptionTitle(metricKey, 'en')
              : selectedYAxisMetric,
            metric_group:
              METRIC_CONTROL_GROUPS.find((group) =>
                (group.metrics as readonly string[]).includes(selectedYAxisMetric),
              )?.label ?? 'Unknown',
          });
        }
      }}
    />
  );
}
