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
import {
  getSpecDecodePairsByModelSlug,
  type SpecDecodePair,
} from '@/lib/compare-variant-availability';
import { COMPARE_MODEL_SLUGS, type CompareModelSlug } from '@/lib/compare-slug';
import { formatModelListZh } from '@/lib/compare-ssr-zh';
import {
  canonicalSpecDecodeCompareSlug,
  precisionDisplayLabel,
  specMethodDisplayLabel,
} from '@/lib/compare-variant-slug';
import { ZH_OG_LOCALE, zhAlternates } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const DESCRIPTION = `投机解码（例如 MTP 式多 token 预测，以及 MiniMax M3 所采用的 EAGLE 等模型专用方法）能否提升推理吞吐量并降低成本？InferenceX 是 SemiAnalysis 推出的独立开源基准测试平台，测试结果均经过验证且可复现。${SUPPORTERS_LINE_ZH}每个页面都会在同一模型和芯片上，对比启用某种投机解码方法与关闭投机解码时的表现。`;

export const metadata: Metadata = {
  title: '芯片投机解码对比',
  description: DESCRIPTION,
  alternates: zhAlternates('/compare-spec-decode'),
  openGraph: {
    title: `芯片投机解码对比 | ${SITE_NAME}`,
    description: DESCRIPTION,
    url: `${SITE_URL}/zh/compare-spec-decode`,
    type: 'website',
    locale: ZH_OG_LOCALE,
  },
  twitter: {
    card: 'summary_large_image',
    title: `芯片投机解码对比 | ${SITE_NAME}`,
    description: DESCRIPTION,
  },
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
  const modelsWithPairs = COMPARE_MODEL_SLUGS.filter(
    (m) => (pairsByModel.get(m.slug)?.length ?? 0) > 0,
  );

  return (
    <>
      <JsonLd data={jsonLd} />
      <section>
        <Card>
          <h1 className="text-2xl lg:text-4xl font-bold tracking-tight">芯片投机解码对比</h1>
          <p className="mt-3 text-base lg:text-lg text-muted-foreground max-w-3xl">
            共 {totalUrls.toLocaleString()} 组投机解码对比，涵盖{' '}
            {formatModelListZh(modelsWithPairs)}
            。每个页面都会在同一模型和芯片上，对比启用某种投机解码方法（MTP、EAGLE
            等）与关闭投机解码时的推理表现，并在相同交互性水平下比较吞吐量和成本。
          </p>
          <div className="mt-6 flex flex-wrap gap-3" data-testid="compare-spec-decode-index-links">
            <Link
              href="/zh/compare"
              className="inline-flex items-center gap-2 rounded-md border border-border px-5 py-3 text-base lg:text-lg font-semibold text-foreground shadow-sm transition-colors hover:bg-muted"
            >
              芯片对比
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
        const pairs = pairsByModel.get(model.slug) ?? [];
        const cards = buildCards(model, pairs);
        return (
          <section key={model.slug} id={model.slug}>
            <Card className="flex flex-col gap-4">
              <div>
                <h2 className="text-xl lg:text-2xl font-bold tracking-tight">{model.label}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  在 {model.label} 上共有 {pairs.length} 组投机解码对比，均有基准测试数据。
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
              </div>
            </Card>
          </section>
        );
      })}
    </>
  );
}
