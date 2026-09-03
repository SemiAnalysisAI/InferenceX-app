'use client';

import type { InferenceData } from '@/components/inference/types';
import { useLocale } from '@/lib/use-locale';

export interface PowerTierCounts {
  certified: number;
  legacy: number;
}

export function countPowerTiers(points: readonly InferenceData[]): PowerTierCounts {
  const counts: PowerTierCounts = { certified: 0, legacy: 0 };
  for (const point of points) {
    if (point.power_tier === 'certified') counts.certified += 1;
    else if (point.power_tier === 'legacy') counts.legacy += 1;
  }
  return counts;
}

const STRINGS = {
  en: {
    validated: 'validated',
    historical: 'historical',
    single: (shown: number, total: number, tier: string) =>
      `Showing ${shown} of ${total} ${tier} measurements.`,
    combined: (
      shown: number,
      total: number,
      validatedShown: number,
      validatedTotal: number,
      historicalShown: number,
      historicalTotal: number,
    ) =>
      `Showing ${shown} of ${total} measured points: ${validatedShown}/${validatedTotal} validated · ${historicalShown}/${historicalTotal} historical.`,
    bestPerSku: 'Best per SKU',
    optimalOnly: 'Optimal Only',
    controlsEnabled: (controls: string) =>
      `${controls} ${controls.includes(' and ') ? 'are' : 'is'} enabled.`,
    reducedBySelections: 'Chart selections are hiding some points.',
  },
  zh: {
    validated: '已验证',
    historical: '历史',
    single: (shown: number, total: number, tier: string) =>
      `当前显示 ${shown}/${total} 个${tier}测量数据点。`,
    combined: (
      shown: number,
      total: number,
      validatedShown: number,
      validatedTotal: number,
      historicalShown: number,
      historicalTotal: number,
    ) =>
      `当前显示 ${shown}/${total} 个实测数据点：已验证 ${validatedShown}/${validatedTotal} · 历史 ${historicalShown}/${historicalTotal}。`,
    bestPerSku: '每个 SKU 仅显示最佳配置',
    optimalOnly: '仅最优',
    controlsEnabled: (controls: string) => `已启用：${controls}。`,
    reducedBySelections: '当前图表选项隐藏了部分数据点。',
  },
} as const;

function joinControls(controls: string[], locale: 'en' | 'zh'): string {
  if (controls.length < 2) return controls[0] ?? '';
  return locale === 'zh' ? controls.join('、') : controls.join(' and ');
}

export function MeasuredPowerSummary({
  total,
  visible,
  bestPerSku,
  optimalOnly,
}: {
  total: PowerTierCounts;
  visible: PowerTierCounts;
  bestPerSku: boolean;
  optimalOnly: boolean;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const totalCount = total.certified + total.legacy;
  const visibleCount = visible.certified + visible.legacy;
  if (totalCount === 0) return null;

  const summary =
    total.certified > 0 && total.legacy > 0
      ? t.combined(
          visibleCount,
          totalCount,
          visible.certified,
          total.certified,
          visible.legacy,
          total.legacy,
        )
      : total.certified > 0
        ? t.single(visible.certified, total.certified, t.validated)
        : t.single(visible.legacy, total.legacy, t.historical);

  const controls: string[] = [];
  if (bestPerSku) controls.push(t.bestPerSku);
  if (optimalOnly) controls.push(t.optimalOnly);
  const reduction =
    visibleCount >= totalCount
      ? null
      : controls.length > 0
        ? t.controlsEnabled(joinControls(controls, locale))
        : t.reducedBySelections;

  return (
    <div
      data-testid="measured-power-summary"
      className="no-export mt-2 flex flex-wrap gap-x-1 px-1 text-2xs leading-relaxed text-muted-foreground"
    >
      <span>{summary}</span>
      {reduction && <span>{reduction}</span>}
    </div>
  );
}
