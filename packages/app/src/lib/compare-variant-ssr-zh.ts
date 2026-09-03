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
import { type VariantBoth, type VariantCompareKind } from '@/lib/compare-variant-ssr';

// ---------------------------------------------------------------------------
// Band phrase -- Chinese
// ---------------------------------------------------------------------------

function bandPositionZh(target: number, range: string, band: 'low' | 'middle' | 'high'): string {
  if (band === 'low') return `${target} tok/s/user 接近 ${range} 交互性区间的下限`;
  if (band === 'high') return `${target} tok/s/user 接近 ${range} 交互性区间的上限`;
  return `${target} tok/s/user 位于 ${range} 交互性区间的中段`;
}

// ---------------------------------------------------------------------------
// Shared template-input type — imported from the EN module so the two files
// cannot drift structurally.
// ---------------------------------------------------------------------------

function variantFullSummaryZh(i: VariantBoth): string {
  const cheaper = i.cheaper === '关闭' || i.cheaper === 'Off' ? '关闭投机解码' : i.cheaper;
  const faster = i.faster === '关闭' || i.faster === 'Off' ? '关闭投机解码' : i.faster;
  const costPart = i.costTied
    ? '每 token 成本基本持平'
    : i.costRatio === null
      ? null
      : `${cheaper} 的成本效率高出 ${fmtPctDelta(i.costRatio)}`;
  const tputPart = i.tputTied
    ? '单芯片吞吐量基本持平'
    : i.tputRatio === null
      ? null
      : `${faster} 的单芯片吞吐量高出 ${fmtPctDelta(i.tputRatio)}`;
  const both = [costPart, tputPart].filter(Boolean).join('；');
  return both.length > 0 ? both : '缺少可比较的有效数据';
}

function specDecodeStateZh(label: string): string {
  return label === '关闭' || label === 'Off' ? '关闭投机解码' : `启用 ${label}`;
}

function variantStateAtZh(kind: VariantCompareKind, label: string): string {
  if (kind === 'precision') return `采用 ${label} 时`;
  return label === '关闭' || label === 'Off' ? '关闭投机解码时' : `启用 ${label} 时`;
}

// ---------------------------------------------------------------------------
// Precision comparison templates -- Chinese
// ---------------------------------------------------------------------------

const PRECISION_BOTH_TEMPLATES_ZH: ((i: VariantBoth) => string)[] = [
  (i) =>
    `在 ${i.gpuLabel} 上运行 ${i.modelLabel}，目标交互性为 ${i.target} tok/s/user 时，${i.aLabel} 的吞吐量为 ${i.aValue.toFixed(0)} tok/s/chip，每百万 token 成本为 ${fmtCost(i.aCost)}；${i.bLabel} 的吞吐量为 ${i.bValue.toFixed(0)} tok/s/chip，每百万 token 成本为 ${fmtCost(i.bCost)}。${variantFullSummaryZh(i)}。较低的量化精度以模型准确率为代价换取更高吞吐量；如需了解对模型质量的影响，请查看评估页。`,
  (i) =>
    `当 ${i.modelLabel} 在 ${i.gpuLabel} 上的目标交互性为 ${i.target} tok/s/user 时，${i.aLabel} 的吞吐量为 ${i.aValue.toFixed(0)} tok/s/chip，每百万 token 成本为 ${fmtCost(i.aCost)}；${i.bLabel} 的吞吐量为 ${i.bValue.toFixed(0)} tok/s/chip，每百万 token 成本为 ${fmtCost(i.bCost)}。${variantFullSummaryZh(i)}。不同量化精度下的模型准确率差异可在评估页查看。`,
  (i) =>
    `在 ${i.gpuLabel} 上运行 ${i.modelLabel}，目标交互性为 ${i.target} tok/s/user 时，${i.aLabel} 与 ${i.bLabel} 的吞吐量分别为 ${i.aValue.toFixed(0)} 和 ${i.bValue.toFixed(0)} tok/s/chip，每百万 token 成本分别为 ${fmtCost(i.aCost)} 和 ${fmtCost(i.bCost)}。${variantFullSummaryZh(i)}。较低量化精度下的成本与吞吐量权衡只是整体考量的一部分；模型准确率数据请参阅评估页。`,
  (i) =>
    `${bandPositionZh(i.target, i.range, i.band)}。在这一运行点，${i.aLabel} 在 ${i.gpuLabel} 上运行 ${i.modelLabel} 的吞吐量为 ${i.aValue.toFixed(0)} tok/s/chip，每百万 token 成本为 ${fmtCost(i.aCost)}；${i.bLabel} 的吞吐量为 ${i.bValue.toFixed(0)} tok/s/chip，每百万 token 成本为 ${fmtCost(i.bCost)}。${variantFullSummaryZh(i)}。调整量化精度会同时影响推理速度和模型质量；模型准确率基准测试请参阅评估页。`,
];

