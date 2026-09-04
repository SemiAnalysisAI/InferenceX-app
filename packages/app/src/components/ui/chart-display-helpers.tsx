'use client';

import Link from 'next/link';
import { useMemo, type ReactNode } from 'react';

import {
  HW_REGISTRY,
  TCO_SOURCE_TITLE,
  TCO_SOURCE_URL,
} from '@semianalysisai/inferencex-constants';

import { Badge } from '@/components/ui/badge';
import { ExternalLinkIcon } from '@/components/ui/external-link-icon';
import { ShareButton } from '@/components/ui/share-button';
import { useLocale } from '@/lib/use-locale';
import type { Locale } from '@/lib/i18n';

// Keep these metric-key groups in sync with chart-utils/chart configs when new source-backed
// metrics are added; this helper owns which caption notes and caveats appear for each family.
const POWER_SOURCE_METRICS = new Set(['y_tpPerMw', 'y_inputTputPerMw', 'y_outputTputPerMw']);
// The disaggregation caveat only applies to the per-token-type per-MW metrics: a
// disaggregated run reports input/output throughput per prefill or per decode chip,
// so dividing by per-chip power inherits that skew. Total tok/s/MW divides
// throughput per chip overall by the same per-chip power an aggregated config
// uses, so it needs no caveat — the same split the cost caveats below make.
const PER_TOKEN_TYPE_POWER_METRICS = new Set(['y_inputTputPerMw', 'y_outputTputPerMw']);
const TOTAL_COST_METRICS = new Set([
  'y_costh',
  'y_costn',
  'y_costr',
  'y_tokensPerDollarH',
  'y_tokensPerDollarN',
  'y_tokensPerDollarR',
]);
const OUTPUT_COST_METRICS = new Set([
  'y_costhOutput',
  'y_costnOutput',
  'y_costrOutput',
  'y_outputTokensPerDollarH',
  'y_outputTokensPerDollarN',
  'y_outputTokensPerDollarR',
]);
const INPUT_COST_METRICS = new Set([
  'y_costhi',
  'y_costni',
  'y_costri',
  'y_inputTokensPerDollarH',
  'y_inputTokensPerDollarN',
  'y_inputTokensPerDollarR',
]);
const POWER_VALUES = Object.fromEntries(
  Object.entries(HW_REGISTRY).map(([base, specs]) => [base, `${specs.power}kW`]),
);

