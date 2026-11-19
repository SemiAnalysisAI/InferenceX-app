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
import { PUBLIC_COMPARE_MODEL_SLUGS } from '@/lib/compare/compare-slug';
import { formatModelListZh } from '@/lib/compare/compare-ssr-zh';
import { zhAlternates } from '@/lib/i18n/i18n';
import { socialMetadata } from '@/lib/seo/social-metadata';
import { getPrecisionPairsByModelSlug } from '@/lib/compare/compare-variant-availability';
import {
  canonicalPrecisionCompareSlug,
  precisionDisplayLabel,
} from '@/lib/compare/compare-variant-slug';

export const revalidate = 86400;

const DESCRIPTION =
  '数值精度如何影响芯片推理性能？在同一芯片上直接对比 FP4、FP8、BF16、INT4 等精度格式在 DeepSeek、Kimi、MiniMax、GLM、Qwen 等模型上的推理表现。';

/** Search snippet; the longer DESCRIPTION stays in the JSON-LD. */
const META_DESCRIPTION =
  '在同一芯片上直接对比 FP4、FP8、BF16、INT4 等精度格式对 DeepSeek、Kimi、MiniMax、GLM、Qwen 等模型推理性能的影响。独立开源基准测试，结果可复现。';

export const metadata: Metadata = {
  title: '芯片精度对比',
  description: META_DESCRIPTION,
  alternates: zhAlternates('/compare-precision'),
  ...socialMetadata({
    title: `芯片精度对比 | ${SITE_NAME}`,
    description: META_DESCRIPTION,
    url: `${SITE_URL}/zh/compare-precision`,
    locale: 'zh',
  }),
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: `芯片精度对比 | ${SITE_NAME}`,
  description: DESCRIPTION,
  url: `${SITE_URL}/zh/compare-precision`,
  inLanguage: 'zh-CN',
};

export default async function ComparePrecisionIndexPageZh() {
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
            芯片精度对比
          </Heading>
          <p className="mt-4 max-w-3xl text-base text-muted-foreground">
            共 {totalUrls.toLocaleString()} 组精度对比，涵盖 {formatModelListZh(modelsWithPairs)}
            。查看 FP4、FP8、BF16、INT4
            等精度格式如何影响同一芯片的吞吐量、成本和交互性；每个页面均展示推理图表和插值对比表。
          </p>
          <CompareCatalogLinks testId="compare-precision-index-links">
            <CompareCatalogLink href="/zh/compare">芯片对比</CompareCatalogLink>
            <CompareCatalogLink href="/zh/compare-per-dollar">每美元性能</CompareCatalogLink>
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
            summary={`在 ${model.label} 上共有 ${pairs.length} 组精度对比，均有基准测试数据`}
          >
            <ComparePairGrid>
              {[...gpuGroups.entries()].flatMap(([gpu, gpuPairs]) => {
                const meta = HW_REGISTRY[gpu];
                const gpuLabel = meta?.label ?? gpu.toUpperCase();
                const archLine = `${meta?.vendor ?? ''} · ${meta?.arch ?? ''}`;
                return gpuPairs.map(({ gpu: g, precA, precB }) => {
                  const slug = canonicalPrecisionCompareSlug(model.slug, g, precA, precB);
                  const label = `${gpuLabel} — ${precisionDisplayLabel(precA)} 与 ${precisionDisplayLabel(precB)}`;
                  return (
                    <ComparePairCardLink
                      key={slug}
                      href={`/zh/compare-precision/${slug}`}
                      slug={slug}
                      label={label}
                      archLine={archLine}
                      locale="zh"
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
