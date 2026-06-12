import type { Metadata } from 'next';
import Link from 'next/link';

import { HW_REGISTRY, SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

import { ComparePairCardLink } from '@/components/compare/compare-pair-card-link';
import { JsonLd } from '@/components/json-ld';
import { Card } from '@/components/ui/card';
import { getComparablePairsByModelSlug } from '@/lib/compare-availability';
import { type ComparePair, COMPARE_MODEL_SLUGS, type CompareModelSlug } from '@/lib/compare-slug';
import { bucketComparePairsByVendor, formatModelList } from '@/lib/compare-ssr';

export const dynamic = 'force-dynamic';

const DESCRIPTION =
  'Browse head-to-head GPU inference benchmark comparisons across every model and hardware pair we test. Latency, throughput, and cost for DeepSeek V4 Pro 1.6T, DeepSeek R1, Kimi K2.5/K2.6/K2.7-Code 1T, GLM 5/5.1, Qwen 3.5 397B-A17B, and more.';

export const metadata: Metadata = {
  title: 'GPU Comparisons',
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/compare` },
  openGraph: {
    title: `GPU Comparisons | ${SITE_NAME}`,
    description: DESCRIPTION,
    url: `${SITE_URL}/compare`,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: `GPU Comparisons | ${SITE_NAME}`,
    description: DESCRIPTION,
  },
};

interface VendorGroup {
  heading: string;
  description: string;
  pairs: { a: string; b: string; slug: string; label: string }[];
}

function groupPairsByVendorForModel(
  model: CompareModelSlug,
  comparablePairs: ComparePair[],
): VendorGroup[] {
  const { cross, nvidia, amd } = bucketComparePairsByVendor(model.slug, comparablePairs);
  const groups: VendorGroup[] = [];
  if (cross.length > 0) {
    groups.push({
      heading: 'NVIDIA vs AMD',
      description: 'Cross-vendor comparisons across architecture generations.',
      pairs: cross,
    });
  }
  if (nvidia.length > 0) {
    groups.push({
      heading: 'NVIDIA vs NVIDIA',
      description: 'Hopper and Blackwell generation comparisons.',
      pairs: nvidia,
    });
  }
  if (amd.length > 0) {
    groups.push({
      heading: 'AMD vs AMD',
      description: 'CDNA 3 and CDNA 4 generation comparisons.',
      pairs: amd,
    });
  }
  return groups;
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: `GPU Comparisons | ${SITE_NAME}`,
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
          <h1 className="text-2xl lg:text-4xl font-bold tracking-tight">GPU Comparisons</h1>
          <p className="mt-3 text-base lg:text-lg text-muted-foreground max-w-3xl">
            {totalUrls.toLocaleString()} head-to-head inference benchmark comparisons across{' '}
            {formatModelList(modelsWithPairs)}. Each page includes interactive charts for latency,
            throughput, and cost metrics, plus an interpolated comparison table.
          </p>
          <div className="mt-6">
            <Link
              data-testid="compare-index-per-dollar-link"
              href="/compare-per-dollar"
              className="inline-flex items-center gap-2 rounded-md bg-brand px-5 py-3 text-base lg:text-lg font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-brand/90"
            >
              Compare GPU performance per dollar
              <span aria-hidden="true" className="text-lg lg:text-xl">
                →
              </span>
            </Link>
          </div>
        </Card>
      </section>

      {modelsWithPairs.map((model) => {
        const pairs = comparablePairsByModel.get(model.slug) ?? [];
        const groups = groupPairsByVendorForModel(model, pairs);
        return (
          <section key={model.slug} id={model.slug}>
            <Card className="flex flex-col gap-4">
              <div>
                <h2 className="text-xl lg:text-2xl font-bold tracking-tight">{model.label}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {pairs.length} GPU pair{pairs.length === 1 ? '' : 's'} with benchmark data on{' '}
                  {model.label}.
                </p>
              </div>
              {groups.map((group) => (
                <div key={`${model.slug}__${group.heading}`} className="flex flex-col gap-3">
                  <div>
                    <h3 className="text-base font-semibold">{group.heading}</h3>
                    <p className="text-xs text-muted-foreground mt-1">{group.description}</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {group.pairs.map(({ slug, label, a, b }) => {
                      const aMeta = HW_REGISTRY[a];
                      const bMeta = HW_REGISTRY[b];
                      const archLine = `${aMeta?.arch ?? '—'} · ${bMeta?.arch ?? '—'}`;
                      return (
                        <ComparePairCardLink
                          key={slug}
                          href={`/compare/${slug}`}
                          slug={slug}
                          label={label}
                          archLine={archLine}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </Card>
          </section>
        );
      })}
    </>
  );
}
