import type { Metadata } from 'next';
import Link from 'next/link';

import { SITE_NAME, SITE_URL, SUPPORTERS_LINE_ZH } from '@semianalysisai/inferencex-constants';

import { ComparePairMatrix } from '@/components/compare/compare-pair-matrix';
import { JsonLd } from '@/components/json-ld';
import { Card } from '@/components/ui/card';
import { getComparablePairsByModelSlug } from '@/lib/compare-availability';
import { buildCompareMatrix } from '@/lib/compare-matrix';
import { COMPARE_MODEL_SLUGS } from '@/lib/compare-slug';
import { formatModelList } from '@/lib/compare-ssr';
import { ZH_OG_LOCALE, zhAlternates } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const DESCRIPTION = `InferenceX 是 SemiAnalysis 推出的独立开源 GPU 推理基准测试平台，提供经过验证的、可复现的每夜测试结果。${SUPPORTERS_LINE_ZH}横向对比 DeepSeek V4 Pro、DeepSeek R1、Kimi K2、MiniMax M3、GLM 5、Qwen 3.5 等模型的延迟、吞吐量与成本。`;

export const metadata: Metadata = {
  title: 'GPU 对比',
  description: DESCRIPTION,
  alternates: zhAlternates('/compare'),
  openGraph: {
    title: `GPU 对比 | ${SITE_NAME}`,
    description: DESCRIPTION,
    url: `${SITE_URL}/zh/compare`,
    type: 'website',
    locale: ZH_OG_LOCALE,
  },
  twitter: {
    card: 'summary_large_image',
    title: `GPU 对比 | ${SITE_NAME}`,
    description: DESCRIPTION,
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: `GPU 对比 | ${SITE_NAME}`,
  description: DESCRIPTION,
  url: `${SITE_URL}/zh/compare`,
  inLanguage: 'zh-CN',
};

export default async function CompareIndexPageZh() {
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
          <h1 className="text-2xl lg:text-4xl font-bold tracking-tight">GPU 对比</h1>
          <p className="mt-3 text-base lg:text-lg text-muted-foreground max-w-3xl">
            {totalUrls.toLocaleString()} 组推理基准测试的正面对比，涵盖{' '}
            {formatModelList(modelsWithPairs)}
            。每个页面均包含延迟、吞吐量和成本指标的交互式图表，以及插值对比表格。
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              data-testid="compare-index-per-dollar-link-zh"
              href="/zh/compare-per-dollar"
              className="inline-flex items-center gap-2 rounded-md bg-brand px-5 py-3 text-base lg:text-lg font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-brand/90"
            >
              GPU 每美元性能对比
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
        return (
          <section key={model.slug} id={model.slug}>
            <Card className="flex flex-col gap-4">
              <div>
                <h2 className="text-xl lg:text-2xl font-bold tracking-tight">{model.label}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {pairs.length} 组 GPU 对比具有 {model.label} 的基准测试数据。
                </p>
              </div>
              <ComparePairMatrix
                matrix={buildCompareMatrix(model.slug, pairs)}
                hrefPrefix="/zh/compare"
                modelLabel={model.label}
              />
            </Card>
          </section>
        );
      })}
    </>
  );
}
