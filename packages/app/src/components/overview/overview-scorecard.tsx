import {
  OVERVIEW_TIERS,
  type OverviewComparisonMode,
  type OverviewEngineScope,
  type OverviewHistoricalComparison,
  type OverviewModelSummary,
  type OverviewPlatformResult,
  type OverviewTier,
} from '@/lib/overview-data';
import {
  buildOverviewDashboardHref,
  detailHref,
  overviewEngineScopeHref,
  overviewHref,
  overviewTierHref,
} from '@/lib/overview-links';

import { OverviewDetailLink } from './overview-detail-link';

export type OverviewLocale = 'en' | 'zh';

export const OVERVIEW_STRINGS = {
  en: {
    title: 'Inference Cost per Million Tokens',
    // The active tier is not repeated here — the SLO selector below already
    // states it.
    scopeMetric: 'Hyperscaler cost',
    scopeDirection: '↓ Lower is better',
    // The unit is dropped from the visible line but kept for screen readers.
    scopeAria: 'Hyperscaler cost per one million total tokens. Lower is better.',
    sourcePrefix: 'Source: InferenceX & ',
    sourceLinkText: 'SemiAnalysis Market July 2026 AI Cloud TCO Model',
    tierNavLabel: 'SLO',
    tierUnit: 'tok/s/user',
    engineScopeNavLabel: 'Engine scope',
    engineScopeOptions: {
      all: 'All Platforms',
      community: 'Open Source Community Engines (vLLM/SGLang)',
    },
    comparisonNavLabel: 'Compare',
    comparisonOptions: {
      hardware: 'vs B200',
      history: '30-day change',
    },
    caption:
      'Cost per million total tokens from each platform’s best observed serving envelope for the scenario shown with each model.',
    historyCaption:
      'Current cost and change versus the latest validated platform result 30–60 days earlier.',
    modelHeader: 'Model · Scenario',
    scenarioLabels: {
      single_turn_8k1k: '8K/1K',
      agentx: 'Long Context Multi-Turn Realistic Agentic Scenario (AgentX)',
    },
    detailLink: 'View details',
    detailAria: (modelLabel: string, scenarioLabel: string) =>
      `View details: ${modelLabel} · ${scenarioLabel}`,
    rawDashboardAria: (evidenceDate: string, modelLabel: string, stack: string) =>
      `Open raw source dashboard for ${evidenceDate}: ${modelLabel} · ${stack}`,
    estimatedTooltip: (topologies: readonly string[]) =>
      topologies.length === 0
        ? 'Estimated from validated benchmark runs.'
        : `Estimated from validated ${topologies.join(' and ')} runs.`,
    estimatedAria: (value: string, explanation: string) => `Approximately ${value}. ${explanation}`,
    cellStateLegend: '— = no result. ∞ = B200 baseline unavailable.',
    missingReasons: (tier: number): Record<string, string> => ({
      int4_bf16_only: 'INT4/BF16 only',
      no_scenario_data: 'no data for this scenario',
      cannot_reach_at_tier: `cannot reach @${tier}`,
      no_exact_at_tier: `no exact @${tier} result`,
    }),
    standardDecodeLabel: 'STP',
    methodologyNote:
      'If a chip does not have FP4 spec decoding available, the next best available configuration is used.',
    costDeltaAria: (pct: string, cheaper: boolean) =>
      `${pct} ${cheaper ? 'cheaper' : 'more expensive'} than B200`,
    costDeltaEvenAria: 'About the same cost as B200',
    noBaselineAria: 'No B200 baseline to compare against',
    historicalDeltaAria: (pct: string, cheaper: boolean, baselineDate: string) =>
      `${pct} ${cheaper ? 'cheaper' : 'more expensive'} than this platform’s ${baselineDate} result`,
    historicalEvenAria: (baselineDate: string) =>
      `About the same cost as this platform’s ${baselineDate} result`,
    historyCellStateLegend: 'Platforms without a valid 30-day comparison show current cost only.',
    referenceHeader: 'Reference',
  },
  zh: {
    title: '推理每百万 token 成本',
    scopeMetric: '超大规模云（hyperscaler）成本',
    scopeDirection: '↓ 越低越好',
    scopeAria: '超大规模云（hyperscaler）每百万总 token 成本，越低越好。',
    sourcePrefix: '来源：InferenceX 与 ',
    sourceLinkText: 'SemiAnalysis Market July 2026 AI Cloud TCO Model',
    tierNavLabel: 'SLO',
    tierUnit: 'tok/s/用户',
    engineScopeNavLabel: '引擎范围',
    engineScopeOptions: {
      all: '所有平台',
      community: '开源社区引擎（vLLM/SGLang）',
    },
    comparisonNavLabel: '对比方式',
    comparisonOptions: {
      hardware: '对比 B200',
      history: '30 天变化',
    },
    caption: '按各模型标注的场景，基于各平台最佳观测服务包络线计算每百万总 token 成本。',
    historyCaption: '当前成本及其相对 30–60 天前最近一次有效平台结果的变化。',
    modelHeader: '模型 · 场景',
    scenarioLabels: {
      single_turn_8k1k: '8K/1K',
      agentx: '长上下文多轮真实智能体场景（AgentX）',
    },
    detailLink: '查看详情',
    detailAria: (modelLabel: string, scenarioLabel: string) =>
      `查看详情：${modelLabel} · ${scenarioLabel}`,
    rawDashboardAria: (evidenceDate: string, modelLabel: string, stack: string) =>
      `打开 ${evidenceDate} 原始数据仪表板：${modelLabel} · ${stack}`,
    estimatedTooltip: (topologies: readonly string[]) =>
      topologies.length === 0
        ? '根据已验证的基准运行结果估算。'
        : `根据已验证的 ${topologies.join(' 与 ')} 运行结果估算。`,
    estimatedAria: (value: string, explanation: string) => `约 ${value}。${explanation}`,
    cellStateLegend: '— = 无结果。∞ = 缺少 B200 基线。',
    missingReasons: (tier: number): Record<string, string> => ({
      int4_bf16_only: '仅 INT4/BF16',
      no_scenario_data: '该场景暂无数据',
      cannot_reach_at_tier: `无法达到 @${tier}`,
      no_exact_at_tier: `无精确 @${tier} 结果`,
    }),
    standardDecodeLabel: 'STP',
    methodologyNote: '若某款芯片不支持 FP4 推测解码，则采用次优的可用配置。',
    costDeltaAria: (pct: string, cheaper: boolean) => `比 B200 ${cheaper ? '便宜' : '昂贵'} ${pct}`,
    costDeltaEvenAria: '与 B200 成本基本持平',
    noBaselineAria: '缺少可比较的 B200 基线',
    historicalDeltaAria: (pct: string, cheaper: boolean, baselineDate: string) =>
      `比该平台 ${baselineDate} 的结果${cheaper ? '便宜' : '昂贵'} ${pct}`,
    historicalEvenAria: (baselineDate: string) => `与该平台 ${baselineDate} 的结果成本基本持平`,
    historyCellStateLegend: '缺少有效 30 天对比的平台仅显示当前成本。',
    referenceHeader: '基准',
  },
} as const;

