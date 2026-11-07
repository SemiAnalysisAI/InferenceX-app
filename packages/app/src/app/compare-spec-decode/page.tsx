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
import {
  getSpecDecodePairsByModelSlug,
  type SpecDecodePair,
} from '@/lib/compare/compare-variant-availability';
import { PUBLIC_COMPARE_MODEL_SLUGS, type CompareModelSlug } from '@/lib/compare/compare-slug';
import { formatModelList } from '@/lib/compare/compare-ssr';
import {
  canonicalSpecDecodeCompareSlug,
  precisionDisplayLabel,
  specMethodDisplayLabel,
} from '@/lib/compare/compare-variant-slug';

export const revalidate = 86400;

const DESCRIPTION =
  'Does speculative decoding (MTP, EAGLE) improve LLM inference throughput and cost? Each page compares one model and chip with the method on versus off.';

/** Search snippet; the longer DESCRIPTION stays in the JSON-LD. */
const META_DESCRIPTION =
  'Speculative decoding on vs off for the same model and chip: does MTP or EAGLE raise inference throughput and cut cost? Independent, open-source benchmarks.';

export const metadata: Metadata = {
  title: 'Chip Speculative Decoding Comparisons',
  description: META_DESCRIPTION,
  alternates: enAlternates('/compare-spec-decode'),
  ...socialMetadata({
    title: `Chip Speculative Decoding Comparisons | ${SITE_NAME}`,
    description: META_DESCRIPTION,
    url: `${SITE_URL}/compare-spec-decode`,
    locale: 'en',
  }),
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: `Chip Speculative Decoding Comparisons | ${SITE_NAME}`,
  description: DESCRIPTION,
  url: `${SITE_URL}/compare-spec-decode`,
};

function buildCards(
  model: CompareModelSlug,
  pairs: SpecDecodePair[],
): { slug: string; label: string; archLine: string }[] {
  return pairs.map(({ gpu, precision, method }) => {
    const gpuMeta = HW_REGISTRY[gpu];
    const gpuLabel = gpuMeta?.label ?? gpu.toUpperCase();
    const precLabel = precisionDisplayLabel(precision);
    const methodLabel = specMethodDisplayLabel(model.displayName, method);
    return {
      slug: canonicalSpecDecodeCompareSlug(model.slug, gpu, precision, method),
      label: `${gpuLabel} ${precLabel} — ${methodLabel} vs Off`,
      archLine: `${gpuMeta?.vendor ?? '—'} · ${gpuMeta?.arch ?? '—'}`,
    };
  });
}

export default async function CompareSpecDecodeIndexPage() {
  const pairsByModel = await getSpecDecodePairsByModelSlug();
  const totalUrls = [...pairsByModel.values()].reduce((s, p) => s + p.length, 0);
  const modelsWithPairs = PUBLIC_COMPARE_MODEL_SLUGS.filter(
    (m) => (pairsByModel.get(m.slug)?.length ?? 0) > 0,
  );

  return (
    <>
      <JsonLd data={jsonLd} />
      <section>
        <Card>
          <Heading as="h1" level="page">
            Chip speculative decoding comparisons
          </Heading>
          <p className="mt-4 max-w-3xl text-base text-muted-foreground">
            {totalUrls.toLocaleString()} speculative decoding comparisons across{' '}
            {formatModelList(modelsWithPairs)}. Each page compares inference with the speculative
            decoding method (MTP, EAGLE and others) enabled versus disabled on the same model and
            chip, covering throughput, cost and interactivity at matched operating points.
          </p>
          <CompareCatalogLinks testId="compare-spec-decode-index-links">
            <CompareCatalogLink href="/compare">Chip comparisons</CompareCatalogLink>
            <CompareCatalogLink href="/compare-per-dollar">
              Performance per dollar
            </CompareCatalogLink>
          </CompareCatalogLinks>
        </Card>
      </section>

      {modelsWithPairs.map((model) => {
        const pairs = pairsByModel.get(model.slug) ?? [];
        const cards = buildCards(model, pairs);
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
            summary={`${pairs.length} speculative decoding comparison${pairs.length === 1 ? '' : 's'} with benchmark data on ${model.label}`}
          >
            <ComparePairGrid>
              {cards.map(({ slug, label, archLine }) => (
                <ComparePairCardLink
                  key={slug}
                  href={`/compare-spec-decode/${slug}`}
                  slug={slug}
                  label={label}
                  archLine={archLine}
                />
              ))}
            </ComparePairGrid>
          </CompareModelSection>
        );
      })}
    </>
  );
}
