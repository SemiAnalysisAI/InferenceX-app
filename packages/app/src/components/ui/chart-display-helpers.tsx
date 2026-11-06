'use client';

import Link from 'next/link';
import { useMemo, type ReactNode } from 'react';

import {
  HW_REGISTRY,
  TCO_SOURCE_TITLE,
  TCO_SOURCE_URL,
} from '@semianalysisai/inferencex-constants';

import { isMetricKey, metricCostTier } from '@/components/inference/metric-registry';
import { publishedCostsForTier } from '@/components/inference/published-costs';
import { ExternalLinkIcon } from '@/components/ui/external-link-icon';
import { sourceLinkClassName } from '@/components/ui/result-context';
import { ShareButton } from '@/components/ui/share-button';
import { useLocale } from '@/lib/i18n/use-locale';
import type { Locale } from '@/lib/i18n/i18n';
import { DEFAULT_TCO_BASIS, type TcoBasis } from '@/lib/catalog/constants';
import type { ChipBasisControl } from '@/components/ui/chip-basis-note';
import { ChipBasisToggle } from '@/components/ui/chip-basis-toggle';
import { CHIP_BASIS_METRICS } from '@/lib/benchmarks/chip-basis';

const POWER_SOURCE_METRICS = new Set(['y_tpPerMw', 'y_inputTputPerMw', 'y_outputTputPerMw']);
const PER_TOKEN_TYPE_POWER_METRICS = new Set(['y_inputTputPerMw', 'y_outputTputPerMw']);
const PER_TOKEN_TYPE_JOULE_METRICS = new Set(['y_jInput', 'y_jOutput']);
const TOTAL_COST_METRICS = new Set([
  'y_costh',
  'y_costr',
  'y_tokensPerDollarH',
  'y_tokensPerDollarR',
]);
const CUSTOM_COST_METRICS = new Set(['y_costUser', 'y_tokensPerDollarUser']);
const OUTPUT_COST_METRICS = new Set([
  'y_costhOutput',
  'y_costrOutput',
  'y_outputTokensPerDollarH',
  'y_outputTokensPerDollarR',
]);
const INPUT_COST_METRICS = new Set([
  'y_costhi',
  'y_costri',
  'y_inputTokensPerDollarH',
  'y_inputTokensPerDollarR',
]);
export function isCostMetric(metric: string): boolean {
  return (
    TOTAL_COST_METRICS.has(metric) ||
    OUTPUT_COST_METRICS.has(metric) ||
    INPUT_COST_METRICS.has(metric)
  );
}
const POWER_VALUES = Object.fromEntries(
  Object.entries(HW_REGISTRY).map(([base, specs]) => [
    base,
    specs.power > 0 ? `${specs.power}kW` : '—',
  ]),
);

function MetricBadges({
  label,
  values,
}: {
  label: string;
  values: Record<string, string | number>;
}) {
  return (
    <p className="mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
      <span>{label}</span>
      {Object.entries(values).map(([base, value]) => (
        <span key={base} className="whitespace-nowrap">
          {HW_REGISTRY[base]?.badgeLabel ?? base.toUpperCase()}{' '}
          <span className="font-medium text-foreground">{value}</span>
        </span>
      ))}
    </p>
  );
}

function SourceLink({
  href,
  children,
  sourceLabel = 'Source:',
}: {
  href: string;
  children: ReactNode;
  sourceLabel?: string;
}) {
  return (
    <p className="text-xs text-muted-foreground">
      {sourceLabel}{' '}
      <Link target="_blank" className="underline hover:text-foreground" href={href}>
        {children}
        <ExternalLinkIcon />
      </Link>
    </p>
  );
}

export function PricesSourceLink() {
  const locale = useLocale();
  return (
    <span data-testid="tco-prices-source">
      {locale === 'zh' ? '价格来源：' : 'Prices: '}
      <Link target="_blank" className={sourceLinkClassName} href={TCO_SOURCE_URL}>
        {TCO_SOURCE_TITLE}
        <ExternalLinkIcon />
      </Link>
    </span>
  );
}

const NOUN_ZH: Record<string, string> = {
  cost: '成本',
  'cost per million tokens': '每百万 token 成本',
  'token cost': 'token 成本',
  'tokens per $1 TCO': '每 1 美元 TCO 对应的 token 数',
  'purchasing power': '购买力',
  'input throughput': '输入吞吐量',
  'output throughput': '输出吞吐量',
  power: '功耗',
  'throughput per MW': '每 MW 吞吐量',
  Joules: '能耗',
  'Joules per token': '每 token 能耗',
};

