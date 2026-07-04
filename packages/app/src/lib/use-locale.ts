'use client';

import { usePathname } from 'next/navigation';

import { isZhPathname, type Locale } from '@/lib/i18n';

/**
 * Current page language, derived from the /zh route prefix. Lets shared
 * client components (footer, dashboard chrome, nudges) render Chinese
 * strings on /zh pages without prop drilling — pair with a component-local
 * `STRINGS = { en: {...}, zh: {...} }` dictionary.
 */
export function useLocale(): Locale {
  const pathname = usePathname();
  return isZhPathname(pathname ?? '') ? 'zh' : 'en';
}
