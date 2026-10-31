'use client';

import * as React from 'react';

import { cn } from '@/lib/shared/utils';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

export function CountUp({
  value,
  locale = 'en-US',
  durationMs = 900,
  className,
}: {
  value: number;
  locale?: string;
  durationMs?: number;
  className?: string;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const format = React.useCallback((n: number) => n.toLocaleString(locale), [locale]);
  const [display, setDisplay] = React.useState(() => format(value));

  React.useEffect(() => {
    const node = ref.current;
    if (
      !node ||
      typeof IntersectionObserver === 'undefined' ||
      (typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION_QUERY).matches)
    ) {
      return undefined;
    }

    let frame = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        node.style.minWidth = `${node.getBoundingClientRect().width}px`;
        const start = performance.now();
        const tick = (now: number) => {
          const progress = Math.min((now - start) / durationMs, 1);
          setDisplay(format(Math.round(value * easeOutCubic(progress))));
          if (progress < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.5 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [durationMs, format, value]);

  return (
    <span ref={ref} className={cn('inline-block text-right tabular-nums', className)}>
      {display}
    </span>
  );
}
