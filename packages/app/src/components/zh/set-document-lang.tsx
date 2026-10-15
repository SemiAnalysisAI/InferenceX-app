'use client';

import { useEffect } from 'react';

/**
 * The root layout hardcodes <html lang="en"> and Next.js offers no supported
 * way to override it per route segment without splitting into multiple root
 * layouts. The /zh layout renders this to stamp the document language after
 * hydration (crawlers detect page language from content and hreflang, so the
 * pre-hydration attribute is not SEO-relevant; this keeps a11y tools correct).
 */
export function SetDocumentLang({ lang }: { lang: string }) {
  useEffect(() => {
    const previous = document.documentElement.lang;
    document.documentElement.lang = lang;
    return () => {
      document.documentElement.lang = previous;
    };
  }, [lang]);

  return null;
}
