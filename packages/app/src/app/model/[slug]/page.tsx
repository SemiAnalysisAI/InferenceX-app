import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import 'katex/dist/katex.min.css';

import { JsonLd } from '@/components/json-ld';
import EmbeddedModelDashboard from '@/components/model/EmbeddedModelDashboard';
import ModelArchitectureInline from '@/components/model/ModelArchitectureInline';
import { Card } from '@/components/ui/card';
import { compileBlogMdx } from '@/lib/blog-mdx';
import { comparisonScenarioForModel } from '@/lib/compare-agentx';
import { COMPARE_MODEL_ALIASES } from '@/lib/compare-slug';
import { getModelPage, getModelPageSlugs } from '@/lib/model-pages';
import { AUTHOR_HANDLE, SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

interface Props {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return getModelPageSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = getModelPage(slug);
  if (!page) return {};
  const title = `${page.meta.title} — Architecture, Evals & Inference Performance`;
  return {
    title: { absolute: `${title} | ${SITE_NAME}` },
    description: page.meta.description,
    // English-only page: canonical without hreflang alternates (no /zh sibling).
    alternates: { canonical: `${SITE_URL}/model/${slug}` },
    // og:image / twitter:image come from the colocated opengraph-image.tsx.
    openGraph: {
      title,
      description: page.meta.description,
      url: `${SITE_URL}/model/${slug}`,
      siteName: SITE_NAME,
      type: 'article',
      locale: 'en_US',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: page.meta.description,
      site: AUTHOR_HANDLE,
      creator: AUTHOR_HANDLE,
    },
  };
}

export default async function ModelPage({ params }: Props) {
  const { slug } = await params;
  // Alias slugs (e.g. /model/glm-5) resolve to their canonical page, matching
  // the /compare route family's alias behavior.
  const canonical = COMPARE_MODEL_ALIASES[slug];
  if (canonical) redirect(`/model/${canonical}`);

  const page = getModelPage(slug);
  if (!page) notFound();

  const { meta, entry, raw } = page;
  const { content } = await compileBlogMdx(raw);
  const scenario = comparisonScenarioForModel(entry);
  const dashboardQuery = new URLSearchParams({
    g_model: entry.displayName,
    i_seq: scenario.sequence,
    i_optimal: '1',
  });

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `${meta.title} — Architecture, Evals & Inference Performance`,
    description: meta.description,
    url: `${SITE_URL}/model/${slug}`,
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL },
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: SITE_NAME, item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Model Architectures', item: `${SITE_URL}/model` },
      { '@type': 'ListItem', position: 3, name: meta.title, item: `${SITE_URL}/model/${slug}` },
    ],
  };

  return (
    <main className="relative">
      <JsonLd data={jsonLd} />
      <JsonLd data={breadcrumbJsonLd} />
      <div className="container mx-auto px-4 lg:px-8 flex flex-col gap-4">
        <Card>
          <header>
            <p className="text-sm text-muted-foreground mb-2">
              <Link href="/inference" className="hover:text-foreground transition-colors">
                Inference Dashboard
              </Link>{' '}
              /{' '}
              <Link href="/model" className="hover:text-foreground transition-colors">
                Model
              </Link>
            </p>
            <h1 className="text-2xl lg:text-4xl font-bold tracking-tight">{meta.title}</h1>
            <p className="mt-3 text-base lg:text-lg text-muted-foreground">{meta.description}</p>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mt-3">
              <span>{meta.developer}</span>
              <span>&middot;</span>
              <span>Released {meta.releaseDate}</span>
            </div>
          </header>
          <div className="mt-6">
            <ModelArchitectureInline displayName={entry.displayName} />
          </div>
          <div className="mt-6 pt-6 border-t border-border/40">
            <article className="prose prose-neutral dark:prose-invert max-w-none blog-prose">
              {content}
            </article>
          </div>
        </Card>
        <Card data-testid="model-page-dashboard">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
            <div>
              <h2 className="text-lg font-semibold mb-1">
                {meta.title} inference performance ({scenario.label})
              </h2>
              <p className="text-muted-foreground text-sm">
                Live InferenceX benchmark data for {entry.label} on the {scenario.label} workload,
                measured in total tokens per dollar across every chip config with data.
              </p>
            </div>
            <Link
              href={`/inference?${dashboardQuery}`}
              className="text-sm text-primary hover:underline whitespace-nowrap"
            >
              Open in full dashboard →
            </Link>
          </div>
          <EmbeddedModelDashboard displayName={entry.displayName} sequence={scenario.sequence} />
        </Card>
      </div>
    </main>
  );
}
