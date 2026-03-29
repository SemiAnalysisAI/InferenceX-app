import { cn } from '@/lib/utils';

const PATTERN_CLASSES = cn(
  'pointer-events-none fixed -z-10 block',
  'bg-muted/50 dark:bg-muted',
  "mask-[url('/brand/left-pattern-full.svg')]",
  'mask-no-repeat mask-position-[top_right] mask-size-[100%]',
  'w-full sm:w-3/4 md:w-1/2 lg:w-1/3 h-screen',
);

export function CircuitBackground() {
  return (
    <>
      {/* Circuit pattern overlays */}
      <div aria-hidden className={cn(PATTERN_CLASSES, 'top-0 left-0')} />
      <div aria-hidden className={cn(PATTERN_CLASSES, 'bottom-0 right-0 rotate-180')} />

      {/* Brand gradient glows (dark mode only) — blue top-left, amber bottom-right */}
      <div
        aria-hidden
        className="pointer-events-none fixed -z-10 hidden dark:block"
        style={{
          top: '-10%',
          left: '-5%',
          width: '40vw',
          height: '50vh',
          borderRadius: '50%',
          background: 'rgba(26, 132, 198, 0.18)',
          filter: 'blur(120px)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed -z-10 hidden dark:block"
        style={{
          bottom: '-10%',
          right: '-5%',
          width: '35vw',
          height: '45vh',
          borderRadius: '50%',
          background: 'rgba(232, 168, 48, 0.15)',
          filter: 'blur(120px)',
        }}
      />
    </>
  );
}
