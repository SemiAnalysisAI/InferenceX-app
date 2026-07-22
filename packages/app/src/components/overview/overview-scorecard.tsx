/**
 * @file overview-scorecard.tsx
 * @description The comparison surface itself. Desktop (a matrix at `xl`) and
 * mobile (stacked cards below `xl`) render the SAME per-model hierarchy from one
 * `ModelHierarchy` component, so the two surfaces cannot drift semantically.
 *
 * Each model reads top to bottom as: the primary precision's ranked hardware as
 * horizontal chips (@50), the secondary precision (a subordinate ranked block or
 * one compact coverage line), the @100 capability read, then a not-ranked line
 * that accounts for every remaining hardware with an explicit reason. Precisions
 * and incompatible cohorts are never compared across — each ranks only itself.
 */

import { Badge } from '@/components/ui/badge';
import {
  overviewHighValue,
  OVERVIEW_HIGH_TIER,
  OVERVIEW_PRIMARY_TIER,
  type OverviewComparisonGroup,
  type OverviewConfigResult,
  type OverviewHardwareStatus,
  type OverviewModelSummary,
  type OverviewNotRankedEntry,
} from '@/lib/overview-data';
import { detailHref } from '@/lib/overview-links';

import { OverviewDetailLink, OverviewDashboardLink } from './overview-detail-link';

export type OverviewLocale = 'en' | 'zh';

