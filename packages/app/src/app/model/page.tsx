import type { Metadata } from 'next';
import Link from 'next/link';

import { JsonLd } from '@/components/json-ld';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { toModel } from '@/lib/compare-enum-coerce';
import { formatParamCount, getModelArchitecture } from '@/lib/model-architectures';
import { getModelPage, getModelPageSlugs } from '@/lib/model-pages';
import { AUTHOR_HANDLE, SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

const PAGE_TITLE = 'Model Architectures';
const PAGE_DESCRIPTION =
  'Architecture deep-dives for every model benchmarked on InferenceX: MoE and attention design, official vendor eval scores, and live inference performance data.';

export const metadata: Metadata = {
  title: { absolute: `${PAGE_TITLE} — MoE, Attention & Evals per Model | ${SITE_NAME}` },
  description: PAGE_DESCRIPTION,
  // English-only page: canonical without hreflang alternates (no /zh sibling).
  alternates: { canonical: `${SITE_URL}/model` },
  // og:image / twitter:image come from the colocated opengraph-image.tsx.
  openGraph: {
    title: `${PAGE_TITLE} — MoE, Attention & Evals per Model`,
    description: PAGE_DESCRIPTION,
    url: `${SITE_URL}/model`,
    siteName: SITE_NAME,
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${PAGE_TITLE} — MoE, Attention & Evals per Model`,
    description: PAGE_DESCRIPTION,
    site: AUTHOR_HANDLE,
    creator: AUTHOR_HANDLE,
  },
};

export default function ModelIndexPage() {
  const pages = getModelPageSlugs()
    .map((slug) => ({ slug, page: getModelPage(slug) }))
    .filter((p): p is { slug: string; page: NonNullable<ReturnType<typeof getModelPage>> } =>
      Boolean(p.page),
    );

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: `${SITE_URL}/model`,
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL },
    hasPart: pages.map(({ slug, page }) => ({
      '@type': 'WebPage',
      name: page.meta.title,
      description: page.meta.description,
      url: `${SITE_URL}/model/${slug}`,
    })),
  };

  return (
    <main className="relative">
      <JsonLd data={jsonLd} />
      <div className="container mx-auto px-4 lg:px-8 flex flex-col gap-4">
        <Card>
          <header>
            <p className="text-sm text-muted-foreground mb-2">
              <Link href="/inference" className="hover:text-foreground transition-colors">
                Inference Dashboard
              </Link>{' '}
              / Model
            </p>
            <h1 className="text-2xl lg:text-4xl font-bold tracking-tight">{PAGE_TITLE}</h1>
            <p className="mt-3 text-base lg:text-lg text-muted-foreground">{PAGE_DESCRIPTION}</p>
          </header>
          <ul
            data-testid="model-index-list"
            className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3 list-none p-0"
          >
            {pages.map(({ slug, page }) => {
              const model = toModel(page.entry.displayName);
              const arch = model ? getModelArchitecture(model) : undefined;
              return (
                <li key={slug}>
                  <Link
                    href={`/model/${slug}`}
                    data-testid={`model-index-link-${slug}`}
                    className="group h-full rounded-lg border border-border/50 bg-muted/30 px-4 py-3 flex flex-col gap-2 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-base font-semibold group-hover:text-primary transition-colors">
                        {page.meta.title}
                      </span>
                      <span className="text-sm shrink-0 text-muted-foreground group-hover:text-foreground transition-colors">
                        →
                      </span>
                    </div>
                    {arch && (
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className="text-xs py-0">
                          {arch.architectureType === 'moe' ? 'MoE' : 'Dense'}
                        </Badge>
                        <Badge variant="outline" className="text-xs py-0">
                          {arch.attentionType === 'AlternatingSinkGQA'
                            ? 'Sink/Full GQA'
                            : arch.attentionType}
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
                      {page.meta.developer} &middot; Released {page.meta.releaseDate}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </main>
  );
}
