import { type Locale, localePath } from '@/lib/i18n/i18n';

/** The page's path alone, so client code can link here without the page config in `tutorial.ts`. */
export const POWERX_TUTORIAL_PATH = '/pwx/tutorial';

export const powerxTutorialPath = (locale: Locale = 'en'): string =>
  localePath(POWERX_TUTORIAL_PATH, locale);
