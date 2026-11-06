'use client';

import { TCO_SOURCE_TITLE, TCO_SOURCE_URL } from '@semianalysisai/inferencex-constants';
import { MetricBadges, SourceLink } from '@/components/ui/chart-display-helpers';
import { InfoHelp } from '@/components/ui/option-info';
import {
  CaptionField,
  ResultContext,
  captionControlTriggerClassName,
} from '@/components/ui/result-context';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useLocale } from '@/lib/i18n/use-locale';
import { costPerGpuHour } from './hardware';
import { COST_TIERS, TIER_LABELS } from './metrics';
import type { ResultsState } from './results';
import { COST_BASES } from './results-chart';

const STRINGS = {
  en: {
    tier: 'Cost Tier',
    tierHelp:
      'The $/GPU/hr pricing basis behind every cost and per-dollar value on this page, from the SemiAnalysis AI Cloud TCO Model.',
    basis: 'GPU basis',
    basisHelp:
      'Participating counts the GPUs that generated the clips. Allocated counts every GPU the job reserved, idle ones included.',
    participating: 'Participating GPUs',
    allocated: 'Allocated GPUs',
    tco: 'TCO $/chip/hr:',
    source: 'Source:',
    official: 'SemiAnalysis InferenceX™',
    overlay: 'SemiAnalysis InferenceX™ + UNOFFICIAL overlays',
  },
  zh: {
    tier: '成本层级',
    tierHelp:
      '本页所有成本和每美元指标所依据的 $/GPU/小时价格口径，数据来自 SemiAnalysis AI Cloud TCO 模型。',
    basis: 'GPU 口径',
    basisHelp: '“参与计算”只计入生成视频的 GPU；“分配”计入作业预留的全部 GPU，包括闲置的 GPU。',
    participating: '参与计算的 GPU',
    allocated: '分配的 GPU',
    tco: 'TCO $/chip/hr：',
    source: '来源：',
    official: 'SemiAnalysis InferenceX™',
    overlay: 'SemiAnalysis InferenceX™ + 非官方 overlays',
  },
} as const;

/** The cost tier, GPU basis and $/GPU/hr rates behind the chart, laid out like the inference caption. */
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
  const rates = Object.fromEntries(
    hardwareKeys.flatMap((key) => {
      const rate = costPerGpuHour(key, state.costTier);
      return rate === null ? [] : [[key, rate]];
    }),
  );
  return (
    <div data-testid="results-cost-context">
      <ResultContext
        locale={locale}
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
              className={captionControlTriggerClassName}
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
            value={s[state.costBasis]}
            testId="results-cost-basis-caption"
            control={
              <span className="inline-flex items-center gap-0.5">
                <SearchableSelect
                  triggerId="results-cost-basis"
                  triggerTestId="results-cost-basis"
                  triggerAriaLabel={s.basis}
                  value={state.costBasis}
                  onValueChange={(value) =>
                    onUpdate({ costBasis: value as ResultsState['costBasis'] })
                  }
                  initialLabel={s[state.costBasis]}
                  placeholder={s.basis}
                  searchable={false}
                  size="sm"
                  className={captionControlTriggerClassName}
                  groups={[
                    {
                      label: '',
                      options: COST_BASES.map((basis) => ({ value: basis, label: s[basis] })),
                    },
                  ]}
                />
                <InfoHelp label={s.basis} value="video-gpu-basis" align="start">
                  {s.basisHelp}
                </InfoHelp>
              </span>
            }
          />
        }
        date={date ?? undefined}
        source={state.unofficialRun ? s.overlay : s.official}
      />
      {Object.keys(rates).length > 0 && <MetricBadges label={s.tco} values={rates} />}
      <SourceLink href={TCO_SOURCE_URL} sourceLabel={s.source}>
        {TCO_SOURCE_TITLE}
      </SourceLink>
    </div>
  );
}
