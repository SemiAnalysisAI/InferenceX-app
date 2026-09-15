'use client';

import { useId } from 'react';
import {
  useInferenceActions,
  useInferenceData,
  useInferenceDisplay,
  useInferenceFilters,
} from '@/components/inference/InferenceContext';
import { METRIC_CONTROL_GROUPS, isMetricKey, metricOptionTitle } from '../metric-registry';
import { ScenarioSelector } from '@/components/ui/chart-selectors';
import { TooltipProvider } from '@/components/ui/tooltip';
import { track } from '@/lib/analytics';
import { getSequenceLabel, type Sequence } from '@/lib/data-mappings';
import { useLocale } from '@/lib/use-locale';

/** The live heading edits the scenario; image exports retain its plain-text name. */
export function TitleScenarioSelector() {
  const id = useId();
  const locale = useLocale();
  const { availableSequences } = useInferenceData();
  const { selectedModel, selectedSequence, selectedPrecisions } = useInferenceFilters();
  const { selectedYAxisMetric } = useInferenceDisplay();
  const { setSelectedSequence } = useInferenceActions();

  const handleChange = (sequence: Sequence) => {
    setSelectedSequence(sequence);
    track('inference_sequence_selected', { sequence });
    const key = selectedYAxisMetric.replace(/^y_/u, '');
    track('inference_filters_changed', {
      model: selectedModel,
      sequence,
      precision: selectedPrecisions.join(','),
      yAxisMetric: selectedYAxisMetric,
      yAxisMetricLabel: isMetricKey(key) ? metricOptionTitle(key, 'en') : selectedYAxisMetric,
      yAxisMetricGroup:
        METRIC_CONTROL_GROUPS.find((group) =>
          (group.metrics as readonly string[]).includes(selectedYAxisMetric),
        )?.label ?? 'Unknown',
    });
  };

  return (
    <>
      <span className="no-export">
        <TooltipProvider delayDuration={0}>
          <ScenarioSelector
            id={id}
            variant="title"
            value={selectedSequence}
            onChange={handleChange}
            availableSequences={availableSequences}
            model={selectedModel}
            data-testid="scenario-selector"
          />
        </TooltipProvider>
      </span>
      <span className="export-only hidden">
        {getSequenceLabel(selectedSequence as Sequence, locale)}
      </span>
    </>
  );
}