export type OverviewStrings = (typeof OVERVIEW_STRINGS)[OverviewLocale];

interface Formatters {
  cost: Intl.NumberFormat;
  percent: Intl.NumberFormat;
  percentAbs: Intl.NumberFormat;
  shortDate: (date: string) => string;
}

export function overviewFormatters(locale: OverviewLocale): Formatters {
  const tag = locale === 'zh' ? 'zh-CN' : 'en-US';
  const shortDateFormat = new Intl.DateTimeFormat(tag, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  return {
    // Three decimals: at hyperscaler $/GPU/hr over TOTAL tokens, real platforms
    // land in the $0.0x–$0.1x band, which two decimals would collapse.
    cost: new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    }),
    percent: new Intl.NumberFormat(tag, {
      style: 'percent',
      maximumFractionDigits: 0,
      signDisplay: 'exceptZero',
    }),
    percentAbs: new Intl.NumberFormat(tag, { style: 'percent', maximumFractionDigits: 0 }),
    shortDate: (date) => shortDateFormat.format(new Date(`${date}T00:00:00Z`)),
  };
}

function formatEvidenceDate(
  formatters: Formatters,
  evidenceDate: { from: string; to: string },
): string {
  const from = formatters.shortDate(evidenceDate.from);
  return evidenceDate.from === evidenceDate.to
    ? from
    : `${from}–${formatters.shortDate(evidenceDate.to)}`;
}