function DisaggCaveat({
  visible,
  calculationNoun,
  comparisonNoun = calculationNoun,
  locale = 'en',
  chipBasis,
}: {
  visible: boolean;
  calculationNoun: string;
  comparisonNoun?: string;
  locale?: Locale;
  /** When set, the caveat describes this basis and offers the toggle. */
  chipBasis?: ChipBasisControl;
}) {
  const totalBasis = chipBasis?.value === 'total';
  const content = totalBasis ? (
    locale === 'zh' ? (
      <>
        <strong>注意：</strong>分离式推理配置（如 MoRI SGLang、Dynamo TRTLLM）的
        {NOUN_ZH[calculationNoun] ?? calculationNoun}
        按芯片总数（预填充芯片 + 解码芯片）计算，与聚合配置口径一致，可以直接对比。
      </>
    ) : (
      <>
        <strong>Note:</strong> Disaggregated inference configurations (e.g., MoRI SGLang, Dynamo
        TRTLLM) calculate {calculationNoun} per total chip count (prefill plus decode chips), the
        same basis aggregated configs use, so the {comparisonNoun} comparison is apples-to-apples.
      </>
    )
  ) : locale === 'zh' ? (
    <>
      <strong>注意：</strong>
      {'分离式推理配置（如 MoRI SGLang、Dynamo TRTLLM）按解码芯片或预填充芯片计算'}
      {NOUN_ZH[calculationNoun] ?? calculationNoun}
      ，而非按芯片总数计算。因此，与聚合配置进行
      {NOUN_ZH[comparisonNoun] ?? comparisonNoun}
      的直接对比并不完全等价。
    </>
  ) : (
    <>
      <strong>Note:</strong> Disaggregated inference configurations (e.g., MoRI SGLang, Dynamo
      TRTLLM) calculate {calculationNoun} per decode chip or per prefill chip, rather than per total
      chip count. This makes direct {comparisonNoun} comparison with aggregated configs not an
      apples-to-apples comparison.
    </>
  );

  return (
    <div
      data-disagg-caveat=""
      data-chip-basis={chipBasis?.value}
      aria-hidden={visible ? undefined : true}
      className={`grid transition-[grid-template-rows,opacity] duration-200 ease-in-out ${
        visible ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
      }`}
    >
      <div className="min-h-0 overflow-hidden text-xs text-muted-foreground">
        {/* Warning edge while the per-pool basis makes the comparison uneven; neutral once
        every chip is the denominator. */}
        <div
          className={`mt-2 border-l-2 py-1 pl-2 ${totalBasis ? 'border-border' : 'border-warning/60'}`}
        >
          <p>{content}</p>
          {chipBasis && !chipBasis.readOnly && visible && (
            <ChipBasisToggle
              value={chipBasis.value}
              onValueChange={chipBasis.onChange}
              source={chipBasis.source}
              className="mt-1.5"
            />
          )}
        </div>
      </div>
    </div>
  );
}

export interface MetricCostAssumptions {
  values: Record<string, number>;
  blankedBases: string[];
  editable: boolean;
  custom: boolean;
}

export function metricCostAssumptions(
  selectedYAxisMetric: string,
  tcoBasis: TcoBasis,
  userCosts: Record<string, number | undefined> | null | undefined,
): MetricCostAssumptions | null {
  const custom = CUSTOM_COST_METRICS.has(selectedYAxisMetric);
  if (!custom && !isCostMetric(selectedYAxisMetric)) return null;
  const key = selectedYAxisMetric.replace(/^y_/u, '');
  const tier = isMetricKey(key) ? metricCostTier(key) : undefined;
  const values =
    tier === 'custom' && userCosts
      ? Object.fromEntries(
          Object.entries(userCosts).filter(
            (entry): entry is [string, number] => typeof entry[1] === 'number',
          ),
        )
      : publishedCostsForTier(tier ?? 'rental', tcoBasis);
  return {
    values,
    blankedBases:
      custom && userCosts
        ? Object.entries(userCosts)
            .filter(([, value]) => value === undefined)
            .map(([base]) => base)
        : [],
    editable: custom || TOTAL_COST_METRICS.has(selectedYAxisMetric),
    custom,
  };
}

export function ChartShareActions() {
  return <ShareButton />;
}

