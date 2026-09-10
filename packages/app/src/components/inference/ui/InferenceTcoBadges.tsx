'use client';

import { useCallback, useEffect, useState } from 'react';

import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import { useGlobalFilterSelection } from '@/components/GlobalFilterContext';

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
import { track } from '@/lib/analytics';
import { useLocale } from '@/lib/use-locale';

/** `y_costUser` → `costUser`, `y_costh` → `costh`; `undefined` off the registry. */
function metricKeyOf(selectedYAxisMetric: string) {
  const key = selectedYAxisMetric.replace(/^y_/u, '');
  return isMetricKey(key) ? key : undefined;
}

/**
 * A typed $/chip/hr. Empty or non-numeric → undefined, so the chip drops
 * off the plot instead of being priced at zero.
 */
export function parseInferenceCustomCost(raw: string): number | undefined {
  if (raw.trim() === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

/**
 * The /inference caption's "TCO $/chip/hr" badges with the price in each
 * badge editable. On a published tier the badges quote the TCO model; the
 * first keystroke copies those prices into the reader's custom costs and
 * moves the y-axis onto the metric's Custom User Values member, so the
 * badges are the only place custom $/chip/hr are entered.
 *
 * `values` are the $/chip/hr for the bases the caption should show, already
 * narrowed to the active selection: the published price on a published tier,
 * the reader's own price on Custom User Values.
 */
export function InferenceTcoBadges({
  label,
  values,
}: {
  label: string;
  values: Record<string, number>;
}) {
  const locale = useLocale();
  const { selectedYAxisMetric } = useInferenceDisplay();
  const { userCosts } = useInferenceFilters();
  const { setUserCosts, setSelectedYAxisMetric } = useInferenceActions();
  const { tcoBasis } = useGlobalFilterSelection();

  const metricKey = metricKeyOf(selectedYAxisMetric);
  const family = metricKey ? costMetricFamily(metricKey) : undefined;
  const customMetric = family ? metricForCostTier(family, 'custom') : undefined;
  const isCustom = metricKey !== undefined && metricKey === customMetric;
  const publishedTier = metricKey ? metricCostTier(metricKey) : undefined;

  // Text as typed, so a half-entered "2." or an emptied field survives the
  // re-render; the parsed number lives in `userCosts`.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  // A deep link onto the custom metric arrives with no custom costs yet;
  // seed every registry chip from the published prices so the chart is not
  // blank and chips outside the current selection are priced too.
  useEffect(() => {
    if (isCustom && userCosts === null) setUserCosts(publishedCostsForTier('custom', tcoBasis));
  }, [isCustom, userCosts, tcoBasis, setUserCosts]);

  const handleChange = useCallback(
    (base: string, raw: string) => {
      const parsed = parseInferenceCustomCost(raw);
      if (isCustom) {
        setDrafts((prev) => ({ ...prev, [base]: raw }));
        setUserCosts({ ...(userCosts ?? values), [base]: parsed });
        return;
      }
      if (!customMetric || !publishedTier) return;
      // Leaving a published tier: every registry chip keeps that tier's
      // price (not only the chips the caption shows, so a chip that joins
      // the selection later is priced too) and only the edited one changes.
      const seeded = Object.fromEntries(
        Object.entries(values).map(([key, value]) => [key, String(value)]),
      );
      setDrafts({ ...seeded, [base]: raw });
      setUserCosts({ ...publishedCostsForTier(publishedTier, tcoBasis), [base]: parsed });
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

  // A chip whose price was blanked has no point on the plot, so it leaves
  // the active selection `values` is narrowed to; keep its badge so the
  // reader can type the price back in.
  const bases = Object.keys(values);
  if (isCustom) {
    for (const [base, raw] of Object.entries(drafts)) {
      if (!bases.includes(base) && parseInferenceCustomCost(raw) === undefined) bases.push(base);
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
      inputIdPrefix="cost-input"
    />
  );
}
