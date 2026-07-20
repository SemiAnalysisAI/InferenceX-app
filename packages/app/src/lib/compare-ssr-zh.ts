/**
 * Simplified Chinese ports of the English-prose-generating functions in
 * compare-ssr.ts. Provides zh narrative templates, JSON-LD builders, and
 * breadcrumb helpers for /zh/compare and /zh/compare-per-dollar slug pages.
 *
 * MUST be updated whenever compare-ssr.ts narrative templates change.
 */
import {
  AUTHOR_NAME,
  AUTHOR_URL,
  HW_REGISTRY,
  SITE_NAME,
  SITE_URL,
} from '@semianalysisai/inferencex-constants';

import {
  type CompareModelSlug,
  compareDisplayLabel,
  compareModelDisplayLabel,
  compareModelSeoName,
} from '@/lib/compare-slug';
import {
  bandFor,
  type CompareJsonLdVariant,
  computeCompareStat,
  fmtCost,
  fmtPctDelta,
  type FullBoth,
  jsonLdEntryFor,
  META_DESCRIPTION_MAX,
  type PairSummary,
  type PerDollarBoth,
  pickRotated,
  type SsrInterpolatedRow,
} from '@/lib/compare-ssr';

// ---------------------------------------------------------------------------
// Band phrase — Chinese
// ---------------------------------------------------------------------------

const BAND_PHRASE_ZH: Record<'low' | 'middle' | 'high', string> = {
  low: '低端',
  middle: '中部',
  high: '高端',
};

// ---------------------------------------------------------------------------
// /compare-per-dollar variant — both GPUs, no tie, non-zero costs
// ---------------------------------------------------------------------------

const PER_DOLLAR_BOTH_TEMPLATES_ZH: ((i: PerDollarBoth) => string)[] = [
  (i) =>
    `在 ${i.modelLabel} 上以 ${i.target} tok/s/user 运行时，${i.aLabel} 每百万 token 成本为 ${fmtCost(i.aCost)}，${i.bLabel} 为 ${fmtCost(i.bCost)}。${i.cheaper} 在此工作点上的成本效率高出 ${fmtPctDelta(i.ratio)}。`,
  (i) =>
    `${i.cheaper} 在 ${i.modelLabel} 上以 ${i.target} tok/s/user 运行时领先于 ${i.pricier}——每百万 token 成本 ${fmtCost(i.cheaperCost)} 对 ${fmtCost(i.pricierCost)}，差距达 ${fmtPctDelta(i.ratio)}。`,
  (i) =>
    `将 ${i.modelLabel} 推至 ${i.target} tok/s/user 时，${i.aLabel} 每百万 token 成本为 ${fmtCost(i.aCost)}，${i.bLabel} 为 ${fmtCost(i.bCost)}——${i.cheaper} 领先 ${fmtPctDelta(i.ratio)}。`,
  (i) =>
    `${i.aLabel}：每百万 token ${fmtCost(i.aCost)}。${i.bLabel}：${fmtCost(i.bCost)}。均在 ${i.modelLabel} 上以 ${i.target} tok/s/user 运行，${i.cheaper} 便宜 ${fmtPctDelta(i.ratio)}。`,
  (i) =>
    `在 ${i.range} 交互性区间的${BAND_PHRASE_ZH[i.band]}——即 ${i.target} tok/s/user 处——${i.aLabel} 运行 ${i.modelLabel} 每百万 token 成本为 ${fmtCost(i.aCost)}，${i.bLabel} 为 ${fmtCost(i.bCost)}。${i.cheaper} 便宜 ${fmtPctDelta(i.ratio)}。`,
  (i) =>
    `在 ${i.modelLabel} 上以 ${i.target} tok/s/user 运行时，每百万 token 成本分别为：${i.aLabel} ${fmtCost(i.aCost)}、${i.bLabel} ${fmtCost(i.bCost)}；${i.cheaper} 每美元多产出 ${fmtPctDelta(i.ratio)} 的 token。`,
];

