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
import { COMPARE_MODEL_SLUGS } from '@/lib/compare-slug';
import { formatModelList } from '@/lib/compare-ssr';
import { ZH_OG_LOCALE, zhAlternates } from '@/lib/i18n';
import { getPrecisionPairsByModelSlug } from '@/lib/compare-variant-availability';
import { canonicalPrecisionCompareSlug, precisionDisplayLabel } from '@/lib/compare-variant-slug';

export const dynamic = 'force-dynamic';

const DESCRIPTION = `精度如何影响 GPU 推理性能？InferenceX 是 SemiAnalysis 推出的独立开源基准测试平台，提供经过验证的、可复现的测试结果。${SUPPORTERS_LINE_ZH}在同一 GPU 上横向对比 FP4、FP8、BF16、INT4 等多种量化精度对 DeepSeek V4 Pro、DeepSeek R1、Kimi K2、MiniMax M3、GLM 5、Qwen 3.5 等模型的影响。`;

export const metadata: Metadata = {
  title: 'GPU 精度对比',
  description: DESCRIPTION,
  alternates: zhAlternates('/compare-precision'),
  openGraph: {
    title: `GPU 精度对比 | ${SITE_NAME}`,
    description: DESCRIPTION,
    url: `${SITE_URL}/zh/compare-precision`,
    type: 'website',
    locale: ZH_OG_LOCALE,
  },
  twitter: {
    card: 'summary_large_image',
    title: `GPU 精度对比 | ${SITE_NAME}`,
    description: DESCRIPTION,
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: `GPU 精度对比 | ${SITE_NAME}`,
  description: DESCRIPTION,
  url: `${SITE_URL}/zh/compare-precision`,
  inLanguage: 'zh-CN',
};

export default async function ComparePrecisionIndexPageZh() {
  const precisionPairsByModel = await getPrecisionPairsByModelSlug();
  const totalUrls = [...precisionPairsByModel.values()].reduce((s, p) => s + p.length, 0);
  const modelsWithPairs = COMPARE_MODEL_SLUGS.filter(
    (m) => (precisionPairsByModel.get(m.slug)?.length ?? 0) > 0,
  );

  return (
    <>
      <JsonLd data={jsonLd} />
      <section>
        <Card>
          <h1 className="text-2xl lg:text-4xl font-bold tracking-tight">GPU 精度对比</h1>
          <p className="mt-3 text-base lg:text-lg text-muted-foreground max-w-3xl">
            {totalUrls.toLocaleString()} 组精度正面对比，涵盖 {formatModelList(modelsWithPairs)}
            。查看 FP4、FP8、BF16、INT4 等多种量化精度如何影响同一 GPU
            上的吞吐量、成本和交互性——每个页面展示推理图表及插值对比表格。
          </p>
          <div className="mt-6 flex flex-wrap gap-3" data-testid="compare-precision-index-links">
            <Link
              href="/zh/compare"
              className="inline-flex items-center gap-2 rounded-md border border-border px-5 py-3 text-base lg:text-lg font-semibold text-foreground shadow-sm transition-colors hover:bg-muted"
            >
              GPU 对比
              <span aria-hidden="true" className="text-lg lg:text-xl">
                →
              </span>
            </Link>
            <Link
              href="/zh/compare-per-dollar"
              className="inline-flex items-center gap-2 rounded-md border border-border px-5 py-3 text-base lg:text-lg font-semibold text-foreground shadow-sm transition-colors hover:bg-muted"
            >
              每美元性能
              <span aria-hidden="true" className="text-lg lg:text-xl">
                →
              </span>
            </Link>
          </div>
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
          <section key={model.slug} id={model.slug}>
            <Card className="flex flex-col gap-4">
              <div>
                <h2 className="text-xl lg:text-2xl font-bold tracking-tight">{model.label}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {pairs.length} 组精度对比具有 {model.label} 的基准测试数据。
                </p>
              </div>
              {[...gpuGroups.entries()].map(([gpu, gpuPairs]) => {
                const meta = HW_REGISTRY[gpu];
                const gpuLabel = meta?.label ?? gpu.toUpperCase();
                const archLine = `${meta?.vendor ?? ''} · ${meta?.arch ?? ''}`;
                return (
                  <div key={`${model.slug}__${gpu}`} className="flex flex-col gap-3">
                    <div>
                      <h3 className="text-base font-semibold">{gpuLabel}</h3>
                      <p className="text-xs text-muted-foreground mt-1">{archLine}</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {gpuPairs.map(({ gpu: g, precA, precB }) => {
                        const slug = canonicalPrecisionCompareSlug(model.slug, g, precA, precB);
                        const label = `${gpuLabel} — ${precisionDisplayLabel(precA)} vs ${precisionDisplayLabel(precB)}`;
                        return (
                          <ComparePairCardLink
                            key={slug}
                            href={`/zh/compare-precision/${slug}`}
                            slug={slug}
                            label={label}
                            archLine={archLine}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </Card>
          </section>
        );
      })}
    </>
  );
}