export const OVERVIEW_STRINGS = {
  en: {
    title: 'AI Inference Overview',
    purpose: 'Compare validated serving results across active models and hardware.',
    scope: `8K→1K · Single-turn · Output tok/s/GPU at ${OVERVIEW_PRIMARY_TIER} tok/s/user · Speculative decode only · FP4/FP8 by comparable coverage`,
    snapshot: (through: string) => `Database snapshot through ${through}`,
    modelHeader: 'Model',
    resultsHeader: 'Ranked results',
    detailsHeader: 'Details',
    caption: `Validated output tok/s/GPU per model and comparable cohort at ${OVERVIEW_PRIMARY_TIER} and ${OVERVIEW_HIGH_TIER} tok/s/user.`,
    cohort: (engine: string, mode: string) => `${engine} · ${mode}`,
    aggregated: 'Aggregated',
    disaggregated: 'Disaggregated',
    anyEngine: 'All engines',
    engineGroupLabels: {
      trt: 'TRTLLM family',
      sglang: 'SGLang/ATOM family',
      vllm: 'vLLM family',
    } as Record<string, string>,
    engineGroupFallback: (engineGroup: string) => `${engineGroup.toUpperCase()} family`,
    primaryHeading: (precision: string) => `${precision} · PRIMARY @${OVERVIEW_PRIMARY_TIER}`,
    secondaryHeading: (precision: string) => `${precision} @${OVERVIEW_PRIMARY_TIER}`,
    secondaryCoverage: (precision: string, list: string) =>
      `${precision} coverage: ${list} measured; insufficient comparable results.`,
    highHeading: `@${OVERVIEW_HIGH_TIER}`,
    leader: 'Leader',
    onlyExactResult: 'Only exact result',
    highLeader: (hardware: string, value: string) => `${hardware} · ${value}`,
    highLeaderSame: 'Same leader',
    leaderChange: 'Leader change',
    highInsufficient: `No exact read at ${OVERVIEW_HIGH_TIER} tok/s/user`,
    highNoPrimaryBaseline: `No ${OVERVIEW_PRIMARY_TIER} tok/s/user baseline`,
    evidenceHighDashboard: `Dashboard @${OVERVIEW_HIGH_TIER}`,
    evidenceDashboardAria: (model: string, config: string) =>
      `Open filtered dashboard: ${model} · ${config}`,
    evidenceHighAria: (model: string, config: string) =>
      `Open filtered dashboard @${OVERVIEW_HIGH_TIER} tok/s/user leader: ${model} · ${config}`,
    infinityLegend: '∞ = no comparable result',
    notRankedReasons: {
      standard_decode_only: 'standard decode only',
      int4_bf16_only: 'INT4/BF16 only',
      different_serving_cohort: 'different serving cohort',
      no_8k1k_data: 'no 8K/1K data',
      cannot_reach_at50: `cannot reach @${OVERVIEW_PRIMARY_TIER}`,
      no_exact_at50: `no exact @${OVERVIEW_PRIMARY_TIER} result`,
    } as Record<string, string>,
    otherPrecisionReason: (precisions: string[]) =>
      `${precisions.map((precision) => precision.toUpperCase()).join('/')} only`,
    joinList: (labels: string[]) =>
      labels.length <= 1
        ? (labels[0] ?? '')
        : `${labels.slice(0, -1).join(', ')} and ${labels.at(-1) ?? ''}`,
    methodologyNote:
      'Precisions and incompatible serving cohorts are ranked separately. The default precision maximizes comparable hardware coverage. Not ranked does not mean slower.',
    interpolationNote:
      'Tier values interpolate each configuration’s official Pareto frontier — no extrapolation.',
    cohortNote:
      'Engine families with different speculative-decode acceptance forcing, and aggregated versus disaggregated deployments, rank as separate cohorts — never against each other.',
    detailLink: 'View details',
    detailAria: (modelLabel: string) => `View details: ${modelLabel}`,
  },
  zh: {
    title: 'AI 推理总览',
    purpose: '对比活跃模型在不同硬件上的已验证服务结果。',
    scope: `8K→1K · 单轮 · ${OVERVIEW_PRIMARY_TIER} tok/s/user 下的输出 tok/s/GPU · 仅投机解码 · 按可比覆盖选择 FP4/FP8`,
    snapshot: (through: string) => `数据库快照截至 ${through}`,
    modelHeader: '模型',
    resultsHeader: '排名结果',
    detailsHeader: '详情',
    caption: `各模型与可对比分组在 ${OVERVIEW_PRIMARY_TIER} 与 ${OVERVIEW_HIGH_TIER} tok/s/user 下的已验证输出 tok/s/GPU。`,
    cohort: (engine: string, mode: string) => `${engine} · ${mode}`,
    aggregated: '聚合部署',
    disaggregated: '分离部署',
    anyEngine: '全部引擎',
    engineGroupLabels: {
      trt: 'TRTLLM 系列',
      sglang: 'SGLang/ATOM 系列',
      vllm: 'vLLM 系列',
    } as Record<string, string>,
    engineGroupFallback: (engineGroup: string) => `${engineGroup.toUpperCase()} 系列`,
    primaryHeading: (precision: string) => `${precision} · 主排名 @${OVERVIEW_PRIMARY_TIER}`,
    secondaryHeading: (precision: string) => `${precision} @${OVERVIEW_PRIMARY_TIER}`,
    secondaryCoverage: (precision: string, list: string) =>
      `${precision} 覆盖：已测量 ${list}；可比结果不足。`,
    highHeading: `@${OVERVIEW_HIGH_TIER}`,
    leader: '领先',
    onlyExactResult: '唯一精确读数',
    highLeader: (hardware: string, value: string) => `${hardware} · ${value}`,
    highLeaderSame: '领先者相同',
    leaderChange: '领先者变化',
    highInsufficient: `${OVERVIEW_HIGH_TIER} tok/s/user 下无精确读数`,
    highNoPrimaryBaseline: `无 ${OVERVIEW_PRIMARY_TIER} tok/s/user 基线`,
    evidenceHighDashboard: `仪表板 @${OVERVIEW_HIGH_TIER}`,
    evidenceDashboardAria: (model: string, config: string) =>
      `打开筛选后的仪表板：${model} · ${config}`,
    evidenceHighAria: (model: string, config: string) =>
      `打开筛选后的仪表板 @${OVERVIEW_HIGH_TIER} tok/s/user：${model} · ${config}`,
    infinityLegend: '∞ = 无可比结果',
    notRankedReasons: {
      standard_decode_only: '仅标准解码',
      int4_bf16_only: '仅 INT4/BF16',
      different_serving_cohort: '不同服务配置',
      no_8k1k_data: '无 8K/1K 数据',
      cannot_reach_at50: `无法达到 @${OVERVIEW_PRIMARY_TIER}`,
      no_exact_at50: `无精确 @${OVERVIEW_PRIMARY_TIER} 结果`,
    } as Record<string, string>,
    otherPrecisionReason: (precisions: string[]) =>
      `仅 ${precisions.map((precision) => precision.toUpperCase()).join('/')}`,
    joinList: (labels: string[]) => labels.join('、'),
    methodologyNote:
      '不同精度和不可直接比较的服务配置将分别排名。默认精度优先覆盖更多可比较硬件。未参与排名不代表性能更低。',
    interpolationNote: '各档位数据基于各配置官方 Pareto 前沿插值；不进行外推。',
    cohortNote:
      '投机解码接受率强制方式不同的引擎系列，以及聚合与分离部署，按独立分组排名，彼此之间不作比较。',
    detailLink: '查看详情',
    detailAria: (modelLabel: string) => `查看详情：${modelLabel}`,
  },
} as const;