const PER_DOLLAR_TIED_TEMPLATES_ZH: ((i: PerDollarBoth) => string)[] = [
  (i) =>
    `在 ${i.modelLabel} 上以 ${i.target} tok/s/user 运行时，${i.aLabel} 和 ${i.bLabel} 的每百万 token 成本几乎相同（${fmtCost(i.aCost)} 对 ${fmtCost(i.bCost)}），差距在 ~1% 以内。`,
  (i) =>
    `${i.aLabel} ${fmtCost(i.aCost)}、${i.bLabel} ${fmtCost(i.bCost)} 每百万 token，在 ${i.modelLabel} 上以 ${i.target} tok/s/user 运行：成本实质相同。`,
  (i) =>
    `在 ${i.modelLabel} 上以 ${i.target} tok/s/user 运行时，${i.aLabel}（${fmtCost(i.aCost)}）与 ${i.bLabel}（${fmtCost(i.bCost)}）的每百万 token 成本基本持平。`,
];

const PER_DOLLAR_ZERO_TEMPLATES_ZH: ((args: {
  modelLabel: string;
  aLabel: string;
  bLabel: string;
  target: number;
  aCost: number;
  bCost: number;
}) => string)[] = [
  (i) =>
    `在 ${i.modelLabel} 上以 ${i.target} tok/s/user 运行时，${i.aLabel} 和 ${i.bLabel} 每百万 token 成本分别为 ${fmtCost(i.aCost)} 和 ${fmtCost(i.bCost)}——其中一方缺少定价或吞吐量数据，无法进行等价比较。`,
  (i) =>
    `${i.aLabel}（${fmtCost(i.aCost)}）与 ${i.bLabel}（${fmtCost(i.bCost)}）每百万 token，在 ${i.modelLabel} 上以 ${i.target} tok/s/user 运行：至少有一方数据为零，无法计算比率。`,
];

const PER_DOLLAR_SINGLE_TEMPLATES_ZH: ((args: {
  modelLabel: string;
  presentLabel: string;
  missingLabel: string;
  target: number;
  presentCost: number;
}) => string)[] = [
  (i) =>
    `在 ${i.modelLabel} 上以 ${i.target} tok/s/user 运行时，${i.presentLabel} 每百万 token 成本为 ${fmtCost(i.presentCost)}；${i.missingLabel} 在此目标点没有基准测试数据。`,
  (i) =>
    `在 ${i.modelLabel} 上以 ${i.target} tok/s/user 运行时，${i.presentLabel} 每百万 token 成本为 ${fmtCost(i.presentCost)}。${i.missingLabel} 尚未在此工作点进行基准测试。`,
  (i) =>
    `仅 ${i.presentLabel} 在 ${i.modelLabel} 上以 ${i.target} tok/s/user 运行时有成本数据——每百万 token ${fmtCost(i.presentCost)}。${i.missingLabel} 在此目标点尚未测试。`,
];

// ---------------------------------------------------------------------------
// /compare 'full' variant — both GPUs, mentions cost AND throughput
// ---------------------------------------------------------------------------

