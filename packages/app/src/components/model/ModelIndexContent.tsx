import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { JsonLd } from '@/components/seo/json-ld';
import { Card } from '@/components/ui/card';
import { Heading } from '@/components/ui/heading';
import { toModel } from '@/lib/compare/compare-enum-coerce';
import type { Locale } from '@/lib/i18n/i18n';
import { formatParamCount, getModelArchitecture } from '@/lib/catalog/model-architectures';
import { getModelPageSlugs } from '@/lib/catalog/model-pages';
import { getLocalizedModelPage } from '@/lib/catalog/model-pages-zh';
import { SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

import ModelDeveloperLogo from './ModelDeveloperLogo';
import { ModelIndexLink } from './ModelIndexLink';
import { MODEL_PAGE_COPY, modelDetailHref } from './model-page-copy';

export default function ModelIndexContent({ locale }: { locale: Locale }) {
  const t = MODEL_PAGE_COPY[locale];
  const pages = getModelPageSlugs()
    .map((slug) => ({ slug, page: getLocalizedModelPage(slug, locale) }))
    .filter((page): page is { slug: string; page: NonNullable<(typeof page)['page']> } =>
      Boolean(page.page),
    );
  const localePrefix = locale === 'zh' ? '/zh' : '';
  const pageUrl = `${SITE_URL}${localePrefix}/model`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: t.indexTitle,
    description: t.indexDescription,
    url: pageUrl,
    inLanguage: locale === 'zh' ? 'zh-CN' : 'en',
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL },
    hasPart: pages.map(({ slug, page }) => ({
      '@type': 'WebPage',
      name: page.meta.title,
      description: page.meta.description,
      url: `${SITE_URL}${modelDetailHref(slug, locale)}`,
      inLanguage: locale === 'zh' ? 'zh-CN' : 'en',
    })),
  };

  return (
    <main className="relative" data-testid="model-index-page">
      <JsonLd data={jsonLd} />
      <div className="container mx-auto px-4 lg:px-8 flex flex-col gap-4">
        <Card>
          <header>
            <p className="mb-2 text-sm text-muted-foreground">
              <Link
                href={`${localePrefix}/inference`}
                className="hover:text-foreground transition-colors"
              >
                {t.inferenceDashboard}
              </Link>{' '}
              / {t.modelBreadcrumb}
            </p>
            <Heading as="h1" level="page" className="text-balance">
              {t.indexTitle}
            </Heading>
            <p className="mt-3 max-w-3xl text-base text-muted-foreground">{t.indexDescription}</p>
          </header>
          <ul
            data-testid="model-index-list"
            className="-mx-3 mt-6 grid list-none grid-cols-1 gap-x-4 gap-y-1 p-0 md:grid-cols-2"
          >
            {pages.map(({ slug, page }) => {
              const model = toModel(page.entry.displayName);
              const arch = model ? getModelArchitecture(model) : undefined;
              const architectureLabel = arch
                ? arch.architectureType === 'moe'
                  ? locale === 'zh'
                    ? 'MoE（混合专家）'
                    : 'MoE'
                  : locale === 'zh'
                    ? 'Dense（稠密）'
                    : 'Dense'
                : null;
              const attentionLabel =
                arch?.attentionType === 'AlternatingSinkGQA'
                  ? locale === 'zh'
                    ? 'Sink/Full GQA'
                    : 'Sink/Full GQA'
                  : arch?.attentionType;
              return (
                <li key={slug}>
                  <ModelIndexLink
                    href={modelDetailHref(slug, locale)}
                    slug={slug}
                    locale={locale}
                    data-testid={`model-index-link-${slug}`}
                    className="group flex h-full flex-col gap-2 rounded-lg px-3 py-3 transition-colors hover:bg-muted/60 focus-visible:outline-none"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2 text-base font-medium">
                        <ModelDeveloperLogo
                          developer={page.meta.developer}
                          locale={locale}
                          className="size-5"
                        />
                        {page.meta.title}
                      </span>
                      <ArrowRight
                        aria-hidden="true"
                        className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
                      />
                    </div>
                    {arch && (
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {architectureLabel} · {attentionLabel} ·{' '}
                        {formatParamCount(arch.totalParams)}
                      </span>
                    )}
                    <span className="line-clamp-3 text-sm text-muted-foreground">
                      {page.meta.description}
                    </span>
                    <span className="mt-auto text-xs text-muted-foreground">
                      {page.meta.developer} &middot; {t.released} {page.meta.releaseDate}
                    </span>
                  </ModelIndexLink>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </main>
  );
}