function missingReasonCopy(platform: OverviewPlatformResult, strings: OverviewStrings): string {
  const reason = platform.missingReason;
  return reason === null ? '' : strings.missingReasons(platform.read.tier)[reason];
}

const RAW_SOURCE_LINK_CLASS =
  'inline-flex min-h-11 items-center rounded-sm underline decoration-dotted underline-offset-4 hover:decoration-solid focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';

/** No result for this GPU. The reason survives as hover/focus/SR text only. */
function CellMissing({ hardware, reason }: { hardware: string; reason: string }) {
  return (
    <span
      data-testid="overview-pair-missing"
      data-hardware={hardware}
      title={reason}
      className="inline-flex items-baseline gap-1 text-muted-foreground"
    >
      <span aria-hidden="true">{'—'}</span>
      <span className="sr-only">{reason}</span>
    </span>
  );
}

/** Deltas inside this band read as parity, not polarity. */
const COST_DELTA_NEUTRAL_BAND = 0.05;
/** Magnitudes at or beyond this saturate the shade ramp. */
const COST_DELTA_SATURATION = 0.5;
// Missing comparison evidence is neutral gray, never red/green: availability
// is not a better/worse judgment.
const COST_DELTA_CLASS = {
  cheaper: 'text-emerald-700 dark:text-emerald-400',
  pricier: 'text-red-700 dark:text-red-400',
  even: 'text-muted-foreground',
  'no-baseline': 'text-muted-foreground',
} as const;
const COST_DELTA_HUE = {
  cheaper: '16 185 129',
  pricier: '239 68 68',
  // Parity and missing comparison evidence both read as neutral gray.
  even: '148 163 184',
  'no-baseline': '148 163 184',
} as const;
/** Flat wash for the two neutral states — they carry no magnitude to ramp. */
const COST_DELTA_NEUTRAL_ALPHA = '0.10';

type CostDeltaPolarity = keyof typeof COST_DELTA_CLASS;

interface DisplayedComparison {
  status: Exclude<OverviewHistoricalComparison['status'], 'no_newer_result'>;
  pct: number | null;
  baselineDate: string | null;
}

function displayedComparison(
  platform: OverviewPlatformResult,
  comparisonMode: OverviewComparisonMode,
): DisplayedComparison | null {
  if (platform.costPerMtok === null) return null;
  if (comparisonMode === 'history') {
    const comparison = platform.historicalComparison;
    return comparison?.status === 'comparable' && comparison.costDeltaPct !== null
      ? {
          status: comparison.status,
          pct: comparison.costDeltaPct,
          baselineDate: comparison.baselineDate,
        }
      : null;
  }
  if (platform.hardware === 'b200') return null;
  return {
    status: platform.costVsB200Pct === null ? 'no_baseline' : 'comparable',
    pct: platform.costVsB200Pct,
    baselineDate: null,
  };
}

function costDeltaPolarity(pct: number): CostDeltaPolarity {
  if (Math.abs(pct) < COST_DELTA_NEUTRAL_BAND) return 'even';
  return pct < 0 ? 'cheaper' : 'pricier';
}

function comparisonPolarity(comparison: DisplayedComparison): CostDeltaPolarity {
  return comparison.status !== 'comparable' || comparison.pct === null
    ? 'no-baseline'
    : costDeltaPolarity(comparison.pct);
}

