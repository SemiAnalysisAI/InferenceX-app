import { cn } from '@/lib/utils';

const PATTERN_CLASSES = cn(
  'pointer-events-none fixed -z-10 hidden sm:block',
  'bg-muted/50 dark:bg-muted',
  "sm:mask-[url('/brand/left-pattern-full.svg')]",
  'sm:mask-no-repeat sm:mask-position-[top_right] sm:mask-size-[100%]',
  'w-full sm:w-3/4 md:w-1/2 lg:w-1/3 h-screen',
);

export function CircuitBackground() {
  return (
    <>
      <div aria-hidden className={cn(PATTERN_CLASSES, 'top-0 left-0 circuit-bg')} />
      <div aria-hidden className={cn(PATTERN_CLASSES, 'bottom-0 right-0 rotate-180 circuit-bg')} />
    </>
  );
}