export function MetricAssumptionNotes({
  selectedYAxisMetric,
  activeHwKeys,
  includeAllPowerThroughputMetrics = true,
  includePowerThroughputCaveat = true,
  tcoBasis = DEFAULT_TCO_BASIS,
  userCosts,
  omitCostValues = false,
  chipBasis,
  caveatsOnly = false,
}: {
  selectedYAxisMetric: string;
  activeHwKeys?: ReadonlySet<string> | readonly string[];
  includeAllPowerThroughputMetrics?: boolean;
  includePowerThroughputCaveat?: boolean;
  tcoBasis?: TcoBasis;
  userCosts?: Record<string, number | undefined> | null;
  omitCostValues?: boolean;
  /**
   * The chart's disaggregated throughput basis. When provided, every caveat on a
   * metric that divides input or output throughput describes it, and offers the toggle
   * unless the control is read-only (embeds, or a chart that hosts the toggle elsewhere).
   */
  chipBasis?: ChipBasisControl;
  /** Render only the disaggregated caveats, without sources or cost badges (embeds). */
  caveatsOnly?: boolean;
}) {
  const locale = useLocale();
  const activeBases = useMemo(() => {
    const bases = new Set<string>();
    for (const key of activeHwKeys ?? []) {
      const base = key.split('_')[0];
      if (base in HW_REGISTRY) bases.add(base);
    }
    return bases;
  }, [activeHwKeys]);
  const filterToActive = <T extends string | number>(
    values: Record<string, T>,
    { keepEmpty = false }: { keepEmpty?: boolean } = {},
  ): Record<string, T> => {
    if (activeBases.size === 0) return values;
    const filtered = Object.fromEntries(
      Object.entries(values).filter(([base]) => activeBases.has(base)),
    );
    if (keepEmpty) return filtered;
    return Object.keys(filtered).length > 0 ? filtered : values;
  };
  const showPowerSource = includeAllPowerThroughputMetrics
    ? POWER_SOURCE_METRICS.has(selectedYAxisMetric)
    : selectedYAxisMetric === 'y_tpPerMw';
  const showOutputCostSource = OUTPUT_COST_METRICS.has(selectedYAxisMetric);
  const showInputCostSource = INPUT_COST_METRICS.has(selectedYAxisMetric);
  const showInputThroughputCaveat = selectedYAxisMetric === 'y_inputTputPerGpu';
  const showOutputThroughputCaveat = selectedYAxisMetric === 'y_outputTputPerGpu';
  const showCostCaveat = showOutputCostSource || showInputCostSource;
  const isTokensPerDollar = selectedYAxisMetric.includes('TokensPerDollar');
  const showJouleSource = selectedYAxisMetric.startsWith('y_j');

  const costAssumptions = omitCostValues
    ? null
    : metricCostAssumptions(selectedYAxisMetric, tcoBasis, userCosts);

  const powerLabel = locale === 'zh' ? '全含功率/芯片：' : 'All in Power/Chip:';
  const costLabel = locale === 'zh' ? 'TCO $/chip/hr：' : 'TCO $/chip/hr:';
  const sourceLabel = locale === 'zh' ? '来源：' : 'Source:';

  if (caveatsOnly && !CHIP_BASIS_METRICS.has(selectedYAxisMetric)) return null;

  return (
    <>
      {!caveatsOnly && showPowerSource && (
        <>
          <MetricBadges label={powerLabel} values={filterToActive(POWER_VALUES)} />
          <SourceLink
            href="https://semianalysis.com/datacenter-industry-model/"
            sourceLabel={sourceLabel}
          >
            SemiAnalysis Datacenter Industry Model
          </SourceLink>
        </>
      )}
      {!caveatsOnly && costAssumptions && (
        <>
          <MetricBadges
            label={costLabel}
            values={filterToActive(costAssumptions.values, { keepEmpty: costAssumptions.custom })}
          />
          {!costAssumptions.custom && (
            <SourceLink href={TCO_SOURCE_URL} sourceLabel={sourceLabel}>
              {TCO_SOURCE_TITLE}
            </SourceLink>
          )}
        </>
      )}
      <DisaggCaveat
        visible={showCostCaveat}
        calculationNoun={isTokensPerDollar ? 'tokens per $1 TCO' : 'cost per million tokens'}
        comparisonNoun={isTokensPerDollar ? 'purchasing power' : 'token cost'}
        locale={locale}
        chipBasis={chipBasis}
      />
      <DisaggCaveat
        visible={showInputThroughputCaveat}
        calculationNoun="input throughput"
        locale={locale}
        chipBasis={chipBasis}
      />
      <DisaggCaveat
        visible={showOutputThroughputCaveat}
        calculationNoun="output throughput"
        locale={locale}
        chipBasis={chipBasis}
      />
      {(includePowerThroughputCaveat || chipBasis) && (
        <DisaggCaveat
          visible={PER_TOKEN_TYPE_POWER_METRICS.has(selectedYAxisMetric)}
          calculationNoun="throughput per MW"
          locale={locale}
          chipBasis={chipBasis}
        />
      )}
      {!caveatsOnly && showJouleSource && (
        <>
          <MetricBadges label={powerLabel} values={filterToActive(POWER_VALUES)} />
          <SourceLink
            href="https://semianalysis.com/datacenter-industry-model/"
            sourceLabel={sourceLabel}
          >
            SemiAnalysis Datacenter Industry Model
          </SourceLink>
        </>
      )}
      <DisaggCaveat
        visible={showJouleSource}
        calculationNoun="Joules"
        comparisonNoun="Joules per token"
        locale={locale}
        chipBasis={PER_TOKEN_TYPE_JOULE_METRICS.has(selectedYAxisMetric) ? chipBasis : undefined}
      />
    </>
  );
}
