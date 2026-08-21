'use client';

import { type ComponentPropsWithoutRef, useEffect, useRef } from 'react';

import {
  OVERVIEW_DEFAULT_HISTORY_WINDOW,
  OVERVIEW_DEFAULT_REFERENCE_HARDWARE,
  OVERVIEW_DEFAULT_ROW_SCOPE,
  OVERVIEW_HARDWARE,
  OVERVIEW_HISTORY_WINDOW_DAYS,
  OVERVIEW_HISTORY_WINDOWS,
  OVERVIEW_TIERS,
  overviewHardwareLabel,
  type OverviewComparisonMode,
  type OverviewEngineScope,
  type OverviewHardwareRowScope,
  type OverviewHistoricalComparison,
  type OverviewModelScope,
  type OverviewModelSummary,
  type OverviewPlatformResult,
  type OverviewReferenceHardware,
  type OverviewRowScope,
  type OverviewTier,
} from '@/lib/overview-data';
import {
  buildOverviewDashboardHref,
  buildOverviewHistoryDashboardHref,
  detailHref,
  overviewEngineScopeHref,
  overviewHref,
  overviewTierHref,
} from '@/lib/overview-links';

import { OverviewDetailLink } from './overview-detail-link';
import { OverviewHistoryDetailLink } from './overview-history-detail-link';
import { OverviewHistoryWindowSelect } from './overview-history-window-select';
import { OverviewNavLink } from './overview-nav-link';
import { type OverviewNavControl, useOverviewNavigation } from './overview-navigation';
import { OverviewReferenceSelect } from './overview-reference-select';
import { type OverviewLocale, type OverviewStrings } from './overview-strings';

interface Formatters {
  cost: Intl.NumberFormat;
  percent: Intl.NumberFormat;
  percentAbs: Intl.NumberFormat;
  shortDate: (date: string) => string;
}

