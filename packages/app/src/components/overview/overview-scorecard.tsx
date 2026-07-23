import {
  OVERVIEW_HIGH_TIER,
  OVERVIEW_TIERS,
  type OverviewHeadlinePairComparison,
  type OverviewHeadlinePairMember,
  type OverviewModelSummary,
  type OverviewTier,
} from '@/lib/overview-data';
import { buildOverviewDashboardHref, detailHref, overviewTierHref } from '@/lib/overview-links';

import { OverviewDetailLink } from './overview-detail-link';

export type OverviewLocale = 'en' | 'zh';

export const OVERVIEW_STRINGS = {
  en: {
    title: 'AI Inference Overview',
    purpose: 'Every active model across MI355X, B200, B300, GB200 and GB300 at a glance.',
    scope: (tier: number) =>
      `8K→1K · Single-turn · Output tok/s/GPU @${tier} tok/s/user · Speculative decode only · Best validated stack per platform`,
    tierNavLabel: 'Service level',
    tierUnit: 'tok/s/user',
    snapshot: (through: string) => `Database snapshot through ${through}`,
    caption:
      "Best validated serving results for every active model across today's key platforms, each compared with B200.",
    modelHeader: 'Model',
    detailsHeader: 'Details',
    detailLink: 'View details',
    detailAria: (modelLabel: string) => `View details: ${modelLabel}`,
    dashboardAria: (modelLabel: string, stack: string) =>
      `Open filtered dashboard: ${modelLabel} · ${stack}`,
    delta: (signedPct: string) => `${signedPct} vs B200`,
    precisionMismatch: (candidatePrecision: string, baselinePrecision: string) =>
      `${candidatePrecision.toUpperCase()} vs ${baselinePrecision.toUpperCase()} · no comparable delta`,
    versionMismatch: 'Different releases · no comparable delta',
    highLeadChanged: (leaderLabel: string) => `At ${OVERVIEW_HIGH_TIER}, ${leaderLabel} leads`,
    infinityLegend: '∞ = no comparable result',
    missingReasons: (tier: number): Record<string, string> => ({
      standard_decode_only: 'standard decode only',
      int4_bf16_only: 'INT4/BF16 only',
      no_8k1k_data: 'no 8K/1K data',
      cannot_reach_at_tier: `cannot reach @${tier}`,
      no_exact_at_tier: `no exact @${tier} result`,
    }),
    methodologyNote:
      "Each cell shows the platform's best validated speculative-decode serving configuration for that model, labeled with its precision. Deltas against B200 compare only same-precision, same-release results — FP4 is never measured against FP8. Results compare complete serving stacks rather than isolated silicon.",
    interpolationNote:
      'Tier values interpolate each configuration’s official Pareto frontier — no extrapolation.',
  },
  zh: {
    title: 'AI 推理总览',
    purpose: '一眼对比各活跃模型在 MI355X、B200、B300、GB200 与 GB300 上的表现。',
    scope: (tier: number) =>
      `8K→1K · 单轮 · 每 GPU 输出 tok/s @${tier} tok/s/用户 · 仅推测解码 · 各平台最佳验证配置`,
    tierNavLabel: '服务档位',
    tierUnit: 'tok/s/用户',
    snapshot: (through: string) => `数据库快照截至 ${through}`,
    caption: '各活跃模型在关键平台上的最佳验证服务结果，均与 B200 对比。',
    modelHeader: '模型',
    detailsHeader: '详情',
    detailLink: '查看详情',
    detailAria: (modelLabel: string) => `查看详情：${modelLabel}`,
    dashboardAria: (modelLabel: string, stack: string) =>
      `打开筛选后的仪表板：${modelLabel} · ${stack}`,
    delta: (signedPct: string) => `相对 B200 ${signedPct}`,
    precisionMismatch: (candidatePrecision: string, baselinePrecision: string) =>
      `${candidatePrecision.toUpperCase()} 与 ${baselinePrecision.toUpperCase()} · 无可比差值`,
    versionMismatch: '版本不同 · 无可比差值',
    highLeadChanged: (leaderLabel: string) => `${OVERVIEW_HIGH_TIER} 档由 ${leaderLabel} 领先`,
    infinityLegend: '∞ = 无可比结果',
    missingReasons: (tier: number): Record<string, string> => ({
      standard_decode_only: '仅标准解码',
      int4_bf16_only: '仅 INT4/BF16',
      no_8k1k_data: '无 8K/1K 数据',
      cannot_reach_at_tier: `无法达到 @${tier}`,
      no_exact_at_tier: `无精确 @${tier} 结果`,
    }),
    methodologyNote:
      '每格展示该平台在该模型上表现最好的已验证推测解码服务配置，并标注精度。相对 B200 的差值只在同精度、同版本结果之间计算——绝不将 FP4 与 FP8 互比。对比对象是完整服务栈，而非单独的芯片。',
    interpolationNote: '各档位数据基于各配置官方 Pareto 前沿插值；不进行外推。',
  },
} as const;

