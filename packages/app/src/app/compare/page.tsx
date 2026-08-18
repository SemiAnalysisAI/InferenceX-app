import type { Metadata } from 'next';
import Link from 'next/link';

import { SITE_NAME, SITE_URL, SUPPORTERS_LINE } from '@semianalysisai/inferencex-constants';

import { enAlternates } from '@/lib/i18n';

import { ComparePairMatrix } from '@/components/compare/compare-pair-matrix';
import { JsonLd } from '@/components/json-ld';
import { Card } from '@/components/ui/card';
import { getComparablePairsByModelSlug } from '@/lib/compare-availability';
import { buildCompareMatrix } from '@/lib/compare-matrix';
import { COMPARE_MODEL_SLUGS } from '@/lib/compare-slug';
import { formatModelList } from '@/lib/compare-ssr';

export const dynamic = 'force-dynamic';

const DESCRIPTION = `InferenceX is the independent, open-source chip inference benchmark from SemiAnalysis, with verified, reproducible nightly results. ${SUPPORTERS_LINE} Compare latency, throughput & cost head-to-head across DeepSeek V4 Pro, DeepSeek R1, Kimi K2, MiniMax M3, GLM 5, Qwen 3.5 & more.`;

export const metadata: Metadata = {
  title: 'Chip Comparisons',
  description: DESCRIPTION,
  alternates: enAlternates('/compare'),
  openGraph: {
    title: `Chip Comparisons | ${SITE_NAME}`,
    description: DESCRIPTION,
    url: `${SITE_URL}/compare`,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: `Chip Comparisons | ${SITE_NAME}`,
    description: DESCRIPTION,
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: `Chip Comparisons | ${SITE_NAME}`,
  description: DESCRIPTION,
  url: `${SITE_URL}/compare`,
};

export default async function CompareIndexPage() {
  // Server-side filter: only show (model, pair) combinations where both GPUs
  // have benchmark data for that model. Avoids cards that would link to an
  // empty-state page. The page-level handler at /compare/[slug] still renders
  // the empty-state for direct URL hits, so this is purely a navigation
  // hygiene concern.
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
          <h1 className="text-2xl lg:text-4xl font-bold tracking-tight">Chip Comparisons</h1>
          <p className="mt-3 text-base lg:text-lg text-muted-foreground max-w-3xl">
            {totalUrls.toLocaleString()} head-to-head inference benchmark comparisons across{' '}
            {formatModelList(modelsWithPairs)}. Each page includes interactive charts for latency,
            throughput, and cost metrics, plus an interpolated comparison table.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              data-testid="compare-index-per-dollar-link"
              href="/compare-per-dollar"
              className="inline-flex items-center gap-2 rounded-md bg-brand px-5 py-3 text-base lg:text-lg font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-brand/90"
            >
              Compare Chip performance per dollar
              <span aria-hidden="true" className="text-lg lg:text-xl">
                →
              </span>
            </Link>
            <Link
              data-testid="compare-index-precision-link"
              href="/compare-precision"
              className="inline-flex items-center gap-2 rounded-md border border-border px-5 py-3 text-base lg:text-lg font-semibold text-foreground shadow-sm transition-colors hover:bg-muted"
            >
              Compare precisions (FP8 vs BF16 ...)
              <span aria-hidden="true" className="text-lg lg:text-xl">
                →
              </span>
            </Link>
            <Link
              data-testid="compare-index-spec-decode-link"
              href="/compare-spec-decode"
              className="inline-flex items-center gap-2 rounded-md border border-border px-5 py-3 text-base lg:text-lg font-semibold text-foreground shadow-sm transition-colors hover:bg-muted"
            >
              Compare speculative decoding (MTP vs off)
              <span aria-hidden="true" className="text-lg lg:text-xl">
                →
              </span>
            </Link>
          </div>
        </Card>
      </section>

      {modelsWithPairs.map((model) => {
        const pairs = comparablePairsByModel.get(model.slug) ?? [];
        return (
          <section key={model.slug} id={model.slug}>
            <Card className="flex flex-col gap-4">
              <div>
                <h2 className="text-xl lg:text-2xl font-bold tracking-tight">{model.label}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {pairs.length} chip pair{pairs.length === 1 ? '' : 's'} with benchmark data on{' '}
                  {model.label}.
                </p>
              </div>
              <ComparePairMatrix
                matrix={buildCompareMatrix(model.slug, pairs)}
                hrefPrefix="/compare"
                modelLabel={model.label}
              />
            </Card>
          </section>
        );
      })}
    </>
  );
}
