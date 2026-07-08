import type { Metadata } from 'next';
import Link from 'next/link';

import {
  HW_REGISTRY,
  SITE_NAME,
  SITE_URL,
  SUPPORTERS_LINE_ZH,
} from '@semianalysisai/inferencex-constants';

import { ComparePairCardLink } from '@/components/compare/compare-pair-card-link';
import { JsonLd } from '@/components/json-ld';
import { Card } from '@/components/ui/card';
import { getComparablePairsByModelSlug } from '@/lib/compare-availability';
import { type ComparePair, COMPARE_MODEL_SLUGS, type CompareModelSlug } from '@/lib/compare-slug';
import { bucketComparePairsByVendor, formatModelList } from '@/lib/compare-ssr';
import { ZH_OG_LOCALE, zhAlternates } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const DESCRIPTION = `哪款 GPU 每美元推理性能最高？InferenceX 是 SemiAnalysis 推出的独立开源基准测试平台，提供经过验证的、可复现的测试结果。${SUPPORTERS_LINE_ZH}横向对比 DeepSeek V4 Pro、DeepSeek R1、Kimi K2、MiniMax M3、GLM 5、Qwen 3.5 等模型基于云服务商 TCO 归一化的每百万 token 成本。`;

export const metadata: Metadata = {
  title: 'GPU 每美元性能',
  description: DESCRIPTION,
  alternates: zhAlternates('/compare-per-dollar'),
  openGraph: {
    title: `GPU 每美元性能 | ${SITE_NAME}`,
    description: DESCRIPTION,
    url: `${SITE_URL}/zh/compare-per-dollar`,
    type: 'website',
    locale: ZH_OG_LOCALE,
  },
  twitter: {
    card: 'summary_large_image',
    title: `GPU 每美元性能 | ${SITE_NAME}`,
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
      description: '跨厂商的不同架构代际每 token 成本对比。',
      pairs: cross,
    });
  }
  if (nvidia.length > 0) {
    groups.push({
      heading: 'NVIDIA vs NVIDIA',
      description: 'Hopper 与 Blackwell 代际每 token 成本对比。',
      pairs: nvidia,
    });
  }
  if (amd.length > 0) {
    groups.push({
      heading: 'AMD vs AMD',
      description: 'CDNA 3 与 CDNA 4 代际每 token 成本对比。',
      pairs: amd,
    });
  }
  return groups;
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: `GPU 每美元性能 | ${SITE_NAME}`,
  description: DESCRIPTION,
  url: `${SITE_URL}/zh/compare-per-dollar`,
  inLanguage: 'zh-CN',
};

export default async function ComparePerDollarIndexPageZh() {
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
          <h1 className="text-2xl lg:text-4xl font-bold tracking-tight">GPU 每美元性能</h1>
          <p className="mt-3 text-base lg:text-lg text-muted-foreground max-w-3xl">
            {totalUrls.toLocaleString()} 组每百万 token 成本的正面对比，涵盖{' '}
            {formatModelList(modelsWithPairs)}
            。性能按所属云服务商 TCO 归一化——每个页面展示每 token 成本图表及插值美元/百万 token
            对比表格，帮助您在任意目标交互性水平下选出更经济的 GPU。
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              data-testid="compare-per-dollar-index-compare-link-zh"
              href="/zh/compare"
              className="inline-flex items-center gap-2 rounded-md bg-brand px-5 py-3 text-base lg:text-lg font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-brand/90"
            >
              GPU 延迟 + 吞吐量对比
              <span aria-hidden="true" className="text-lg lg:text-xl">
                →
              </span>
            </Link>
            <Link
              data-testid="compare-index-precision-link-zh"
              href="/zh/compare-precision"
              className="inline-flex items-center gap-2 rounded-md border border-border px-5 py-3 text-base lg:text-lg font-semibold text-foreground shadow-sm transition-colors hover:bg-muted"
            >
              {'精度对比（FP8 vs BF16 等）'}
              <span aria-hidden="true" className="text-lg lg:text-xl">
                →
              </span>
            </Link>
            <Link
              data-testid="compare-index-spec-decode-link-zh"
              href="/zh/compare-spec-decode"
              className="inline-flex items-center gap-2 rounded-md border border-border px-5 py-3 text-base lg:text-lg font-semibold text-foreground shadow-sm transition-colors hover:bg-muted"
            >
              {'投机解码对比（MTP vs 关闭）'}
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
                  {pairs.length} 组 GPU 对比具有 {model.label} 的每 token 成本基准测试数据。
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
                          href={`/zh/compare-per-dollar/${slug}`}
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
