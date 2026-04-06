'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import { ShareTwitterButton, ShareLinkedInButton } from '@/components/share-buttons';
import { Badge } from '@/components/ui/badge';
import { ExternalLinkIcon } from '@/components/ui/external-link-icon';
import { ShareButton } from '@/components/ui/share-button';
import { GPU_SPECS } from '@/lib/constants';

// Keep these metric-key groups in sync with chart-utils/chart configs when new source-backed
// metrics are added; this helper owns which caption notes and caveats appear for each family.
const POWER_SOURCE_METRICS = new Set(['y_tpPerMw', 'y_inputTputPerMw', 'y_outputTputPerMw']);
const TOTAL_COST_METRICS = new Set(['y_costh', 'y_costn', 'y_costr']);
const OUTPUT_COST_METRICS = new Set(['y_costhOutput', 'y_costnOutput', 'y_costrOutput']);
const INPUT_COST_METRICS = new Set(['y_costhi', 'y_costni', 'y_costri']);
const POWER_VALUES = Object.fromEntries(
  Object.entries(GPU_SPECS).map(([base, specs]) => [base, `${specs.power}kW`]),
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

function SourceLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <p className="text-muted-foreground">
      <small>
        Source:{' '}
        <Link target="_blank" className="underline hover:text-foreground" href={href}>
          {children}
          <ExternalLinkIcon />
        </Link>
      </small>
    </p>
  );
}

function DisaggCaveat({
  visible,
  calculationNoun,
  comparisonNoun = calculationNoun,
}: {
  visible: boolean;
  calculationNoun: string;
  comparisonNoun?: string;
}) {
  return (
    <div
      className={`overflow-hidden transition-all duration-200 ease-in-out ${
        visible ? 'max-h-20 opacity-100' : 'max-h-0 opacity-0'
      }`}
    >
      <p className="text-muted-foreground text-xs mt-2 border-l-2 border-amber-500 pl-2 bg-amber-500/5 py-1">
        <strong>Note:</strong> Disaggregated inference configurations (e.g., MoRI SGLang, Dynamo
        TRT) calculate {calculationNoun} per decode GPU or per prefill GPU, rather than per total
        GPU count. This makes direct {comparisonNoun} comparison with aggregated configs not an
        apples-to-apples comparison.
      </p>
    </div>
  );
}

function getCostValues(selectedYAxisMetric: string) {
  return Object.fromEntries(
    Object.entries(GPU_SPECS).map(([base, specs]) => [
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
  return (
    <div className="flex items-center gap-1.5">
      <ShareButton />
      <div className="hidden sm:flex items-center gap-1.5">
        <ShareTwitterButton />
        <ShareLinkedInButton />
      </div>
    </div>
  );
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

  return (
    <>
      {showPowerSource && (
        <>
          <MetricBadges label="All in Power/GPU:" values={POWER_VALUES} />
          <SourceLink href="https://semianalysis.com/datacenter-industry-model/">
            SemiAnalysis Datacenter Industry Model
          </SourceLink>
        </>
      )}
      {costValues && (
        <>
          <MetricBadges label="TCO $/GPU/hr:" values={costValues} />
          <SourceLink href="https://semianalysis.com/ai-cloud-tco-model/">
            SemiAnalysis Market August 2025 Pricing Surveys & AI Cloud TCO Model
          </SourceLink>
        </>
      )}
      <DisaggCaveat visible={selectedYAxisMetric.startsWith('y_cost')} calculationNoun="cost" />
      <DisaggCaveat visible={showInputThroughputCaveat} calculationNoun="input throughput" />
      <DisaggCaveat visible={showOutputThroughputCaveat} calculationNoun="output throughput" />
      {includePowerThroughputCaveat && (
        <DisaggCaveat
          visible={POWER_SOURCE_METRICS.has(selectedYAxisMetric)}
          calculationNoun="power"
        />
      )}
      {showJouleSource && (
        <>
          <MetricBadges label="All in Power/GPU:" values={POWER_VALUES} />
          <SourceLink href="https://semianalysis.com/datacenter-industry-model/">
            SemiAnalysis Datacenter Industry Model
          </SourceLink>
        </>
      )}
      <DisaggCaveat
        visible={showJouleSource}
        calculationNoun="Joules"
        comparisonNoun="Joules per token"
      />
    </>
  );
}
