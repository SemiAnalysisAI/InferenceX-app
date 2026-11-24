'use client';

import { Badge, badgeVariants } from '@/components/ui/badge';
import type { Locale } from '@/lib/i18n/i18n';
import { useLocale } from '@/lib/i18n/use-locale';
import {
  POWER_BASIS_TAG_LABELS,
  POWER_BASIS_TAG_TITLES,
  type PowerBasisTag,
} from '@/lib/power/power-basis';
import { cn, escapeHtml } from '@/lib/shared/utils';

/**
 * Neutral in both themes and in the tutorial's provenance grammar. The measured GPU tag is a
 * solid muted step, the modeled IT and facility tags are hairline outlines.
 */
const POWER_BASIS_TAG_STYLE: Record<PowerBasisTag, { bg: string; fg: string; border: string }> = {
  gpu: { bg: 'var(--muted)', fg: 'var(--foreground)', border: 'transparent' },
  it: { bg: 'transparent', fg: 'var(--muted-foreground)', border: 'var(--border)' },
  facility: { bg: 'transparent', fg: 'var(--muted-foreground)', border: 'var(--border)' },
};

// One class string for the React pill and the tooltip HTML, so both look the same. The
// tooltip pill inherits its line's font size; the React pill sets text-2xs.
const PILL_BOX = 'ml-1 px-1.5 py-0 align-baseline';
const PILL_CLASS = cn(
  badgeVariants({ variant: 'outline' }),
  PILL_BOX,
  'text-[length:inherit] leading-snug',
);

/** The tag as an HTML string, for the D3 tooltips that build markup by hand. */
export function powerBasisPillHtml(tag: PowerBasisTag, locale: Locale): string {
  const { bg, fg, border } = POWER_BASIS_TAG_STYLE[tag];
  return `<span data-testid="power-basis-pill" data-basis="${tag}" title="${escapeHtml(POWER_BASIS_TAG_TITLES[tag][locale])}" class="${escapeHtml(PILL_CLASS)}" style="background:${bg};color:${fg};border-color:${border}">${escapeHtml(POWER_BASIS_TAG_LABELS[tag][locale])}</span>`;
}

/**
 * The small GPU / IT / Facility tag next to a power number. One vocabulary for
 * tooltips, table headers, readouts and axis titles; each pill's `title`
 * (`POWER_BASIS_TAG_TITLES`) is the only place the tag's meaning is explained.
 */
export function PowerBasisPill({ tag, className }: { tag: PowerBasisTag; className?: string }) {
  const locale = useLocale();
  const { bg, fg, border } = POWER_BASIS_TAG_STYLE[tag];
  return (
    <Badge
      variant="outline"
      data-testid="power-basis-pill"
      data-basis={tag}
      title={POWER_BASIS_TAG_TITLES[tag][locale]}
      className={cn(PILL_BOX, 'text-2xs leading-snug', className)}
      style={{ background: bg, color: fg, borderColor: border }}
    >
      {POWER_BASIS_TAG_LABELS[tag][locale]}
    </Badge>
  );
}
