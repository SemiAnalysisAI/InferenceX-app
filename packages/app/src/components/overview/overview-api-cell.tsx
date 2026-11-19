import type { Model } from '@/lib/catalog/data-mappings';
import {
  OVERVIEW_TOKEN_MIXES,
  overviewApiPrice,
  overviewApiRatio,
  type OverviewApiPriceBand,
  type OverviewApiPriceRead,
  overviewTieredTokenMix,
  tokenMixShares,
} from '@/lib/overview/overview-api-pricing';
import type { OverviewScenario } from '@/lib/overview/overview-data';

import type { OverviewLocale, OverviewStrings } from './overview-strings';

/** Same ±5% band the −X% badges call "even". */
const API_RATIO_EVEN_BAND = 0.05;

const RATIO_CLASS = {
  cheaper:
    'text-[color-mix(in_oklch,var(--success)_60%,var(--foreground))] bg-[color-mix(in_oklch,var(--success)_12%,transparent)]',
  pricier:
    'text-[color-mix(in_oklch,var(--destructive)_60%,var(--foreground))] bg-[color-mix(in_oklch,var(--destructive)_12%,transparent)]',
  even: 'text-muted-foreground bg-muted/40',
} as const;

const unitPrice = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 3,
});
const share = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function formatTokenCount(tokens: number): string {
  return tokens % 1024 === 0 ? `${tokens / 1024}K` : tokens.toLocaleString('en-US');
}

export function overviewApiTooltip(
  read: OverviewApiPriceRead,
  locale: OverviewLocale,
  strings: OverviewStrings,
  cost: Intl.NumberFormat,
): string {
  const { pricing, mixKey } = read;
  const common = {
    provider: pricing.provider,
    apiModelId: pricing.apiModelId,
    mixLabel: strings.apiMixLabels[mixKey] ?? mixKey,
    result: cost.format(read.costPerMtok),
    note: pricing.note[locale],
    asOf: pricing.asOf,
  };
  if ('input' in pricing.pricing) {
    const band: OverviewApiPriceBand = pricing.pricing;
    const mix = tokenMixShares(OVERVIEW_TOKEN_MIXES[mixKey]);
    // No cache on the API: cached corpus tokens bill as plain input.
    const terms =
      band.cacheHit === null
        ? [
            [mix.cachedTokens + mix.uncachedInputTokens, band.input],
            [mix.outputTokens, band.output],
          ]
        : [
            [mix.cachedTokens, band.cacheHit],
            [mix.uncachedInputTokens, band.input],
            [mix.outputTokens, band.output],
          ];
    return strings.apiFlatTooltip({
      ...common,
      cacheHit: band.cacheHit === null ? null : unitPrice.format(band.cacheHit),
      input: unitPrice.format(band.input),
      output: unitPrice.format(band.output),
      cached: share.format(mix.cachedTokens),
      uncached: share.format(mix.uncachedInputTokens),
      outputShare: share.format(mix.outputTokens),
      formula: terms
        .filter(([part]) => part > 0)
        .map(([part, price]) => `${share.format(part)} × ${unitPrice.format(price)}`)
        .join(' + '),
    });
  }
  const tiers = pricing.pricing;
  const tierRanges = tiers.map((tier, i) =>
    i === 0
      ? strings.apiTierUpTo(formatTokenCount(tier.maxInputTokens))
      : strings.apiTierRange(
          formatTokenCount(tiers[i - 1].maxInputTokens),
          formatTokenCount(tier.maxInputTokens),
        ),
  );
  const tierText = tiers
    .map(
      (tier, i) =>
        `${tierRanges[i]} ${unitPrice.format(tier.band.input)} / ${unitPrice.format(tier.band.output)}`,
    )
    .join('; ');
  const total = OVERVIEW_TOKEN_MIXES[mixKey];
  const totalInput = total.cachedTokens + total.uncachedInputTokens;
  const measured = overviewTieredTokenMix(mixKey);
  const split =
    measured === null
      ? strings.apiTierSplit(tierRanges[0], share.format(1), share.format(1))
      : measured
          .map((bucket, i) =>
            strings.apiTierSplit(
              tierRanges[i],
              share.format((bucket.mix.cachedTokens + bucket.mix.uncachedInputTokens) / totalInput),
              share.format(bucket.mix.outputTokens / total.outputTokens),
            ),
          )
          .join('; ');
  return strings.apiTieredTooltip({ ...common, tiers: tierText, split });
}

