import type { Metadata } from 'next';

import { PowerXTutorialArticle } from '@/components/powerx/powerx-tutorial-article';
import { createPowerXTutorialComponents } from '@/components/powerx/tutorial-mdx-components';
import { JsonLd } from '@/components/seo/json-ld';
import { PowerXFeatureGate } from '@/components/powerx/powerx-feature-gate';
import { compileBlogMdx } from '@/lib/blog/blog-mdx';
import {
  buildPowerXTutorialJsonLd,
  getPowerXTutorial,
  powerxTutorialMetadata,
} from '@/lib/powerx/tutorial';

const LOCALE = 'zh';

export function generateMetadata(): Metadata {
  return powerxTutorialMetadata(getPowerXTutorial(LOCALE).meta, LOCALE);
}

export default async function PowerXTutorialPageZh() {
  const { meta, raw } = getPowerXTutorial(LOCALE);
  const { content } = await compileBlogMdx(raw, LOCALE, createPowerXTutorialComponents(LOCALE));

  return (
    <PowerXFeatureGate locale={LOCALE}>
      <main className="relative">
        <JsonLd data={buildPowerXTutorialJsonLd(meta, LOCALE)} />
        <div className="container mx-auto max-w-5xl px-4 pb-24 lg:px-8">
          <PowerXTutorialArticle locale={LOCALE} meta={meta} content={content} />
        </div>
      </main>
    </PowerXFeatureGate>
  );
}
