import type { Locale } from '@/lib/i18n/i18n';

const DISPLAY_DATE_FORMATTERS: Record<Locale, Intl.DateTimeFormat> = {
  en: new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }),
  zh: new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }),
};

export function parseCalendarDate(dateStr: string): Date {
  if (dateStr.includes('-') && !dateStr.includes(',')) {
    const [year, month, day] = dateStr.split('-');
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const [datePart] = dateStr.split(', ');
  const [month, day, year] = datePart.split('/');
  return new Date(Number(year), Number(month) - 1, Number(day));
}

export function formatDisplayDate(dateStr: string, locale: Locale = 'en'): string {
  return DISPLAY_DATE_FORMATTERS[locale].format(parseCalendarDate(dateStr));
}
