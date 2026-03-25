import { cn } from '@/lib/utils';

const PATTERN_CLASSES = cn(
  'pointer-events-none fixed -z-10 block',
  'bg-muted/50 dark:bg-muted',
  "mask-[url('/brand/left-pattern-full.svg')]",
  'mask-no-repeat mask-position-[top_right] mask-size-[100%]',
  'w-full sm:w-3/4 md:w-1/2 h-screen',
);

export function CircuitBackground() {
  return (
    <>
      <div aria-hidden className={cn(PATTERN_CLASSES, 'top-0 left-0')} />
      <div aria-hidden className={cn(PATTERN_CLASSES, 'bottom-0 right-0 rotate-180')} />
    </>
  );
}