function fullSummaryZh(i: FullBoth): string {
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

const FULL_BOTH_TEMPLATES_ZH: ((i: FullBoth) => string)[] = [
  (i) =>
    `在 ${i.modelLabel} 上以 ${i.target} tok/s/user 交互性运行时，${i.aLabel} 吞吐量为 ${i.aValue.toFixed(0)} tok/s/GPU，每百万 token 成本 ${fmtCost(i.aCost)}；${i.bLabel} 吞吐量为 ${i.bValue.toFixed(0)} tok/s/GPU，成本 ${fmtCost(i.bCost)}。${fullSummaryZh(i)}。`,
  (i) =>
    `${i.aLabel} 在 ${i.modelLabel} 上以 ${i.target} tok/s/user 运行时达到 ${i.aValue.toFixed(0)} tok/s/GPU（每百万 token ${fmtCost(i.aCost)}）；${i.bLabel} 达到 ${i.bValue.toFixed(0)} tok/s/GPU（${fmtCost(i.bCost)}）。${fullSummaryZh(i)}。`,
  (i) =>
    `${i.modelLabel} 在 ${i.target} tok/s/user 交互性下的吞吐量：${i.aLabel} 为 ${i.aValue.toFixed(0)} tok/s/GPU，${i.bLabel} 为 ${i.bValue.toFixed(0)}。每百万 token 成本分别为 ${fmtCost(i.aCost)} 和 ${fmtCost(i.bCost)}。${fullSummaryZh(i)}。`,
  (i) =>
    `${i.aLabel} / ${i.bLabel} 在 ${i.modelLabel} 上以 ${i.target} tok/s/user 运行：${i.aValue.toFixed(0)} / ${i.bValue.toFixed(0)} tok/s/GPU，${fmtCost(i.aCost)} / ${fmtCost(i.bCost)} 每百万 token。${fullSummaryZh(i)}。`,
  (i) =>
    `在 ${i.range} 交互性区间的${BAND_PHRASE_ZH[i.band]}，即 ${i.modelLabel} 上以 ${i.target} tok/s/user 运行时：${i.aLabel} 达到 ${i.aValue.toFixed(0)} tok/s/GPU（${fmtCost(i.aCost)}/百万 token），${i.bLabel} 达到 ${i.bValue.toFixed(0)}（${fmtCost(i.bCost)}/百万）。${fullSummaryZh(i)}。`,
  (i) =>
    `以 ${i.target} tok/s/user 为目标在 ${i.modelLabel} 上运行时，${i.aLabel} 产出 ${i.aValue.toFixed(0)} tok/s/GPU（每百万 token ${fmtCost(i.aCost)}），${i.bLabel} 产出 ${i.bValue.toFixed(0)}（${fmtCost(i.bCost)}）。${fullSummaryZh(i)}。`,
];

const FULL_SINGLE_TEMPLATES_ZH: ((args: {
  modelLabel: string;
  presentLabel: string;
  missingLabel: string;
  target: number;
  presentValue: number;
  presentCost: number;
}) => string)[] = [
  (i) =>
    `在 ${i.modelLabel} 上以 ${i.target} tok/s/user 运行时，${i.presentLabel} 吞吐量为 ${i.presentValue.toFixed(0)} tok/s/GPU，每百万 token 成本 ${fmtCost(i.presentCost)}；${i.missingLabel} 在此目标点没有基准测试数据。`,
  (i) =>
    `${i.presentLabel} 在 ${i.modelLabel} 上以 ${i.target} tok/s/user 运行时达到 ${i.presentValue.toFixed(0)} tok/s/GPU（每百万 token ${fmtCost(i.presentCost)}）。${i.missingLabel} 在此工作点没有数据。`,
  (i) =>
    `${i.presentLabel}：${i.presentValue.toFixed(0)} tok/s/GPU，每百万 token ${fmtCost(i.presentCost)}（${i.modelLabel} 上以 ${i.target} tok/s/user 运行）。${i.missingLabel} 在此点尚未测试。`,
];

// ---------------------------------------------------------------------------
// compareTableNarrativeZh
// ---------------------------------------------------------------------------

export function compareTableNarrativeZh(
  variant: CompareJsonLdVariant,
  modelLabel: string,
  aLabel: string,
  bLabel: string,
  ssrRows: SsrInterpolatedRow[],
  interactivityRange: { min: number; max: number },
): string[] {
  if (ssrRows.length === 0) return [];

  const range = `${interactivityRange.min}–${interactivityRange.max} tok/s/user`;
  const pageSeed = `${variant}|${modelLabel}|${aLabel}|${bLabel}`;
  const paragraphs: string[] = [];

  for (const [rowIndex, row] of ssrRows.entries()) {
    const { target, a, b } = row;
    if (!a && !b) continue;
    const band = bandFor(target, interactivityRange);

    if (variant === 'per-dollar') {
      if (a && b) {
        if (!(a.cost > 0 && b.cost > 0)) {
          paragraphs.push(
            pickRotated(
              PER_DOLLAR_ZERO_TEMPLATES_ZH,
              pageSeed,
              rowIndex,
            )({
              modelLabel,
              aLabel,
              bLabel,
              target,
              aCost: a.cost,
              bCost: b.cost,
            }),
          );
          continue;
        }
        const aCheaper = a.cost < b.cost;
        const cheaper = aCheaper ? aLabel : bLabel;
        const pricier = aCheaper ? bLabel : aLabel;
        const ratio = aCheaper ? b.cost / a.cost : a.cost / b.cost;
        const inputs: PerDollarBoth = {
          modelLabel,
          aLabel,
          bLabel,
          cheaper,
          pricier,
          cheaperCost: aCheaper ? a.cost : b.cost,
          pricierCost: aCheaper ? b.cost : a.cost,
          ratio,
          target,
          aCost: a.cost,
          bCost: b.cost,
          range,
          band,
        };
        const pool = ratio < 1.01 ? PER_DOLLAR_TIED_TEMPLATES_ZH : PER_DOLLAR_BOTH_TEMPLATES_ZH;
        paragraphs.push(pickRotated(pool, pageSeed, rowIndex)(inputs));
        continue;
      }
      const present = (a ?? b)!;
      paragraphs.push(
        pickRotated(
          PER_DOLLAR_SINGLE_TEMPLATES_ZH,
          pageSeed,
          rowIndex,
        )({
          modelLabel,
          presentLabel: a ? aLabel : bLabel,
          missingLabel: a ? bLabel : aLabel,
          target,
          presentCost: present.cost,
        }),
      );
      continue;
    }

    // 'full' variant
    if (a && b) {
      const costOk = a.cost > 0 && b.cost > 0;
      const tputOk = a.value > 0 && b.value > 0;
      const aCheaper = a.cost < b.cost;
      const aFaster = a.value > b.value;
      const costRatio = costOk ? (aCheaper ? b.cost / a.cost : a.cost / b.cost) : null;
      const tputRatio = tputOk ? (aFaster ? a.value / b.value : b.value / a.value) : null;
      const inputs: FullBoth = {
        modelLabel,
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
      paragraphs.push(pickRotated(FULL_BOTH_TEMPLATES_ZH, pageSeed, rowIndex)(inputs));
      continue;
    }
    const present = (a ?? b)!;
    paragraphs.push(
      pickRotated(
        FULL_SINGLE_TEMPLATES_ZH,
        pageSeed,
        rowIndex,
      )({
        modelLabel,
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
// SEO meta description — Chinese port of compareMetaDescription
// ---------------------------------------------------------------------------

/** First candidate ≤ max, or undefined. Local mirror of the private helper in
 *  compare-ssr.ts so the ladder logic stays identical between the two files. */
function firstUnderZh(candidates: string[], max: number): string | undefined {
  return candidates.find((c) => c.length <= max);
}

/** Simplified Chinese, stat-led, ≤155-char meta description for a
 *  `/zh/compare/<slug>` page. 1:1 port of `compareMetaDescription`: same
 *  representative-row stat (`computeCompareStat`), same fallback-to-boilerplate
 *  and brand-clause-drop ladders. Model name, GPU SKUs and units stay English
 *  per the translation rules; the connective prose is Chinese. */
export function compareMetaDescriptionZh(
  model: CompareModelSlug,
  a: string,
  b: string,
  ssrRows: SsrInterpolatedRow[],
): string {
  const modelName = compareModelSeoName(model);
  const gpuLabel = compareDisplayLabel(a, b);

  const fallback =
    firstUnderZh(
      [
        `${gpuLabel} 在 ${modelName} 上的推理基准测试：来自 ${SITE_NAME}（${AUTHOR_NAME} 出品）的经验证、可复现开源结果。对比延迟、吞吐量与成本。`,
        `${gpuLabel} 在 ${modelName} 上的推理基准测试：来自 ${SITE_NAME}（${AUTHOR_NAME} 出品）的开源结果。`,
        `${gpuLabel} 在 ${modelName} 上的推理基准测试，来自 ${SITE_NAME}。`,
        `${gpuLabel} 在 ${modelName} 上的推理基准测试。`,
      ],
      META_DESCRIPTION_MAX,
    ) ?? `${gpuLabel} 推理基准测试`.slice(0, META_DESCRIPTION_MAX);

  const stat = computeCompareStat(a, b, ssrRows);
  if (!stat) return fallback;

  const tputClause =
    stat.tputPct > 0 ? `${stat.faster} 每 GPU 吞吐量比 ${stat.slower} 高 ${stat.tputPct}%` : null;
  const costClause = stat.costPct > 0 ? `${stat.cheaper} 每 token 成本低 ${stat.costPct}%` : null;

  let core: string;
  if (tputClause && costClause) core = `在 ${modelName} 上，${tputClause}；${costClause}。`;
  else if (tputClause) core = `在 ${modelName} 上，${tputClause}。`;
  else if (costClause)
    core = `在 ${modelName} 上，${stat.cheaper} 每 token 成本比 ${stat.pricier} 低 ${stat.costPct}%。`;
  else return fallback;

  return (
    firstUnderZh(
      [
        `${core}来自 ${SITE_NAME}（${AUTHOR_NAME} 出品）的可验证开源基准测试。`,
        `${core}来自 ${SITE_NAME} 的开源基准测试。`,
        core,
      ],
      META_DESCRIPTION_MAX,
    ) ?? fallback
  );
}

// ---------------------------------------------------------------------------
// JSON-LD — Chinese
// ---------------------------------------------------------------------------

export function buildBreadcrumbJsonLdZh(
  variant: CompareJsonLdVariant,
  pairLabel: string,
  url: string,
) {
  const indexUrl =
    variant === 'per-dollar' ? `${SITE_URL}/zh/compare-per-dollar` : `${SITE_URL}/zh/compare`;
  const indexName = variant === 'per-dollar' ? 'GPU 每美元性能' : 'GPU 对比';
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

export function buildJsonLdZh(
  variant: CompareJsonLdVariant,
  model: CompareModelSlug,
  a: string,
  b: string,
  url: string,
  summaryA: PairSummary,
  summaryB: PairSummary,
  ssrRows: SsrInterpolatedRow[],
  imageUrl?: string,
  datePublished?: string,
  dateModified?: string,
  modelApiKey?: string,
) {
  const aLabel = HW_REGISTRY[a]?.label ?? a.toUpperCase();
  const bLabel = HW_REGISTRY[b]?.label ?? b.toUpperCase();
  const fullLabel = compareModelDisplayLabel(model, a, b);

  const itemListName =
    variant === 'per-dollar' ? `${fullLabel} — 每美元性能` : `${fullLabel} 推理基准测试`;
  const itemListDescription =
    variant === 'per-dollar'
      ? `${aLabel} 与 ${bLabel} 在 ${model.label} 上的每百万 token 成本。基于所属云服务商 TCO 归一化的 GPU 推理性能。`
      : `${aLabel} 与 ${bLabel} 在 ${model.label} 上的正面 AI 推理基准测试对比。`;
  const datasetName =
    variant === 'per-dollar'
      ? `${aLabel} vs ${bLabel}（${model.label}）每美元性能对比`
      : `${aLabel} vs ${bLabel}（${model.label}）插值基准测试对比`;
  const datasetDescription =
    variant === 'per-dollar'
      ? `${aLabel} 与 ${bLabel} 在 ${model.label} 上的所属云服务商每百万 token 成本，在相同交互性水平下对齐——美元归一化推理基准测试。`
      : `${aLabel} 与 ${bLabel} 在 ${model.label} 上在相同交互性水平下的插值吞吐量、成本、能效及并发数。`;

  const comparisonRows = ssrRows
    .filter((row) => row.a || row.b)
    .map((row) => {
      const metrics: { name: string; value: string }[] = [
        { name: 'Model', value: model.displayName },
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
        name: `${model.label} 在 ${row.target} tok/s/user 交互性下的对比`,
        variableMeasured: metrics.map((m) => ({
          '@type': 'PropertyValue',
          name: m.name,
          value: m.value,
        })),
      };
    });

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
        itemListElement: [jsonLdEntryFor(a, summaryA, 1), jsonLdEntryFor(b, summaryB, 2)],
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
              keywords: [
                ...new Set(
                  [
                    'AI inference benchmark',
                    'GPU comparison',
                    variant === 'per-dollar' ? 'cost per million tokens' : 'inference latency',
                    variant === 'per-dollar' ? 'performance per dollar' : 'tokens per second',
                    model.label,
                    aLabel,
                    bLabel,
                    HW_REGISTRY[a]?.vendor,
                    HW_REGISTRY[b]?.vendor,
                  ].filter(Boolean),
                ),
              ].join(', '),
              ...(datePublished && { datePublished }),
              ...(dateModified && { dateModified }),
              creator: {
                '@type': 'Organization',
                name: AUTHOR_NAME,
                url: AUTHOR_URL,
              },
              ...(modelApiKey && {
                distribution: {
                  '@type': 'DataDownload',
                  encodingFormat: 'application/json',
                  contentUrl: `${SITE_URL}/api/v1/benchmarks?model=${encodeURIComponent(modelApiKey)}`,
                  name: `${model.label} latest benchmark rows (JSON)`,
                },
              }),
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
