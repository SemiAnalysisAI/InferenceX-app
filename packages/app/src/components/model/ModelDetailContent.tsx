import Link from 'next/link';

import { JsonLd } from '@/components/json-ld';
import { Card } from '@/components/ui/card';
import { Heading } from '@/components/ui/heading';
import { compileBlogMdx } from '@/lib/blog-mdx';
import { comparisonScenarioForModel } from '@/lib/compare-agentx';
import type { Locale } from '@/lib/i18n';
import type { ModelPage } from '@/lib/model-pages';
import { SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

import EmbeddedModelDashboard from './EmbeddedModelDashboard';
import ModelArchitectureInline from './ModelArchitectureInline';
import ModelDeveloperLogo from './ModelDeveloperLogo';
import {
  MODEL_PAGE_COPY,
  modelDashboardHref,
  modelEnglishArticleHref,
  modelIndexHref,
} from './model-page-copy';

export default async function ModelDetailContent({
  slug,
  page,
  locale,
}: {
  slug: string;
  page: ModelPage;
  locale: Locale;
}) {
  const { meta, entry, raw } = page;
  const { content } = await compileBlogMdx(raw);
  const scenario = comparisonScenarioForModel(entry);
  const dashboardQuery = new URLSearchParams({
    g_model: entry.displayName,
    i_seq: scenario.sequence,
    i_optimal: '1',
  });
  const t = MODEL_PAGE_COPY[locale];
  const localePrefix = locale === 'zh' ? '/zh' : '';
  const pageUrl = `${SITE_URL}${localePrefix}/model/${slug}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: t.detailTitle(meta.title),
    description: meta.description,
    url: pageUrl,
    inLanguage: locale === 'zh' ? 'zh-CN' : 'en',
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL },
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: SITE_NAME, item: SITE_URL },
      {
        '@type': 'ListItem',
        position: 2,
        name: t.indexTitle,
        item: `${SITE_URL}${modelIndexHref(locale)}`,
      },
      { '@type': 'ListItem', position: 3, name: meta.title, item: pageUrl },
    ],
  };

  return (
    <main className="relative" data-testid="model-detail-page">
      <JsonLd data={jsonLd} />
      <JsonLd data={breadcrumbJsonLd} />
      <div className="container mx-auto px-4 lg:px-8 flex flex-col gap-4">
        <Card>
          <header>
            <p className="text-sm text-muted-foreground mb-2">
              <Link
                href={`${localePrefix}/inference`}
                className="hover:text-foreground transition-colors"
              >
                {t.inferenceDashboard}
              </Link>{' '}
              /{' '}
              <Link
                href={modelIndexHref(locale)}
                className="hover:text-foreground transition-colors"
              >
                {t.modelBreadcrumb}
              </Link>
            </p>
            <div className="flex items-center gap-3">
              <ModelDeveloperLogo
                developer={meta.developer}
                locale={locale}
                className="size-8 lg:size-10"
              />
              <Heading as="h1" level="page">
                {meta.title}
              </Heading>
            </div>
            <p className="mt-3 text-base lg:text-lg text-muted-foreground">{meta.description}</p>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mt-3">
              <span>{meta.developer}</span>
              <span>&middot;</span>
              <span>
                {t.released} {meta.releaseDate}
              </span>
            </div>
          </header>
          <div
            className="mt-6 overflow-x-auto rounded-xl border border-border/40 bg-muted/10 p-3 md:p-5"
            data-testid="model-architecture-diagram"
          >
            <ModelArchitectureInline displayName={entry.displayName} />
          </div>
          <div className="mt-6 pt-6 border-t border-border/40">
            {locale === 'zh' && (
              <aside
                role="note"
                data-testid="model-english-article-notice"
                className="mb-6 rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground"
              >
                <p>{t.englishArticleNotice}</p>
                <Link
                  href={modelEnglishArticleHref(slug)}
                  className="mt-2 inline-flex text-primary hover:underline"
                >
                  {t.englishArticleLink}
                </Link>
              </aside>
            )}
            <article
              data-testid="model-page-article"
              lang={locale === 'zh' ? 'en' : undefined}
              className="prose prose-neutral dark:prose-invert max-w-none blog-prose"
            >
              {content}
            </article>
          </div>
        </Card>
        <Card data-testid="model-page-dashboard">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
            <div>
              <h2 className="text-lg font-semibold mb-1">
                {t.dashboardHeading(meta.title, scenario.label)}
              </h2>
              <p className="text-muted-foreground text-sm">
                {t.dashboardDescription(entry.label, scenario.label)}
              </p>
            </div>
            <Link
              href={modelDashboardHref(dashboardQuery.toString(), locale)}
              className="text-sm text-primary hover:underline whitespace-nowrap"
            >
              {t.openDashboard}
            </Link>
          </div>
          <EmbeddedModelDashboard displayName={entry.displayName} sequence={scenario.sequence} />
        </Card>
      </div>
    </main>
  );
}
