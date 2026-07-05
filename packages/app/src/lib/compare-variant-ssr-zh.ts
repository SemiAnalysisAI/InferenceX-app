/**
 * Simplified Chinese ports of the English-prose-generating functions in
 * compare-variant-ssr.ts. Provides zh narrative templates, JSON-LD builders,
 * and breadcrumb helpers for /zh/compare-precision and /zh/compare-spec-decode
 * slug pages.
 *
 * MUST be updated whenever compare-variant-ssr.ts narrative templates change.
 */
import {
  AUTHOR_NAME,
  AUTHOR_URL,
  HW_REGISTRY,
  SITE_URL,
} from '@semianalysisai/inferencex-constants';

import type { CompareModelSlug } from '@/lib/compare-slug';
import {
  bandFor,
  fmtCost,
  fmtPctDelta,
  type PairSummary,
  pickRotated,
  type SsrInterpolatedRow,
} from '@/lib/compare-ssr';
import {
  type VariantBoth,
  type VariantCompareKind,
  variantJsonLdEntryFor,
} from '@/lib/compare-variant-ssr';

// ---------------------------------------------------------------------------
// Band phrase -- Chinese
// ---------------------------------------------------------------------------

const BAND_PHRASE_ZH: Record<'low' | 'middle' | 'high', string> = {
  low: '低端',
  middle: '中部',
  high: '高端',
};

// ---------------------------------------------------------------------------
// Shared template-input type — imported from the EN module so the two files
// cannot drift structurally.
// ---------------------------------------------------------------------------

function variantFullSummaryZh(i: VariantBoth): string {
  const costPart = i.costTied
    ? '每 token 成本基本持平'
    : i.costRatio === null
      ? null
      : `${i.cheaper} 每 token 成本低 ${fmtPctDelta(i.costRatio)}`;
  const tputPart = i.tputTied
    ? '每 GPU 吞吐量基本持平'
    : i.tputRatio === null
      ? null
      : `${i.faster} 每 GPU 吞吐量高出 ${fmtPctDelta(i.tputRatio)}`;
  const both = [costPart, tputPart].filter(Boolean).join('；');
  return both.length > 0 ? both : '差距极小，难以判定优劣';
}

// ---------------------------------------------------------------------------
// Precision comparison templates -- Chinese
// ---------------------------------------------------------------------------

const PRECISION_BOTH_TEMPLATES_ZH: ((i: VariantBoth) => string)[] = [
  (i) =>
    `在 ${i.modelLabel}（${i.gpuLabel}）上以 ${i.target} tok/s/user 交互性运行时，${i.aLabel} 吞吐量为 ${i.aValue.toFixed(0)} tok/s/GPU，每百万 token 成本 ${fmtCost(i.aCost)}；${i.bLabel} 吞吐量为 ${i.bValue.toFixed(0)} tok/s/GPU，成本 ${fmtCost(i.bCost)}。${variantFullSummaryZh(i)}。低精度量化以模型精度换取吞吐量——请查看评估页面了解质量影响。`,
  (i) =>
    `${i.aLabel} 在 ${i.modelLabel}（${i.gpuLabel}）上以 ${i.target} tok/s/user 运行时达到 ${i.aValue.toFixed(0)} tok/s/GPU（每百万 token ${fmtCost(i.aCost)}）；${i.bLabel} 达到 ${i.bValue.toFixed(0)} tok/s/GPU（${fmtCost(i.bCost)}）。${variantFullSummaryZh(i)}。量化级别的精度差异在评估页面中跟踪。`,
  (i) =>
    `${i.modelLabel}（${i.gpuLabel}）在 ${i.target} tok/s/user 交互性下的吞吐量：${i.aLabel} 为 ${i.aValue.toFixed(0)} tok/s/GPU，${i.bLabel} 为 ${i.bValue.toFixed(0)}。每百万 token 成本分别为 ${fmtCost(i.aCost)} 和 ${fmtCost(i.bCost)}。${variantFullSummaryZh(i)}。低精度带来的成本-吞吐量权衡只是全貌的一部分——请参阅评估页面的精度数据。`,
  (i) =>
    `在 ${i.range} 交互性区间的${BAND_PHRASE_ZH[i.band]}，即 ${i.modelLabel}（${i.gpuLabel}）上以 ${i.target} tok/s/user 运行时：${i.aLabel} 达到 ${i.aValue.toFixed(0)} tok/s/GPU（${fmtCost(i.aCost)}/百万 token），${i.bLabel} 达到 ${i.bValue.toFixed(0)}（${fmtCost(i.bCost)}/百万）。${variantFullSummaryZh(i)}。精度变更同时影响推理速度和模型质量——请查阅评估页面的精度基准测试。`,
];