function comparisonAria(
  comparison: DisplayedComparison,
  comparisonMode: OverviewComparisonMode,
  polarity: CostDeltaPolarity,
  formatters: Formatters,
  strings: OverviewStrings,
): string {
  if (comparison.status === 'no_baseline' || comparison.pct === null) {
    return strings.noBaselineAria;
  }
  if (comparisonMode === 'hardware') {
    return polarity === 'even'
      ? strings.costDeltaEvenAria
      : strings.costDeltaAria(
          formatters.percentAbs.format(Math.abs(comparison.pct)),
          polarity === 'cheaper',
        );
  }

  const baselineDate =
    comparison.baselineDate === null ? '' : formatters.shortDate(comparison.baselineDate);
  return polarity === 'even'
    ? strings.historicalEvenAria(baselineDate)
    : strings.historicalDeltaAria(
        formatters.percentAbs.format(Math.abs(comparison.pct)),
        polarity === 'cheaper',
        baselineDate,
      );
}

/** Continuous shade: only background alpha tracks the magnitude, so every
 *  cell reads on one ramp instead of stepping through discrete bins. */
function costDeltaAlpha(pct: number): string {
  const strength = Math.min(Math.abs(pct), COST_DELTA_SATURATION) / COST_DELTA_SATURATION;
  return (0.08 + strength * 0.32).toFixed(2);
}

/**
 * The whole cell carries the comparison shade, not just its badge: at a glance
 * the matrix should read as a heat map, with the badge stating the number.
 * A cell with no priced read stays untinted — there is nothing to compare.
 */
export function costDeltaCellStyle(
  platform: OverviewPlatformResult,
  comparisonMode: OverviewComparisonMode = 'hardware',
): { backgroundColor: string } | undefined {
  const comparison = displayedComparison(platform, comparisonMode);
  if (comparison === null) return undefined;
  const { pct } = comparison;
  const polarity = comparisonPolarity(comparison);
  const alpha =
    pct === null || polarity === 'even' ? COST_DELTA_NEUTRAL_ALPHA : costDeltaAlpha(pct);
  return { backgroundColor: `rgb(${COST_DELTA_HUE[polarity]} / ${alpha})` };
}

/** Relative comparison badge. Missing B200 evidence stays neutral and uses
 *  `∞` instead of manufacturing a percentage. */
function CostDeltaBadge({
  comparison,
  comparisonMode,
  hardware,
  formatters,
  strings,
  phoneRow,
}: {
  comparison: DisplayedComparison;
  comparisonMode: OverviewComparisonMode;
  hardware: string;
  formatters: Formatters;
  strings: OverviewStrings;
  phoneRow: boolean;
}) {
  const { pct, status } = comparison;
  const polarity = comparisonPolarity(comparison);
  const aria = comparisonAria(comparison, comparisonMode, polarity, formatters, strings);
  return (
    <span
      data-testid="overview-cost-delta"
      data-hardware={hardware}
      data-cost-polarity={polarity}
      data-history-status={comparisonMode === 'history' ? status : undefined}
      title={aria}
      // The cell behind it carries the shade, so the badge itself stays
      // untinted — two washes of the same hue would double up.
      className={`inline-flex items-center whitespace-nowrap rounded-sm px-1 py-0.5 text-[10px] font-semibold tabular-nums ${
        phoneRow ? 'col-start-2 justify-self-start' : 'xl:col-start-2 xl:justify-self-end'
      } ${COST_DELTA_CLASS[polarity]}`}
    >
      <span aria-hidden="true">{pct === null ? '∞' : formatters.percent.format(pct)}</span>
      <span className="sr-only">{aria}</span>
    </span>
  );
}

