'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { ExternalLinkIcon } from '@/components/ui/external-link-icon';
import { ShareButton } from '@/components/ui/share-button';
import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';
import { useLocale } from '@/lib/use-locale';
import type { Locale } from '@/lib/i18n';

// Keep these metric-key groups in sync with chart-utils/chart configs when new source-backed
// metrics are added; this helper owns which caption notes and caveats appear for each family.
const POWER_SOURCE_METRICS = new Set(['y_tpPerMw', 'y_inputTputPerMw', 'y_outputTputPerMw']);
const TOTAL_COST_METRICS = new Set(['y_costh', 'y_costn', 'y_costr']);
const OUTPUT_COST_METRICS = new Set(['y_costhOutput', 'y_costnOutput', 'y_costrOutput']);
const INPUT_COST_METRICS = new Set(['y_costhi', 'y_costni', 'y_costri']);
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
          {base.toUpperCase()}: {value}
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
        <strong>注意：</strong>分离式推理配置（如 MoRI SGLang、Dynamo TRTLLM）按解码 GPU 或预填充
        GPU 计算
        {NOUN_ZH[calculationNoun] ?? calculationNoun}
        ，而非按 GPU 总数计算。因此，与聚合配置进行
        {NOUN_ZH[comparisonNoun] ?? comparisonNoun}
        的直接对比并不完全等价。
      </>
    ) : (
      <>
        <strong>Note:</strong> Disaggregated inference configurations (e.g., MoRI SGLang, Dynamo
        TRTLLM) calculate {calculationNoun} per decode GPU or per prefill GPU, rather than per total
        GPU count. This makes direct {comparisonNoun} comparison with aggregated configs not an
        apples-to-apples comparison.
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
      selectedYAxisMetric === 'y_costhi'
        ? specs.costh
        : selectedYAxisMetric === 'y_costn' ||
            selectedYAxisMetric === 'y_costnOutput' ||
            selectedYAxisMetric === 'y_costni'
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
  includeAllPowerThroughputMetrics = true,
  includePowerThroughputCaveat = true,
}: {
  selectedYAxisMetric: string;
  // Historical trends only annotates y_tpPerMw and intentionally omits per-MW caveats to preserve
  // the tab's existing caption contract while sharing the same helper as inference.
  includeAllPowerThroughputMetrics?: boolean;
  includePowerThroughputCaveat?: boolean;
}) {
  const locale = useLocale();
  const showPowerSource = includeAllPowerThroughputMetrics
    ? POWER_SOURCE_METRICS.has(selectedYAxisMetric)
    : selectedYAxisMetric === 'y_tpPerMw';
  const showTotalCostSource = TOTAL_COST_METRICS.has(selectedYAxisMetric);
  const showOutputCostSource = OUTPUT_COST_METRICS.has(selectedYAxisMetric);
  const showInputCostSource = INPUT_COST_METRICS.has(selectedYAxisMetric);
  const showInputThroughputCaveat = selectedYAxisMetric === 'y_inputTputPerGpu';
  const showOutputThroughputCaveat = selectedYAxisMetric === 'y_outputTputPerGpu';
  const showJouleSource = selectedYAxisMetric.startsWith('y_j');

  const costValues =
    showTotalCostSource || showOutputCostSource || showInputCostSource
      ? getCostValues(selectedYAxisMetric)
      : null;

  const powerLabel = locale === 'zh' ? '全包功耗/GPU：' : 'All in Power/GPU:';
  const costLabel = locale === 'zh' ? 'TCO $/GPU/小时：' : 'TCO $/GPU/hr:';
  const sourceLabel = locale === 'zh' ? '来源：' : 'Source:';

  return (
    <>
      {showPowerSource && (
        <>
          <MetricBadges label={powerLabel} values={POWER_VALUES} />
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
          <MetricBadges label={costLabel} values={costValues} />
          <SourceLink href="https://semianalysis.com/ai-cloud-tco-model/" sourceLabel={sourceLabel}>
            SemiAnalysis Market August 2025 Pricing Surveys & AI Cloud TCO Model
          </SourceLink>
        </>
      )}
      <DisaggCaveat
        visible={selectedYAxisMetric.startsWith('y_cost')}
        calculationNoun="cost"
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
          visible={POWER_SOURCE_METRICS.has(selectedYAxisMetric)}
          calculationNoun="power"
          locale={locale}
        />
      )}
      {showJouleSource && (
        <>
          <MetricBadges label={powerLabel} values={POWER_VALUES} />
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
