import type { Metadata } from 'next';

import { HW_REGISTRY, SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

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
import { bucketComparePairsByVendor } from '@/lib/compare/compare-ssr';
import { formatModelListZh } from '@/lib/compare/compare-ssr-zh';
import { zhAlternates } from '@/lib/i18n/i18n';
import { socialMetadata } from '@/lib/seo/social-metadata';

export const revalidate = 86400;

const DESCRIPTION =
  '哪款芯片的每美元推理性能更高？对比 DeepSeek、Kimi、MiniMax、GLM、Qwen 等模型按 Hyperscaler TCO 归一化后的每百万 token 成本，数据来自 InferenceX 开源基准测试。';

/** Search snippet; the longer DESCRIPTION stays in the JSON-LD. */
const META_DESCRIPTION =
  '对比各芯片按 Hyperscaler TCO 归一化后的每百万 token 成本，覆盖 DeepSeek、Kimi、MiniMax、GLM、Qwen 等模型。独立开源基准测试，结果可复现。';

export const metadata: Metadata = {
  title: '芯片每美元性能',
  description: META_DESCRIPTION,
  alternates: zhAlternates('/compare-per-dollar'),
  ...socialMetadata({
    title: `芯片每美元性能 | ${SITE_NAME}`,
    description: META_DESCRIPTION,
    url: `${SITE_URL}/zh/compare-per-dollar`,
    locale: 'zh',
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
      heading: 'NVIDIA 与 AMD',
      description: '跨厂商的不同架构代际每 token 成本对比',
      pairs: cross,
    });
  }
  if (nvidia.length > 0) {
    groups.push({
      heading: 'NVIDIA 芯片对比',
      description: 'Hopper 与 Blackwell 代际每 token 成本对比',
      pairs: nvidia,
    });
  }
  if (amd.length > 0) {
    groups.push({
      heading: 'AMD 芯片对比',
      description: 'CDNA 3 与 CDNA 4 代际每 token 成本对比',
      pairs: amd,
    });
  }
  return groups;
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: `芯片每美元性能 | ${SITE_NAME}`,
  description: DESCRIPTION,
  url: `${SITE_URL}/zh/compare-per-dollar`,
  inLanguage: 'zh-CN',
};

export default async function ComparePerDollarIndexPageZh() {
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
            芯片每美元性能
          </Heading>
          <p className="mt-4 max-w-3xl text-base text-muted-foreground">
            共 {totalUrls.toLocaleString()} 组每百万 token 成本对比，涵盖{' '}
            {formatModelListZh(modelsWithPairs)}
            。每美元性能采用 Hyperscaler 自有设备 TCO 口径。每个页面均展示每 token
            成本图表，以及根据插值结果生成的每百万 token
            成本（美元）对比表，可用于找出任一目标交互性下成本较低的 SKU。
          </p>
          <p className="mt-3 max-w-3xl text-base text-muted-foreground">
            已有 AgentX 数据的模型会默认展示长上下文、多轮 trace 回放结果；尚无 AgentX
            数据的模型则默认展示受控的 8K/1K 工作负载。每组对比都会标明测试场景。
          </p>
          <CompareCatalogLinks>
            <CompareCatalogLink
              testId="compare-per-dollar-index-compare-link-zh"
              href="/zh/compare"
            >
              芯片延迟与吞吐量对比
            </CompareCatalogLink>
            <CompareCatalogLink
              testId="compare-index-precision-link-zh"
              href="/zh/compare-precision"
            >
              量化精度对比（FP4、FP8、BF16）
            </CompareCatalogLink>
            <CompareCatalogLink
              testId="compare-index-spec-decode-link-zh"
              href="/zh/compare-spec-decode"
            >
              投机解码对比（启用 MTP 与关闭投机解码）
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
            summary={`在 ${model.label} 上共有 ${pairs.length} 组芯片对比，均有每 token 成本基准测试数据`}
          >
            {groups.map((group) => (
              <ComparePairGroup
                key={`${model.slug}__${group.heading}`}
                heading={group.heading}
                description={group.description}
              >
                {group.pairs.map(({ slug, a, b }) => {
                  const aMeta = HW_REGISTRY[a];
                  const bMeta = HW_REGISTRY[b];
                  const archLine = `${aMeta?.arch ?? '—'} · ${bMeta?.arch ?? '—'}`;
                  return (
                    <ComparePairCardLink
                      key={slug}
                      href={comparisonPairHref('zh', slug, 'compare-per-dollar')}
                      slug={slug}
                      label={`${aMeta?.label ?? a.toUpperCase()} 与 ${bMeta?.label ?? b.toUpperCase()}`}
                      archLine={archLine}
                      scenarioLabel={scenario.label}
                      locale="zh"
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
