'use client';

import type { Locale } from '@/lib/i18n/i18n';
import { useLocale } from '@/lib/i18n/use-locale';
import {
  POWER_BASIS_TAG_LABELS,
  POWER_BASIS_TAG_OF,
  POWER_BASIS_TAG_TITLES,
  type PowerBasis,
  type PowerBasisTag,
} from '@/lib/power/power-basis';
import { escapeHtml } from '@/lib/shared/utils';

/** One color per basis tag, the same in both themes so a pill reads the same everywhere. */
export const POWER_BASIS_TAG_COLORS: Record<PowerBasisTag, { bg: string; fg: string }> = {
  gpu: { bg: 'var(--muted)', fg: 'var(--foreground)' },
  it: { bg: '#0b86d1', fg: '#ffffff' },
  facility: { bg: '#7c5ce0', fg: '#ffffff' },
};

// No font-size: the pill inherits its line's size (the tooltip keeps every line at 11px).
const PILL_STYLE =
  'display:inline-block;margin-left:0.3em;padding:0 0.4em;border-radius:999px;font-weight:600;line-height:1.35;vertical-align:baseline;white-space:nowrap;';

/** The pill as an HTML string, for the D3 tooltips that build markup by hand. */
export function powerBasisPillHtml(tag: PowerBasisTag, locale: Locale): string {
  const { bg, fg } = POWER_BASIS_TAG_COLORS[tag];
  return `<span data-testid="power-basis-pill" data-basis="${tag}" title="${escapeHtml(POWER_BASIS_TAG_TITLES[tag][locale])}" style="${PILL_STYLE}background:${bg};color:${fg}">${escapeHtml(POWER_BASIS_TAG_LABELS[tag][locale])}</span>`;
}

/**
 * The small GPU / IT / Facility tag next to a power number. One vocabulary for
 * tooltips, table headers, readouts and axis titles; the meaning of each tag is
 * explained once inside the PowerX "How we measure" details.
 */
export function PowerBasisPill({
  tag,
  basis,
  className,
}: {
  tag?: PowerBasisTag;
  /** Resolve the tag from a power basis instead. */
  basis?: PowerBasis;
  className?: string;
}) {
  const locale = useLocale();
  const resolved = tag ?? (basis ? POWER_BASIS_TAG_OF[basis] : 'gpu');
  const { bg, fg } = POWER_BASIS_TAG_COLORS[resolved];
  return (
    <span
      data-testid="power-basis-pill"
      data-basis={resolved}
      title={POWER_BASIS_TAG_TITLES[resolved][locale]}
      className={`ml-1 inline-block rounded-full px-1.5 align-baseline text-2xs leading-snug font-semibold whitespace-nowrap ${className ?? ''}`}
      style={{ background: bg, color: fg }}
    >
      {POWER_BASIS_TAG_LABELS[resolved][locale]}
    </span>
  );
}
