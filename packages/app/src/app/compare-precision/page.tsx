import type { Metadata } from 'next';

import { HW_REGISTRY, SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

import { enAlternates } from '@/lib/i18n/i18n';
import { socialMetadata } from '@/lib/seo/social-metadata';

import {
  CompareCatalogLink,
  CompareCatalogLinks,
  CompareModelSection,
  ComparePairGrid,
} from '@/components/compare/compare-catalog';
import { ComparePairCardLink } from '@/components/compare/compare-pair-card-link';
import { JsonLd } from '@/components/seo/json-ld';
import { Card } from '@/components/ui/card';
import { Heading } from '@/components/ui/heading';
import { ModelLogo } from '@/components/ui/model-logo';
import { type Model } from '@/lib/catalog/data-mappings';
import { PUBLIC_COMPARE_MODEL_SLUGS } from '@/lib/compare/compare-slug';
import { formatModelList } from '@/lib/compare/compare-ssr';
import { getPrecisionPairsByModelSlug } from '@/lib/compare/compare-variant-availability';
import {
  canonicalPrecisionCompareSlug,
  precisionDisplayLabel,
} from '@/lib/compare/compare-variant-slug';

export const revalidate = 86400;

const DESCRIPTION =
  'How does precision affect chip inference? Compare FP4, FP8, BF16 and INT4 head-to-head on the same chip across DeepSeek, Kimi, MiniMax, GLM and Qwen.';

/** Search snippet; the longer DESCRIPTION stays in the JSON-LD. */
const META_DESCRIPTION =
  'Compare FP4, FP8, BF16, INT4 and more precisions head-to-head on the same chip for DeepSeek, Kimi, MiniMax, GLM, Qwen & more. Independent, open benchmarks.';

export const metadata: Metadata = {
  title: 'Chip Precision Comparisons',
  description: META_DESCRIPTION,
  alternates: enAlternates('/compare-precision'),
  ...socialMetadata({
    title: `Chip Precision Comparisons | ${SITE_NAME}`,
    description: META_DESCRIPTION,
    url: `${SITE_URL}/compare-precision`,
    locale: 'en',
  }),
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: `Chip Precision Comparisons | ${SITE_NAME}`,
  description: DESCRIPTION,
  url: `${SITE_URL}/compare-precision`,
};

export default async function ComparePrecisionIndexPage() {
  const precisionPairsByModel = await getPrecisionPairsByModelSlug();
  const totalUrls = [...precisionPairsByModel.values()].reduce((s, p) => s + p.length, 0);
  const modelsWithPairs = PUBLIC_COMPARE_MODEL_SLUGS.filter(
    (m) => (precisionPairsByModel.get(m.slug)?.length ?? 0) > 0,
  );

  return (
    <>
      <JsonLd data={jsonLd} />
      <section>
        <Card>
          <Heading as="h1" level="page">
            Chip precision comparisons
          </Heading>
          <p className="mt-4 max-w-3xl text-base text-muted-foreground">
            {totalUrls.toLocaleString()} head-to-head precision comparisons across{' '}
            {formatModelList(modelsWithPairs)}. See how FP4, FP8, BF16, INT4 and other quantization
            levels affect throughput, cost and interactivity on the same chip. Each page renders the
            inference chart and an interpolated comparison table.
          </p>
          <CompareCatalogLinks testId="compare-precision-index-links">
            <CompareCatalogLink href="/compare">Chip vs chip comparisons</CompareCatalogLink>
            <CompareCatalogLink href="/compare-per-dollar">
              Performance per dollar
            </CompareCatalogLink>
          </CompareCatalogLinks>
        </Card>
      </section>

      {modelsWithPairs.map((model) => {
        const pairs = precisionPairsByModel.get(model.slug) ?? [];
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
          <CompareModelSection
            key={model.slug}
            id={model.slug}
            title={
              <>
                <ModelLogo model={model.displayName as Model} className="size-6" />
                {model.label}
              </>
            }
            summary={`${pairs.length} precision comparison${pairs.length === 1 ? '' : 's'} with benchmark data on ${model.label}`}
          >
            <ComparePairGrid>
              {[...gpuGroups.entries()].flatMap(([gpu, gpuPairs]) => {
                const meta = HW_REGISTRY[gpu];
                const gpuLabel = meta?.label ?? gpu.toUpperCase();
                const archLine = `${meta?.vendor ?? ''} · ${meta?.arch ?? ''}`;
                return gpuPairs.map(({ gpu: g, precA, precB }) => {
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
                });
              })}
            </ComparePairGrid>
          </CompareModelSection>
        );
      })}
    </>
  );
}