export type OverviewStrings = (typeof OVERVIEW_STRINGS)[OverviewLocale];

interface Formatters {
  number: Intl.NumberFormat;
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
    number: new Intl.NumberFormat(tag, { maximumFractionDigits: 0 }),
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

function missingReasonCopy(member: OverviewHeadlinePairMember, strings: OverviewStrings): string {
  const reason = member.missingReason;
  return reason === null ? '' : strings.missingReasons(member.read.tier)[reason];
}

function signedPercent(formatters: Formatters, percent: number): string {
  const rounded = Math.round(percent);
  const sign = rounded < 0 ? '−' : '+';
  return `${sign}${formatters.number.format(Math.abs(rounded))}%`;
}

/** Rendered only when the @100 leader flips; the data layer nulls it on the 100 view. */
function highLeadLine(
  pair: OverviewHeadlinePairComparison,
  strings: OverviewStrings,
): string | null {
  if (pair.highLeaderTransition !== 'changed_hardware') return null;
  const candidateHigh = pair.candidate.highRead.value;
  const baselineHigh = pair.baseline.highRead.value;
  if (candidateHigh === null || baselineHigh === null) return null;
  const leaderLabel =
    candidateHigh > baselineHigh ? pair.candidate.hardwareLabel : pair.baseline.hardwareLabel;
  return strings.highLeadChanged(leaderLabel);
}

const PAIR_VALUE_LINK_CLASS =
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

function CellValue({
  locale,
  model,
  member,
  formatters,
  strings,
}: {
  locale: OverviewLocale;
  model: OverviewModelSummary;
  member: OverviewHeadlinePairMember;
  formatters: Formatters;
  strings: OverviewStrings;
}) {
  const { value, config, evidenceDate } = member.read;
  if (member.missingReason !== null || value === null) {
    return <CellMissing hardware={member.hardware} reason={missingReasonCopy(member, strings)} />;
  }
  // Framework and precision stay visible; the spec method rides the title/aria only.
  const stack =
    config === null
      ? null
      : `${member.hardwareLabel} · ${config.frameworkLabel} · ${config.precision.toUpperCase()} · ${config.specLabel}`;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
      <span
        data-testid="overview-pair-value"
        data-hardware={member.hardware}
        className="font-semibold tabular-nums"
      >
        {config === null || stack === null ? (
          formatters.number.format(value)
        ) : (
          <a
            href={buildOverviewDashboardHref(locale, model, config)}
            title={stack}
            aria-label={strings.dashboardAria(model.modelLabel, stack)}
            className={PAIR_VALUE_LINK_CLASS}
          >
            {formatters.number.format(value)}
          </a>
        )}
      </span>
      {member.precision === null ? null : (
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {config === null
            ? member.precision.toUpperCase()
            : `${config.frameworkLabel} · ${config.precision.toUpperCase()}`}
        </span>
      )}
      {evidenceDate === null ? null : (
        <span
          data-testid="overview-pair-evidence-date"
          data-hardware={member.hardware}
          className="text-xs text-muted-foreground/80 tabular-nums"
        >
          {formatEvidenceDate(formatters, evidenceDate)}
        </span>
      )}
    </div>
  );
}

function BaselineCell(props: {
  locale: OverviewLocale;
  model: OverviewModelSummary;
  member: OverviewHeadlinePairMember;
  formatters: Formatters;
  strings: OverviewStrings;
}) {
  return (
    <div data-testid="overview-baseline" data-hardware={props.member.hardware}>
      <CellValue {...props} />
    </div>
  );
}