function CellValue({
  locale,
  model,
  member,
  formatters,
  strings,
  comparisonMode,
  phoneRow = false,
}: {
  locale: OverviewLocale;
  model: OverviewModelSummary;
  member: OverviewPlatformResult;
  formatters: Formatters;
  strings: OverviewStrings;
  comparisonMode: OverviewComparisonMode;
  phoneRow?: boolean;
}) {
  const { value, config, evidenceDate, evidenceTopologies } = member.read;
  if (member.missingReason !== null || value === null || member.costPerMtok === null) {
    return <CellMissing hardware={member.hardware} reason={missingReasonCopy(member, strings)} />;
  }
  const precisionLabel = config?.precision.toUpperCase() ?? member.precision?.toUpperCase() ?? null;
  const evidenceSpecLabel =
    config === null
      ? null
      : config.specMethod === 'none' || config.specMethod === ''
        ? strings.standardDecodeLabel
        : config.specLabel;
  // Speculative decode is the expected case, so a cell only calls out the
  // exception: a standard-decode read, badged STP.
  const decodeLabel =
    config !== null && (config.specMethod === 'none' || config.specMethod === '')
      ? strings.standardDecodeLabel
      : null;
  const stackPrefix =
    config === null || precisionLabel === null
      ? null
      : [config.frameworkLabel, precisionLabel].join(' · ');
  const stackBadge =
    stackPrefix === null
      ? null
      : decodeLabel === null
        ? stackPrefix
        : [stackPrefix, decodeLabel].join(' · ');
  const stack =
    config === null || evidenceSpecLabel === null
      ? null
      : [
          member.hardwareLabel,
          config.frameworkLabel,
          config.precision.toUpperCase(),
          evidenceSpecLabel,
        ].join(' · ');
  const evidenceDateLabel =
    evidenceDate === null ? '' : formatEvidenceDate(formatters, evidenceDate);
  const formattedValue = formatters.cost.format(member.costPerMtok);
  const estimateExplanation = member.read.estimated
    ? strings.estimatedTooltip(evidenceTopologies)
    : undefined;
  // No visible date, but the evidence link's hover/focus/SR label keeps the
  // run date so the number stays reproducible.
  const evidenceAria =
    config === null || stack === null
      ? null
      : strings.rawDashboardAria(evidenceDateLabel, model.modelLabel, stack);
  const costText = formattedValue;
  const comparison = displayedComparison(member, comparisonMode);
  return (
    <div className="min-w-0 space-y-0.5 text-sm">
      {/* Fixed cost | delta grids keep comparisons scannable on desktop and phones;
          the delta slot is reserved even on B200 so numbers align across rows. */}
      <div
        className={
          phoneRow
            ? 'grid grid-cols-[max-content_minmax(0,1fr)] items-baseline gap-x-1.5 gap-y-0.5'
            : 'flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 xl:grid xl:grid-cols-[minmax(max-content,1fr)_3.5rem]'
        }
      >
        <span
          data-testid="overview-pair-value"
          data-hardware={member.hardware}
          className="whitespace-nowrap font-semibold tabular-nums"
        >
          {evidenceAria === null || config === null ? (
            <span title={estimateExplanation}>
              {estimateExplanation === undefined ? null : (
                <span className="sr-only">
                  {strings.estimatedAria(formattedValue, estimateExplanation)}
                </span>
              )}
              {costText}
            </span>
          ) : (
            /* The cost itself is the evidence entry point into the filtered
               dashboard for exactly this configuration. */
            <a
              data-testid="overview-cost-evidence-link"
              href={buildOverviewDashboardHref(locale, model, config)}
              title={
                estimateExplanation === undefined
                  ? evidenceAria
                  : `${estimateExplanation} ${evidenceAria}`
              }
              aria-label={
                estimateExplanation === undefined
                  ? `${formattedValue}. ${evidenceAria}`
                  : `${strings.estimatedAria(formattedValue, estimateExplanation)} ${evidenceAria}`
              }
              className={RAW_SOURCE_LINK_CLASS}
            >
              {costText}
            </a>
          )}
        </span>
        {comparison === null ? null : (
          <CostDeltaBadge
            comparison={comparison}
            comparisonMode={comparisonMode}
            hardware={member.hardware}
            formatters={formatters}
            strings={strings}
            phoneRow={phoneRow}
          />
        )}
      </div>
      {member.precision === null ? null : (
        <div className="min-w-0 text-[11px] leading-tight font-normal uppercase tracking-wider text-muted-foreground/70">
          {config === null ? (
            member.precision.toUpperCase()
          ) : phoneRow && stackPrefix !== null && decodeLabel !== null ? (
            <>
              <span className="block">{stackPrefix}</span>
              <span className="block">{decodeLabel}</span>
            </>
          ) : (
            stackBadge
          )}
        </div>
      )}
    </div>
  );
}