function MetricBadges({
  label,
  values,
}: {
  label: string;
  values: Record<string, string | number>;
}) {
  return (
    <p className="text-muted-foreground mb-2 flex flex-wrap gap-2 items-center">
      {label}{' '}
      {Object.entries(values).map(([base, value]) => (
        <Badge key={base} variant="outline">
          {HW_REGISTRY[base]?.badgeLabel ?? base.toUpperCase()}: {value}
        </Badge>
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
    <p className="text-muted-foreground">
      <small>
        {sourceLabel}{' '}
        <Link target="_blank" className="underline hover:text-foreground" href={href}>
          {children}
          <ExternalLinkIcon />
        </Link>
      </small>
    </p>
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
  Joules: '能耗',
  'Joules per token': '每 token 能耗',
};

function DisaggCaveat({
  visible,
  calculationNoun,
  comparisonNoun = calculationNoun,
  locale = 'en',
}: {
  visible: boolean;
  calculationNoun: string;
  comparisonNoun?: string;
  locale?: Locale;
}) {
  const content =
    locale === 'zh' ? (
      <>
        <strong>注意：</strong>分离式推理配置（如 MoRI SGLang、Dynamo TRTLLM）按解码芯片或预填充
        芯片计算
        {NOUN_ZH[calculationNoun] ?? calculationNoun}
        ，而非按芯片总数计算。因此，与聚合配置进行
        {NOUN_ZH[comparisonNoun] ?? comparisonNoun}
        的直接对比并不完全等价。
      </>
    ) : (
      <>
        <strong>Note:</strong> Disaggregated inference configurations (e.g., MoRI SGLang, Dynamo
        TRTLLM) calculate {calculationNoun} per decode chip or per prefill chip, rather than per
        total chip count. This makes direct {comparisonNoun} comparison with aggregated configs not
        an apples-to-apples comparison.
      </>
    );

  return (
    <div
      className={`overflow-hidden transition-all duration-200 ease-in-out ${
        visible ? 'max-h-20 opacity-100' : 'max-h-0 opacity-0'
      }`}
    >
      <p className="text-muted-foreground text-xs mt-2 border-l-2 border-amber-500 pl-2 bg-amber-500/5 py-1">
        {content}
      </p>
    </div>
  );
}

function getCostValues(selectedYAxisMetric: string) {
  return Object.fromEntries(
    Object.entries(HW_REGISTRY).map(([base, specs]) => [
      base,
      selectedYAxisMetric === 'y_costh' ||
      selectedYAxisMetric === 'y_costhOutput' ||
      selectedYAxisMetric === 'y_costhi' ||
      selectedYAxisMetric === 'y_tokensPerDollarH' ||
      selectedYAxisMetric === 'y_outputTokensPerDollarH' ||
      selectedYAxisMetric === 'y_inputTokensPerDollarH'
        ? specs.costh
        : selectedYAxisMetric === 'y_costn' ||
            selectedYAxisMetric === 'y_costnOutput' ||
            selectedYAxisMetric === 'y_costni' ||
            selectedYAxisMetric === 'y_tokensPerDollarN' ||
            selectedYAxisMetric === 'y_outputTokensPerDollarN' ||
            selectedYAxisMetric === 'y_inputTokensPerDollarN'
          ? specs.costn
          : specs.costr,
    ]),
  );
}

export function ChartShareActions() {
  return <ShareButton />;
}

export function MetricAssumptionNotes({
  selectedYAxisMetric,
  activeHwKeys,
  includeAllPowerThroughputMetrics = true,
  includePowerThroughputCaveat = true,
}: {
  selectedYAxisMetric: string;
  /**
   * Active legend hardware keys (e.g. `gb300_dynamo-sglang`). When provided,
   * the TCO $/chip/hr and Power/Chip badges are narrowed to the base GPUs the
   * selection covers, so the caption only quotes chips that can appear on the
   * plot. Omitted (or when the selection maps to no registry GPU) every
   * registry GPU is shown, preserving the historical behavior.
   */
  activeHwKeys?: ReadonlySet<string> | readonly string[];
  // Historical trends only annotates y_tpPerMw and intentionally omits per-MW caveats to preserve
  // the tab's existing caption contract while sharing the same helper as inference.
  includeAllPowerThroughputMetrics?: boolean;
  includePowerThroughputCaveat?: boolean;
}) {
  const locale = useLocale();
  // Legend keys are `{base}` or `{base}_{framework/variant}`; badge maps are
  // keyed by registry base, so reduce the selection to its base GPUs.
  const activeBases = useMemo(() => {
    const bases = new Set<string>();
    for (const key of activeHwKeys ?? []) {
      const base = key.split('_')[0];
      if (base in HW_REGISTRY) bases.add(base);
    }
    return bases;
  }, [activeHwKeys]);
  const filterToActive = (values: Record<string, string | number>) => {
    if (activeBases.size === 0) return values;
    const filtered = Object.fromEntries(
      Object.entries(values).filter(([base]) => activeBases.has(base)),
    );
    // Defensive: never render a badge row with an empty value list.
    return Object.keys(filtered).length > 0 ? filtered : values;
  };
  const showPowerSource = includeAllPowerThroughputMetrics
    ? POWER_SOURCE_METRICS.has(selectedYAxisMetric)
    : selectedYAxisMetric === 'y_tpPerMw';
  const showTotalCostSource = TOTAL_COST_METRICS.has(selectedYAxisMetric);
  const showOutputCostSource = OUTPUT_COST_METRICS.has(selectedYAxisMetric);
  const showInputCostSource = INPUT_COST_METRICS.has(selectedYAxisMetric);
  const showInputThroughputCaveat = selectedYAxisMetric === 'y_inputTputPerGpu';
  const showOutputThroughputCaveat = selectedYAxisMetric === 'y_outputTputPerGpu';
  // Per-token-type cost and purchasing power only. A disagg config's prefill and decode
  // chips are counted separately, so input/output economics are attributed to one side
  // of the split and can't be lined up against an aggregated config.
  // The total-token metric uses the whole chip count, which is the same
  // denominator an aggregated config uses, so it needs no caveat — the same
  // split the throughput caveats above already make (input/output, not total).
  const showCostCaveat = showOutputCostSource || showInputCostSource;
  const isTokensPerDollar = selectedYAxisMetric.includes('TokensPerDollar');
  const showJouleSource = selectedYAxisMetric.startsWith('y_j');

  const costValues =
    showTotalCostSource || showOutputCostSource || showInputCostSource
      ? getCostValues(selectedYAxisMetric)
      : null;

  const powerLabel = locale === 'zh' ? '全含功率/芯片：' : 'All in Power/Chip:';
  const costLabel = locale === 'zh' ? 'TCO $/chip/hr：' : 'TCO $/chip/hr:';
  const sourceLabel = locale === 'zh' ? '来源：' : 'Source:';

  return (
    <>
      {showPowerSource && (
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
      {costValues && (
        <>
          <MetricBadges label={costLabel} values={filterToActive(costValues)} />
          <SourceLink href={TCO_SOURCE_URL} sourceLabel={sourceLabel}>
            {TCO_SOURCE_TITLE}
          </SourceLink>
        </>
      )}
      <DisaggCaveat
        visible={showCostCaveat}
        calculationNoun={isTokensPerDollar ? 'tokens per $1 TCO' : 'cost per million tokens'}
        comparisonNoun={isTokensPerDollar ? 'purchasing power' : 'token cost'}
        locale={locale}
      />
      <DisaggCaveat
        visible={showInputThroughputCaveat}
        calculationNoun="input throughput"
        locale={locale}
      />
      <DisaggCaveat
        visible={showOutputThroughputCaveat}
        calculationNoun="output throughput"
        locale={locale}
      />
      {includePowerThroughputCaveat && (
        <DisaggCaveat
          visible={PER_TOKEN_TYPE_POWER_METRICS.has(selectedYAxisMetric)}
          calculationNoun="power"
          locale={locale}
        />
      )}
      {showJouleSource && (
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
      />
    </>
  );
}