function CandidateCell({
  locale,
  model,
  pair,
  formatters,
  strings,
}: {
  locale: OverviewLocale;
  model: OverviewModelSummary;
  pair: OverviewHeadlinePairComparison;
  formatters: Formatters;
  strings: OverviewStrings;
}) {
  const highLine = highLeadLine(pair, strings);
  return (
    <div data-testid="overview-pair" data-pair={pair.id} className="space-y-1">
      <CellValue
        locale={locale}
        model={model}
        member={pair.candidate}
        formatters={formatters}
        strings={strings}
      />
      {pair.directDeltaPercent === null ? null : (
        <p
          data-testid="overview-pair-delta"
          className="text-xs font-medium tabular-nums text-foreground"
        >
          {strings.delta(signedPercent(formatters, pair.directDeltaPercent))}
        </p>
      )}
      {pair.deltaUnavailableReason === null ? null : (
        <p data-testid="overview-pair-mismatch" className="text-xs text-muted-foreground">
          {pair.deltaUnavailableReason === 'precision_mismatch'
            ? strings.precisionMismatch(
                pair.candidate.precision ?? '',
                pair.baseline.precision ?? '',
              )
            : strings.versionMismatch}
        </p>
      )}
      {highLine === null ? null : <p className="text-xs text-muted-foreground">{highLine}</p>}
    </div>
  );
}

function ModelName({ model }: { model: OverviewModelSummary }) {
  return <h2 className="text-sm font-semibold leading-snug">{model.modelLabel}</h2>;
}

interface SurfaceProps {
  models: OverviewModelSummary[];
  locale: OverviewLocale;
  formatters: Formatters;
  strings: OverviewStrings;
}

export function DesktopOverviewMatrix({ models, locale, formatters, strings }: SurfaceProps) {
  const headlinePairs = models[0]?.headlinePairs ?? [];
  const baselineHeader = headlinePairs[0]?.baseline.hardwareLabel ?? null;
  return (
    <div className="hidden xl:block">
      <table
        data-testid="overview-desktop-matrix"
        className="w-full table-fixed border-collapse text-sm"
      >
        <caption className="sr-only">{strings.caption}</caption>
        <colgroup>
          <col className="w-[17%]" />
          {baselineHeader === null ? null : <col className="w-[13%]" />}
          {headlinePairs.map((pair) => (
            <col key={pair.id} className="w-[13.5%]" />
          ))}
          <col className="w-[12%]" />
        </colgroup>
        <thead>
          <tr className="border-b border-border/50 text-xs uppercase tracking-wider text-muted-foreground">
            <th scope="col" className="px-4 py-2 text-left font-semibold lg:px-6">
              {strings.modelHeader}
            </th>
            {baselineHeader === null ? null : (
              <th scope="col" className="px-4 py-2 text-left font-semibold">
                {baselineHeader}
              </th>
            )}
            {headlinePairs.map((pair) => (
              <th key={pair.id} scope="col" className="px-4 py-2 text-left font-semibold">
                {pair.candidate.hardwareLabel}
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
                <ModelName model={model} />
              </th>
              {model.headlinePairs[0] === undefined ? null : (
                <td className="px-4 py-3 align-top">
                  <BaselineCell
                    locale={locale}
                    model={model}
                    member={model.headlinePairs[0].baseline}
                    formatters={formatters}
                    strings={strings}
                  />
                </td>
              )}
              {model.headlinePairs.map((pair) => (
                <td key={pair.id} className="px-4 py-3 align-top">
                  <CandidateCell
                    locale={locale}
                    model={model}
                    pair={pair}
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
            <ModelName model={model} />
            <div className="grid grid-cols-[84px_1fr] items-baseline gap-x-3 gap-y-1">
              {model.headlinePairs[0] === undefined ? null : (
                <>
                  <span className="text-xs font-medium text-muted-foreground">
                    {model.headlinePairs[0].baseline.hardwareLabel}
                  </span>
                  <BaselineCell
                    locale={locale}
                    model={model}
                    member={model.headlinePairs[0].baseline}
                    formatters={formatters}
                    strings={strings}
                  />
                </>
              )}
              {model.headlinePairs.map((pair) => (
                <div key={pair.id} className="contents">
                  <span className="text-xs font-medium text-muted-foreground">
                    {pair.candidate.hardwareLabel}
                  </span>
                  <CandidateCell
                    locale={locale}
                    model={model}
                    pair={pair}
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
  locale,
  strings,
}: {
  tier: OverviewTier;
  locale: OverviewLocale;
  strings: OverviewStrings;
}) {
  const optionClass = 'px-3 py-1.5 tabular-nums';
  return (
    <nav
      data-testid="overview-tier-switcher"
      aria-label={strings.tierNavLabel}
      className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"
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
              href={overviewTierHref(locale, option)}
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

export function OverviewMethodology({ strings }: { strings: OverviewStrings }) {
  return (
    <div className="space-y-1 border-t border-border/50 px-4 py-3 text-xs leading-snug text-muted-foreground lg:px-6">
      <p>{strings.methodologyNote}</p>
      <p>{strings.infinityLegend}</p>
      <p>{strings.interpolationNote}</p>
    </div>
  );
}
