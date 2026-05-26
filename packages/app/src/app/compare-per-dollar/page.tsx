import type { Metadata } from 'next';

import { HW_REGISTRY, SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

import { ComparePairCardLink } from '@/components/compare/compare-pair-card-link';
import { JsonLd } from '@/components/json-ld';
import { Card } from '@/components/ui/card';
import { getComparablePairsByModelSlug } from '@/lib/compare-availability';
import {
  canonicalCompareSlug,
  compareDisplayLabel,
  type ComparePair,
  COMPARE_MODEL_SLUGS,
  type CompareModelSlug,
} from '@/lib/compare-slug';

export const dynamic = 'force-dynamic';

const DESCRIPTION =
  'GPU performance per dollar — head-to-head cost per million tokens across every model and hardware pair we benchmark. Performance normalized by owning-hyperscaler TCO for DeepSeek R1, Kimi K2.5/K2.6, GLM 5/5.1, Qwen 3.5, and more. Pick the cheapest SKU for your workload.';

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

/** "A", "A and B", or "A, B, and C" — Oxford-comma serial join. Enumerated
 *  in the lede instead of a bare count so search engines see every model name
 *  in the indexable description. */
function formatModelList(models: CompareModelSlug[]): string {
  const labels = models.map((m) => m.label);
  if (labels.length === 0) return 'no models';
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels.at(-1)}`;
}

interface VendorGroup {
  heading: string;
  description: string;
  pairs: { a: string; b: string; slug: string; label: string }[];
}

function groupPairsByVendorForModel(
  model: CompareModelSlug,
  comparablePairs: ComparePair[],
): VendorGroup[] {
  const nvidia: VendorGroup['pairs'] = [];
  const amd: VendorGroup['pairs'] = [];
  const cross: VendorGroup['pairs'] = [];

  for (const { a, b } of comparablePairs) {
    const entry = {
      a,
      b,
      slug: canonicalCompareSlug(model.slug, a, b),
      label: compareDisplayLabel(a, b),
    };
    const vA = HW_REGISTRY[a]?.vendor;
    const vB = HW_REGISTRY[b]?.vendor;
    if (vA === 'NVIDIA' && vB === 'NVIDIA') nvidia.push(entry);
    else if (vA === 'AMD' && vB === 'AMD') amd.push(entry);
    else cross.push(entry);
  }

  const groups: VendorGroup[] = [];

  if (cross.length > 0) {
    groups.push({
      heading: 'NVIDIA vs AMD',
      description: 'Cross-vendor cost-per-token comparisons across architecture generations.',
      pairs: cross,
    });
  }
  if (nvidia.length > 0) {
    groups.push({
      heading: 'NVIDIA vs NVIDIA',
      description: 'Hopper and Blackwell generation cost-per-token comparisons.',
      pairs: nvidia,
    });
  }
  if (amd.length > 0) {
    groups.push({
      heading: 'AMD vs AMD',
      description: 'CDNA 3 and CDNA 4 generation cost-per-token comparisons.',
      pairs: amd,
    });
  }

  return groups;
}

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
  // index's behavior — no empty-state cards in navigation. The page-level
  // handler at /compare-per-dollar/[slug] still renders the empty-state for
  // direct URL hits.
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
                  {pairs.length} GPU pair{pairs.length === 1 ? '' : 's'} with cost-per-token
                  benchmark data on {model.label}.
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
                          href={`/compare-per-dollar/${slug}`}
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
