import type { Metadata } from 'next';

import { SITE_NAME, SITE_URL, SUPPORTERS_LINE } from '@semianalysisai/inferencex-constants';

import { JsonLd } from '@/components/json-ld';
import { Card } from '@/components/ui/card';
import { CatalogLinkCard } from '@/components/catalog/catalog-link-card';
import { enAlternates } from '@/lib/i18n';
import { INFERENCE_MODEL_SLUGS } from '@/lib/inference-model-slug';
import { getAllRankingPageEntries } from '@/lib/rankings';

const title = 'GPU Rankings for LLM Inference';
const description =
  'Live leaderboards of the fastest and cheapest GPUs for serving open LLMs like DeepSeek, Kimi, GLM, MiniMax, and Qwen. Ranked by measured tokens/s per GPU and $ per million tokens, re-benchmarked continuously.';

export const metadata: Metadata = {
  title,
  description: `${description} ${SUPPORTERS_LINE}`,
  keywords: [
    'fastest GPU for LLM inference',
    'cheapest GPU for LLM inference',
    'GPU leaderboard LLM',
    'best GPU for AI inference',
    'LLM inference cost per token',
    'H100 vs B200 vs MI355X',
    'tokens per second per GPU',
    'GPU inference rankings',
  ],
  alternates: enAlternates('/rankings'),
  openGraph: {
    title: `${title} | ${SITE_NAME}`,
    description,
    url: `${SITE_URL}/rankings`,
    type: 'website',
  },
  twitter: { card: 'summary_large_image', title, description },
};

export default function RankingsIndexPage() {
  const entries = getAllRankingPageEntries();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title,
    description,
    url: `${SITE_URL}/rankings`,
    hasPart: entries.map((entry) => ({
      '@type': 'WebPage',
      name:
        entry.kind === 'fastest-gpu'
          ? `Fastest GPU for ${entry.model.seoName}`
          : `Cheapest GPU for ${entry.model.seoName}`,
      url: `${SITE_URL}/rankings/${entry.slug}`,
    })),
  };

  return (
    <main className="relative">
      <JsonLd data={jsonLd} />
      <div className="container mx-auto px-4 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <header className="pt-8 md:pt-12">
            <h1 className="max-w-4xl text-4xl font-bold tracking-heading text-balance md:text-5xl">
              {title}
            </h1>
            <p className="mt-4 max-w-3xl text-lg leading-relaxed text-muted-foreground">
              Which GPU should serve your model? Every ranking below is derived from measured
              benchmark runs at matched interactivity, not spec sheets, and re-renders as new
              results land.
            </p>
          </header>

          <section className="mt-10 mb-16 grid gap-4 sm:grid-cols-2">
            {INFERENCE_MODEL_SLUGS.map((model) => (
              <Card key={model.slug} className="gap-0 p-5">
                <h2 className="text-lg font-semibold tracking-tight">{model.seoName}</h2>
                <ul className="mt-4 space-y-2">
                  <li>
                    <CatalogLinkCard
                      href={`/rankings/fastest-gpu-for-${model.slug}`}
                      title={`Fastest GPU for ${model.seoName}`}
                      description="Ranked by measured tokens/s per GPU"
                      slug={`fastest-gpu-for-${model.slug}`}
                      locale="en"
                      event="ranking_index_entry_clicked"
                    />
                  </li>
                  <li>
                    <CatalogLinkCard
                      href={`/rankings/cheapest-gpu-for-${model.slug}`}
                      title={`Cheapest GPU for ${model.seoName}`}
                      description="Ranked by measured cost per million tokens"
                      slug={`cheapest-gpu-for-${model.slug}`}
                      locale="en"
                      event="ranking_index_entry_clicked"
                    />
                  </li>
                </ul>
              </Card>
            ))}
          </section>
        </div>
      </div>
    </main>
  );
}