function buildOverviewFormatters(locale: OverviewLocale): Formatters {
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

/** Built once per locale. Constructing ICU formatters is not free and the page
 *  body calls this on every render; the inputs are two fixed locales. */
const FORMATTER_CACHE = new Map<OverviewLocale, Formatters>();

export function overviewFormatters(locale: OverviewLocale): Formatters {
  let cached = FORMATTER_CACHE.get(locale);
  if (cached === undefined) {
    cached = buildOverviewFormatters(locale);
    FORMATTER_CACHE.set(locale, cached);
  }
  return cached;
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

/** No result for this GPU. The reason reads as visible text, mirroring the
 *  stack line on a populated cell — a `title` tooltip reaches neither keyboard
 *  nor touch users, and this is the only per-cell string with no other surface. */
function CellMissing({ hardware, reason }: { hardware: string; reason: string }) {
  return (
    <div
      data-testid="overview-pair-missing"
      data-hardware={hardware}
      className="min-w-0 space-y-0.5 text-sm text-muted-foreground"
    >
      <span>{'—'}</span>
      {reason === '' ? null : (
        <div className="min-w-0 text-[11px] leading-tight font-normal text-muted-foreground/70">
          {reason}
        </div>
      )}
    </div>
  );
}

/** Deltas inside this band read as parity, not polarity. */
const COST_DELTA_NEUTRAL_BAND = 0.05;
/** Magnitudes at or beyond this saturate the shade ramp. */
const COST_DELTA_SATURATION = 0.5;
// Missing comparison evidence is neutral gray, never red/green: availability
// is not a better/worse judgment.
const COST_DELTA_CLASS = {
  cheaper: 'text-emerald-900 dark:text-emerald-200',
  pricier: 'text-red-900 dark:text-red-200',
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

/** `referenceCost` is the reference column's cost for this row, or null when it
 *  has no priced read. The ratio is recomputed here rather than read from
 *  `costVsReferencePct` because the payload may have been cached for a
 *  different reference — `ref` never reaches the server on a client commit. */
function displayedComparison(
  platform: OverviewPlatformResult,
  comparisonMode: OverviewComparisonMode,
  referenceHardware: OverviewReferenceHardware,
  referenceCost: number | null,
): DisplayedComparison | null {
  if (platform.costPerMtok === null) return null;
  if (comparisonMode !== 'hardware') {
    const comparison = platform.historicalComparison;
    return comparison?.status === 'comparable' && comparison.costDeltaPct !== null
      ? {
          status: comparison.status,
          pct: comparison.costDeltaPct,
          baselineDate: comparison.baselineDate,
        }
      : null;
  }
  if (platform.hardware === referenceHardware) return null;
  const pct =
    referenceCost === null || platform.costPerMtok === null
      ? null
      : platform.costPerMtok / referenceCost - 1;
  return {
    status: pct === null ? 'no_baseline' : 'comparable',
    pct,
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
  referenceLabel: string,
): string {
  if (comparison.status === 'no_baseline' || comparison.pct === null) {
    return strings.noBaselineAria(referenceLabel);
  }
  if (comparisonMode === 'hardware') {
    return polarity === 'even'
      ? strings.costDeltaEvenAria(referenceLabel)
      : strings.costDeltaAria(
          formatters.percentAbs.format(Math.abs(comparison.pct)),
          polarity === 'cheaper',
          referenceLabel,
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
  referenceHardware: OverviewReferenceHardware = OVERVIEW_DEFAULT_REFERENCE_HARDWARE,
  referenceCost: number | null = null,
): { backgroundColor: string } | undefined {
  const comparison = displayedComparison(
    platform,
    comparisonMode,
    referenceHardware,
    referenceCost,
  );
  if (comparison === null) return undefined;
  const { pct } = comparison;
  const polarity = comparisonPolarity(comparison);
  const alpha =
    pct === null || polarity === 'even' ? COST_DELTA_NEUTRAL_ALPHA : costDeltaAlpha(pct);
  return { backgroundColor: `rgb(${COST_DELTA_HUE[polarity]} / ${alpha})` };
}

/** Relative comparison badge. Missing reference evidence stays neutral and
 *  uses `∞` instead of manufacturing a percentage. */
function CostDeltaBadge({
  comparison,
  comparisonMode,
  hardware,
  formatters,
  strings,
  referenceLabel,
  phoneRow,
}: {
  comparison: DisplayedComparison;
  comparisonMode: OverviewComparisonMode;
  hardware: string;
  formatters: Formatters;
  strings: OverviewStrings;
  referenceLabel: string;
  phoneRow: boolean;
}) {
  const { pct, status } = comparison;
  const polarity = comparisonPolarity(comparison);
  const aria = comparisonAria(
    comparison,
    comparisonMode,
    polarity,
    formatters,
    strings,
    referenceLabel,
  );
  return (
    <span
      data-testid="overview-cost-delta"
      data-hardware={hardware}
      data-cost-polarity={polarity}
      data-history-status={comparisonMode === 'hardware' ? undefined : status}
      title={aria}
      // The cell behind it carries the shade, so the badge itself stays
      // untinted — two washes of the same hue would double up.
      className={`inline-flex translate-y-px items-center whitespace-nowrap rounded-sm px-1 py-0.5 text-[10px] font-semibold tabular-nums ${
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
  referenceHardware,
  referenceCost,
  referenceLabel,
  phoneRow = false,
}: {
  locale: OverviewLocale;
  model: OverviewModelSummary;
  member: OverviewPlatformResult;
  formatters: Formatters;
  strings: OverviewStrings;
  comparisonMode: OverviewComparisonMode;
  referenceHardware: OverviewReferenceHardware;
  referenceCost: number | null;
  referenceLabel: string;
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
  const comparison = displayedComparison(member, comparisonMode, referenceHardware, referenceCost);
  const historicalConfig =
    comparisonMode !== 'hardware' && member.historicalComparison?.status === 'comparable'
      ? member.historicalComparison.baselineConfig
      : null;
  return (
    <div className="min-w-0 space-y-0.5 text-sm">
      {/* Fixed cost | delta grids keep comparisons scannable on desktop and phones;
          the delta slot is reserved on the reference too, aligning every row. */}
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
            referenceLabel={referenceLabel}
            phoneRow={phoneRow}
          />
        )}
      </div>
      {member.precision === null ? null : (
        <div className="min-w-0 text-[11px] leading-tight font-normal uppercase tracking-wider text-muted-foreground">
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
      {config === null || historicalConfig === null ? null : (
        <OverviewHistoryDetailLink
          href={buildOverviewHistoryDashboardHref(locale, model, config, historicalConfig)}
          model={model.model}
          hardware={member.hardware}
          ariaLabel={strings.compareCurvesAria(model.modelLabel, member.hardwareLabel)}
        >
          {strings.compareCurvesLink}
        </OverviewHistoryDetailLink>
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
  referenceHardware: OverviewReferenceHardware;
  referenceCost: number | null;
  referenceLabel: string;
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
        referenceHardware={props.referenceHardware}
        referenceCost={props.referenceCost}
        referenceLabel={props.referenceLabel}
        phoneRow={props.phoneRow}
      />
    </div>
  );
}

function ModelName({ model, strings }: { model: OverviewModelSummary; strings: OverviewStrings }) {
  const badge = strings.categoryBadges[model.category];
  const label = strings.scenarioLabels[model.scenario];
  const shortLabel = strings.scenarioLabelsShort[model.scenario];
  return (
    <div>
      <h2 className="text-sm font-semibold leading-snug">
        {model.modelLabel}
        {badge === undefined ? null : (
          <span
            data-testid="overview-model-category-badge"
            data-category={model.category}
            title={strings.categoryBadgeTitle}
            className="ml-1.5 inline-block rounded-sm border border-border/60 px-1 py-px align-middle text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            {badge}
            {/* `title` reaches a hovering mouse and nothing else, so a screen
                reader announced this badge as a bare label with no reason
                attached. `normal-case` because the badge's `uppercase` inherits
                and browsers expose the transformed string to the accessibility
                tree, which turns the sentence into shouted, mis-parsed words. */}
            <span className="sr-only normal-case">{strings.categoryBadgeTitle}</span>
          </span>
        )}
      </h2>
      <p
        data-testid="overview-model-scenario"
        title={label}
        className="mt-0.5 text-[11px] font-normal leading-tight text-muted-foreground"
      >
        {shortLabel === label ? (
          label
        ) : (
          <>
            <span className="sr-only">{label}</span>
            <span aria-hidden="true">{shortLabel}</span>
          </>
        )}
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
  referenceHardware: OverviewReferenceHardware;
}

export function DesktopOverviewMatrix({
  models,
  locale,
  formatters,
  strings,
  comparisonMode,
  referenceHardware,
  presenting = false,
}: SurfaceProps & { presenting?: boolean }) {
  const platforms = models[0]?.platforms ?? [];
  const referenceLabel = overviewHardwareLabel(referenceHardware);
  return (
    // The `xl` gate asks whether the viewport can hold the matrix, which stops
    // being the question once presenting: the deck lays out at a fixed width and
    // is scaled by `zoom`, so on a projector narrower than 1280px this would
    // hide the matrix on a slide whose phone list has already been dropped.
    <div className={presenting ? 'block' : 'hidden xl:block'}>
      <table data-testid="overview-desktop-matrix" className="w-full border-collapse text-sm">
        <caption className="sr-only">
          {comparisonMode === 'hardware'
            ? strings.caption
            : strings.historyCaption(OVERVIEW_HISTORY_WINDOW_DAYS[comparisonMode])}
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
                className={`px-3 py-2 text-left font-semibold ${comparisonMode === 'hardware' && platform.hardware === referenceHardware ? 'bg-muted' : 'bg-card'}`}
              >
                {comparisonMode === 'hardware' && platform.hardware === referenceHardware
                  ? `${platform.hardwareLabel} · ${strings.referenceHeader}`
                  : platform.hardwareLabel}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {models.map((model) => {
            // One lookup per row, not one per cell. Every row carries all five
            // platforms, so this misses only when the reference has no read.
            const referenceCost =
              model.platforms.find((platform) => platform.hardware === referenceHardware)
                ?.costPerMtok ?? null;
            return (
              <tr
                key={`${model.model}-${model.scenario}`}
                data-testid="overview-desktop-model"
                data-model={model.model}
                data-scenario={model.scenario}
                className="border-b border-border/50 align-top last:border-b-0"
              >
                <th scope="row" className="px-4 py-2.5 text-left align-top font-normal lg:px-6">
                  <ModelName model={model} strings={strings} />
                  {/* The link lives with the model it drills into, so the matrix
                    spends no column on a header that is the same every row. */}
                  {comparisonMode === 'hardware' && (
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
                  )}
                </th>
                {model.platforms.map((platform) => (
                  <td
                    key={platform.hardware}
                    style={costDeltaCellStyle(
                      platform,
                      comparisonMode,
                      referenceHardware,
                      referenceCost,
                    )}
                    className={`px-3 py-2.5 align-top ${comparisonMode === 'hardware' && platform.hardware === referenceHardware ? 'bg-muted/30' : ''}`}
                  >
                    <PlatformCell
                      locale={locale}
                      model={model}
                      platform={platform}
                      formatters={formatters}
                      strings={strings}
                      comparisonMode={comparisonMode}
                      referenceHardware={referenceHardware}
                      referenceCost={referenceCost}
                      referenceLabel={referenceLabel}
                    />
                  </td>
                ))}
              </tr>
            );
          })}
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
  referenceHardware,
}: SurfaceProps) {
  const referenceLabel = overviewHardwareLabel(referenceHardware);
  return (
    <ul data-testid="overview-mobile-list" className="divide-y divide-border/50 xl:hidden">
      {models.map((model) => {
        const referenceCost =
          model.platforms.find((platform) => platform.hardware === referenceHardware)
            ?.costPerMtok ?? null;
        return (
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
                    style={costDeltaCellStyle(
                      platform,
                      comparisonMode,
                      referenceHardware,
                      referenceCost,
                    )}
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
                      referenceHardware={referenceHardware}
                      referenceCost={referenceCost}
                      referenceLabel={referenceLabel}
                      phoneRow
                    />
                  </div>
                ))}
              </div>
              {comparisonMode === 'hardware' && (
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
              )}
            </article>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The active option of a switcher. It replaces the anchor the user activated,
 * which destroys the focused node and drops focus to <body>; when the click
 * came from the keyboard, this takes that focus back.
 *
 * `tabIndex={-1}` keeps a non-interactive span out of the tab order while still
 * allowing programmatic focus.
 */
function ActiveSwitcherOption({
  control,
  children,
  ...props
}: ComponentPropsWithoutRef<'span'> & { control: OverviewNavControl }) {
  const { focusIntent } = useOverviewNavigation();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (focusIntent.current !== control) return;
    focusIntent.current = null;
    ref.current?.focus({ preventScroll: true });
    // Mount-only by construction: `control` is a literal per call site and
    // `focusIntent` is a stable ref, so this runs exactly on the commit that
    // swapped the anchor out. Dropping the deps would consume the intent one
    // render early and leave focus on <body>.
  }, [control, focusIntent]);
  return (
    <span {...props} ref={ref} tabIndex={-1}>
      {children}
    </span>
  );
}

/** Every option remains a copyable server-rendered URL; ordinary clicks use a
 *  soft App Router transition and the displayed tier is never a self-link. */
export function OverviewTierSwitcher({
  tier,
  engineScope,
  comparisonMode,
  referenceHardware,
  modelScope,
  rowScope,
  hardwareRowScope,
  locale,
  strings,
}: {
  tier: OverviewTier;
  engineScope: OverviewEngineScope;
  comparisonMode: OverviewComparisonMode;
  referenceHardware: OverviewReferenceHardware;
  modelScope: OverviewModelScope;
  rowScope: OverviewRowScope;
  hardwareRowScope: OverviewHardwareRowScope;
  locale: OverviewLocale;
  strings: OverviewStrings;
}) {
  const optionClass =
    'inline-flex min-h-11 items-center px-3 tabular-nums focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring';
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
            <ActiveSwitcherOption
              key={option}
              control="tier"
              aria-current="page"
              className={`${optionClass} bg-muted font-semibold text-foreground`}
            >
              {option}
            </ActiveSwitcherOption>
          ) : (
            <OverviewNavLink
              key={option}
              href={overviewTierHref(
                locale,
                option,
                engineScope,
                comparisonMode,
                referenceHardware,
                modelScope,
                rowScope,
                hardwareRowScope,
              )}
              analytics={{ control: 'tier', value: String(option) }}
              searchKeys={['tier']}
              className={`${optionClass} text-muted-foreground transition-colors hover:text-foreground`}
            >
              {option}
            </OverviewNavLink>
          ),
        )}
      </div>
      <span className="text-muted-foreground">{strings.tierUnit}</span>
    </nav>
  );
}

/** Scope links keep their native href while preserving the other controls. */
export function OverviewEngineScopeSwitcher({
  engineScope,
  tier,
  comparisonMode,
  referenceHardware,
  modelScope,
  rowScope,
  hardwareRowScope,
  locale,
  strings,
}: {
  engineScope: OverviewEngineScope;
  tier: OverviewTier;
  comparisonMode: OverviewComparisonMode;
  referenceHardware: OverviewReferenceHardware;
  modelScope: OverviewModelScope;
  rowScope: OverviewRowScope;
  hardwareRowScope: OverviewHardwareRowScope;
  locale: OverviewLocale;
  strings: OverviewStrings;
}) {
  const options: OverviewEngineScope[] = ['community', 'all'];
  const optionClass =
    'inline-flex min-h-11 w-full items-center rounded-md border border-border/60 px-3 py-1.5 text-left leading-snug focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring sm:w-auto';
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
            <ActiveSwitcherOption
              key={option}
              control="engine"
              data-overview-engine-scope={option}
              aria-current="true"
              className={`${optionClass} bg-muted font-semibold text-foreground`}
            >
              {strings.engineScopeOptions[option]}
            </ActiveSwitcherOption>
          ) : (
            <OverviewNavLink
              key={option}
              data-overview-engine-scope={option}
              href={overviewEngineScopeHref(
                locale,
                option,
                tier,
                comparisonMode,
                referenceHardware,
                modelScope,
                rowScope,
                hardwareRowScope,
              )}
              analytics={{ control: 'engine', value: option }}
              searchKeys={['engine']}
              className={`${optionClass} text-muted-foreground transition-colors hover:text-foreground`}
            >
              {strings.engineScopeOptions[option]}
            </OverviewNavLink>
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
  referenceHardware,
  modelScope,
  rowScope,
  hardwareRowScope,
  locale,
  strings,
}: {
  comparisonMode: OverviewComparisonMode;
  engineScope: OverviewEngineScope;
  tier: OverviewTier;
  referenceHardware: OverviewReferenceHardware;
  modelScope: OverviewModelScope;
  rowScope: OverviewRowScope;
  hardwareRowScope: OverviewHardwareRowScope;
  locale: OverviewLocale;
  strings: OverviewStrings;
}) {
  const referenceLabel = overviewHardwareLabel(referenceHardware);
  const referenceOptions = OVERVIEW_HARDWARE.map((hardware) => ({
    value: hardware,
    label: overviewHardwareLabel(hardware),
    href: overviewHref(
      locale,
      tier,
      engineScope,
      'hardware',
      hardware,
      modelScope,
      rowScope,
      hardwareRowScope,
    ),
  }));
  const windowOptions = OVERVIEW_HISTORY_WINDOWS.map((window) => ({
    value: window,
    label: strings.historyWindowOptions[window],
    href: overviewHref(locale, tier, engineScope, window, referenceHardware, modelScope),
  }));
  // The inactive-only classes live on the inactive branch, not here: Tailwind
  // emits `border-transparent` after the active border at equal specificity,
  // so sharing them left the active underline invisible in light mode. The
  // darker light-theme blue also keeps this small active label above AA
  // contrast on the page background; dark mode retains the brand primary.
  const optionClass =
    'relative inline-flex min-h-11 min-w-[130px] items-center justify-center whitespace-nowrap border-b-2 px-4 py-2 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring sm:min-w-[140px]';
  const inactiveOptionClass =
    'border-transparent text-muted-foreground hover:border-muted-foreground/30';
  return (
    <nav
      data-testid="overview-comparison-switcher"
      aria-label={strings.comparisonNavLabel}
      className="flex flex-wrap justify-center gap-x-1 gap-y-1.5 sm:gap-x-1.5"
    >
      {comparisonMode === 'hardware' ? (
        <ActiveSwitcherOption
          control="comparison"
          data-overview-comparison="hardware"
          aria-current="true"
          className={`${optionClass} border-sky-800 text-sky-800 dark:border-primary dark:text-primary`}
        >
          <span className="inline-flex items-center gap-0.5">
            <span>{locale === 'zh' ? '对比 ' : 'vs '}</span>
            <OverviewReferenceSelect
              ariaLabel={strings.referenceSelectorAria}
              options={referenceOptions}
            />
          </span>
        </ActiveSwitcherOption>
      ) : (
        <OverviewNavLink
          data-overview-comparison="hardware"
          href={overviewHref(
            locale,
            tier,
            engineScope,
            'hardware',
            referenceHardware,
            modelScope,
            rowScope,
            hardwareRowScope,
          )}
          analytics={{ control: 'comparison', value: 'hardware' }}
          searchKeys={['compare']}
          className={`${optionClass} ${inactiveOptionClass}`}
        >
          {strings.hardwareComparisonLabel(referenceLabel)}
        </OverviewNavLink>
      )}
      {comparisonMode === 'hardware' ? (
        <OverviewNavLink
          data-overview-comparison={OVERVIEW_DEFAULT_HISTORY_WINDOW}
          href={overviewHref(
            locale,
            tier,
            engineScope,
            OVERVIEW_DEFAULT_HISTORY_WINDOW,
            referenceHardware,
            modelScope,
            rowScope,
            hardwareRowScope,
          )}
          analytics={{ control: 'comparison', value: OVERVIEW_DEFAULT_HISTORY_WINDOW }}
          searchKeys={['compare']}
          className={`${optionClass} ${inactiveOptionClass}`}
        >
          {strings.comparisonOptions.history}
        </OverviewNavLink>
      ) : (
        <ActiveSwitcherOption
          control="comparison"
          data-overview-comparison={comparisonMode}
          aria-current="true"
          className={`${optionClass} border-sky-800 text-sky-800 dark:border-primary dark:text-primary`}
        >
          <span className="inline-flex items-center gap-0.5">
            <span>{locale === 'zh' ? '对比 ' : 'vs '}</span>
            <OverviewHistoryWindowSelect
              ariaLabel={strings.historyWindowSelectAria}
              value={comparisonMode}
              options={windowOptions}
            />
          </span>
        </ActiveSwitcherOption>
      )}
    </nav>
  );
}

/**
 * Where a scope toggle is drawn. `section` is the chip in the footer bar
 * beneath the matrix; `toolbar` is the same chip riding the deck toolbar while
 * presenting, where the count badge would be noise at projection size.
 */
type OverviewScopeToggleVariant = 'section' | 'toolbar';

/**
 * Matches Exit, so the right end of the deck toolbar reads as one row of
 * actions. Deliberately not filled-when-engaged: these labels name the click
 * rather than the state, and a filled "Show all rows" contradicts itself.
 */
const SCOPE_CHIP_CLASS =
  'inline-flex min-h-11 items-center whitespace-nowrap rounded-md border border-border/60 px-3 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground';

/** The count the chip's short label elides; the full sentence stays on the
 *  accessible name, so the badge is presentation only. */
function ScopeChipCount({ count }: { count: number }) {
  return (
    <span
      aria-hidden="true"
      className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] leading-none tabular-nums"
    >
      {count}
    </span>
  );
}

export function OverviewModelScopeToggle({
  modelScope,
  tier,
  engineScope,
  comparisonMode,
  referenceHardware,
  rowScope,
  hardwareRowScope,
  locale,
  strings,
  variant = 'section',
}: {
  modelScope: OverviewModelScope;
  tier: OverviewTier;
  engineScope: OverviewEngineScope;
  comparisonMode: OverviewComparisonMode;
  referenceHardware: OverviewReferenceHardware;
  rowScope: OverviewRowScope;
  hardwareRowScope: OverviewHardwareRowScope;
  locale: OverviewLocale;
  strings: OverviewStrings;
  variant?: OverviewScopeToggleVariant;
}) {
  const target: OverviewModelScope = modelScope === 'all' ? 'default' : 'all';
  // Inactive models rarely post a 30-day change, so revealing them under the
  // changed-only scope would filter them straight back out and read as a dead
  // link. Asking for more models asks for more rows.
  const targetRowScope: OverviewRowScope = target === 'all' ? 'all' : rowScope;
  // Same trap in hardware mode, and a deeper one: an inactive model is the most
  // likely to have no result on any platform, which is exactly what the
  // priced-only scope removes.
  const targetHardwareRowScope: OverviewHardwareRowScope =
    target === 'all' ? 'all' : hardwareRowScope;
  const sentence = modelScope === 'all' ? strings.modelScopeHide : strings.modelScopeShow;
  const link = (
    <OverviewNavLink
      data-overview-model-scope={target}
      href={overviewHref(
        locale,
        tier,
        engineScope,
        comparisonMode,
        referenceHardware,
        target,
        targetRowScope,
        targetHardwareRowScope,
      )}
      analytics={{ control: 'models', value: target }}
      searchKeys={['models', 'rows', 'hwrows']}
      aria-label={sentence}
      title={sentence}
      className={SCOPE_CHIP_CLASS}
    >
      {modelScope === 'all' ? strings.modelScopeChipHide : strings.modelScopeChipShow}
    </OverviewNavLink>
  );
  if (variant === 'toolbar') return link;
  return (
    <nav
      data-testid="overview-model-scope-toggle"
      aria-label={strings.modelScopeNavLabel}
      className="text-xs"
    >
      {link}
    </nav>
  );
}

/**
 * Opt-in narrowing to the rows that moved in the window, and the way back.
 * Rendered only when the two scopes would differ, so a fully-comparable window
 * shows no dead control.
 */
export function OverviewRowScopeToggle({
  rowScope,
  unchangedRowCount,
  windowDays,
  tier,
  engineScope,
  referenceHardware,
  modelScope,
  locale,
  strings,
  variant = 'section',
}: {
  rowScope: OverviewRowScope;
  /** Days of the active history window; the copy must name the window the
   *  filter actually reads. */
  windowDays: number;
  unchangedRowCount: number;
  tier: OverviewTier;
  engineScope: OverviewEngineScope;
  referenceHardware: OverviewReferenceHardware;
  modelScope: OverviewModelScope;
  locale: OverviewLocale;
  strings: OverviewStrings;
  variant?: OverviewScopeToggleVariant;
}) {
  if (unchangedRowCount === 0) return null;
  const target: OverviewRowScope = rowScope === 'all' ? 'changed' : 'all';
  const sentence =
    rowScope === 'all'
      ? strings.rowScopeHide(unchangedRowCount, windowDays)
      : strings.rowScopeShow(unchangedRowCount, windowDays);
  const link = (
    <OverviewNavLink
      data-overview-row-scope={target}
      href={overviewHref(
        locale,
        tier,
        engineScope,
        OVERVIEW_DEFAULT_HISTORY_WINDOW,
        referenceHardware,
        modelScope,
        target,
      )}
      analytics={{ control: 'rows', value: target }}
      searchKeys={['rows']}
      aria-label={sentence}
      title={sentence}
      className={SCOPE_CHIP_CLASS}
    >
      {rowScope === 'all' ? strings.rowScopeChipHide : strings.rowScopeChipShow}
      {variant === 'section' ? <ScopeChipCount count={unchangedRowCount} /> : null}
    </OverviewNavLink>
  );
  if (variant === 'toolbar') return link;
  return (
    <nav
      data-testid="overview-row-scope-toggle"
      aria-label={strings.rowScopeNavLabel(windowDays)}
      className="text-xs"
    >
      {link}
    </nav>
  );
}

/** The hardware-mode sibling of {@link OverviewRowScopeToggle}. Kept separate
 *  rather than parameterised: the two filters answer different questions, name
 *  different counts, and each mode remembers its own answer. */
export function OverviewHardwareRowScopeToggle({
  hardwareRowScope,
  emptyRowCount,
  tier,
  engineScope,
  referenceHardware,
  modelScope,
  locale,
  strings,
  variant = 'section',
}: {
  hardwareRowScope: OverviewHardwareRowScope;
  emptyRowCount: number;
  tier: OverviewTier;
  engineScope: OverviewEngineScope;
  referenceHardware: OverviewReferenceHardware;
  modelScope: OverviewModelScope;
  locale: OverviewLocale;
  strings: OverviewStrings;
  variant?: OverviewScopeToggleVariant;
}) {
  if (emptyRowCount === 0) return null;
  const target: OverviewHardwareRowScope = hardwareRowScope === 'all' ? 'priced' : 'all';
  const sentence =
    hardwareRowScope === 'all'
      ? strings.hardwareRowScopeHide(emptyRowCount)
      : strings.hardwareRowScopeShow(emptyRowCount);
  const link = (
    <OverviewNavLink
      data-overview-hardware-row-scope={target}
      href={overviewHref(
        locale,
        tier,
        engineScope,
        'hardware',
        referenceHardware,
        modelScope,
        OVERVIEW_DEFAULT_ROW_SCOPE,
        target,
      )}
      analytics={{ control: 'hwrows', value: target }}
      searchKeys={['hwrows']}
      aria-label={sentence}
      title={sentence}
      className={SCOPE_CHIP_CLASS}
    >
      {hardwareRowScope === 'all'
        ? strings.hardwareRowScopeChipHide
        : strings.hardwareRowScopeChipShow}
      {variant === 'section' ? <ScopeChipCount count={emptyRowCount} /> : null}
    </OverviewNavLink>
  );
  if (variant === 'toolbar') return link;
  return (
    <nav
      data-testid="overview-hardware-row-scope-toggle"
      aria-label={strings.hardwareRowScopeNavLabel}
      className="text-xs"
    >
      {link}
    </nav>
  );
}

export function OverviewMethodology({
  strings,
  comparisonMode,
  referenceHardware,
}: {
  strings: OverviewStrings;
  comparisonMode: OverviewComparisonMode;
  referenceHardware: OverviewReferenceHardware;
}) {
  const referenceLabel = overviewHardwareLabel(referenceHardware);
  return (
    <div
      data-testid="overview-methodology"
      className="space-y-1 text-xs leading-snug text-muted-foreground"
    >
      {comparisonMode === 'hardware' ? null : (
        <p>{strings.historyCaption(OVERVIEW_HISTORY_WINDOW_DAYS[comparisonMode])}</p>
      )}
      <p>
        {comparisonMode === 'hardware'
          ? strings.cellStateLegend(referenceLabel)
          : strings.historyCellStateLegend(OVERVIEW_HISTORY_WINDOW_DAYS[comparisonMode])}
      </p>
      <p>{strings.methodologyNote}</p>
    </div>
  );
}
