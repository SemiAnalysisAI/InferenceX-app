import { type Locale, localePath } from '@/lib/i18n/i18n';

/** Kept apart from `tutorial.ts`, which reads the markdown from disk, so client code can link here. */
export const POWERX_TUTORIAL_PATH = '/powerx/tutorial';

export const powerxTutorialPath = (locale: Locale = 'en'): string =>
  localePath(POWERX_TUTORIAL_PATH, locale);
