'use client';

import { useId, useMemo } from 'react';

import { useGlobalFilterSelection } from '@/components/GlobalFilterContext';

import {
  useInferenceActions,
  useInferenceDisplay,
  useInferenceFilters,
} from '@/components/inference/InferenceContext';
import {
  METRIC_CONTROL_GROUPS,
  costMetricFamily,
  costTierOptionLabel,
  costTiersForFamily,
  isMetricKey,
  metricCostTier,
  metricForCostTier,
  metricOptionTitle,
  type CostMetricFamilyId,
  type CostTier,
} from '@/components/inference/metric-registry';
import { publishedCostsForTier } from '@/components/inference/published-costs';
import { InfoHelp } from '@/components/ui/option-info';
import { lockedTierLabel, lockedTierValue } from '@/components/ui/locked-rent-tiers';
import { captionControlTriggerClassName } from '@/components/ui/result-context';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  LOCKED_RENT_TIERS,
  LockedTierBadge,
  useLockedTierDialog,
} from '@/components/ui/tco-model-dialog';
import { track } from '@/lib/analytics';
import { useLocale } from '@/lib/use-locale';
import { cn } from '@/lib/utils';

const STRINGS = {
  en: {
    costTier: 'Cost Tier',
    costTierTooltip:
      'The $/chip/hr pricing basis behind cost and tokens-per-dollar metrics. InferenceX publishes Owning at Large Hyperscaler Volume and Rent - 3 Year Commit; the shorter rental terms are priced in the SemiAnalysis AI Cloud TCO Model.',
  },
  zh: {
    costTier: '成本层级',
    costTierTooltip:
      '成本类和每美元 token 数指标所依据的 $/芯片/小时 价格口径。InferenceX 公开自有（超大规模云大批量）与租赁 - 3 年承诺两档；更短租期的价格收录在 SemiAnalysis AI Cloud TCO 模型中。',
  },
} as const;

/**
 * The published tier the selected metric is on, or `undefined` when the
 * metric has no pricing basis. Callers gate the selector on this so the
 * caption only carries a tier line for cost metrics.
 */
export function selectedCostTier(selectedYAxisMetric: string): CostTier | undefined {
  const key = selectedYAxisMetric.replace(/^y_/u, '');
  return isMetricKey(key) ? metricCostTier(key) : undefined;
}

/**
 * Inline Cost Tier selector for the chart caption. It swaps the selected
 * y-axis metric between its pricing bases: the two published tiers, Custom
 * User Values, and the rental terms locked behind the TCO model dialog.
 *
 * It renders where the caption used to print the tier as plain text, so the
 * pricing basis reads as part of the result the chart shows. The trigger is
 * `no-export`; PNG exports keep the plain-text label via the caption's
 * `export-only` twin.
 *
 * `allowCustom={false}` leaves Custom User Values out of the list for charts
 * that price every point from the published tiers and have nowhere to enter
 * a custom $/chip/hr (the /historical trend chart).
 */
export function CostTierSelector({
  className,
  allowCustom = true,
}: {
  className?: string;
  allowCustom?: boolean;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  // One selector per figure on /inference, so the trigger id is per instance.
  const triggerId = useId();
  const { selectedYAxisMetric } = useInferenceDisplay();
  const { selectedModel, selectedSequence, selectedPrecisions, userCosts } = useInferenceFilters();
  const { setSelectedYAxisMetric, setUserCosts } = useInferenceActions();
  const { tcoBasis } = useGlobalFilterSelection();
  const { interceptLocked, dialog } = useLockedTierDialog('yaxis_cost_tier');

  const selectedMetricKey = selectedYAxisMetric.replace(/^y_/u, '');
  const selectedFamily: CostMetricFamilyId | undefined = isMetricKey(selectedMetricKey)
    ? costMetricFamily(selectedMetricKey)
    : undefined;
  const selectedTier = selectedCostTier(selectedYAxisMetric);

  // Published tiers first, in registry order, then Custom User Values, then
  // the shorter rental terms locked behind the TCO model dialog.
  const options = useMemo(() => {
    if (!selectedFamily) return [];
    const published = costTiersForFamily(selectedFamily)
      .filter((tier) => allowCustom || tier !== 'custom')
      .map((tier) => ({
        value: `y_${metricForCostTier(selectedFamily, tier)!}`,
        label: costTierOptionLabel(tier, locale),
        testId: `cost-tier-${tier}`,
      }));
    const rentalMetric = metricForCostTier(selectedFamily, 'rental');
    const locked = rentalMetric
      ? LOCKED_RENT_TIERS.map((tier) => ({
          value: lockedTierValue(tier.id, rentalMetric),
          label: lockedTierLabel(tier, locale),
          badge: <LockedTierBadge className="mt-0.5" />,
          testId: `cost-tier-locked-${tier.id}`,
        }))
      : [];
    return [...published, ...locked];
  }, [selectedFamily, locale, allowCustom]);

  if (!selectedFamily || !selectedTier) return null;

  const handleChange = (value: string) => {
    if (interceptLocked(value)) return;
    const tierKey = value.replace(/^y_/u, '');
    // First visit to Custom User Values: start from the prices the caption
    // was showing, so the reader edits the badges from there. Later visits
    // keep whatever they typed.
    if (
      isMetricKey(tierKey) &&
      metricCostTier(tierKey) === 'custom' &&
      userCosts === null &&
      selectedTier !== 'custom'
    ) {
      setUserCosts(publishedCostsForTier(selectedTier, tcoBasis));
    }
    setSelectedYAxisMetric(value);
    track('inference_cost_tier_selected', {
      metric: value,
      cost_tier: (isMetricKey(tierKey) ? metricCostTier(tierKey) : undefined) ?? 'unknown',
      metric_label: isMetricKey(tierKey) ? metricOptionTitle(tierKey, 'en') : value,
    });
    if (selectedModel && selectedSequence && selectedPrecisions.length > 0) {
      track('inference_filters_changed', {
        model: selectedModel,
        sequence: selectedSequence,
        precision: selectedPrecisions.join(','),
        yAxisMetric: value,
        yAxisMetricLabel: isMetricKey(tierKey) ? metricOptionTitle(tierKey, 'en') : value,
        yAxisMetricGroup:
          METRIC_CONTROL_GROUPS.find((group) =>
            (group.metrics as readonly string[]).includes(value),
          )?.label ?? 'Unknown',
      });
    }
  };

  return (
    <span className={cn('inline-flex items-center gap-0.5', className)}>
      <SearchableSelect
        triggerId={triggerId}
        triggerTestId="cost-tier-selector"
        // The caption's <dt> is not a <label>, so name the combobox directly.
        triggerAriaLabel={t.costTier}
        value={selectedYAxisMetric}
        onValueChange={handleChange}
        placeholder={t.costTier}
        // The tier resolves client-side from the URL, but the caption's
        // server render already knows the default metric's tier, so the
        // trigger can show it before hydration instead of the placeholder.
        // Same copy as the option list, so the label does not change once
        // the select hydrates.
        initialLabel={costTierOptionLabel(selectedTier, locale)}
        searchable={false}
        trackPrefix="cost_tier"
        size="sm"
        className={captionControlTriggerClassName}
        contentClassName="w-80"
        groups={[{ label: '', options }]}
      />
      <InfoHelp
        label={t.costTier}
        value="cost-tier-select"
        analyticsEvent="selector_help_opened"
        align="start"
      >
        {t.costTierTooltip}
      </InfoHelp>
      {dialog}
    </span>
  );
}
