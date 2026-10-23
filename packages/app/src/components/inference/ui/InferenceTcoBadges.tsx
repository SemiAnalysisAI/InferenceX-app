'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import { useGlobalFilterSelection } from '@/providers/GlobalFilterContext';

import {
  useInferenceActions,
  useInferenceDisplay,
  useInferenceFilters,
} from '@/components/inference/InferenceContext';
import {
  costMetricFamily,
  isMetricKey,
  metricCostTier,
  metricForCostTier,
} from '@/components/inference/metric-registry';
import { publishedCostsForTier } from '@/components/inference/published-costs';
import { EditableTcoBadges } from '@/components/ui/editable-tco-badges';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';

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
  label,
  values,
  blankedBases,
}: {
  label: string;
  values: Record<string, number>;
  blankedBases?: string[];
}) {
  const locale = useLocale();
  const inputIdPrefix = useId();
  const { selectedYAxisMetric } = useInferenceDisplay();
  const { userCosts } = useInferenceFilters();
  const { setUserCosts, setSelectedYAxisMetric } = useInferenceActions();
  const { tcoBasis } = useGlobalFilterSelection();

  const metricKey = metricKeyOf(selectedYAxisMetric);
  const family = metricKey ? costMetricFamily(metricKey) : undefined;
  const customMetric = family ? metricForCostTier(family, 'custom') : undefined;
  const isCustom = metricKey !== undefined && metricKey === customMetric;
  const publishedTier = metricKey ? metricCostTier(metricKey) : undefined;

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

  const bases = Object.keys(values);
  if (isCustom) {
    for (const base of blankedBases ?? []) {
      if (!bases.includes(base)) bases.push(base);
    }
  }
  const items = bases.map((base) => {
    const chipLabel = HW_REGISTRY[base]?.badgeLabel ?? base.toUpperCase();
    let value: string;
    if (isCustom) {
      const applied = userCosts?.[base];
      value = drafts[base] ?? (applied === undefined ? '' : String(applied));
    } else {
      value = String(values[base]);
    }
    return { base, label: chipLabel, value };
  });

  return (
    <EditableTcoBadges
      label={label}
      items={items}
      onChange={handleChange}
      onCommit={handleCommit}
      inputLabel={(name) => (locale === 'zh' ? `${name} $/芯片/小时` : `${name} $/chip/hr`)}
      testId="inference-tco-badges"
      badgeTestId="inference-tco-badge"
      inputIdPrefix={`cost-input-${inputIdPrefix}`}
      inputTestIdPrefix="cost-input"
    />
  );
}
