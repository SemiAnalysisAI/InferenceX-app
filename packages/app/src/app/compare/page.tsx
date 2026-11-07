import type { Metadata } from 'next';
import { Suspense } from 'react';

import { HW_REGISTRY, SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

import { enAlternates } from '@/lib/i18n/i18n';
import { socialMetadata } from '@/lib/seo/social-metadata';

import { AgentXCompareHero } from '@/components/compare/agentx-compare-hero';
import {
  CompareCatalogLink,
  CompareCatalogLinks,
  CompareModelSection,
  ComparePairGroup,
} from '@/components/compare/compare-catalog';
import { ComparePairCardLink } from '@/components/compare/compare-pair-card-link';
import { JsonLd } from '@/components/seo/json-ld';
import { Card } from '@/components/ui/card';
import { Heading } from '@/components/ui/heading';
import { ModelLogo } from '@/components/ui/model-logo';
import { CompareRouteSkeleton } from '@/components/motion/route-skeletons';
import { comparisonPairHref, comparisonScenarioForModel } from '@/lib/compare/compare-agentx';
import { getComparablePairsByModelSlug } from '@/lib/compare/compare-availability';
import {
  type ComparePair,
  PUBLIC_COMPARE_MODEL_SLUGS,
  type CompareModelSlug,
} from '@/lib/compare/compare-slug';
import { bucketComparePairsByVendor, formatModelList } from '@/lib/compare/compare-ssr';
import { type Model } from '@/lib/catalog/data-mappings';

export const revalidate = 86400;

const DESCRIPTION =
  'Compare AgentX agentic inference results for Kimi K3, DeepSeek V4 Pro, MiniMax M3, Qwen 3.5, and GLM 5.3, plus fixed-sequence chip comparisons.';

export const metadata: Metadata = {
  title: 'AgentX Inference Comparisons',
  description: DESCRIPTION,
  alternates: enAlternates('/compare'),
  ...socialMetadata({
    title: `AgentX Inference Comparisons | ${SITE_NAME}`,
    description: DESCRIPTION,
    url: `${SITE_URL}/compare`,
    locale: 'en',
  }),
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
      description: 'Cross-vendor comparisons across architecture generations',
      pairs: cross,
    });
  }
  if (nvidia.length > 0) {
    groups.push({
      heading: 'NVIDIA vs NVIDIA',
      description: 'Hopper and Blackwell generation comparisons',
      pairs: nvidia,
    });
  }
  if (amd.length > 0) {
    groups.push({
      heading: 'AMD vs AMD',
      description: 'CDNA 3 and CDNA 4 generation comparisons',
      pairs: amd,
    });
  }
  return groups;
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: `AgentX Inference Comparisons | ${SITE_NAME}`,
  description: DESCRIPTION,
  url: `${SITE_URL}/compare`,
};

export default function CompareIndexPage() {
  return (
    <>
      <JsonLd data={jsonLd} />
      <AgentXCompareHero locale="en" />
      <Suspense fallback={<CompareRouteSkeleton />}>
        <CompareCatalog />
      </Suspense>
    </>
  );
}

async function CompareCatalog() {
  const comparablePairsByModel = await getComparablePairsByModelSlug();
  const totalUrls = [...comparablePairsByModel.values()].reduce((s, p) => s + p.length, 0);
  const modelsWithPairs = PUBLIC_COMPARE_MODEL_SLUGS.filter(
    (m) => (comparablePairsByModel.get(m.slug)?.length ?? 0) > 0,
  );

  return (
    <>
      <section id="model-comparisons" data-testid="compare-model-catalog">
        <Card>
          <Heading level="section" className="text-2xl">
            AgentX and 8K/1K results
          </Heading>
          <p className="mt-3 max-w-3xl text-base text-muted-foreground">
            {totalUrls.toLocaleString()} head-to-head inference benchmark comparisons across{' '}
            {formatModelList(modelsWithPairs)}. Models with AgentX data open long-context,
            multi-turn trace replay results. Models not yet covered by AgentX open the controlled
            8K/1K workload. Each pair lists its scenario.
          </p>
          <CompareCatalogLinks>
            <CompareCatalogLink testId="compare-index-per-dollar-link" href="/compare-per-dollar">
              Compare chip performance per dollar
            </CompareCatalogLink>
            <CompareCatalogLink testId="compare-index-precision-link" href="/compare-precision">
              Compare precisions (FP4, FP8, BF16)
            </CompareCatalogLink>
            <CompareCatalogLink testId="compare-index-spec-decode-link" href="/compare-spec-decode">
              Compare speculative decoding (MTP vs off)
            </CompareCatalogLink>
          </CompareCatalogLinks>
        </Card>
      </section>

      {modelsWithPairs.map((model) => {
        const pairs = comparablePairsByModel.get(model.slug) ?? [];
        const groups = groupPairsByVendorForModel(model, pairs);
        const scenario = comparisonScenarioForModel(model);
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
            summary={`${pairs.length} chip pair${pairs.length === 1 ? '' : 's'} with benchmark data on ${model.label}`}
          >
            {groups.map((group) => (
              <ComparePairGroup
                key={`${model.slug}__${group.heading}`}
                heading={group.heading}
                description={group.description}
              >
                {group.pairs.map(({ slug, label, a, b }) => {
                  const aMeta = HW_REGISTRY[a];
                  const bMeta = HW_REGISTRY[b];
                  const archLine = `${aMeta?.arch ?? '—'} · ${bMeta?.arch ?? '—'}`;
                  return (
                    <ComparePairCardLink
                      key={slug}
                      href={comparisonPairHref('en', slug)}
                      slug={slug}
                      label={label}
                      archLine={archLine}
                      scenarioLabel={scenario.label}
                      hardwareA={{
                        label: aMeta?.label ?? a.toUpperCase(),
                        vendor: aMeta?.vendor,
                      }}
                      hardwareB={{
                        label: bMeta?.label ?? b.toUpperCase(),
                        vendor: bMeta?.vendor,
                      }}
                    />
                  );
                })}
              </ComparePairGroup>
            ))}
          </CompareModelSection>
        );
      })}
    </>
  );
}
