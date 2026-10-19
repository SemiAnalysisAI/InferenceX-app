'use client';

import { useId, useMemo } from 'react';

import { useGlobalFilterSelection } from '@/providers/GlobalFilterContext';

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
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { cn } from '@/lib/shared/utils';

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

export function selectedCostTier(selectedYAxisMetric: string): CostTier | undefined {
  const key = selectedYAxisMetric.replace(/^y_/u, '');
  return isMetricKey(key) ? metricCostTier(key) : undefined;
}

export function CostTierSelector({
  className,
  allowCustom = true,
}: {
  className?: string;
  allowCustom?: boolean;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
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
        triggerAriaLabel={t.costTier}
        value={selectedYAxisMetric}
        onValueChange={handleChange}
        placeholder={t.costTier}
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
