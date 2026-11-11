import type { Metadata } from 'next';

import { PowerXTutorialArticle } from '@/components/powerx/powerx-tutorial-article';
import { PowerXFeatureGate } from '@/components/powerx/powerx-feature-gate';
import { POWERX_TUTORIAL_WIDGETS } from '@/components/powerx/widgets';
import { JsonLd } from '@/components/seo/json-ld';
import { createTutorialComponents } from '@/components/tutorial/tutorial-mdx-components';
import { compileBlogMdx } from '@/lib/blog/blog-mdx';
import { POWERX_TUTORIAL } from '@/lib/powerx/tutorial';
import {
  buildTutorialJsonLd,
  getTutorial,
  tutorialMetadata,
} from '@/lib/tutorial/tutorial-content';

const LOCALE = 'en';

export function generateMetadata(): Metadata {
  return tutorialMetadata(POWERX_TUTORIAL, getTutorial(POWERX_TUTORIAL, LOCALE).meta, LOCALE);
}

export default async function PowerXTutorialPage() {
  const { meta, raw } = getTutorial(POWERX_TUTORIAL, LOCALE);
  const { content } = await compileBlogMdx(
    raw,
    LOCALE,
    createTutorialComponents(LOCALE, POWERX_TUTORIAL_WIDGETS),
  );

  return (
    <PowerXFeatureGate locale={LOCALE}>
      <main className="relative">
        <JsonLd data={buildTutorialJsonLd(POWERX_TUTORIAL, meta, LOCALE)} />
        <div className="container mx-auto max-w-5xl px-4 pb-24 lg:px-8">
          <PowerXTutorialArticle locale={LOCALE} meta={meta} content={content} />
        </div>
      </main>
    </PowerXFeatureGate>
  );
}
