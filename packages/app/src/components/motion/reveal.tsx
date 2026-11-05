'use client';

import * as React from 'react';

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
