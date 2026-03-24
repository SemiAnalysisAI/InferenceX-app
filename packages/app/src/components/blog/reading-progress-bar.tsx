'use client';

import { useEffect, useRef, useState } from 'react';
import { track } from '@/lib/analytics';

export function ReadingProgressBar({ slug }: { slug: string }) {
  const [progress, setProgress] = useState(0);
  const firedRef = useRef<Set<number>>(new Set());
  const rafRef = useRef<number>(0);

  useEffect(() => {
    function onScroll() {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const article = document.querySelector('[data-blog-article]');
        if (!article) return;

        const rect = article.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        // 0 when article top is at viewport top, 1 when article bottom reaches viewport bottom
        const totalDistance = rect.height - viewportHeight;
        const p = totalDistance <= 0 ? 1 : Math.min(1, Math.max(0, -rect.top / totalDistance));

        setProgress(p);

        for (const milestone of [25, 50, 75, 100]) {
          if (p * 100 >= milestone && !firedRef.current.has(milestone)) {
            firedRef.current.add(milestone);
            track('blog_read_milestone', { milestone, slug });
          }
        }
      });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(rafRef.current);
    };
  }, [slug]);

  if (progress <= 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-0.5 pointer-events-none">
      <div
        className="h-full bg-brand transition-[width] duration-150"
        style={{ width: `${progress * 100}%` }}
      />
    </div>
  );
}