export function OverviewApiCell({
  model,
  scenario,
  locale,
  strings,
  cost,
  phoneRow = false,
}: {
  model: Model;
  scenario: OverviewScenario;
  locale: OverviewLocale;
  strings: OverviewStrings;
  cost: Intl.NumberFormat;
  phoneRow?: boolean;
}) {
  const read = overviewApiPrice(model, scenario);
  if (read.status === 'unavailable') {
    const reason = strings.apiUnavailable[read.reason];
    return (
      <span
        data-testid="overview-api-price"
        data-api-status="unavailable"
        title={reason}
        aria-label={strings.apiUnavailableAria(reason)}
        className="cursor-help text-sm text-muted-foreground"
      >
        —
      </span>
    );
  }
  const tooltip = overviewApiTooltip(read, locale, strings, cost);
  const value = cost.format(read.costPerMtok);
  return (
    <div
      data-testid="overview-api-price"
      data-api-status="priced"
      className={phoneRow ? 'flex flex-wrap items-baseline gap-x-2' : 'space-y-0.5'}
    >
      <a
        data-testid="overview-api-source-link"
        href={read.pricing.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={tooltip}
        aria-label={`${value}. ${tooltip}`}
        className="text-sm font-medium tabular-nums text-muted-foreground underline decoration-dotted decoration-muted-foreground/60 underline-offset-[3px] hover:text-foreground"
      >
        {value}
      </a>
      <div className="text-2xs leading-tight text-muted-foreground/80">
        {read.pricing.providerShort ?? read.pricing.provider}
      </div>
    </div>
  );
}

/** "×N cheaper than API" pill for a hardware cell, or null when either side
 *  has no price. */
export function OverviewApiRatioBadge({
  model,
  scenario,
  hardware,
  hardwareLabel,
  hardwareCostPerMtok,
  strings,
  cost,
}: {
  model: Model;
  scenario: OverviewScenario;
  hardware: string;
  hardwareLabel: string;
  hardwareCostPerMtok: number | null;
  strings: OverviewStrings;
  cost: Intl.NumberFormat;
}) {
  const read = overviewApiPrice(model, scenario);
  if (read.status !== 'priced') return null;
  const ratio = overviewApiRatio(hardwareCostPerMtok, read.costPerMtok);
  if (ratio === null || hardwareCostPerMtok === null) return null;
  const polarity: keyof typeof RATIO_CLASS =
    Math.abs(ratio - 1) < API_RATIO_EVEN_BAND ? 'even' : ratio > 1 ? 'cheaper' : 'pricier';
  const factor = polarity === 'pricier' ? 1 / ratio : ratio;
  const n = factor.toFixed(factor < 10 ? 1 : 0);
  const label =
    polarity === 'even'
      ? strings.apiRatioEven
      : polarity === 'cheaper'
        ? strings.apiRatioCheaper(n)
        : strings.apiRatioPricier(n);
  const tooltip = strings.apiRatioTooltip(
    hardwareLabel,
    cost.format(hardwareCostPerMtok),
    cost.format(read.costPerMtok),
    label,
  );
  return (
    <span
      data-testid="overview-api-ratio"
      data-hardware={hardware}
      data-api-polarity={polarity}
      title={tooltip}
      className={`inline-flex w-fit cursor-help items-center whitespace-nowrap rounded-sm px-1 py-px text-2xs font-medium tabular-nums ${RATIO_CLASS[polarity]}`}
    >
      <span aria-hidden="true">{label}</span>
      <span className="sr-only">{tooltip}</span>
    </span>
  );
}