// ---------------------------------------------------------------------------
// Spec-decode comparison templates -- Chinese
// ---------------------------------------------------------------------------

const SPEC_DECODE_BOTH_TEMPLATES_ZH: ((i: VariantBoth) => string)[] = [
  (i) =>
    `在 ${i.modelLabel}（${i.gpuLabel}）上以 ${i.target} tok/s/user 交互性运行时，${i.aLabel} 吞吐量为 ${i.aValue.toFixed(0)} tok/s/GPU，每百万 token 成本 ${fmtCost(i.aCost)}；${i.bLabel} 吞吐量为 ${i.bValue.toFixed(0)} tok/s/GPU，成本 ${fmtCost(i.bCost)}。${variantFullSummaryZh(i)}。投机解码通过接受草稿 token 来降低每 token 延迟——收益因工作负载和提示分布而异。`,
  (i) =>
    `${i.aLabel} 在 ${i.modelLabel}（${i.gpuLabel}）上以 ${i.target} tok/s/user 运行时达到 ${i.aValue.toFixed(0)} tok/s/GPU（每百万 token ${fmtCost(i.aCost)}）；${i.bLabel} 达到 ${i.bValue.toFixed(0)} tok/s/GPU（${fmtCost(i.bCost)}）。${variantFullSummaryZh(i)}。草稿 token 的接受率决定了投机解码在给定并发水平下是否有效。`,
  (i) =>
    `${i.modelLabel}（${i.gpuLabel}）在 ${i.target} tok/s/user 交互性下的吞吐量：${i.aLabel} 为 ${i.aValue.toFixed(0)} tok/s/GPU，${i.bLabel} 为 ${i.bValue.toFixed(0)}。每百万 token 成本分别为 ${fmtCost(i.aCost)} 和 ${fmtCost(i.bCost)}。${variantFullSummaryZh(i)}。投机解码以额外的草稿 token 计算换取更少的解码步骤——收益取决于序列长度和批大小。`,
  (i) =>
    `在 ${i.range} 交互性区间的${BAND_PHRASE_ZH[i.band]}，即 ${i.modelLabel}（${i.gpuLabel}）上以 ${i.target} tok/s/user 运行时：${i.aLabel} 达到 ${i.aValue.toFixed(0)} tok/s/GPU（${fmtCost(i.aCost)}/百万 token），${i.bLabel} 达到 ${i.bValue.toFixed(0)}（${fmtCost(i.bCost)}/百万）。${variantFullSummaryZh(i)}。投机解码的收益因工作负载而异；短输出提示获益通常较小。`,
];

// Single-side templates -- Chinese (shared by both kinds)
const VARIANT_SINGLE_TEMPLATES_ZH: ((args: {
  modelLabel: string;
  gpuLabel: string;
  presentLabel: string;
  missingLabel: string;
  target: number;
  presentValue: number;
  presentCost: number;
}) => string)[] = [
  (i) =>
    `在 ${i.modelLabel}（${i.gpuLabel}）上以 ${i.target} tok/s/user 运行时，${i.presentLabel} 吞吐量为 ${i.presentValue.toFixed(0)} tok/s/GPU，每百万 token 成本 ${fmtCost(i.presentCost)}；${i.missingLabel} 在此目标点没有基准测试数据。`,
  (i) =>
    `${i.presentLabel} 在 ${i.modelLabel}（${i.gpuLabel}）上以 ${i.target} tok/s/user 运行时达到 ${i.presentValue.toFixed(0)} tok/s/GPU（每百万 token ${fmtCost(i.presentCost)}）。${i.missingLabel} 在此工作点没有数据。`,
  (i) =>
    `${i.presentLabel}：${i.presentValue.toFixed(0)} tok/s/GPU，每百万 token ${fmtCost(i.presentCost)}（${i.modelLabel}（${i.gpuLabel}）上以 ${i.target} tok/s/user 运行）。${i.missingLabel} 在此点尚未测试。`,
];