// ---------------------------------------------------------------------------
// Spec-decode comparison templates -- Chinese
// ---------------------------------------------------------------------------

const SPEC_DECODE_BOTH_TEMPLATES_ZH: ((i: VariantBoth) => string)[] = [
  (i) =>
    `在 ${i.gpuLabel} 上运行 ${i.modelLabel}，目标交互性设为 ${i.target} tok/s/user：${variantStateAtZh('spec-decode', i.aLabel)}，吞吐量为 ${i.aValue.toFixed(0)} tok/s/chip，每百万 token 成本为 ${fmtCost(i.aCost)}；${variantStateAtZh('spec-decode', i.bLabel)}，吞吐量为 ${i.bValue.toFixed(0)} tok/s/chip，每百万 token 成本为 ${fmtCost(i.bCost)}。${variantFullSummaryZh(i)}。投机解码通过接受 draft token 降低每 token 延迟；收益因工作负载和 prompt 分布而异。`,
  (i) =>
    `${i.modelLabel} 在 ${i.gpuLabel} 上的目标交互性设为 ${i.target} tok/s/user：${variantStateAtZh('spec-decode', i.aLabel)}，吞吐量为 ${i.aValue.toFixed(0)} tok/s/chip，每百万 token 成本为 ${fmtCost(i.aCost)}；${variantStateAtZh('spec-decode', i.bLabel)}，吞吐量为 ${i.bValue.toFixed(0)} tok/s/chip，每百万 token 成本为 ${fmtCost(i.bCost)}。${variantFullSummaryZh(i)}。draft token 接受率决定了在给定并发数下，投机解码是提升性能还是拖累性能。`,
  (i) =>
    `在 ${i.gpuLabel} 上运行 ${i.modelLabel}，目标交互性设为 ${i.target} tok/s/user：${variantStateAtZh('spec-decode', i.aLabel)}，吞吐量为 ${i.aValue.toFixed(0)} tok/s/chip，每百万 token 成本为 ${fmtCost(i.aCost)}；${variantStateAtZh('spec-decode', i.bLabel)}，吞吐量为 ${i.bValue.toFixed(0)} tok/s/chip，每百万 token 成本为 ${fmtCost(i.bCost)}。${variantFullSummaryZh(i)}。投机解码会增加 draft token 的计算量，以减少解码步数；收益取决于序列长度和批大小。`,
  (i) =>
    `${bandPositionZh(i.target, i.range, i.band)}。在这一运行点，${variantStateAtZh('spec-decode', i.aLabel)}，吞吐量为 ${i.aValue.toFixed(0)} tok/s/chip，每百万 token 成本为 ${fmtCost(i.aCost)}；${variantStateAtZh('spec-decode', i.bLabel)}，吞吐量为 ${i.bValue.toFixed(0)} tok/s/chip，每百万 token 成本为 ${fmtCost(i.bCost)}。${variantFullSummaryZh(i)}。投机解码的收益因工作负载而异；输出较短的 prompt 通常收益较小。`,
];

