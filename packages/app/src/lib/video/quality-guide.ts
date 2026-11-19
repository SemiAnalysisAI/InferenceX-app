import type { TutorialGuide } from '@/lib/tutorial/tutorial-content';

import { VIDEO_QUALITY_GUIDE_PATH } from './quality-guide-path';

export const VIDEO_QUALITY_GUIDE: TutorialGuide = {
  contentDir: 'videogenx',
  slug: 'quality',
  path: VIDEO_QUALITY_GUIDE_PATH,
  seoPrefix: { en: 'VideoGenX quality guide', zh: 'VideoGenX 质量指南' },
  about: 'VideoGenX',
  eyebrow: { en: 'Guide', zh: '指南' },
  dashboard: 'video',
  returnedEvent: 'video_quality_guide_returned',
  testId: 'video-quality-guide',
};
