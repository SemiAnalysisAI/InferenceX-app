import type { Metadata } from 'next';

import { HW_REGISTRY, SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

import { ComparePairCardLink } from '@/components/compare/compare-pair-card-link';
import { JsonLd } from '@/components/json-ld';
import { Card } from '@/components/ui/card';
import {
  allCanonicalComparePairs,
  canonicalCompareSlug,
  compareDisplayLabel,
} from '@/lib/compare-slug';

const DESCRIPTION =
  'Browse head-to-head GPU inference benchmark comparisons. Latency, throughput, and cost across LLM workloads for every hardware pair we test.';

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

function groupPairsByVendor(): VendorGroup[] {
  const all = allCanonicalComparePairs();

  const nvidia: VendorGroup['pairs'] = [];
  const amd: VendorGroup['pairs'] = [];
  const cross: VendorGroup['pairs'] = [];

  for (const { a, b } of all) {
    const entry = {
      a,
      b,
      slug: canonicalCompareSlug(a, b),
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

export default function CompareIndexPage() {
  const groups = groupPairsByVendor();
  const totalPairs = groups.reduce((sum, g) => sum + g.pairs.length, 0);

  return (
    <>
      <JsonLd data={jsonLd} />
      <section>
        <Card>
          <h1 className="text-2xl lg:text-4xl font-bold tracking-tight">GPU Comparisons</h1>
          <p className="mt-3 text-base lg:text-lg text-muted-foreground max-w-3xl">
            {totalPairs} head-to-head inference benchmark comparisons across every GPU we test. Each
            page includes interactive charts for latency, throughput, and cost metrics.
          </p>
        </Card>
      </section>

      {groups.map((group) => (
        <section key={group.heading}>
          <Card className="flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-semibold">{group.heading}</h2>
              <p className="text-sm text-muted-foreground mt-1">{group.description}</p>
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
          </Card>
        </section>
      ))}
    </>
  );
}
