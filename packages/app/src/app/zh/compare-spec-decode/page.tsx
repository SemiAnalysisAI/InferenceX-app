import type { Metadata } from 'next';

import { HW_REGISTRY, SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

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
import { formatModelListZh } from '@/lib/compare/compare-ssr-zh';
import {
  canonicalSpecDecodeCompareSlug,
  precisionDisplayLabel,
  specMethodDisplayLabel,
} from '@/lib/compare/compare-variant-slug';
import { zhAlternates } from '@/lib/i18n/i18n';
import { socialMetadata } from '@/lib/seo/social-metadata';

export const revalidate = 86400;

const DESCRIPTION =
  '投机解码（MTP、EAGLE 等）能否提升推理吞吐量并降低成本？每个页面在同一模型和芯片上对比启用与关闭投机解码时的表现，数据来自 InferenceX 开源基准测试。';

/** Search snippet; the longer DESCRIPTION stays in the JSON-LD. */
const META_DESCRIPTION =
  '在同一模型和芯片上对比开启与关闭投机解码（MTP、EAGLE 等）时的推理吞吐量与成本。独立开源基准测试，结果可复现。';

export const metadata: Metadata = {
  title: '芯片投机解码对比',
  description: META_DESCRIPTION,
  alternates: zhAlternates('/compare-spec-decode'),
  ...socialMetadata({
    title: `芯片投机解码对比 | ${SITE_NAME}`,
    description: META_DESCRIPTION,
    url: `${SITE_URL}/zh/compare-spec-decode`,
    locale: 'zh',
  }),
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: `芯片投机解码对比 | ${SITE_NAME}`,
  description: DESCRIPTION,
  url: `${SITE_URL}/zh/compare-spec-decode`,
  inLanguage: 'zh-CN',
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
      label: `${gpuLabel} ${precLabel} — 启用 ${methodLabel} 与关闭投机解码`,
      archLine: `${gpuMeta?.vendor ?? '—'} · ${gpuMeta?.arch ?? '—'}`,
    };
  });
}

export default async function CompareSpecDecodeIndexPageZh() {
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
            芯片投机解码对比
          </Heading>
          <p className="mt-4 max-w-3xl text-base text-muted-foreground">
            共 {totalUrls.toLocaleString()} 组投机解码对比，涵盖{' '}
            {formatModelListZh(modelsWithPairs)}
            。每个页面都会在同一模型和芯片上，对比启用某种投机解码方法（MTP、EAGLE
            等）与关闭投机解码时的推理表现，并在相同交互性水平下比较吞吐量和成本。
          </p>
          <CompareCatalogLinks testId="compare-spec-decode-index-links">
            <CompareCatalogLink href="/zh/compare">芯片对比</CompareCatalogLink>
            <CompareCatalogLink href="/zh/compare-per-dollar">每美元性能</CompareCatalogLink>
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
            summary={`在 ${model.label} 上共有 ${pairs.length} 组投机解码对比，均有基准测试数据`}
          >
            <ComparePairGrid>
              {cards.map(({ slug, label, archLine }) => (
                <ComparePairCardLink
                  key={slug}
                  href={`/zh/compare-spec-decode/${slug}`}
                  slug={slug}
                  label={label}
                  archLine={archLine}
                  locale="zh"
                />
              ))}
            </ComparePairGrid>
          </CompareModelSection>
        );
      })}
    </>
  );
}
