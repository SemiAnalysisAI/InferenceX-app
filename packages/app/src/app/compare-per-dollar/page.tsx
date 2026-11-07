import type { Metadata } from 'next';

import { HW_REGISTRY, SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

import { enAlternates } from '@/lib/i18n/i18n';
import { socialMetadata } from '@/lib/seo/social-metadata';

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
import { type Model } from '@/lib/catalog/data-mappings';
import { comparisonPairHref, comparisonScenarioForModel } from '@/lib/compare/compare-agentx';
import { getComparablePairsByModelSlug } from '@/lib/compare/compare-availability';
import {
  type ComparePair,
  PUBLIC_COMPARE_MODEL_SLUGS,
  type CompareModelSlug,
} from '@/lib/compare/compare-slug';
import { bucketComparePairsByVendor, formatModelList } from '@/lib/compare/compare-ssr';

export const revalidate = 86400;

const DESCRIPTION =
  'Which chip delivers more LLM inference per dollar? Compare cost per million tokens, normalized by hyperscaler TCO, for DeepSeek, Kimi, MiniMax, GLM & Qwen.';

/** Search snippet; the longer DESCRIPTION stays in the JSON-LD. */
const META_DESCRIPTION =
  'Compare cost per million tokens, normalized by hyperscaler TCO, across chips for DeepSeek, Kimi, MiniMax, GLM, Qwen & more. Open, reproducible benchmarks.';

export const metadata: Metadata = {
  title: 'Chip Performance per Dollar',
  description: META_DESCRIPTION,
  alternates: enAlternates('/compare-per-dollar'),
  ...socialMetadata({
    title: `Chip Performance per Dollar | ${SITE_NAME}`,
    description: META_DESCRIPTION,
    url: `${SITE_URL}/compare-per-dollar`,
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
      description: 'Cross-vendor cost-per-token comparisons across architecture generations',
      pairs: cross,
    });
  }
  if (nvidia.length > 0) {
    groups.push({
      heading: 'NVIDIA vs NVIDIA',
      description: 'Hopper and Blackwell generation cost-per-token comparisons',
      pairs: nvidia,
    });
  }
  if (amd.length > 0) {
    groups.push({
      heading: 'AMD vs AMD',
      description: 'CDNA 3 and CDNA 4 generation cost-per-token comparisons',
      pairs: amd,
    });
  }
  return groups;
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: `Chip Performance per Dollar | ${SITE_NAME}`,
  description: DESCRIPTION,
  url: `${SITE_URL}/compare-per-dollar`,
};

export default async function ComparePerDollarIndexPage() {
  const comparablePairsByModel = await getComparablePairsByModelSlug();
  const totalUrls = [...comparablePairsByModel.values()].reduce((s, p) => s + p.length, 0);
  const modelsWithPairs = PUBLIC_COMPARE_MODEL_SLUGS.filter(
    (m) => (comparablePairsByModel.get(m.slug)?.length ?? 0) > 0,
  );

  return (
    <>
      <JsonLd data={jsonLd} />
      <section>
        <Card>
          <Heading as="h1" level="page">
            Chip performance per dollar
          </Heading>
          <p className="mt-4 max-w-3xl text-base text-muted-foreground">
            {totalUrls.toLocaleString()} head-to-head cost-per-million-tokens comparisons across{' '}
            {formatModelList(modelsWithPairs)}. Performance is normalized by owning-hyperscaler TCO.
            Each page renders the cost-per-token chart and an interpolated dollars-per-million table
            so you can pick the cheaper SKU at any target interactivity level.
          </p>
          <p className="mt-3 max-w-3xl text-base text-muted-foreground">
            Models with AgentX data open long-context, multi-turn trace replay results. Models not
            yet covered by AgentX open the controlled 8K/1K workload. Each pair lists its scenario.
          </p>
          <CompareCatalogLinks>
            <CompareCatalogLink testId="compare-per-dollar-index-compare-link" href="/compare">
              Chip latency and throughput comparisons
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
            summary={`${pairs.length} chip pair${pairs.length === 1 ? '' : 's'} with cost-per-token benchmark data on ${model.label}`}
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
                      href={comparisonPairHref('en', slug, 'compare-per-dollar')}
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
