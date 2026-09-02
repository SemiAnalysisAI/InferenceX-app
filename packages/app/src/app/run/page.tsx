import type { Metadata } from 'next';

import { SITE_NAME, SITE_URL, SUPPORTERS_LINE } from '@semianalysisai/inferencex-constants';

import { JsonLd } from '@/components/json-ld';
import { CatalogLinkCard } from '@/components/catalog/catalog-link-card';
import { Card } from '@/components/ui/card';
import { enAlternates } from '@/lib/i18n';
import { INFERENCE_MODEL_SLUGS } from '@/lib/inference-model-slug';
import { runPageHeading, type RunPageEntry } from '@/lib/run-pages';
import { getAvailableRunEntries } from '@/lib/run-rankings-data.server';

export const dynamic = 'force-dynamic';

const title = 'Run Any Model on Any GPU: Measured Results';
const description =
  'Measured throughput, latency, and cost for every open LLM and GPU pairing the InferenceX fleet benchmarks: DeepSeek, Kimi, GLM, MiniMax, and Qwen on H100, H200, B200, GB200 NVL72, MI300X, MI325X, MI355X, and more.';

export function generateMetadata(): Metadata {
  return {
    title,
    description: `${description} ${SUPPORTERS_LINE}`,
    keywords: [
      'run LLM on GPU benchmark',
      'LLM GPU throughput',
      'model on GPU performance',
      'DeepSeek GPU benchmark',
      'Kimi GPU benchmark',
      'LLM inference cost per GPU',
      'H100 LLM benchmark',
      'MI355X LLM benchmark',
    ],
    alternates: enAlternates('/run'),
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description,
      url: `${SITE_URL}/run`,
      type: 'website',
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function RunIndexPage() {
  const entries = await getAvailableRunEntries();
  const byModel = new Map<string, RunPageEntry[]>();
  for (const entry of entries) {
    const list = byModel.get(entry.model.slug) ?? [];
    list.push(entry);
    byModel.set(entry.model.slug, list);
  }
  const models = INFERENCE_MODEL_SLUGS.filter((model) => byModel.has(model.slug));

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title,
    description,
    url: `${SITE_URL}/run`,
    hasPart: entries.map((entry) => ({
      '@type': 'WebPage',
      name: runPageHeading(entry),
      url: `${SITE_URL}/run/${entry.slug}`,
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
              Pick a model and a GPU: each page below answers how fast it runs, what it costs per
              million tokens, and which serving engine produced the number, from continuously
              re-benchmarked runs on real hardware.
            </p>
          </header>

          <section className="mt-10 mb-16 space-y-8">
            {models.map((model) => (
              <Card key={model.slug} className="gap-0 p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-lg font-semibold tracking-tight">{model.seoName}</h2>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {(byModel.get(model.slug) ?? []).length} GPUs
                  </span>
                </div>
                <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                  {(byModel.get(model.slug) ?? []).map((entry) => (
                    <li key={entry.slug}>
                      <CatalogLinkCard
                        href={`/run/${entry.slug}`}
                        title={`${model.seoName} on ${entry.chip.label}`}
                        description="Measured throughput, latency & cost"
                        slug={entry.slug}
                        locale="en"
                        event="run_index_entry_clicked"
                      />
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </section>
        </div>
      </div>
    </main>
  );
}
