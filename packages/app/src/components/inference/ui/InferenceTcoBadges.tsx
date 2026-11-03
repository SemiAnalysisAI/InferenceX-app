'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import { useGlobalFilterSelection } from '@/providers/GlobalFilterContext';

import {
  useInferenceActions,
  useInferenceAnalyticsContext,
  useInferenceDisplay,
  useInferenceFilters,
} from '@/components/inference/InferenceContext';
import {
  costMetricFamily,
  costTiersForFamily,
  isMetricKey,
  metricCostTier,
  metricForCostTier,
  type CostTier,
} from '@/components/inference/metric-registry';
import { publishedCostsForTier } from '@/components/inference/published-costs';
import { TcoPriceTable } from '@/components/ui/editable-tco-badges';
import { track } from '@/lib/analytics/analytics';

function metricKeyOf(selectedYAxisMetric: string) {
  const key = selectedYAxisMetric.replace(/^y_/u, '');
  return isMetricKey(key) ? key : undefined;
}

export function parseInferenceCustomCost(raw: string): number | undefined {
  if (raw.trim() === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function InferenceTcoBadges({
  bases,
  values,
  editable = true,
  className,
}: {
  bases: readonly string[];
  values: Record<string, number>;
  editable?: boolean;
  className?: string;
}) {
  const inputIdPrefix = useId();
  const { selectedYAxisMetric } = useInferenceDisplay();
  const { userCosts } = useInferenceFilters();
  const { setUserCosts, setSelectedYAxisMetric } = useInferenceActions();
  const analyticsContext = useInferenceAnalyticsContext();
  const { tcoBasis } = useGlobalFilterSelection();

  const metricKey = metricKeyOf(selectedYAxisMetric);
  const family = metricKey ? costMetricFamily(metricKey) : undefined;
  const customMetric = family ? metricForCostTier(family, 'custom') : undefined;
  const isCustom = metricKey !== undefined && metricKey === customMetric;
  const publishedTier = metricKey ? metricCostTier(metricKey) : undefined;
  const baselineTier = useMemo(() => {
    if (!isCustom || !family || !userCosts) return undefined;
    let best: CostTier | undefined;
    let bestMatches = -1;
    for (const tier of costTiersForFamily(family)) {
      if (tier === 'custom') continue;
      const published = publishedCostsForTier(tier, tcoBasis);
      const matches = Object.entries(userCosts).filter(
        ([base, value]) => value === published[base],
      ).length;
      if (matches > bestMatches) {
        best = tier;
        bestMatches = matches;
      }
    }
    return best;
  }, [isCustom, family, userCosts, tcoBasis]);
  const baseline = baselineTier ? publishedCostsForTier(baselineTier, tcoBasis) : undefined;
  const overriddenBases = new Set(
    baseline
      ? Object.keys(userCosts ?? {}).filter((base) => userCosts?.[base] !== baseline[base])
      : [],
  );

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const ownedCostsRef = useRef<typeof userCosts>(null);
  const [seenCosts, setSeenCosts] = useState(userCosts);
  if (userCosts !== seenCosts) {
    setSeenCosts(userCosts);
    if (userCosts !== ownedCostsRef.current) setDrafts({});
  }

  useEffect(() => {
    if (isCustom && userCosts === null) setUserCosts(publishedCostsForTier('custom', tcoBasis));
  }, [isCustom, userCosts, tcoBasis, setUserCosts]);

  const handleChange = useCallback(
    (base: string, raw: string) => {
      const parsed = parseInferenceCustomCost(raw);
      if (isCustom) {
        const next = { ...(userCosts ?? values), [base]: parsed };
        ownedCostsRef.current = next;
        setDrafts((prev) => ({ ...prev, [base]: raw }));
        setUserCosts(next);
        return;
      }
      if (!customMetric || !publishedTier) return;
      const seeded = Object.fromEntries(
        Object.entries(values).map(([key, value]) => [key, String(value)]),
      );
      const next = { ...publishedCostsForTier(publishedTier, tcoBasis), [base]: parsed };
      ownedCostsRef.current = next;
      setDrafts({ ...seeded, [base]: raw });
      setUserCosts(next);
      setSelectedYAxisMetric(`y_${customMetric}`);
      track('inference_cost_tier_selected', {
        ...analyticsContext,
        metric: `y_${customMetric}`,
        cost_tier: 'custom',
        via: 'tco_badge',
      });
    },
    [
      isCustom,
      customMetric,
      publishedTier,
      tcoBasis,
      values,
      userCosts,
      setUserCosts,
      setSelectedYAxisMetric,
    ],
  );
  const handleCommit = useCallback((base: string, raw: string) => {
    track('inference_custom_cost_set', { gpu: base, value: raw });
  }, []);

  const handleReset = () => {
    if (!family || !baselineTier) return;
    const metric = `y_${metricForCostTier(family, baselineTier)}`;
    setUserCosts(null);
    setSelectedYAxisMetric(metric);
    track('inference_custom_cost_reset', { ...analyticsContext, metric, cost_tier: baselineTier });
  };

  const items = bases.map((base) => {
    const chipLabel = HW_REGISTRY[base]?.badgeLabel ?? base.toUpperCase();
    let value: string;
    if (isCustom) {
      const applied = userCosts?.[base];
      value = drafts[base] ?? (applied === undefined ? '' : String(applied));
    } else {
      value = String(values[base]);
    }
    return { base, label: chipLabel, value, overridden: overriddenBases.has(base) };
  });

  return (
    <TcoPriceTable
      items={items}
      editable={editable}
      onChange={handleChange}
      onCommit={handleCommit}
      onReset={overriddenBases.size > 0 ? handleReset : undefined}
      resetTestId="inference-tco-reset"
      testId="inference-tco-badges"
      cellTestId="inference-tco-badge"
      inputIdPrefix={`cost-input-${inputIdPrefix}`}
      inputTestIdPrefix="cost-input"
      className={className}
    />
  );
}