// ---------------------------------------------------------------------------
// variantCompareNarrativeZh
// ---------------------------------------------------------------------------

export function variantCompareNarrativeZh(
  kind: VariantCompareKind,
  modelLabel: string,
  gpuLabel: string,
  aLabel: string,
  bLabel: string,
  ssrRows: SsrInterpolatedRow[],
  interactivityRange: { min: number; max: number },
): string[] {
  if (ssrRows.length === 0) return [];

  const range = `${interactivityRange.min}–${interactivityRange.max} tok/s/user`;
  const pageSeed = `${kind}|${modelLabel}|${gpuLabel}|${aLabel}|${bLabel}`;
  const paragraphs: string[] = [];
  const bothPool =
    kind === 'precision' ? PRECISION_BOTH_TEMPLATES_ZH : SPEC_DECODE_BOTH_TEMPLATES_ZH;

  for (const [rowIndex, row] of ssrRows.entries()) {
    const { target, a, b } = row;
    if (!a && !b) continue;
    const band = bandFor(target, interactivityRange);

    if (a && b) {
      const costOk = a.cost > 0 && b.cost > 0;
      const tputOk = a.value > 0 && b.value > 0;
      const aCheaper = a.cost < b.cost;
      const aFaster = a.value > b.value;
      const costRatio = costOk ? (aCheaper ? b.cost / a.cost : a.cost / b.cost) : null;
      const tputRatio = tputOk ? (aFaster ? a.value / b.value : b.value / a.value) : null;
      const inputs: VariantBoth = {
        modelLabel,
        gpuLabel,
        aLabel,
        bLabel,
        cheaper: aCheaper ? aLabel : bLabel,
        faster: aFaster ? aLabel : bLabel,
        costRatio,
        tputRatio,
        costTied: costOk && costRatio !== null && costRatio < 1.01,
        tputTied: tputOk && tputRatio !== null && tputRatio < 1.01,
        target,
        aCost: a.cost,
        bCost: b.cost,
        aValue: a.value,
        bValue: b.value,
        range,
        band,
      };
      paragraphs.push(pickRotated(bothPool, pageSeed, rowIndex)(inputs));
      continue;
    }

    const present = (a ?? b)!;
    paragraphs.push(
      pickRotated(
        VARIANT_SINGLE_TEMPLATES_ZH,
        pageSeed,
        rowIndex,
      )({
        modelLabel,
        gpuLabel,
        presentLabel: a ? aLabel : bLabel,
        missingLabel: a ? bLabel : aLabel,
        target,
        presentValue: present.value,
        presentCost: present.cost,
      }),
    );
  }

  return paragraphs;
}

// ---------------------------------------------------------------------------
// JSON-LD -- Chinese
// ---------------------------------------------------------------------------

