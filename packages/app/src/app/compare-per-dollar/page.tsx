import type { Metadata } from 'next';

import { SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

import { CompareMatrixLegend, ComparePairMatrix } from '@/components/compare/compare-pair-matrix';
import { JsonLd } from '@/components/json-ld';
import { Card } from '@/components/ui/card';
import { getComparablePairsByModelSlug } from '@/lib/compare-availability';
import { COMPARE_MODEL_SLUGS } from '@/lib/compare-slug';
import { bucketComparePairsByVendor, formatModelList } from '@/lib/compare-ssr';

export const dynamic = 'force-dynamic';

const DESCRIPTION =
  'GPU performance per dollar — head-to-head cost per million tokens across every model and hardware pair we benchmark. Performance normalized by owning-hyperscaler TCO for DeepSeek V4 Pro 1.6T, DeepSeek R1, Kimi K2.5/K2.6/K2.7-Code 1T, MiniMax M3 428B, GLM 5/5.1, Qwen 3.5 397B-A17B, and more. Pick the cheapest SKU for your workload.';

export const metadata: Metadata = {
  title: 'GPU Performance per Dollar',
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/compare-per-dollar` },
  openGraph: {
    title: `GPU Performance per Dollar | ${SITE_NAME}`,
    description: DESCRIPTION,
    url: `${SITE_URL}/compare-per-dollar`,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: `GPU Performance per Dollar | ${SITE_NAME}`,
    description: DESCRIPTION,
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: `GPU Performance per Dollar | ${SITE_NAME}`,
  description: DESCRIPTION,
  url: `${SITE_URL}/compare-per-dollar`,
};

export default async function ComparePerDollarIndexPage() {
  // Server-side filter (Neon availability): only show (model, pair) combos
  // where both GPUs have benchmark data for that model. Matches the /compare
  // index's behavior — no empty cells in navigation. The page-level handler at
  // /compare-per-dollar/[slug] still renders the empty-state for direct URL
  // hits.
  const comparablePairsByModel = await getComparablePairsByModelSlug();
  const totalUrls = [...comparablePairsByModel.values()].reduce((s, p) => s + p.length, 0);
  const modelsWithPairs = COMPARE_MODEL_SLUGS.filter(
    (m) => (comparablePairsByModel.get(m.slug)?.length ?? 0) > 0,
  );

  return (
    <>
      <JsonLd data={jsonLd} />
      <section>
        <Card>
          <h1 className="text-2xl lg:text-4xl font-bold tracking-tight">
            GPU Performance per Dollar
          </h1>
          <p className="mt-3 text-base lg:text-lg text-muted-foreground max-w-3xl">
            {totalUrls.toLocaleString()} head-to-head cost-per-million-tokens comparisons across{' '}
            {formatModelList(modelsWithPairs)}. Performance normalized by owning-hyperscaler TCO —
            each page renders the cost-per-token chart and an interpolated dollars-per-million
            comparison table so you can pick the cheaper SKU at any target interactivity level.
          </p>
          <div className="mt-5">
            <CompareMatrixLegend />
          </div>
        </Card>
      </section>

      {modelsWithPairs.map((model) => {
        const pairs = comparablePairsByModel.get(model.slug) ?? [];
        const buckets = bucketComparePairsByVendor(model.slug, pairs);
        const entries = [...buckets.nvidia, ...buckets.amd, ...buckets.cross];
        return (
          <section key={model.slug} id={model.slug}>
            <Card className="flex flex-col gap-4">
              <div>
                <h2 className="text-xl lg:text-2xl font-bold tracking-tight">{model.label}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {pairs.length} GPU pair{pairs.length === 1 ? '' : 's'} with cost-per-token
                  benchmark data on {model.label}.
                </p>
              </div>
              <ComparePairMatrix pairs={entries} hrefPrefix="/compare-per-dollar" />
            </Card>
          </section>
        );
      })}
    </>
  );
}
