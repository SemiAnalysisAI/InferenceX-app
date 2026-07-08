import type { Metadata } from 'next';
import Link from 'next/link';

import {
  HW_REGISTRY,
  SITE_NAME,
  SITE_URL,
  SUPPORTERS_LINE,
} from '@semianalysisai/inferencex-constants';

import { enAlternates } from '@/lib/i18n';

import { ComparePairCardLink } from '@/components/compare/compare-pair-card-link';
import { JsonLd } from '@/components/json-ld';
import { Card } from '@/components/ui/card';
import { COMPARE_MODEL_SLUGS } from '@/lib/compare-slug';
import { formatModelList } from '@/lib/compare-ssr';
import { getPrecisionPairsByModelSlug } from '@/lib/compare-variant-availability';
import { canonicalPrecisionCompareSlug, precisionDisplayLabel } from '@/lib/compare-variant-slug';

export const dynamic = 'force-dynamic';

const DESCRIPTION = `How does precision affect GPU inference performance? InferenceX is the independent, open-source benchmark from SemiAnalysis, with verified, reproducible results. ${SUPPORTERS_LINE} Compare FP4, FP8, BF16, INT4, and more quantization levels head-to-head on the same GPU across DeepSeek V4 Pro, DeepSeek R1, Kimi K2, MiniMax M3, GLM 5, Qwen 3.5 & more.`;

export const metadata: Metadata = {
  title: 'GPU Precision Comparisons',
  description: DESCRIPTION,
  alternates: enAlternates('/compare-precision'),
  openGraph: {
    title: `GPU Precision Comparisons | ${SITE_NAME}`,
    description: DESCRIPTION,
    url: `${SITE_URL}/compare-precision`,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: `GPU Precision Comparisons | ${SITE_NAME}`,
    description: DESCRIPTION,
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: `GPU Precision Comparisons | ${SITE_NAME}`,
  description: DESCRIPTION,
  url: `${SITE_URL}/compare-precision`,
};

export default async function ComparePrecisionIndexPage() {
  const precisionPairsByModel = await getPrecisionPairsByModelSlug();
  const totalUrls = [...precisionPairsByModel.values()].reduce((s, p) => s + p.length, 0);
  const modelsWithPairs = COMPARE_MODEL_SLUGS.filter(
    (m) => (precisionPairsByModel.get(m.slug)?.length ?? 0) > 0,
  );

  return (
    <>
      <JsonLd data={jsonLd} />
      <section>
        <Card>
          <h1 className="text-2xl lg:text-4xl font-bold tracking-tight">
            GPU Precision Comparisons
          </h1>
          <p className="mt-3 text-base lg:text-lg text-muted-foreground max-w-3xl">
            {totalUrls.toLocaleString()} head-to-head precision comparisons across{' '}
            {formatModelList(modelsWithPairs)}. See how FP4, FP8, BF16, INT4, and more quantization
            levels affect throughput, cost, and interactivity on the same GPU — each page renders
            the inference chart and an interpolated comparison table.
          </p>
          <div className="mt-6 flex flex-wrap gap-3" data-testid="compare-precision-index-links">
            <Link
              href="/compare"
              className="inline-flex items-center gap-2 rounded-md border border-border px-5 py-3 text-base lg:text-lg font-semibold text-foreground shadow-sm transition-colors hover:bg-muted"
            >
              GPU vs GPU comparisons
              <span aria-hidden="true" className="text-lg lg:text-xl">
                →
              </span>
            </Link>
            <Link
              href="/compare-per-dollar"
              className="inline-flex items-center gap-2 rounded-md border border-border px-5 py-3 text-base lg:text-lg font-semibold text-foreground shadow-sm transition-colors hover:bg-muted"
            >
              Performance per dollar
              <span aria-hidden="true" className="text-lg lg:text-xl">
                →
              </span>
            </Link>
          </div>
        </Card>
      </section>

      {modelsWithPairs.map((model) => {
        const pairs = precisionPairsByModel.get(model.slug) ?? [];
        // Group by GPU for cleaner presentation.
        const gpuGroups = new Map<string, typeof pairs>();
        for (const pair of pairs) {
          let list = gpuGroups.get(pair.gpu);
          if (!list) {
            list = [];
            gpuGroups.set(pair.gpu, list);
          }
          list.push(pair);
        }

        return (
          <section key={model.slug} id={model.slug}>
            <Card className="flex flex-col gap-4">
              <div>
                <h2 className="text-xl lg:text-2xl font-bold tracking-tight">{model.label}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {pairs.length} precision comparison{pairs.length === 1 ? '' : 's'} with benchmark
                  data on {model.label}.
                </p>
              </div>
              {[...gpuGroups.entries()].map(([gpu, gpuPairs]) => {
                const meta = HW_REGISTRY[gpu];
                const gpuLabel = meta?.label ?? gpu.toUpperCase();
                const archLine = `${meta?.vendor ?? ''} · ${meta?.arch ?? ''}`;
                return (
                  <div key={`${model.slug}__${gpu}`} className="flex flex-col gap-3">
                    <div>
                      <h3 className="text-base font-semibold">{gpuLabel}</h3>
                      <p className="text-xs text-muted-foreground mt-1">{archLine}</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {gpuPairs.map(({ gpu: g, precA, precB }) => {
                        const slug = canonicalPrecisionCompareSlug(model.slug, g, precA, precB);
                        const label = `${gpuLabel} — ${precisionDisplayLabel(precA)} vs ${precisionDisplayLabel(precB)}`;
                        return (
                          <ComparePairCardLink
                            key={slug}
                            href={`/compare-precision/${slug}`}
                            slug={slug}
                            label={label}
                            archLine={archLine}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </Card>
          </section>
        );
      })}
    </>
  );
}