export function buildVariantJsonLdZh(
  kind: VariantCompareKind,
  model: CompareModelSlug,
  gpuKey: string,
  aLabel: string,
  bLabel: string,
  url: string,
  summaryA: PairSummary,
  summaryB: PairSummary,
  ssrRows: SsrInterpolatedRow[],
  imageUrl?: string,
  datePublished?: string,
  dateModified?: string,
) {
  const gpuMeta = HW_REGISTRY[gpuKey];
  const gpuDisplayLabel = gpuMeta?.label ?? gpuKey.toUpperCase();
  const kindLabel = kind === 'precision' ? '精度对比' : '投机解码对比';

  const itemListName = `${model.label} ${kindLabel} — ${aLabel} vs ${bLabel}（${gpuDisplayLabel}）`;
  const itemListDescription =
    kind === 'precision'
      ? `${model.label} 在 ${gpuDisplayLabel} 上的 ${aLabel} 与 ${bLabel} 精度对比。在相同交互性水平下对齐的吞吐量、成本和交互性。`
      : `${model.label} 在 ${gpuDisplayLabel} 上的 ${aLabel} 与 ${bLabel} 投机解码对比。在相同交互性水平下对齐的吞吐量、成本和交互性。`;
  const datasetName = `${aLabel} vs ${bLabel}（${model.label}，${gpuDisplayLabel}）${kindLabel}`;
  const datasetDescription =
    kind === 'precision'
      ? `${model.label}（${gpuDisplayLabel}）上 ${aLabel} 与 ${bLabel} 精度在相同交互性水平下的插值吞吐量和成本。`
      : `${model.label}（${gpuDisplayLabel}）上 ${aLabel} 与 ${bLabel} 投机解码在相同交互性水平下的插值吞吐量和成本。`;

  const comparisonRows = ssrRows
    .filter((row) => row.a || row.b)
    .map((row) => {
      const metrics: { name: string; value: string }[] = [
        { name: 'Model', value: model.displayName },
        { name: 'GPU', value: gpuDisplayLabel },
        { name: 'Target Interactivity (tok/s/user)', value: String(row.target) },
      ];
      if (row.a) {
        metrics.push(
          { name: `${aLabel} Throughput (tok/s/gpu)`, value: row.a.value.toFixed(1) },
          { name: `${aLabel} Cost ($/M tok)`, value: row.a.cost.toFixed(3) },
          { name: `${aLabel} tok/s/MW`, value: row.a.tpPerMw.toFixed(0) },
          { name: `${aLabel} Concurrency`, value: String(Math.round(row.a.concurrency)) },
        );
      }
      if (row.b) {
        metrics.push(
          { name: `${bLabel} Throughput (tok/s/gpu)`, value: row.b.value.toFixed(1) },
          { name: `${bLabel} Cost ($/M tok)`, value: row.b.cost.toFixed(3) },
          { name: `${bLabel} tok/s/MW`, value: row.b.tpPerMw.toFixed(0) },
          { name: `${bLabel} Concurrency`, value: String(Math.round(row.b.concurrency)) },
        );
      }
      return {
        '@type': 'Dataset',
        name: `${model.label} 在 ${row.target} tok/s/user 交互性下的${kind === 'precision' ? '精度' : '投机解码'}对比`,
        variableMeasured: metrics.map((m) => ({
          '@type': 'PropertyValue',
          name: m.name,
          value: m.value,
        })),
      };
    });

  const keywords = [
    ...new Set(
      [
        'AI inference benchmark',
        kind === 'precision' ? 'precision comparison' : 'speculative decoding comparison',
        'inference throughput',
        'tokens per second',
        model.label,
        gpuDisplayLabel,
        aLabel,
        bLabel,
        gpuMeta?.vendor,
      ].filter(Boolean),
    ),
  ].join(', ');

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ItemList',
        name: itemListName,
        description: itemListDescription,
        url,
        inLanguage: 'zh-CN',
        ...(imageUrl && { image: imageUrl }),
        itemListOrder: 'https://schema.org/ItemListOrderAscending',
        numberOfItems: 2,
        itemListElement: [
          variantJsonLdEntryFor(aLabel, summaryA, 1),
          variantJsonLdEntryFor(bLabel, summaryB, 2),
        ],
      },
      ...(comparisonRows.length > 0
        ? [
            {
              '@type': 'Dataset',
              name: datasetName,
              description: datasetDescription,
              url,
              inLanguage: 'zh-CN',
              license: 'https://www.apache.org/licenses/LICENSE-2.0',
              isAccessibleForFree: true,
              measurementTechnique:
                'Open-source automated GPU CI/CD inference benchmark (github.com/SemiAnalysisAI/InferenceX)',
              keywords,
              ...(datePublished && { datePublished }),
              ...(dateModified && { dateModified }),
              creator: {
                '@type': 'Organization',
                name: AUTHOR_NAME,
                url: AUTHOR_URL,
              },
              ...(imageUrl && {
                image: {
                  '@type': 'ImageObject',
                  contentUrl: imageUrl,
                  caption: datasetName,
                },
              }),
              hasPart: comparisonRows,
            },
          ]
        : []),
    ],
  };
}

export function buildVariantBreadcrumbJsonLdZh(
  kind: VariantCompareKind,
  pairLabel: string,
  url: string,
) {
  const routeSegment = kind === 'precision' ? 'compare-precision' : 'compare-spec-decode';
  const indexUrl = `${SITE_URL}/zh/${routeSegment}`;
  const indexName = kind === 'precision' ? '精度对比' : '投机解码对比';
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '首页', item: `${SITE_URL}/zh` },
      { '@type': 'ListItem', position: 2, name: indexName, item: indexUrl },
      { '@type': 'ListItem', position: 3, name: pairLabel, item: url },
    ],
  };
}
