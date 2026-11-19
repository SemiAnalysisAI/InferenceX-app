import { type Locale, localePath } from '@/lib/i18n/i18n';

/** The page's path alone, so client code can link here without the page config in `quality-guide.ts`. */
export const VIDEO_QUALITY_GUIDE_PATH = '/vgx/quality';

export const videoQualityGuidePath = (locale: Locale = 'en'): string =>
  localePath(VIDEO_QUALITY_GUIDE_PATH, locale);
