import { cn } from '@/lib/shared/utils';

const TAG_CHIP_CLASS =
  'inline-flex h-8 items-center justify-center gap-1.5 rounded-md border px-3 text-xs font-medium leading-none whitespace-nowrap transition-colors';

export function tagChipClass(active: boolean | undefined): string {
  return cn(
    TAG_CHIP_CLASS,
    active
      ? 'border-brand/40 bg-brand/10 text-brand'
      : 'border-border/50 text-muted-foreground hover:bg-muted/50 hover:text-foreground',
  );
}