function PlatformCell(props: {
  locale: OverviewLocale;
  model: OverviewModelSummary;
  platform: OverviewPlatformResult;
  formatters: Formatters;
  strings: OverviewStrings;
  comparisonMode: OverviewComparisonMode;
  phoneRow?: boolean;
}) {
  return (
    <div data-testid="overview-platform" data-hardware={props.platform.hardware}>
      <CellValue
        locale={props.locale}
        model={props.model}
        member={props.platform}
        formatters={props.formatters}
        strings={props.strings}
        comparisonMode={props.comparisonMode}
        phoneRow={props.phoneRow}
      />
    </div>
  );
}

function ModelName({ model, strings }: { model: OverviewModelSummary; strings: OverviewStrings }) {
  return (
    <div>
      <h2 className="text-sm font-semibold leading-snug">{model.modelLabel}</h2>
      <p
        data-testid="overview-model-scenario"
        className="mt-0.5 text-[11px] font-normal leading-tight text-muted-foreground"
      >
        {strings.scenarioLabels[model.scenario]}
      </p>
    </div>
  );
}

interface SurfaceProps {
  models: OverviewModelSummary[];
  locale: OverviewLocale;
  formatters: Formatters;
  strings: OverviewStrings;
  comparisonMode: OverviewComparisonMode;
}

