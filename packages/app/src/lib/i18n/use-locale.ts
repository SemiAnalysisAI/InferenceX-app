'use client';

import { usePathname } from 'next/navigation';

import { isZhPathname, type Locale } from '@/lib/i18n/i18n';

export function useLocale(): Locale {
  const pathname = usePathname();
  return isZhPathname(pathname ?? '') ? 'zh' : 'en';
}
