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

import { ExternalLinkIcon } from '../ui/external-link-icon';
import { OverviewDetailLink } from './overview-detail-link';

export type OverviewLocale = 'en' | 'zh';

export const OVERVIEW_STRINGS = {
  en: {
    title: 'AI Inference Overview',
    purpose: 'Every active model across MI355X, B200, B300, GB200 and GB300 at a glance.',
    scope: (tier: number) =>
      `8K→1K · Single-turn · $ per million output tokens @${tier} tok/s/user · Prioritizes speculative decode and FP4; otherwise uses the best available platform envelope`,
    tierNavLabel: 'Service level',
    tierUnit: 'tok/s/user',
    engineScopeNavLabel: 'Engine scope',
    engineScopeOptions: {
      all: 'All Platforms',
      community: 'Open Source Community Engines (vLLM/SGLang)',
    },
    snapshot: (through: string) => `Database snapshot through ${through}`,
    caption:
      "Cost per million output tokens from the best observed platform serving envelopes for every active model across today's key platforms, prioritizing speculative decode and FP4.",
    modelHeader: 'Model',
    detailsHeader: 'Details',
    detailLink: 'View details',
    detailAria: (modelLabel: string) => `View details: ${modelLabel}`,
    rawDashboardAria: (evidenceDate: string, modelLabel: string, stack: string) =>
      `Open raw source dashboard for ${evidenceDate}: ${modelLabel} · ${stack}`,
    standardDecode: 'Standard decode',
    estimatedTooltip: (topologies: readonly string[]) =>
      topologies.length === 0
        ? 'Estimated from validated benchmark runs.'
        : `Estimated from validated ${topologies.join(' and ')} runs.`,
    estimatedAria: (value: string, explanation: string) => `Approximately ${value}. ${explanation}`,
    noGlm8k1k: 'No GLM‑5.2 single-turn 8K/1K benchmark yet',
    infinityLegend: '∞ = no comparable result',
    missingReasons: (tier: number): Record<string, string> => ({
      int4_bf16_only: 'INT4/BF16 only',
      no_8k1k_data: 'no 8K/1K data',
      cannot_reach_at_tier: `cannot reach @${tier}`,
      no_exact_at_tier: `no exact @${tier} result`,
    }),
    methodologyNote: 'Priority: speculative FP4 → speculative FP8 → standard FP4 → standard FP8.',
    costNote:
      'Cost = 3-yr rental $/GPU/hr ÷ output tok/s per deployed GPU. Lower is better; % compares against B200.',
    costDeltaAria: (pct: string, cheaper: boolean) =>
      `${pct} ${cheaper ? 'cheaper' : 'more expensive'} than B200`,
    normalizationNote:
      'Disaggregated results include both prefill and decode GPUs in the denominator.',
    interpolationNote:
      'Tier values use the best observed platform serving envelope; ≈ marks estimates between validated runs. No extrapolation.',
  },
  zh: {
    title: 'AI 推理总览',
    purpose: '一眼对比各活跃模型在 MI355X、B200、B300、GB200 与 GB300 上的表现。',
    scope: (tier: number) =>
      `8K→1K · 单轮 · 每百万输出 token 成本（美元）@${tier} tok/s/用户 · 优先采用推测解码与 FP4；否则采用最佳可用平台服务包络线`,
    tierNavLabel: '服务档位',
    tierUnit: 'tok/s/用户',
    engineScopeNavLabel: '引擎范围',
    engineScopeOptions: {
      all: '所有平台',
      community: '开源社区引擎（vLLM/SGLang）',
    },
    snapshot: (through: string) => `数据库快照截至 ${through}`,
    caption:
      '基于最佳观测平台服务包络线计算的各活跃模型每百万输出 token 成本；优先采用推测解码与 FP4。',
    modelHeader: '模型',
    detailsHeader: '详情',
    detailLink: '查看详情',
    detailAria: (modelLabel: string) => `查看详情：${modelLabel}`,
    rawDashboardAria: (evidenceDate: string, modelLabel: string, stack: string) =>
      `打开 ${evidenceDate} 原始数据仪表板：${modelLabel} · ${stack}`,
    standardDecode: '标准解码',
    estimatedTooltip: (topologies: readonly string[]) =>
      topologies.length === 0
        ? '根据已验证的基准运行结果估算。'
        : `根据已验证的 ${topologies.join(' 与 ')} 运行结果估算。`,
    estimatedAria: (value: string, explanation: string) => `约 ${value}。${explanation}`,
    noGlm8k1k: '暂无 GLM‑5.2 单轮 8K/1K 基准结果',
    infinityLegend: '∞ = 无可比结果',
    missingReasons: (tier: number): Record<string, string> => ({
      int4_bf16_only: '仅 INT4/BF16',
      no_8k1k_data: '无 8K/1K 数据',
      cannot_reach_at_tier: `无法达到 @${tier}`,
      no_exact_at_tier: `无精确 @${tier} 结果`,
    }),
    methodologyNote: '优先顺序：推测解码 FP4 → 推测解码 FP8 → 标准解码 FP4 → 标准解码 FP8。',
    costNote:
      '成本 = 3 年期租赁 $/GPU/小时 ÷ 每张已部署 GPU 的输出 tok/s。数值越低越好；% 为相对 B200 的差异。',
    costDeltaAria: (pct: string, cheaper: boolean) => `比 B200 ${cheaper ? '便宜' : '昂贵'} ${pct}`,
    normalizationNote: '分离式结果的分母同时计入预填充与解码 GPU。',
    interpolationNote:
      '各档位数值采用最佳观测平台服务包络线；≈ 表示根据已验证运行结果估算。不会外推。',
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
    cost: new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
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

function CellMissing({ hardware, reason }: { hardware: string; reason: string }) {
  return (
    <span
      data-testid="overview-pair-missing"
      data-hardware={hardware}
      title={reason}
      className="inline-flex items-baseline gap-1 text-muted-foreground"
    >
      <span aria-hidden="true">{'∞'}</span>
      <span className="sr-only">{reason}</span>
    </span>
  );
}

const COST_DELTA_SHADES = {
  cheaper: [
    'bg-emerald-500/10 text-emerald-600 dark:text-emerald-500',
    'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
    'bg-emerald-500/25 text-emerald-800 dark:text-emerald-300',
  ],
  pricier: [
    'bg-red-500/10 text-red-600 dark:text-red-500',
    'bg-red-500/15 text-red-700 dark:text-red-400',
    'bg-red-500/25 text-red-800 dark:text-red-300',
  ],
} as const;

function costDeltaClasses(pct: number): string {
  const magnitude = Math.abs(pct);
  const shade = magnitude >= 0.25 ? 2 : magnitude >= 0.1 ? 1 : 0;
  return COST_DELTA_SHADES[pct < 0 ? 'cheaper' : 'pricier'][shade];
}

function CostDeltaBadge({
  pct,
  hardware,
  formatters,
  strings,
}: {
  pct: number;
  hardware: string;
  formatters: Formatters;
  strings: OverviewStrings;
}) {
  const aria = strings.costDeltaAria(formatters.percentAbs.format(Math.abs(pct)), pct < 0);
  return (
    <span
      data-testid="overview-cost-delta"
      data-hardware={hardware}
      title={aria}
      className={`inline-flex items-center rounded-sm px-1 py-0.5 text-[10px] font-semibold tabular-nums ${costDeltaClasses(pct)}`}
    >
      <span aria-hidden="true">{formatters.percent.format(pct)}</span>
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
}: {
  locale: OverviewLocale;
  model: OverviewModelSummary;
  member: OverviewPlatformResult;
  formatters: Formatters;
  strings: OverviewStrings;
}) {
  const { value, config, evidenceDate, evidenceTopologies } = member.read;
  if (member.missingReason !== null || value === null || member.costPerMtok === null) {
    return <CellMissing hardware={member.hardware} reason={missingReasonCopy(member, strings)} />;
  }
  const precisionLabel = config?.precision.toUpperCase() ?? member.precision?.toUpperCase() ?? null;
  const stackBadge =
    config === null || precisionLabel === null
      ? null
      : [
          config.frameworkLabel,
          precisionLabel,
          member.decodeMode === 'standard' ? strings.standardDecode : null,
        ]
          .filter((part): part is string => part !== null)
          .join(' · ');
  const stack =
    config === null
      ? null
      : [
          member.hardwareLabel,
          config.frameworkLabel,
          config.precision.toUpperCase(),
          member.decodeMode === 'standard' ? strings.standardDecode : config.specLabel,
        ].join(' · ');
  const evidenceDateLabel =
    evidenceDate === null ? '' : formatEvidenceDate(formatters, evidenceDate);
  const formattedValue = formatters.cost.format(member.costPerMtok);
  const estimateExplanation = member.read.estimated
    ? strings.estimatedTooltip(evidenceTopologies)
    : undefined;
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-2 gap-y-0.5 text-sm">
      <span className="inline-flex min-w-0 items-baseline gap-1.5 justify-self-start">
        <span
          data-testid="overview-pair-value"
          data-hardware={member.hardware}
          title={estimateExplanation}
          className="min-w-0 font-semibold tabular-nums"
        >
          {estimateExplanation === undefined ? (
            formattedValue
          ) : (
            <>
              <span className="sr-only">
                {strings.estimatedAria(formattedValue, estimateExplanation)}
              </span>
              <span data-testid="overview-estimate-visible" aria-hidden="true">
                {'≈'}
                {formattedValue}
              </span>
            </>
          )}
        </span>
        {member.costVsB200Pct === null ? null : (
          <CostDeltaBadge
            pct={member.costVsB200Pct}
            hardware={member.hardware}
            formatters={formatters}
            strings={strings}
          />
        )}
      </span>
      {evidenceDate === null ? null : (
        <span
          data-testid="overview-pair-evidence-date"
          data-hardware={member.hardware}
          className="justify-self-end whitespace-nowrap text-xs text-muted-foreground/80 tabular-nums"
        >
          {config === null || stack === null ? (
            evidenceDateLabel
          ) : (
            <a
              href={buildOverviewDashboardHref(locale, model, config)}
              title={strings.rawDashboardAria(evidenceDateLabel, model.modelLabel, stack)}
              aria-label={strings.rawDashboardAria(evidenceDateLabel, model.modelLabel, stack)}
              className={RAW_SOURCE_LINK_CLASS}
            >
              {evidenceDateLabel}
              <ExternalLinkIcon aria-hidden="true" />
            </a>
          )}
        </span>
      )}
      {member.precision === null ? null : (
        <span className="col-span-2 min-w-0 text-[10px] leading-tight font-semibold uppercase tracking-wider text-muted-foreground">
          {config === null ? member.precision.toUpperCase() : stackBadge}
        </span>
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
}) {
  return (
    <div data-testid="overview-platform" data-hardware={props.platform.hardware}>
      <CellValue
        locale={props.locale}
        model={props.model}
        member={props.platform}
        formatters={props.formatters}
        strings={props.strings}
      />
    </div>
  );
}

function hasNoGlm8k1kResult(model: OverviewModelSummary): boolean {
  if (model.model !== 'GLM-5.2') return false;
  return (
    model.platforms.length > 0 &&
    model.platforms.every((platform) => platform.missingReason === 'no_8k1k_data')
  );
}

function ModelName({ model, strings }: { model: OverviewModelSummary; strings: OverviewStrings }) {
  return (
    <div className="space-y-1">
      <h2 className="text-sm font-semibold leading-snug">{model.modelLabel}</h2>
      {hasNoGlm8k1kResult(model) ? (
        <p
          data-testid="overview-model-coverage-note"
          className="text-xs leading-snug text-muted-foreground"
        >
          {strings.noGlm8k1k}
        </p>
      ) : null}
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
    <div className="hidden xl:block">
      <table
        data-testid="overview-desktop-matrix"
        className="w-full table-fixed border-collapse text-sm"
      >
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
              <th key={platform.hardware} scope="col" className="px-4 py-2 text-left font-semibold">
                {platform.hardwareLabel}
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
              <th scope="row" className="px-4 py-3 text-left align-top font-normal lg:px-6">
                <ModelName model={model} strings={strings} />
              </th>
              {model.platforms.map((platform) => (
                <td key={platform.hardware} className="px-4 py-3 align-top">
                  <PlatformCell
                    locale={locale}
                    model={model}
                    platform={platform}
                    formatters={formatters}
                    strings={strings}
                  />
                </td>
              ))}
              <td className="px-4 py-3 align-top">
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
            <div className="grid grid-cols-[84px_1fr] items-baseline gap-x-3 gap-y-1">
              {model.platforms.map((platform) => (
                <div key={platform.hardware} className="contents">
                  <span className="text-xs font-medium text-muted-foreground">
                    {platform.hardwareLabel}
                  </span>
                  <PlatformCell
                    locale={locale}
                    model={model}
                    platform={platform}
                    formatters={formatters}
                    strings={strings}
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
      <p>{strings.methodologyNote}</p>
      <p>{strings.costNote}</p>
      <p>{strings.normalizationNote}</p>
      <p>{strings.infinityLegend}</p>
      <p>{strings.interpolationNote}</p>
    </div>
  );
}
