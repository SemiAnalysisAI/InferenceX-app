import type { Metadata } from 'next';

import { PowerXTutorialArticle } from '@/components/powerx/powerx-tutorial-article';
import { createPowerXTutorialComponents } from '@/components/powerx/tutorial-mdx-components';
import { JsonLd } from '@/components/seo/json-ld';
import { extractHeadings } from '@/lib/blog/blog';
import { compileBlogMdx } from '@/lib/blog/blog-mdx';
import { remarkGithubAlerts } from '@/lib/powerx/remark-github-alerts';
import { remarkGithubHtml } from '@/lib/powerx/remark-github-html';
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
  const { content } = await compileBlogMdx(raw, LOCALE, {
    format: 'md',
    components: createPowerXTutorialComponents(LOCALE),
    remarkPlugins: [remarkGithubAlerts, remarkGithubHtml],
  });

  return (
    <main className="relative">
      <JsonLd data={buildPowerXTutorialJsonLd(meta, LOCALE)} />
      <div className="container mx-auto max-w-6xl px-4 pb-12 lg:px-8">
        <PowerXTutorialArticle
          locale={LOCALE}
          meta={meta}
          headings={extractHeadings(raw)}
          content={content}
        />
      </div>
    </main>
  );
}