export function DesktopOverviewMatrix({
  models,
  locale,
  formatters,
  strings,
  comparisonMode,
}: SurfaceProps) {
  const platforms = models[0]?.platforms ?? [];
  return (
    <div className="hidden xl:block">
      <table data-testid="overview-desktop-matrix" className="w-full border-collapse text-sm">
        <caption className="sr-only">
          {comparisonMode === 'history' ? strings.historyCaption : strings.caption}
        </caption>
        <colgroup>
          <col className="w-[22%]" />
          {platforms.map((platform) => (
            <col key={platform.hardware} className="w-[15.6%]" />
          ))}
        </colgroup>
        {/* Sticky so the platform a column belongs to stays readable while
            scrolling a nine-row matrix. `top-14` clears the site header (h-14,
            sticky top-0, z-50), and z-10 keeps this under it. Opaque, or the
            scrolled rows show through. */}
        <thead className="sticky top-14 z-10 bg-card">
          <tr className="border-b border-border/50 text-sm uppercase tracking-wider text-muted-foreground">
            <th scope="col" className="bg-card px-4 py-2 text-left font-semibold lg:px-6">
              {strings.modelHeader}
            </th>
            {platforms.map((platform) => (
              <th
                key={platform.hardware}
                scope="col"
                className={`px-3 py-2 text-left font-semibold ${comparisonMode === 'hardware' && platform.hardware === 'b200' ? 'bg-muted' : 'bg-card'}`}
              >
                {comparisonMode === 'hardware' && platform.hardware === 'b200'
                  ? `${platform.hardwareLabel} · ${strings.referenceHeader}`
                  : platform.hardwareLabel}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {models.map((model) => (
            <tr
              key={`${model.model}-${model.scenario}`}
              data-testid="overview-desktop-model"
              data-model={model.model}
              data-scenario={model.scenario}
              className="border-b border-border/50 align-top last:border-b-0"
            >
              <th scope="row" className="px-4 py-4 text-left align-top font-normal lg:px-6">
                <ModelName model={model} strings={strings} />
                {/* The link lives with the model it drills into, so the matrix
                    spends no column on a header that is the same every row. */}
                <OverviewDetailLink
                  href={detailHref(locale, model)}
                  model={model.model}
                  ariaLabel={strings.detailAria(
                    model.modelLabel,
                    strings.scenarioLabels[model.scenario],
                  )}
                  className="mt-1 text-xs"
                >
                  {strings.detailLink}
                </OverviewDetailLink>
              </th>
              {model.platforms.map((platform) => (
                <td
                  key={platform.hardware}
                  style={costDeltaCellStyle(platform, comparisonMode)}
                  className={`px-3 py-4 align-top ${comparisonMode === 'hardware' && platform.hardware === 'b200' ? 'bg-muted/30' : ''}`}
                >
                  <PlatformCell
                    locale={locale}
                    model={model}
                    platform={platform}
                    formatters={formatters}
                    strings={strings}
                    comparisonMode={comparisonMode}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MobileOverviewList({
  models,
  locale,
  formatters,
  strings,
  comparisonMode,
}: SurfaceProps) {
  return (
    <ul data-testid="overview-mobile-list" className="divide-y divide-border/50 xl:hidden">
      {models.map((model) => (
        <li key={`${model.model}-${model.scenario}`}>
          <article
            data-testid="overview-mobile-model"
            data-model={model.model}
            data-scenario={model.scenario}
            className="space-y-2 px-4 py-3.5"
          >
            <ModelName model={model} strings={strings} />
            <div className="grid grid-cols-1">
              {model.platforms.map((platform) => (
                <div
                  key={platform.hardware}
                  data-testid="overview-mobile-platform-row"
                  data-hardware={platform.hardware}
                  style={costDeltaCellStyle(platform, comparisonMode)}
                  className="grid min-w-0 grid-cols-[4.25rem_minmax(0,1fr)] gap-x-3 border-b border-border/30 py-1.5 last:border-b-0"
                >
                  <span
                    data-testid="overview-mobile-hardware"
                    className="pt-0.5 text-xs font-medium text-muted-foreground"
                  >
                    {platform.hardwareLabel}
                  </span>
                  <PlatformCell
                    locale={locale}
                    model={model}
                    platform={platform}
                    formatters={formatters}
                    strings={strings}
                    comparisonMode={comparisonMode}
                    phoneRow
                  />
                </div>
              ))}
            </div>
            <OverviewDetailLink
              href={detailHref(locale, model)}
              model={model.model}
              ariaLabel={strings.detailAria(
                model.modelLabel,
                strings.scenarioLabels[model.scenario],
              )}
              className="min-h-11 w-full justify-between"
            >
              {strings.detailLink}
            </OverviewDetailLink>
          </article>
        </li>
      ))}
    </ul>
  );
}

/** Plain links so every view is a copyable server-rendered URL; the displayed
 *  tier is inert `aria-current` text, never a self-link. */
export function OverviewTierSwitcher({
  tier,
  engineScope,
  comparisonMode,
  locale,
  strings,
}: {
  tier: OverviewTier;
  engineScope: OverviewEngineScope;
  comparisonMode: OverviewComparisonMode;
  locale: OverviewLocale;
  strings: OverviewStrings;
}) {
  const optionClass = 'inline-flex min-h-11 items-center px-3 tabular-nums';
  return (
    <nav
      data-testid="overview-tier-switcher"
      aria-label={strings.tierNavLabel}
      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"
    >
      <span className="text-muted-foreground">{strings.tierNavLabel}</span>
      <div className="flex divide-x divide-border/60 overflow-hidden rounded-md border border-border/60">
        {OVERVIEW_TIERS.map((option) =>
          option === tier ? (
            <span
              key={option}
              aria-current="page"
              className={`${optionClass} bg-foreground font-semibold text-background`}
            >
              {option}
            </span>
          ) : (
            <a
              key={option}
              href={overviewTierHref(locale, option, engineScope, comparisonMode)}
              className={`${optionClass} text-muted-foreground transition-colors hover:bg-muted hover:text-foreground`}
            >
              {option}
            </a>
          ),
        )}
      </div>
      <span className="text-muted-foreground">{strings.tierUnit}</span>
    </nav>
  );
}

/** Plain server links keep scope selection copyable and preserve the active tier. */
export function OverviewEngineScopeSwitcher({
  engineScope,
  tier,
  comparisonMode,
  locale,
  strings,
}: {
  engineScope: OverviewEngineScope;
  tier: OverviewTier;
  comparisonMode: OverviewComparisonMode;
  locale: OverviewLocale;
  strings: OverviewStrings;
}) {
  const options: OverviewEngineScope[] = ['community', 'all'];
  const optionClass =
    'inline-flex min-h-11 w-full items-center rounded-md border border-border/60 px-3 py-1.5 text-left leading-snug sm:w-auto';
  return (
    <nav
      data-testid="overview-engine-scope-switcher"
      aria-label={strings.engineScopeNavLabel}
      className="flex min-w-0 flex-col items-start gap-1 text-xs sm:flex-row sm:items-center sm:gap-2"
    >
      <span className="shrink-0 text-muted-foreground">{strings.engineScopeNavLabel}</span>
      <div className="flex w-full min-w-0 flex-col gap-1 sm:w-auto sm:flex-row">
        {options.map((option) =>
          option === engineScope ? (
            <span
              key={option}
              data-overview-engine-scope={option}
              aria-current="true"
              className={`${optionClass} bg-foreground font-semibold text-background`}
            >
              {strings.engineScopeOptions[option]}
            </span>
          ) : (
            <a
              key={option}
              data-overview-engine-scope={option}
              href={overviewEngineScopeHref(locale, option, tier, comparisonMode)}
              className={`${optionClass} text-muted-foreground transition-colors hover:bg-muted hover:text-foreground`}
            >
              {strings.engineScopeOptions[option]}
            </a>
          ),
        )}
      </div>
    </nav>
  );
}

export function OverviewComparisonSwitcher({
  comparisonMode,
  engineScope,
  tier,
  locale,
  strings,
}: {
  comparisonMode: OverviewComparisonMode;
  engineScope: OverviewEngineScope;
  tier: OverviewTier;
  locale: OverviewLocale;
  strings: OverviewStrings;
}) {
  const options: OverviewComparisonMode[] = ['hardware', 'history'];
  const optionClass =
    'relative inline-flex min-h-11 min-w-[130px] items-center justify-center whitespace-nowrap border-b-2 border-transparent px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors duration-200 hover:border-muted-foreground/30 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring sm:min-w-[140px]';
  return (
    <nav
      data-testid="overview-comparison-switcher"
      aria-label={strings.comparisonNavLabel}
      className="flex flex-wrap justify-center gap-x-1 gap-y-1.5 sm:gap-x-1.5"
    >
      {options.map((option) =>
        option === comparisonMode ? (
          <span
            key={option}
            data-overview-comparison={option}
            aria-current="true"
            className={`${optionClass} border-secondary text-secondary dark:border-primary dark:text-primary`}
          >
            {strings.comparisonOptions[option]}
          </span>
        ) : (
          <a
            key={option}
            data-overview-comparison={option}
            href={overviewHref(locale, tier, engineScope, option)}
            className={optionClass}
          >
            {strings.comparisonOptions[option]}
          </a>
        ),
      )}
    </nav>
  );
}

export function OverviewMethodology({
  strings,
  comparisonMode,
}: {
  strings: OverviewStrings;
  comparisonMode: OverviewComparisonMode;
}) {
  return (
    <div
      data-testid="overview-methodology"
      className="space-y-1 border-t border-border/50 px-4 py-3 text-xs leading-snug text-muted-foreground lg:px-6"
    >
      {comparisonMode === 'history' ? <p>{strings.historyCaption}</p> : null}
      <p>
        {comparisonMode === 'history' ? strings.historyCellStateLegend : strings.cellStateLegend}
      </p>
      <p>{strings.methodologyNote}</p>
    </div>
  );
}
