import Link from 'next/link';

import { JsonLd } from '@/components/json-ld';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { toModel } from '@/lib/compare-enum-coerce';
import type { Locale } from '@/lib/i18n';
import { formatParamCount, getModelArchitecture } from '@/lib/model-architectures';
import { getModelPageSlugs } from '@/lib/model-pages';
import { getLocalizedModelPage } from '@/lib/model-pages-zh';
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
            <p className="text-sm text-muted-foreground mb-2">
              <Link
                href={`${localePrefix}/inference`}
                className="hover:text-foreground transition-colors"
              >
                {t.inferenceDashboard}
              </Link>{' '}
              / {t.modelBreadcrumb}
            </p>
            <h1 className="text-2xl lg:text-4xl font-bold tracking-tight">{t.indexTitle}</h1>
            <p className="mt-3 text-base lg:text-lg text-muted-foreground">{t.indexDescription}</p>
          </header>
          <ul
            data-testid="model-index-list"
            className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3 list-none p-0"
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
                    className="group h-full rounded-lg border border-border/50 bg-muted/30 px-4 py-3 flex flex-col gap-2 transition-[border-color,background-color,box-shadow] hover:border-brand/45 hover:bg-brand/5 hover:shadow-sm focus-visible:outline-none"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2 text-base font-semibold group-hover:text-primary transition-colors">
                        <ModelDeveloperLogo
                          developer={page.meta.developer}
                          locale={locale}
                          className="size-5"
                        />
                        {page.meta.title}
                      </span>
                      <span className="text-sm shrink-0 text-muted-foreground group-hover:text-foreground transition-colors">
                        →
                      </span>
                    </div>
                    {arch && (
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className="text-xs py-0">
                          {architectureLabel}
                        </Badge>
                        <Badge variant="outline" className="text-xs py-0">
                          {arch.attentionType === 'AlternatingSinkGQA'
                            ? attentionLabel
                            : attentionLabel}
                        </Badge>
                        <Badge variant="outline" className="text-xs py-0">
                          {formatParamCount(arch.totalParams)}
                        </Badge>
                      </span>
                    )}
                    <span className="text-sm text-muted-foreground line-clamp-3">
                      {page.meta.description}
                    </span>
                    <span className="text-xs text-muted-foreground mt-auto">
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