// Single-side templates -- Chinese (shared by both kinds)
const VARIANT_SINGLE_TEMPLATES_ZH: ((args: {
  kind: VariantCompareKind;
  modelLabel: string;
  gpuLabel: string;
  presentLabel: string;
  missingLabel: string;
  target: number;
  presentValue: number;
  presentCost: number;
}) => string)[] = [
  (i) =>
    `在 ${i.gpuLabel} 上运行 ${i.modelLabel}，目标交互性设为 ${i.target} tok/s/user：${variantStateAtZh(i.kind, i.presentLabel)}，吞吐量为 ${i.presentValue.toFixed(0)} tok/s/chip，每百万 token 成本为 ${fmtCost(i.presentCost)}；${variantStateAtZh(i.kind, i.missingLabel)}，该运行点暂无基准测试数据。`,
  (i) =>
    `${i.modelLabel} 在 ${i.gpuLabel} 上的目标交互性设为 ${i.target} tok/s/user：${variantStateAtZh(i.kind, i.presentLabel)}，吞吐量为 ${i.presentValue.toFixed(0)} tok/s/chip，每百万 token 成本为 ${fmtCost(i.presentCost)}；${variantStateAtZh(i.kind, i.missingLabel)}，该运行点暂无数据。`,
  (i) =>
    `在 ${i.gpuLabel} 上运行 ${i.modelLabel}，目标交互性设为 ${i.target} tok/s/user：${variantStateAtZh(i.kind, i.presentLabel)}，吞吐量为 ${i.presentValue.toFixed(0)} tok/s/chip，每百万 token 成本为 ${fmtCost(i.presentCost)}；${variantStateAtZh(i.kind, i.missingLabel)}，该运行点尚未测试。`,
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
        kind,
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

function variantJsonLdEntryForZh(label: string, summary: PairSummary, position: number) {
  const props: { name: string; value: string | number }[] = [{ name: '类别', value: '配置方案' }];
  if (summary.bestThroughputPerGpu !== null) {
    props.push({
      name: '最高单芯片吞吐量（tok/s）',
      value: Number(summary.bestThroughputPerGpu.toFixed(2)),
    });
  }
  if (summary.bestMedianTtft !== null) {
    props.push({
      name: '最低 TTFT 中位数（s）',
      value: Number(summary.bestMedianTtft.toFixed(3)),
    });
  }
  if (summary.bestMedianTpot !== null) {
    props.push({
      name: '最低 TPOT 中位数（s）',
      value: Number(summary.bestMedianTpot.toFixed(4)),
    });
  }
  props.push({ name: '基准测试配置数', value: summary.configCount });
  return {
    '@type': 'ListItem',
    position,
    item: {
      '@type': 'Thing',
      name: label,
      additionalProperty: props.map((property) => ({
        '@type': 'PropertyValue',
        name: property.name,
        value: property.value,
      })),
    },
  };
}

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
  const kindLabel = kind === 'precision' ? '量化精度对比' : '投机解码对比';
  const aDisplayLabel = kind === 'precision' ? aLabel : specDecodeStateZh(aLabel);
  const bDisplayLabel = kind === 'precision' ? bLabel : specDecodeStateZh(bLabel);
  const pairLabel =
    kind === 'precision' ? `${aLabel} 与 ${bLabel}` : `${aDisplayLabel} 与 ${bDisplayLabel}`;

  const itemListName = `${model.label} ${kindLabel}：${pairLabel}（${gpuDisplayLabel}）`;
  const itemListDescription =
    kind === 'precision'
      ? `对比 ${model.label} 在 ${gpuDisplayLabel} 上采用 ${aLabel} 与 ${bLabel} 两种量化精度时的表现，并在相同交互性水平下比较吞吐量和成本。`
      : `对比 ${model.label} 在 ${gpuDisplayLabel} 上的两种配置（${aDisplayLabel}、${bDisplayLabel}），并在相同交互性水平下比较吞吐量和成本。`;
  const datasetName = `${model.label} ${kindLabel}：${pairLabel}（${gpuDisplayLabel}）`;
  const datasetDescription =
    kind === 'precision'
      ? `${model.label} 在 ${gpuDisplayLabel} 上采用 ${aLabel} 与 ${bLabel} 两种量化精度时的插值对比数据；在相同交互性水平下比较吞吐量和成本。`
      : `${model.label} 在 ${gpuDisplayLabel} 上两种配置（${aDisplayLabel}、${bDisplayLabel}）的插值对比数据；在相同交互性水平下比较吞吐量和成本。`;

  const comparisonRows = ssrRows
    .filter((row) => row.a || row.b)
    .map((row) => {
      const metrics: { name: string; value: string }[] = [
        { name: '模型', value: model.displayName },
        { name: '芯片', value: gpuDisplayLabel },
        { name: '目标交互性（tok/s/user）', value: String(row.target) },
      ];
      if (row.a) {
        metrics.push(
          { name: `${aDisplayLabel}：吞吐量（tok/s/chip）`, value: row.a.value.toFixed(1) },
          { name: `${aDisplayLabel}：成本（$/M tok）`, value: row.a.cost.toFixed(3) },
          { name: `${aDisplayLabel}：能效（tok/s/MW）`, value: row.a.tpPerMw.toFixed(0) },
          { name: `${aDisplayLabel}：并发数`, value: String(Math.round(row.a.concurrency)) },
        );
      }
      if (row.b) {
        metrics.push(
          { name: `${bDisplayLabel}：吞吐量（tok/s/chip）`, value: row.b.value.toFixed(1) },
          { name: `${bDisplayLabel}：成本（$/M tok）`, value: row.b.cost.toFixed(3) },
          { name: `${bDisplayLabel}：能效（tok/s/MW）`, value: row.b.tpPerMw.toFixed(0) },
          { name: `${bDisplayLabel}：并发数`, value: String(Math.round(row.b.concurrency)) },
        );
      }
      return {
        '@type': 'Dataset',
        name: `${model.label}：目标交互性 ${row.target} tok/s/user 下的${kindLabel}`,
        inLanguage: 'zh-CN',
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
        'AI 推理基准测试',
        kind === 'precision' ? '精度对比' : '投机解码对比',
        '推理吞吐量',
        '每秒 token 数',
        model.label,
        gpuDisplayLabel,
        aDisplayLabel,
        bDisplayLabel,
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
          variantJsonLdEntryForZh(aDisplayLabel, summaryA, 1),
          variantJsonLdEntryForZh(bDisplayLabel, summaryB, 2),
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
                '通过开源 CI/CD 自动执行的芯片推理基准测试（github.com/SemiAnalysisAI/InferenceX）',
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
