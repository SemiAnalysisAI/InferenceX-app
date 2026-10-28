import type { Metadata } from 'next';
import Link from 'next/link';

import { HW_REGISTRY, SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

import { enAlternates } from '@/lib/i18n/i18n';
import { socialMetadata } from '@/lib/seo/social-metadata';

import { ComparePairCardLink } from '@/components/compare/compare-pair-card-link';
import { JsonLd } from '@/components/seo/json-ld';
import { Card } from '@/components/ui/card';
import {
  getSpecDecodePairsByModelSlug,
  type SpecDecodePair,
} from '@/lib/compare/compare-variant-availability';
import { COMPARE_MODEL_SLUGS, type CompareModelSlug } from '@/lib/compare/compare-slug';
import { formatModelList } from '@/lib/compare/compare-ssr';
import {
  canonicalSpecDecodeCompareSlug,
  precisionDisplayLabel,
  specMethodDisplayLabel,
} from '@/lib/compare/compare-variant-slug';

export const revalidate = 3600;

const DESCRIPTION =
  'Does speculative decoding (MTP, EAGLE) improve LLM inference throughput and cost? Each page compares one model and chip with the method on versus off.';

export const metadata: Metadata = {
  title: 'Chip Speculative Decoding Comparisons',
  description: DESCRIPTION,
  alternates: enAlternates('/compare-spec-decode'),
  ...socialMetadata({
    title: `Chip Speculative Decoding Comparisons | ${SITE_NAME}`,
    description: DESCRIPTION,
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
  const modelsWithPairs = COMPARE_MODEL_SLUGS.filter(
    (m) => (pairsByModel.get(m.slug)?.length ?? 0) > 0,
  );

  return (
    <>
      <JsonLd data={jsonLd} />
      <section>
        <Card>
          <h1 className="text-2xl lg:text-4xl font-bold tracking-tight">
            Chip Speculative Decoding Comparisons
          </h1>
          <p className="mt-3 text-base lg:text-lg text-muted-foreground max-w-3xl">
            {totalUrls.toLocaleString()} speculative decoding comparisons across{' '}
            {formatModelList(modelsWithPairs)}. Each page compares inference with the speculative
            decoding method (MTP, EAGLE, etc.) enabled versus disabled on the same model and chip —
            throughput, cost, and interactivity at matched operating points.
          </p>
          <div className="mt-6 flex flex-wrap gap-3" data-testid="compare-spec-decode-index-links">
            <Link
              href="/compare"
              className="inline-flex items-center gap-2 rounded-md border border-border px-5 py-3 text-base lg:text-lg font-semibold text-foreground shadow-sm transition-colors hover:bg-muted"
            >
              Chip comparisons
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
        const pairs = pairsByModel.get(model.slug) ?? [];
        const cards = buildCards(model, pairs);
        return (
          <section key={model.slug} id={model.slug}>
            <Card className="flex flex-col gap-4">
              <div>
                <h2 className="text-xl lg:text-2xl font-bold tracking-tight">{model.label}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {pairs.length} speculative decoding comparison{pairs.length === 1 ? '' : 's'} with
                  benchmark data on {model.label}.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {cards.map(({ slug, label, archLine }) => (
                  <ComparePairCardLink
                    key={slug}
                    href={`/compare-spec-decode/${slug}`}
                    slug={slug}
                    label={label}
                    archLine={archLine}
                  />
                ))}
              </div>
            </Card>
          </section>
        );
      })}
    </>
  );
}
