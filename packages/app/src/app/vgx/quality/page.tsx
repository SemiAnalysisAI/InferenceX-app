import type { Metadata } from 'next';

import { JsonLd } from '@/components/seo/json-ld';
import { TutorialArticle } from '@/components/tutorial/tutorial-article';
import { createTutorialComponents } from '@/components/tutorial/tutorial-mdx-components';
import { videoQualityGuideWidgets } from '@/components/video-benchmark/quality-guide';
import { compileBlogMdx } from '@/lib/blog/blog-mdx';
import {
  buildTutorialJsonLd,
  getTutorial,
  tutorialMetadata,
} from '@/lib/tutorial/tutorial-content';
import { VIDEO_QUALITY_GUIDE } from '@/lib/video/quality-guide';
import { loadReferencePsnrEvidence } from '@/lib/video/reference-psnr-evidence';

/** A ceiling only: the video read cache's five-minute window sets the actual refresh. */
export const revalidate = 3600;

const LOCALE = 'en';

export function generateMetadata(): Metadata {
  return tutorialMetadata(
    VIDEO_QUALITY_GUIDE,
    getTutorial(VIDEO_QUALITY_GUIDE, LOCALE).meta,
    LOCALE,
  );
}

export default async function VideoQualityGuidePage() {
  const { meta, raw } = getTutorial(VIDEO_QUALITY_GUIDE, LOCALE);
  const evidence = await loadReferencePsnrEvidence();
  const { content } = await compileBlogMdx(
    raw,
    LOCALE,
    createTutorialComponents(LOCALE, videoQualityGuideWidgets(evidence)),
  );

  return (
    <main className="relative">
      <JsonLd data={buildTutorialJsonLd(VIDEO_QUALITY_GUIDE, meta, LOCALE)} />
      <div className="container mx-auto max-w-5xl px-4 pb-24 lg:px-8">
        <TutorialArticle
          locale={LOCALE}
          meta={meta}
          content={content}
          guide={VIDEO_QUALITY_GUIDE}
        />
      </div>
    </main>
  );
}
