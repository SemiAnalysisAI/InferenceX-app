'use client';

import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';
import { PricesSourceLink } from '@/components/ui/chart-display-helpers';
import { TcoPriceTable } from '@/components/ui/editable-tco-badges';
import { InfoHelp } from '@/components/ui/option-info';
import { CaptionField, ResultContext } from '@/components/ui/result-context';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useLocale } from '@/lib/i18n/use-locale';
import { costPerGpuHour, hardwareLabel } from './hardware';
import { COST_TIERS, TIER_LABELS } from './metrics';
import type { ResultsState } from './results';

const STRINGS = {
  en: {
    tier: 'Cost tier',
    tierHelp:
      'The $/GPU/hr pricing basis behind every cost and per-dollar value on this page, from the SemiAnalysis AI Cloud TCO Model.',
    basis: 'GPU basis',
    basisHelp:
      'Participating counts the GPUs that generated the clips. Allocated counts every GPU the job reserved, idle ones included.',
    participating: 'Participating GPUs',
    official: 'SemiAnalysis InferenceX™',
    overlay: 'SemiAnalysis InferenceX™ + unofficial overlays',
  },
  zh: {
    tier: '成本层级',
    tierHelp:
      '本页所有成本和每美元指标所依据的 $/GPU/小时价格口径，数据来自 SemiAnalysis AI Cloud TCO 模型。',
    basis: 'GPU 口径',
    basisHelp: '“参与计算”只计入生成视频的 GPU；“分配”计入作业预留的全部 GPU，包括闲置的 GPU。',
    participating: '参与计算的 GPU',
    official: 'SemiAnalysis InferenceX™',
    overlay: 'SemiAnalysis InferenceX™ + 非官方 overlays',
  },
} as const;

/** The chart footer: cost tier, GPU basis and the $/GPU/hr rates behind the chart, as on /infx/inference. */
export default function VideoCostContext({
  state,
  onUpdate,
  hardwareKeys,
  date,
}: {
  state: ResultsState;
  onUpdate: (patch: Partial<ResultsState>) => void;
  /** Hardware plotted on the chart; only their rates are listed. */
  hardwareKeys: readonly string[];
  date: string | null;
}) {
  const locale = useLocale();
  const s = STRINGS[locale];
  const tierLabel = TIER_LABELS[state.costTier][locale];
  const rates = hardwareKeys.flatMap((key) => {
    const rate = costPerGpuHour(key, state.costTier);
    return rate === null
      ? []
      : [
          {
            base: key,
            label: HW_REGISTRY[key]?.badgeLabel ?? hardwareLabel(key),
            value: rate.toFixed(2),
          },
        ];
  });
  return (
    <div data-testid="results-cost-context">
      <ResultContext
        locale={locale}
        layout="footer"
        costTier={tierLabel}
        costTierControl={
          <span className="inline-flex items-center gap-0.5">
            <SearchableSelect
              triggerId="results-cost-tier"
              triggerTestId="results-cost-tier"
              triggerAriaLabel={s.tier}
              value={state.costTier}
              onValueChange={(value) => onUpdate({ costTier: value as ResultsState['costTier'] })}
              initialLabel={tierLabel}
              placeholder={s.tier}
              searchable={false}
              size="sm"
              className="w-auto max-w-full text-xs"
              contentClassName="w-80"
              groups={[
                {
                  label: '',
                  options: COST_TIERS.map((tier) => ({
                    value: tier,
                    label: TIER_LABELS[tier][locale],
                  })),
                },
              ]}
            />
            <InfoHelp label={s.tier} value="video-cost-tier" align="start">
              {s.tierHelp}
            </InfoHelp>
          </span>
        }
        tcoBasis={
          <CaptionField
            label={s.basis}
            value={s.participating}
            testId="results-cost-basis-caption"
            hideLabel
            control={
              <span className="inline-flex items-center gap-0.5">
                <span>{s.participating}</span>
                <InfoHelp label={s.basis} value="video-gpu-basis" align="start">
                  {s.basisHelp}
                </InfoHelp>
              </span>
            }
          />
        }
        priceTable={
          rates.length > 0 ? (
            <TcoPriceTable
              items={rates}
              testId="results-tco-table"
              cellTestId="results-tco-rate"
              inputIdPrefix="results-tco"
            />
          ) : undefined
        }
        date={date ?? undefined}
        source={state.unofficialRun ? s.overlay : s.official}
        metaEnd={<PricesSourceLink />}
      />
    </div>
  );
}
