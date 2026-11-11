import type { TutorialGuide } from '@/lib/tutorial/tutorial-content';

import { POWERX_TUTORIAL_PATH } from './tutorial-path';

export const POWERX_TUTORIAL: TutorialGuide = {
  contentDir: 'powerx',
  slug: 'tutorial',
  path: POWERX_TUTORIAL_PATH,
  seoPrefix: { en: 'PowerX tutorial', zh: 'PowerX 教程' },
  about: 'PowerX',
};
