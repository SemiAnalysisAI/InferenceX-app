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
import { comparisonPairHref, comparisonScenarioForModel } from '@/lib/compare-agentx';
import { getComparablePairsByModelSlug } from '@/lib/compare-availability';
import { type ComparePair, COMPARE_MODEL_SLUGS, type CompareModelSlug } from '@/lib/compare-slug';
import { bucketComparePairsByVendor } from '@/lib/compare-ssr';
import { formatModelListZh } from '@/lib/compare-ssr-zh';
import { ZH_OG_LOCALE, zhAlternates } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const DESCRIPTION = `哪款芯片的每美元推理性能更高？InferenceX 是 SemiAnalysis 推出的独立开源基准测试平台，测试结果均经过验证且可复现。${SUPPORTERS_LINE_ZH}对比 DeepSeek V4 Pro、DeepSeek R1、Kimi K2、MiniMax M3、GLM 5、Qwen 3.5 等模型按 Hyperscaler TCO 归一化后的每百万 token 成本。`;

export const metadata: Metadata = {
  title: '芯片每美元性能',
  description: DESCRIPTION,
  alternates: zhAlternates('/compare-per-dollar'),
  openGraph: {
    title: `芯片每美元性能 | ${SITE_NAME}`,
    description: DESCRIPTION,
    url: `${SITE_URL}/zh/compare-per-dollar`,
    type: 'website',
    locale: ZH_OG_LOCALE,
  },
  twitter: {
    card: 'summary_large_image',
    title: `芯片每美元性能 | ${SITE_NAME}`,
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
      heading: 'NVIDIA 与 AMD',
      description: '跨厂商的不同架构代际每 token 成本对比。',
      pairs: cross,
    });
  }
  if (nvidia.length > 0) {
    groups.push({
      heading: 'NVIDIA 芯片对比',
      description: 'Hopper 与 Blackwell 代际每 token 成本对比。',
      pairs: nvidia,
    });
  }
  if (amd.length > 0) {
    groups.push({
      heading: 'AMD 芯片对比',
      description: 'CDNA 3 与 CDNA 4 代际每 token 成本对比。',
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
  const modelsWithPairs = COMPARE_MODEL_SLUGS.filter(
    (m) => (comparablePairsByModel.get(m.slug)?.length ?? 0) > 0,
  );

  return (
    <>
      <JsonLd data={jsonLd} />
      <section>
        <Card>
          <h1 className="text-2xl lg:text-4xl font-bold tracking-tight">芯片每美元性能</h1>
          <p className="mt-3 text-base lg:text-lg text-muted-foreground max-w-3xl">
            共 {totalUrls.toLocaleString()} 组每百万 token 成本对比，涵盖{' '}
            {formatModelListZh(modelsWithPairs)}
            。每美元性能采用 Hyperscaler 自有设备 TCO 口径。每个页面均展示每 token
            成本图表，以及根据插值结果生成的每百万 token
            成本（美元）对比表，可用于找出任一目标交互性下成本较低的 SKU。
          </p>
          <p className="mt-3 text-base lg:text-lg text-muted-foreground max-w-3xl">
            已有 AgentX 数据的模型会默认展示长上下文、多轮 trace 回放结果；尚无 AgentX
            数据的模型则默认展示受控的 8K/1K 工作负载。每张卡片都会标明测试场景。
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              data-testid="compare-per-dollar-index-compare-link-zh"
              href="/zh/compare"
              className="inline-flex items-center gap-2 rounded-md bg-brand px-5 py-3 text-base lg:text-lg font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-brand/90"
            >
              芯片延迟与吞吐量对比
              <span aria-hidden="true" className="text-lg lg:text-xl">
                →
              </span>
            </Link>
            <Link
              data-testid="compare-index-precision-link-zh"
              href="/zh/compare-precision"
              className="inline-flex items-center gap-2 rounded-md border border-border px-5 py-3 text-base lg:text-lg font-semibold text-foreground shadow-sm transition-colors hover:bg-muted"
            >
              量化精度对比（FP8 与 BF16 等）
              <span aria-hidden="true" className="text-lg lg:text-xl">
                →
              </span>
            </Link>
            <Link
              data-testid="compare-index-spec-decode-link-zh"
              href="/zh/compare-spec-decode"
              className="inline-flex items-center gap-2 rounded-md border border-border px-5 py-3 text-base lg:text-lg font-semibold text-foreground shadow-sm transition-colors hover:bg-muted"
            >
              投机解码对比（启用 MTP 与关闭投机解码）
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
        // Same scenario split /compare uses: models with AgentX data open the
        // agentic trace replay, the rest open the fixed 8K/1K workload.
        const scenario = comparisonScenarioForModel(model);
        return (
          <section key={model.slug} id={model.slug}>
            <Card className="flex flex-col gap-4">
              <div>
                <h2 className="text-xl lg:text-2xl font-bold tracking-tight">{model.label}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  在 {model.label} 上共有 {pairs.length} 组芯片对比，均有每 token 成本基准测试数据。
                </p>
              </div>
              {groups.map((group) => (
                <div key={`${model.slug}__${group.heading}`} className="flex flex-col gap-3">
                  <div>
                    <h3 className="text-base font-semibold">{group.heading}</h3>
                    <p className="text-xs text-muted-foreground mt-1">{group.description}</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {group.pairs.map(({ slug, a, b }) => {
                      const aMeta = HW_REGISTRY[a];
                      const bMeta = HW_REGISTRY[b];
                      const archLine = `${aMeta?.arch ?? '—'} · ${bMeta?.arch ?? '—'}`;
                      return (
                        <ComparePairCardLink
                          key={slug}
                          href={comparisonPairHref('zh', slug, model, 'compare-per-dollar')}
                          slug={slug}
                          label={`${aMeta?.label ?? a.toUpperCase()} 与 ${bMeta?.label ?? b.toUpperCase()}`}
                          archLine={archLine}
                          scenarioLabel={scenario.label}
                          locale="zh"
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
