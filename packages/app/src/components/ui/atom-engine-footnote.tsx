'use client';

import { useLocale } from '@/lib/use-locale';
import { cn } from '@/lib/utils';

/**
 * Superscript marker appended to ATOM-family framework labels (e.g. "ATOM¹",
 * "Mooncake ATOMesh¹"). Consumers detect it in a display label to decide
 * whether the footnote below applies to the chart.
 */
export const ATOM_FOOTNOTE_MARKER = '¹';

const STRINGS = {
  en: {
    atomFootnote:
      'The ATOM engine is promising, however it has yet to serve production tokens. It is still in its infant stage.',
  },
  zh: {
    atomFootnote: 'ATOM 引擎前景可期，但尚未用于生产环境 token 服务，仍处于早期阶段。',
  },
} as const;

/**
 * Footnote explaining the ¹ marker on ATOM-family series labels. Rendered in
 * the evaluation chart legend and in the inference chart's axis-metric info
 * footer, so the copy lives in one place.
 */
export function AtomEngineFootnote({ className }: { className?: string }) {
  const locale = useLocale();
  return (
    <p
      data-testid="atom-engine-footnote"
      className={cn('text-3xs text-muted-foreground/70 leading-tight', className)}
    >
      <sup>1</sup> {STRINGS[locale].atomFootnote}
    </p>
  );
}
