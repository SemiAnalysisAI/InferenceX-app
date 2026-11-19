import type { Metadata } from 'next';

import { SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

import { JsonLd } from '@/components/seo/json-ld';
import { CatalogLinkCard } from '@/components/catalog/catalog-link-card';
import { Card } from '@/components/ui/card';
import { Heading } from '@/components/ui/heading';
import { ModelLogo } from '@/components/ui/model-logo';
import { enAlternates } from '@/lib/i18n/i18n';
import { socialMetadata } from '@/lib/seo/social-metadata';
import { PUBLIC_INFERENCE_MODEL_SLUGS } from '@/lib/routing/inference-model-slug';
import { runPageHeading, type RunPageEntry } from '@/lib/live-seo/run-pages';
import { getAvailableRunEntries } from '@/lib/live-seo/run-rankings-data.server';

export const revalidate = 86400;

const title = 'Run Any Model on Any GPU: Measured Results';
const heading = 'Run any model on any GPU';
const description =
  'Measured throughput, latency and cost for each open LLM and GPU pair InferenceX tests: DeepSeek, Kimi, GLM and Qwen on H100, B200, GB200, MI355X and more.';

export function generateMetadata(): Metadata {
  return {
    title,
    description,
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
    ...socialMetadata({
      title: `${title} | ${SITE_NAME}`,
      description,
      url: `${SITE_URL}/run`,
      locale: 'en',
    }),
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
  const models = PUBLIC_INFERENCE_MODEL_SLUGS.filter((model) => byModel.has(model.slug));

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
            <Heading as="h1" level="display" className="max-w-4xl">
              {heading}
            </Heading>
            <p className="mt-4 max-w-3xl text-lg leading-relaxed text-muted-foreground">
              Pick a model and a GPU: each page below answers how fast it runs, what it costs per
              million tokens, and which serving engine produced the number, from continuously
              re-benchmarked runs on real hardware.
            </p>
          </header>

          <section className="mt-10 mb-16 space-y-4">
            {models.map((model) => (
              <Card key={model.slug} className="gap-0 p-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="flex items-center gap-2 text-lg font-semibold">
                    <ModelLogo model={model.model} className="size-5" />
                    {model.seoName}
                  </h2>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {(byModel.get(model.slug) ?? []).length} GPUs
                  </span>
                </div>
                <ul className="-mx-3 mt-3 grid gap-x-4 gap-y-1 sm:grid-cols-2">
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
