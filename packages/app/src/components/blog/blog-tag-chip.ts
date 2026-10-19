import { cn } from '@/lib/shared/utils';

export const TAG_CHIP_CLASS =
  'inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors';

export function tagChipClass(active: boolean | undefined): string {
  return cn(
    TAG_CHIP_CLASS,
    active
      ? 'border-brand/50 bg-brand/15 text-brand'
      : 'border-border/50 bg-card/60 text-muted-foreground hover:border-border hover:text-foreground',
  );
}
