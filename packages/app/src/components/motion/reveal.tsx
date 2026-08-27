'use client';

import * as React from 'react';

/**
 * Reveal-on-view wrapper — the entrance primitive of the motion system.
 *
 * Server-renders a plain `div` with `data-reveal`; `motion.css` hides it
 * (opacity + translateY) only when scripting is enabled and the visitor
 * has not requested reduced motion. Once the block enters the viewport an
 * IntersectionObserver flips `data-inview`, and the CSS transition settles
 * the block into place. Transform + opacity only, so reveals never cause
 * layout shift.
 *
 * `delayMs` staggers siblings that reveal together (~70–90ms steps).
 */
export function Reveal({
  delayMs = 0,
  style,
  children,
  ...props
}: React.ComponentProps<'div'> & { delayMs?: number }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [inView, setInView] = React.useState(false);

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      // Reveal once ~40px of the block clears the bottom edge, so the
      // animation is actually seen instead of finishing below the fold.
      { threshold: 0, rootMargin: '0px 0px -40px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-reveal=""
      data-inview={inView ? 'true' : undefined}
      style={
        delayMs > 0
          ? ({ ...style, '--motion-reveal-delay': `${delayMs}ms` } as React.CSSProperties)
          : style
      }
      {...props}
    >
      {children}
    </div>
  );
}
