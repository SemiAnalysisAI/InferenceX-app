import type { TutorialGuide } from '@/lib/tutorial/tutorial-content';

import { VIDEO_QUALITY_GUIDE_PATH } from './quality-guide-path';

export const VIDEO_QUALITY_GUIDE: TutorialGuide = {
  contentDir: 'videogenx',
  slug: 'quality',
  path: VIDEO_QUALITY_GUIDE_PATH,
  seoPrefix: { en: 'VideoGenX quality guide', zh: 'VideoGenX 质量指南' },
  about: 'VideoGenX',
};
