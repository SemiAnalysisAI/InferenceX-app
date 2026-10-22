'use client';

import { useEffect } from 'react';

export function HashScroll() {
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const timer = setTimeout(() => {
      document.querySelector(`#${CSS.escape(hash)}`)?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  return null;
}