export type OverviewStrings = (typeof OVERVIEW_STRINGS)[OverviewLocale];

interface Formatters {
  number: Intl.NumberFormat;
  signed: Intl.NumberFormat;
  date: (date: string) => string;
  shortDate: (date: string) => string;
}

export function overviewFormatters(locale: OverviewLocale): Formatters {
  const tag = locale === 'zh' ? 'zh-CN' : 'en-US';
  const dateFormat = new Intl.DateTimeFormat(tag, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const shortDateFormat = new Intl.DateTimeFormat(tag, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  return {
    number: new Intl.NumberFormat(tag, { maximumFractionDigits: 0 }),
    signed: new Intl.NumberFormat(tag, { maximumFractionDigits: 0, signDisplay: 'exceptZero' }),
    date: (date) => dateFormat.format(new Date(`${date}T00:00:00Z`)),
    shortDate: (date) => shortDateFormat.format(new Date(`${date}T00:00:00Z`)),
  };
}

/**
 * A result's evidence dates, localized: a single day (`Jul 6` / `7月6日`) when
 * both backing frontier points share a date, else an en-dash range
 * (`Jun 24–Jul 4`). Null when the value has no backing date.
 */
function formatEvidenceDate(
  formatters: Formatters,
  evidenceDate: { from: string; to: string } | null,
): string | null {
  if (evidenceDate === null) return null;
  const from = formatters.shortDate(evidenceDate.from);
  return evidenceDate.from === evidenceDate.to
    ? from
    : `${from}–${formatters.shortDate(evidenceDate.to)}`;
}

function cohortLabel(
  group: OverviewComparisonGroup,
  strings: OverviewStrings,
  showDbModel: boolean,
): string {
  const engine =
    group.engineGroup === null
      ? strings.anyEngine
      : (strings.engineGroupLabels[group.engineGroup] ??
        strings.engineGroupFallback(group.engineGroup));
  const mode =
    group.deploymentMode === 'disaggregated' ? strings.disaggregated : strings.aggregated;
  const label = strings.cohort(engine, mode);
  // Point releases of one display model rank in separate cohorts; name the raw
  // db model so two same-engine, same-mode cohorts are told apart.
  return showDbModel ? `${label} · ${group.dbModel}` : label;
}

/** Cohorts with at least one exact @50 read — the ones that render ranked chips. */
function rankedCohorts(groups: readonly OverviewComparisonGroup[]): OverviewComparisonGroup[] {
  return groups.filter((group) => group.primaryRanking.state !== 'insufficient_coverage');
}

/** A cohort's hardware that hold an exact @50 read, leader first then value desc. */
function rankedStatuses(group: OverviewComparisonGroup): OverviewHardwareStatus[] {
  return group.hardwareStatuses
    .filter((status) => status.isPrimaryLeader || status.primaryDeltaPercent !== null)
    .toSorted((a, b) => (b.primary.value ?? -1) - (a.primary.value ?? -1));
}

/** Not-ranked reason copy; `other_precision_only` names the measured precisions. */
function notRankedReason(entry: OverviewNotRankedEntry, strings: OverviewStrings): string {
  return entry.reason === 'other_precision_only'
    ? strings.otherPrecisionReason(entry.precisions)
    : strings.notRankedReasons[entry.reason];
}

/** The exact deployment topology of a ranked configuration, for an aria-label. */
function evidenceConfigLabel(
  config: OverviewConfigResult,
  strings: OverviewStrings,
  showDbModel: boolean,
): string {
  return [
    config.hardwareLabel,
    config.precision.toUpperCase(),
    config.frameworkLabel,
    config.specLabel,
    config.disagg ? strings.disaggregated : strings.aggregated,
    config.parallelism,
    `${config.totalGpu} GPU`,
    ...(showDbModel ? [config.dbModel] : []),
  ].join(' · ');
}

const BLOCK_HEADING_CLASS =
  'mb-0.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground';
const SUBORDINATE_HEADING_CLASS =
  'mb-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80';

/**
 * One ranked hardware: its label, its @50 value linking to the filtered
 * dashboard, and its standing — `Leader`, its signed delta against the leader,
 * or `Only exact result` when it is the cohort's lone exact read.
 */
function RankedChip({
  locale,
  model,
  group,
  status,
  multiDbModel,
  formatters,
  strings,
}: {
  locale: OverviewLocale;
  model: OverviewModelSummary;
  group: OverviewComparisonGroup;
  status: OverviewHardwareStatus;
  multiDbModel: boolean;
  formatters: Formatters;
  strings: OverviewStrings;
}) {
  const { value, config } = status.primary;
  const standing = status.isPrimaryLeader
    ? group.primaryRanking.state === 'single_measured'
      ? strings.onlyExactResult
      : strings.leader
    : `${formatters.signed.format(status.primaryDeltaPercent as number)}%`;
  const date = formatEvidenceDate(formatters, status.primary.evidenceDate);
  return (
    <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
      <span className="font-medium">{status.hardwareLabel}</span>
      {value === null ? null : config === null ? (
        <span className="text-sm font-semibold tabular-nums">
          {formatters.number.format(value)}
        </span>
      ) : (
        <OverviewDashboardLink
          locale={locale}
          model={model}
          config={config}
          ariaLabel={strings.evidenceDashboardAria(
            model.modelLabel,
            evidenceConfigLabel(config, strings, multiDbModel),
          )}
        >
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {formatters.number.format(value)}
          </span>
        </OverviewDashboardLink>
      )}
      <span className="text-xs text-muted-foreground tabular-nums">· {standing}</span>
      {date === null ? null : (
        <span className="text-xs text-muted-foreground/80 tabular-nums">· {date}</span>
      )}
    </p>
  );
}

/** A precision's ranked cohorts as stacked chips, under one heading. */
function RankedSection({
  locale,
  model,
  cohorts,
  heading,
  headingClass,
  formatters,
  strings,
}: {
  locale: OverviewLocale;
  model: OverviewModelSummary;
  cohorts: OverviewComparisonGroup[];
  heading: string;
  headingClass: string;
  formatters: Formatters;
  strings: OverviewStrings;
}) {
  if (cohorts.length === 0) return null;
  const multiDbModel = new Set(cohorts.map((group) => group.dbModel)).size > 1;
  return (
    <div>
      <p className={headingClass}>{heading}</p>
      {cohorts.map((group) => (
        <div key={group.id} className="space-y-0.5">
          {cohorts.length > 1 ? (
            <p className="text-xs text-muted-foreground">
              {cohortLabel(group, strings, multiDbModel)}
            </p>
          ) : null}
          {rankedStatuses(group).map((status) => (
            <RankedChip
              key={status.hardware}
              locale={locale}
              model={model}
              group={group}
              status={status}
              multiDbModel={multiDbModel}
              formatters={formatters}
              strings={strings}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** The primary precision block: its heading names the precision and the tier. */
function PrimarySection({
  locale,
  model,
  cohorts,
  formatters,
  strings,
}: {
  locale: OverviewLocale;
  model: OverviewModelSummary;
  cohorts: OverviewComparisonGroup[];
  formatters: Formatters;
  strings: OverviewStrings;
}) {
  const precision = (model.selectedPrecision ?? '').toUpperCase();
  return (
    <RankedSection
      locale={locale}
      model={model}
      cohorts={cohorts}
      heading={strings.primaryHeading(precision)}
      headingClass={BLOCK_HEADING_CLASS}
      formatters={formatters}
      strings={strings}
    />
  );
}

/**
 * The secondary precision, subordinate to the primary: a ranked block when it
 * genuinely adds comparable hardware, otherwise one compact coverage line so the
 * precision still surfaces without a second full table.
 */
function SecondarySection({
  locale,
  model,
  formatters,
  strings,
}: {
  locale: OverviewLocale;
  model: OverviewModelSummary;
  formatters: Formatters;
  strings: OverviewStrings;
}) {
  const secondary = model.secondary;
  if (secondary === null) return null;
  const precision = secondary.precision.toUpperCase();
  if (secondary.state === 'coverage') {
    const list = strings.joinList(secondary.measuredHardware);
    if (list === '') return null;
    return (
      <p className="text-xs text-muted-foreground">{strings.secondaryCoverage(precision, list)}</p>
    );
  }
  return (
    <RankedSection
      locale={locale}
      model={model}
      cohorts={rankedCohorts(secondary.comparisonGroups)}
      heading={strings.secondaryHeading(precision)}
      headingClass={SUBORDINATE_HEADING_CLASS}
      formatters={formatters}
      strings={strings}
    />
  );
}

/**
 * The 100 tok/s/user read of one cohort. It is ranked from its own evidence, so
 * it names its own leader and says plainly whether that leader changed.
 */
function HighTierRead({
  group,
  formatters,
  strings,
}: {
  group: OverviewComparisonGroup;
  formatters: Formatters;
  strings: OverviewStrings;
}) {
  const leader = group.highRanking.leader;
  const value = leader === null ? null : overviewHighValue(leader);
  if (leader === null || value === null) {
    return <span className="text-xs text-muted-foreground">{strings.highInsufficient}</span>;
  }
  // The @100 leader's own read date — from its hardware's high read, so a @100
  // read backed by a different config than the @50 leader shows its own date.
  const date = formatEvidenceDate(
    formatters,
    group.hardwareStatuses.find((status) => status.hardware === leader.hardware)?.high
      .evidenceDate ?? null,
  );
  return (
    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className="tabular-nums">
        {strings.highLeader(leader.hardwareLabel, formatters.number.format(value))}
      </span>
      {group.highRanking.state === 'single_measured' ? (
        <span className="text-xs text-muted-foreground">{strings.onlyExactResult}</span>
      ) : group.highLeaderTransition === 'changed_hardware' ? (
        <Badge
          variant="outline"
          className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:border-amber-400/30 dark:text-amber-400"
          title={strings.leaderChange}
        >
          {strings.leaderChange}
        </Badge>
      ) : group.highLeaderTransition === 'no_primary_baseline' ? (
        <span className="text-xs text-muted-foreground">{strings.highNoPrimaryBaseline}</span>
      ) : (
        <span className="text-xs text-muted-foreground">{strings.highLeaderSame}</span>
      )}
      {date === null ? null : (
        <span className="text-xs text-muted-foreground/80 tabular-nums">· {date}</span>
      )}
    </span>
  );
}

/**
 * The @100 capability read per comparable cohort. When the @100 leader runs a
 * different configuration than the @50 leader, its own filtered dashboard rides
 * along so the high-tier read ships with the evidence behind it.
 */
function HighSection({
  locale,
  model,
  cohorts,
  formatters,
  strings,
}: {
  locale: OverviewLocale;
  model: OverviewModelSummary;
  cohorts: OverviewComparisonGroup[];
  formatters: Formatters;
  strings: OverviewStrings;
}) {
  const highCohorts = cohorts.filter((group) => group.primaryRanking.state === 'comparable');
  if (highCohorts.length === 0) return null;
  const multiDbModel = new Set(highCohorts.map((group) => group.dbModel)).size > 1;
  return (
    <div>
      <p className={BLOCK_HEADING_CLASS}>{strings.highHeading}</p>
      {highCohorts.map((group) => {
        const primaryLeader = group.primaryRanking.leader;
        const highLeader = group.highRanking.leader;
        return (
          <div key={group.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm">
            {highCohorts.length > 1 ? (
              <span className="text-xs text-muted-foreground">
                {cohortLabel(group, strings, multiDbModel)}
              </span>
            ) : null}
            <HighTierRead group={group} formatters={formatters} strings={strings} />
            {highLeader !== null &&
            (primaryLeader === null || highLeader.key !== primaryLeader.key) ? (
              <OverviewDashboardLink
                locale={locale}
                model={model}
                config={highLeader}
                ariaLabel={strings.evidenceHighAria(
                  model.modelLabel,
                  evidenceConfigLabel(highLeader, strings, multiDbModel),
                )}
              >
                {strings.evidenceHighDashboard}
              </OverviewDashboardLink>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Every remaining hardware, accounted for in one line: those with no exact @50
 * read and not ranked by the secondary block, each with its explicit reason. The
 * standing note "not ranked does not mean slower" lives once in the methodology.
 */
function NotRankedLine({
  model,
  strings,
}: {
  model: OverviewModelSummary;
  strings: OverviewStrings;
}) {
  // Hardware already named by the secondary section — its ranked rows or its
  // coverage 'measured' list — is not repeated here; dedup against the secondary's
  // measured labels so each hardware surfaces in exactly one place.
  const secondaryMeasured = new Set(model.secondary?.measuredHardware);
  const entries = model.notRanked.filter((entry) => !secondaryMeasured.has(entry.hardwareLabel));
  if (entries.length === 0) return null;
  // ∞ marks missing/unavailable only — it never enters ranking or gap math, so it
  // must never render with a percent. The reason rides in title/aria; the page
  // footer carries the legend.
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
      {entries.map((entry) => {
        const reason = notRankedReason(entry, strings);
        return (
          <span
            key={entry.hardware}
            title={reason}
            aria-label={`${entry.hardwareLabel}: ${reason}`}
          >
            {entry.hardwareLabel} <span aria-hidden="true">∞</span>
          </span>
        );
      })}
    </p>
  );
}

/** The full per-model hierarchy, identical on both surfaces. */
function ModelHierarchy({
  locale,
  model,
  formatters,
  strings,
}: {
  locale: OverviewLocale;
  model: OverviewModelSummary;
  formatters: Formatters;
  strings: OverviewStrings;
}) {
  const cohorts = rankedCohorts(model.comparisonGroups);
  return (
    <div className="space-y-2 text-sm">
      <PrimarySection
        locale={locale}
        model={model}
        cohorts={cohorts}
        formatters={formatters}
        strings={strings}
      />
      <SecondarySection locale={locale} model={model} formatters={formatters} strings={strings} />
      <HighSection
        locale={locale}
        model={model}
        cohorts={cohorts}
        formatters={formatters}
        strings={strings}
      />
      <NotRankedLine model={model} strings={strings} />
    </div>
  );
}

/**
 * The model's name and — for a coverage-only model that shows no ranked chips —
 * its freshness. A ranked model dates each result on its own chip instead, so
 * the model-level date is only the fallback for a model with nothing to rank.
 */
function ModelIdentity({
  model,
  formatters,
}: {
  model: OverviewModelSummary;
  formatters: Formatters;
}) {
  const hasRankedResults =
    rankedCohorts(model.comparisonGroups).length > 0 || model.secondary?.state === 'ranked';
  const freshness =
    hasRankedResults || model.latestWorkloadDate === null
      ? null
      : formatters.date(model.latestWorkloadDate);
  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
      <h2 className="text-sm font-semibold leading-snug">{model.modelLabel}</h2>
      {freshness ? (
        <span className="text-xs text-muted-foreground tabular-nums">{freshness}</span>
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

/** Model column plus one content column carrying the full hierarchy; no scroll. */
export function DesktopOverviewMatrix({ models, locale, formatters, strings }: SurfaceProps) {
  return (
    <div className="hidden xl:block">
      <table
        data-testid="overview-desktop-matrix"
        className="w-full table-fixed border-collapse text-sm"
      >
        <caption className="sr-only">{strings.caption}</caption>
        <colgroup>
          <col className="w-[18%]" />
          <col className="w-[70%]" />
          <col className="w-[12%]" />
        </colgroup>
        <thead>
          <tr className="border-b border-border/50 text-xs uppercase tracking-wider text-muted-foreground">
            <th scope="col" className="px-4 py-2 text-left font-semibold lg:px-6">
              {strings.modelHeader}
            </th>
            <th scope="col" className="px-4 py-2 text-left font-semibold">
              {strings.resultsHeader}
            </th>
            <th scope="col" className="px-4 py-2 text-left font-semibold">
              {strings.detailsHeader}
            </th>
          </tr>
        </thead>
        {models.map((model) => (
          <tbody
            key={model.model}
            data-testid="overview-desktop-model"
            data-model={model.model}
            className="border-b border-border/50 last:border-b-0"
          >
            <tr className="align-top">
              <th scope="row" className="px-4 py-3 text-left align-top font-normal lg:px-6">
                <ModelIdentity model={model} formatters={formatters} />
              </th>
              <td className="px-4 py-3">
                <ModelHierarchy
                  locale={locale}
                  model={model}
                  formatters={formatters}
                  strings={strings}
                />
              </td>
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
          </tbody>
        ))}
      </table>
    </div>
  );
}

/** Below `xl`: the same hierarchy stacked as cards, always fully visible. */
export function MobileOverviewList({ models, locale, formatters, strings }: SurfaceProps) {
  return (
    <ul data-testid="overview-mobile-list" className="divide-y divide-border/50 xl:hidden">
      {models.map((model) => (
        <li key={model.model}>
          <article
            data-testid="overview-mobile-model"
            data-model={model.model}
            className="space-y-2 px-4 py-3"
          >
            <ModelIdentity model={model} formatters={formatters} />
            <ModelHierarchy
              locale={locale}
              model={model}
              formatters={formatters}
              strings={strings}
            />
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

export function OverviewMethodology({ strings }: { strings: OverviewStrings }) {
  return (
    <div className="space-y-1 border-t border-border/50 px-4 py-3 text-xs leading-snug text-muted-foreground lg:px-6">
      <p>{strings.methodologyNote}</p>
      <p>{strings.infinityLegend}</p>
      <p>{strings.cohortNote}</p>
      <p>{strings.interpolationNote}</p>
    </div>
  );
}
