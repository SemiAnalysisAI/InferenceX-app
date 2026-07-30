import {
  OVERVIEW_TIERS,
  type OverviewEngineScope,
  type OverviewModelSummary,
  type OverviewPlatformResult,
  type OverviewTier,
} from '@/lib/overview-data';
import {
  buildOverviewDashboardHref,
  detailHref,
  overviewEngineScopeHref,
  overviewTierHref,
} from '@/lib/overview-links';

import { OverviewDetailLink } from './overview-detail-link';

export type OverviewLocale = 'en' | 'zh';

export const OVERVIEW_STRINGS = {
  en: {
    title: 'Inference Cost Overview',
    purpose: 'Every active model across MI355X, B200, B300, GB200 and GB300 at a glance.',
    // The active tier is not repeated here — the Service level selector below
    // already states it.
    scopeMetric: 'Hyperscaler cost · $/1M total tokens',
    scopeDirection: '↓ Lower is better',
    scopeAria: 'Hyperscaler cost per one million total tokens. Lower is better.',
    tierNavLabel: 'Service level',
    tierUnit: 'tok/s/user',
    engineScopeNavLabel: 'Engine scope',
    engineScopeOptions: {
      all: 'All Platforms',
      community: 'Open Source Community Engines (vLLM/SGLang)',
    },
    caption:
      'Cost per million total tokens from each platform’s best observed serving envelope for the scenario shown with each model.',
    modelHeader: 'Model · Scenario',
    scenarioLabels: {
      single_turn_8k1k: 'Single-turn · 8K→1K',
      agentx: 'AgentX',
    },
    detailsHeader: 'Details',
    detailLink: 'View details',
    detailAria: (modelLabel: string) => `View details: ${modelLabel}`,
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
    speculativeDecodeLabel: (method: string) => `Spec decode (${method})`,
    standardDecodeLabel: 'Standard decode',
    methodologyNote: 'Priority: speculative FP4 → speculative FP8 → standard FP4 → standard FP8.',
    costNote:
      'Cost = hyperscaler $/GPU/hr ÷ total tok/s per deployed GPU. Percentages compare against B200.',
    costDeltaAria: (pct: string, cheaper: boolean) =>
      `${pct} ${cheaper ? 'cheaper' : 'more expensive'} than B200`,
    costDeltaEvenAria: 'About the same cost as B200',
    noBaselineAria: 'No B200 baseline to compare against',
    referenceHeader: 'Reference',
    normalizationNote:
      'Disaggregated results include both prefill and decode GPUs in the denominator.',
    interpolationNote:
      'Tier values use the best observed platform serving envelope and may be estimated between validated runs. No extrapolation.',
    comparabilityNote:
      'Each row compares platforms within the scenario shown with that model; dates, engines, precisions and speculative methods may differ.',
  },
  zh: {
    title: '推理成本总览',
    purpose: '一眼对比各活跃模型在 MI355X、B200、B300、GB200 与 GB300 上的表现。',
    scopeMetric: '超大规模云（hyperscaler）成本 · $/1M 总 token',
    scopeDirection: '↓ 越低越好',
    scopeAria: '超大规模云（hyperscaler）每百万总 token 成本，越低越好。',
    tierNavLabel: '服务档位',
    tierUnit: 'tok/s/用户',
    engineScopeNavLabel: '引擎范围',
    engineScopeOptions: {
      all: '所有平台',
      community: '开源社区引擎（vLLM/SGLang）',
    },
    caption: '按各模型标注的场景，基于各平台最佳观测服务包络线计算每百万总 token 成本。',
    modelHeader: '模型 · 场景',
    scenarioLabels: {
      single_turn_8k1k: '单轮 · 8K→1K',
      agentx: 'AgentX',
    },
    detailsHeader: '详情',
    detailLink: '查看详情',
    detailAria: (modelLabel: string) => `查看详情：${modelLabel}`,
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
    speculativeDecodeLabel: (method: string) => `推测解码（${method}）`,
    standardDecodeLabel: '标准解码',
    methodologyNote: '优先顺序：推测解码 FP4 → 推测解码 FP8 → 标准解码 FP4 → 标准解码 FP8。',
    costNote:
      '成本 = 超大规模云（hyperscaler）$/GPU/小时 ÷ 每张已部署 GPU 的总 tok/s。百分比均相对 B200。',
    costDeltaAria: (pct: string, cheaper: boolean) => `比 B200 ${cheaper ? '便宜' : '昂贵'} ${pct}`,
    costDeltaEvenAria: '与 B200 成本基本持平',
    noBaselineAria: '缺少可比较的 B200 基线',
    referenceHeader: '基准',
    normalizationNote: '分离式结果的分母同时计入预填充与解码 GPU。',
    interpolationNote:
      '各档位数值采用最佳观测平台服务包络线，可能根据已验证运行结果估算。不会外推。',
    comparabilityNote: '每行均在该模型标注的场景内比较各平台；日期、引擎、精度与推测方法可能不同。',
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
// `no-baseline` (∞) is neutral gray, never red/green: a missing B200 baseline
// is not a better/worse judgment.
const COST_DELTA_CLASS = {
  cheaper: 'text-emerald-700 dark:text-emerald-400',
  pricier: 'text-red-700 dark:text-red-400',
  even: 'bg-muted text-muted-foreground',
  'no-baseline': 'text-muted-foreground',
} as const;
const COST_DELTA_HUE = { cheaper: '16 185 129', pricier: '239 68 68' } as const;

type CostDeltaPolarity = keyof typeof COST_DELTA_CLASS;

function costDeltaPolarity(pct: number): CostDeltaPolarity {
  if (Math.abs(pct) < COST_DELTA_NEUTRAL_BAND) return 'even';
  return pct < 0 ? 'cheaper' : 'pricier';
}

/** Continuous shade: only background alpha tracks the magnitude, so every
 *  badge reads on one ramp instead of stepping through discrete bins. */
function costDeltaAlpha(pct: number): string {
  const strength = Math.min(Math.abs(pct), COST_DELTA_SATURATION) / COST_DELTA_SATURATION;
  return (0.08 + strength * 0.32).toFixed(2);
}

/** Relative-to-B200 badge. `pct === null` means the row's B200 baseline is
 *  unavailable: the badge shows a neutral `∞` instead of a percentage. */
function CostDeltaBadge({
  pct,
  hardware,
  formatters,
  strings,
  phoneRow,
}: {
  pct: number | null;
  hardware: string;
  formatters: Formatters;
  strings: OverviewStrings;
  phoneRow: boolean;
}) {
  const polarity: CostDeltaPolarity = pct === null ? 'no-baseline' : costDeltaPolarity(pct);
  const aria =
    pct === null
      ? strings.noBaselineAria
      : polarity === 'even'
        ? strings.costDeltaEvenAria
        : strings.costDeltaAria(
            formatters.percentAbs.format(Math.abs(pct)),
            polarity === 'cheaper',
          );
  return (
    <span
      data-testid="overview-cost-delta"
      data-hardware={hardware}
      data-cost-polarity={polarity}
      title={aria}
      style={
        pct === null || polarity === 'even' || polarity === 'no-baseline'
          ? undefined
          : { backgroundColor: `rgb(${COST_DELTA_HUE[polarity]} / ${costDeltaAlpha(pct)})` }
      }
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
  phoneRow = false,
}: {
  locale: OverviewLocale;
  model: OverviewModelSummary;
  member: OverviewPlatformResult;
  formatters: Formatters;
  strings: OverviewStrings;
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
  const decodeLabel =
    config === null || evidenceSpecLabel === null
      ? null
      : config.specMethod === 'none' || config.specMethod === ''
        ? evidenceSpecLabel
        : strings.speculativeDecodeLabel(evidenceSpecLabel);
  const stackPrefix =
    config === null || precisionLabel === null
      ? null
      : [config.frameworkLabel, precisionLabel].join(' · ');
  const stackBadge =
    stackPrefix === null || decodeLabel === null ? null : [stackPrefix, decodeLabel].join(' · ');
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
                  ? evidenceAria
                  : `${strings.estimatedAria(formattedValue, estimateExplanation)} ${evidenceAria}`
              }
              className={RAW_SOURCE_LINK_CLASS}
            >
              {costText}
            </a>
          )}
        </span>
        {member.hardware === 'b200' ? null : (
          <CostDeltaBadge
            pct={member.costVsB200Pct}
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
}

export function DesktopOverviewMatrix({ models, locale, formatters, strings }: SurfaceProps) {
  const platforms = models[0]?.platforms ?? [];
  return (
    <div className="hidden overflow-x-auto xl:block">
      <table data-testid="overview-desktop-matrix" className="w-full border-collapse text-sm">
        <caption className="sr-only">{strings.caption}</caption>
        <colgroup>
          <col className="w-[17%]" />
          {platforms.map((platform) => (
            <col key={platform.hardware} className="w-[13.5%]" />
          ))}
          <col className="w-[12%]" />
        </colgroup>
        <thead>
          <tr className="border-b border-border/50 text-xs uppercase tracking-wider text-muted-foreground">
            <th scope="col" className="px-4 py-2 text-left font-semibold lg:px-6">
              {strings.modelHeader}
            </th>
            {platforms.map((platform) => (
              <th
                key={platform.hardware}
                scope="col"
                className={`px-3 py-2 text-left font-semibold ${platform.hardware === 'b200' ? 'bg-muted/30' : ''}`}
              >
                {platform.hardware === 'b200'
                  ? `${platform.hardwareLabel} · ${strings.referenceHeader}`
                  : platform.hardwareLabel}
              </th>
            ))}
            <th scope="col" className="px-4 py-2 text-left font-semibold">
              {strings.detailsHeader}
            </th>
          </tr>
        </thead>
        <tbody>
          {models.map((model) => (
            <tr
              key={model.model}
              data-testid="overview-desktop-model"
              data-model={model.model}
              className="border-b border-border/50 align-top last:border-b-0"
            >
              <th scope="row" className="px-4 py-4 text-left align-top font-normal lg:px-6">
                <ModelName model={model} strings={strings} />
              </th>
              {model.platforms.map((platform) => (
                <td
                  key={platform.hardware}
                  className={`px-3 py-4 align-top ${platform.hardware === 'b200' ? 'bg-muted/30' : ''}`}
                >
                  <PlatformCell
                    locale={locale}
                    model={model}
                    platform={platform}
                    formatters={formatters}
                    strings={strings}
                  />
                </td>
              ))}
              <td className="px-4 py-4 align-top">
                <OverviewDetailLink
                  href={detailHref(locale, model)}
                  model={model.model}
                  ariaLabel={strings.detailAria(model.modelLabel)}
                >
                  {strings.detailLink}
                </OverviewDetailLink>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MobileOverviewList({ models, locale, formatters, strings }: SurfaceProps) {
  return (
    <ul data-testid="overview-mobile-list" className="divide-y divide-border/50 xl:hidden">
      {models.map((model) => (
        <li key={model.model}>
          <article
            data-testid="overview-mobile-model"
            data-model={model.model}
            className="space-y-2 px-4 py-3.5"
          >
            <ModelName model={model} strings={strings} />
            <div className="grid grid-cols-1">
              {model.platforms.map((platform) => (
                <div
                  key={platform.hardware}
                  data-testid="overview-mobile-platform-row"
                  data-hardware={platform.hardware}
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
                    phoneRow
                  />
                </div>
              ))}
            </div>
            <OverviewDetailLink
              href={detailHref(locale, model)}
              model={model.model}
              ariaLabel={strings.detailAria(model.modelLabel)}
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
  locale,
  strings,
}: {
  tier: OverviewTier;
  engineScope: OverviewEngineScope;
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
              href={overviewTierHref(locale, option, engineScope)}
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
  locale,
  strings,
}: {
  engineScope: OverviewEngineScope;
  tier: OverviewTier;
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
              href={overviewEngineScopeHref(locale, option, tier)}
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

export function OverviewMethodology({ strings }: { strings: OverviewStrings }) {
  return (
    <div className="space-y-1 border-t border-border/50 px-4 py-3 text-xs leading-snug text-muted-foreground lg:px-6">
      <p>{strings.costNote}</p>
      <p>{strings.cellStateLegend}</p>
      <p>{strings.methodologyNote}</p>
      <p>{strings.comparabilityNote}</p>
      <p>{strings.normalizationNote}</p>
      <p>{strings.interpolationNote}</p>
    </div>
  );
}
