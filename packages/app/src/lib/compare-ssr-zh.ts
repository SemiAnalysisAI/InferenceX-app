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

import { type CompareModelSlug, compareModelSeoName } from '@/lib/compare-slug';
import {
  type AgenticScenarioIntro,
  bandFor,
  type CompareJsonLdVariant,
  computeCompareStat,
  fmtCost,
  fmtPctDelta,
  type FullBoth,
  META_DESCRIPTION_MAX,
  type PairSummary,
  type PerDollarBoth,
  pickRotated,
  type SsrInterpolatedRow,
} from '@/lib/compare-ssr';

/** Format model names for Chinese prose without leaking English conjunctions. */
export function formatModelListZh(models: CompareModelSlug[]): string {
  const labels = models.map((model) => model.label);
  return labels.length === 0 ? '暂无模型' : labels.join('、');
}

// ---------------------------------------------------------------------------
// Band phrase — Chinese
// ---------------------------------------------------------------------------

function bandPositionZh(target: number, range: string, band: 'low' | 'middle' | 'high'): string {
  if (band === 'low') return `${target} tok/s/user 接近 ${range} 交互性区间的下限`;
  if (band === 'high') return `${target} tok/s/user 接近 ${range} 交互性区间的上限`;
  return `${target} tok/s/user 位于 ${range} 交互性区间的中段`;
}

// ---------------------------------------------------------------------------
// /compare-per-dollar variant — both GPUs, no tie, non-zero costs
// ---------------------------------------------------------------------------

const PER_DOLLAR_BOTH_TEMPLATES_ZH: ((i: PerDollarBoth) => string)[] = [
  (i) =>
    `当 ${i.modelLabel} 的目标交互性为 ${i.target} tok/s/user 时，${i.aLabel} 的每百万 token 成本为 ${fmtCost(i.aCost)}，${i.bLabel} 为 ${fmtCost(i.bCost)}；在这一运行点，${i.cheaper} 的成本效率高出 ${fmtPctDelta(i.ratio)}。`,
  (i) =>
    `当 ${i.modelLabel} 的目标交互性为 ${i.target} tok/s/user 时，${i.cheaper} 与 ${i.pricier} 的每百万 token 成本分别为 ${fmtCost(i.cheaperCost)} 和 ${fmtCost(i.pricierCost)}；${i.cheaper} 的成本效率高出 ${fmtPctDelta(i.ratio)}。`,
  (i) =>
    `将 ${i.modelLabel} 的目标交互性设为 ${i.target} tok/s/user 时，${i.aLabel} 的每百万 token 成本为 ${fmtCost(i.aCost)}，${i.bLabel} 为 ${fmtCost(i.bCost)}；${i.cheaper} 的成本效率高出 ${fmtPctDelta(i.ratio)}。`,
  (i) =>
    `在 ${i.modelLabel} 的 ${i.target} tok/s/user 运行点，${i.aLabel} 的每百万 token 成本为 ${fmtCost(i.aCost)}，${i.bLabel} 为 ${fmtCost(i.bCost)}；${i.cheaper} 的成本效率高出 ${fmtPctDelta(i.ratio)}。`,
  (i) =>
    `${bandPositionZh(i.target, i.range, i.band)}。在这一运行点，${i.aLabel} 运行 ${i.modelLabel} 的每百万 token 成本为 ${fmtCost(i.aCost)}，${i.bLabel} 为 ${fmtCost(i.bCost)}；${i.cheaper} 的成本效率高出 ${fmtPctDelta(i.ratio)}。`,
  (i) =>
    `当 ${i.modelLabel} 的目标交互性为 ${i.target} tok/s/user 时，${i.aLabel} 与 ${i.bLabel} 的每百万 token 成本分别为 ${fmtCost(i.aCost)} 和 ${fmtCost(i.bCost)}；${i.cheaper} 每美元可处理的总 token 数多出 ${fmtPctDelta(i.ratio)}。`,
];

const PER_DOLLAR_TIED_TEMPLATES_ZH: ((i: PerDollarBoth) => string)[] = [
  (i) =>
    `当 ${i.modelLabel} 的目标交互性为 ${i.target} tok/s/user 时，${i.aLabel} 与 ${i.bLabel} 的每百万 token 成本分别为 ${fmtCost(i.aCost)} 和 ${fmtCost(i.bCost)}；两者相差不到 1%，可视为基本持平。`,
  (i) =>
    `在 ${i.modelLabel} 的 ${i.target} tok/s/user 运行点，${i.aLabel} 与 ${i.bLabel} 的每百万 token 成本分别为 ${fmtCost(i.aCost)} 和 ${fmtCost(i.bCost)}；两者相差不到 1%，成本基本持平。`,
  (i) =>
    `当 ${i.modelLabel} 的目标交互性为 ${i.target} tok/s/user 时，${i.aLabel}（${fmtCost(i.aCost)}）与 ${i.bLabel}（${fmtCost(i.bCost)}）的每百万 token 成本相差不到 1%，可视为基本持平。`,
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
    `当 ${i.modelLabel} 的目标交互性为 ${i.target} tok/s/user 时，${i.aLabel} 与 ${i.bLabel} 的每百万 token 成本分别为 ${fmtCost(i.aCost)} 和 ${fmtCost(i.bCost)}。至少一方缺少有效的定价或吞吐量数据，因此无法进行等价比较。`,
  (i) =>
    `在 ${i.modelLabel} 的 ${i.target} tok/s/user 运行点，${i.aLabel} 与 ${i.bLabel} 的每百万 token 成本分别为 ${fmtCost(i.aCost)} 和 ${fmtCost(i.bCost)}。至少一方的输入值为零，因此无法用比率表示差距。`,
];

const PER_DOLLAR_SINGLE_TEMPLATES_ZH: ((args: {
  modelLabel: string;
  presentLabel: string;
  missingLabel: string;
  target: number;
  presentCost: number;
}) => string)[] = [
  (i) =>
    `当 ${i.modelLabel} 的目标交互性为 ${i.target} tok/s/user 时，${i.presentLabel} 的每百万 token 成本为 ${fmtCost(i.presentCost)}；${i.missingLabel} 在该运行点暂无基准测试数据。`,
  (i) =>
    `在 ${i.modelLabel} 的 ${i.target} tok/s/user 运行点，${i.presentLabel} 的每百万 token 成本为 ${fmtCost(i.presentCost)}；${i.missingLabel} 尚未在该运行点进行基准测试。`,
  (i) =>
    `当 ${i.modelLabel} 的目标交互性为 ${i.target} tok/s/user 时，仅 ${i.presentLabel} 有成本数据，每百万 token 成本为 ${fmtCost(i.presentCost)}；${i.missingLabel} 在该运行点尚未测试。`,
];

// ---------------------------------------------------------------------------
// /compare 'full' variant — both GPUs, mentions cost AND throughput
// ---------------------------------------------------------------------------

function fullSummaryZh(i: FullBoth): string {
  const costPart = i.costTied
    ? '每 token 成本基本持平'
    : i.costRatio === null
      ? null
      : `${i.cheaper} 的成本效率高出 ${fmtPctDelta(i.costRatio)}`;
  const tputPart = i.tputTied
    ? '单芯片吞吐量基本持平'
    : i.tputRatio === null
      ? null
      : `${i.faster} 的单芯片吞吐量高出 ${fmtPctDelta(i.tputRatio)}`;
  const both = [costPart, tputPart].filter(Boolean).join('；');
  return both.length > 0 ? both : '缺少可比较的有效数据';
}

const FULL_BOTH_TEMPLATES_ZH: ((i: FullBoth) => string)[] = [
  (i) =>
    `当 ${i.modelLabel} 的目标交互性为 ${i.target} tok/s/user 时，${i.aLabel} 的吞吐量为 ${i.aValue.toFixed(0)} tok/s/chip，每百万 token 成本为 ${fmtCost(i.aCost)}；${i.bLabel} 的吞吐量为 ${i.bValue.toFixed(0)} tok/s/chip，每百万 token 成本为 ${fmtCost(i.bCost)}。${fullSummaryZh(i)}。`,
  (i) =>
    `在 ${i.modelLabel} 的 ${i.target} tok/s/user 运行点，${i.aLabel} 的吞吐量为 ${i.aValue.toFixed(0)} tok/s/chip，每百万 token 成本为 ${fmtCost(i.aCost)}；${i.bLabel} 的吞吐量为 ${i.bValue.toFixed(0)} tok/s/chip，每百万 token 成本为 ${fmtCost(i.bCost)}。${fullSummaryZh(i)}。`,
  (i) =>
    `当 ${i.modelLabel} 的目标交互性为 ${i.target} tok/s/user 时，${i.aLabel} 与 ${i.bLabel} 的吞吐量分别为 ${i.aValue.toFixed(0)} 和 ${i.bValue.toFixed(0)} tok/s/chip，每百万 token 成本分别为 ${fmtCost(i.aCost)} 和 ${fmtCost(i.bCost)}。${fullSummaryZh(i)}。`,
  (i) =>
    `以 ${i.target} tok/s/user 为目标运行 ${i.modelLabel} 时，${i.aLabel} 的吞吐量为 ${i.aValue.toFixed(0)} tok/s/chip，每百万 token 成本为 ${fmtCost(i.aCost)}；${i.bLabel} 的吞吐量为 ${i.bValue.toFixed(0)} tok/s/chip，每百万 token 成本为 ${fmtCost(i.bCost)}。${fullSummaryZh(i)}。`,
  (i) =>
    `${bandPositionZh(i.target, i.range, i.band)}。在这一运行点，${i.aLabel} 运行 ${i.modelLabel} 的吞吐量为 ${i.aValue.toFixed(0)} tok/s/chip，每百万 token 成本为 ${fmtCost(i.aCost)}；${i.bLabel} 的吞吐量为 ${i.bValue.toFixed(0)} tok/s/chip，每百万 token 成本为 ${fmtCost(i.bCost)}。${fullSummaryZh(i)}。`,
  (i) =>
    `将 ${i.modelLabel} 的目标交互性设为 ${i.target} tok/s/user 时，${i.aLabel} 的吞吐量为 ${i.aValue.toFixed(0)} tok/s/chip，每百万 token 成本为 ${fmtCost(i.aCost)}；${i.bLabel} 的吞吐量为 ${i.bValue.toFixed(0)} tok/s/chip，每百万 token 成本为 ${fmtCost(i.bCost)}。${fullSummaryZh(i)}。`,
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
    `当 ${i.modelLabel} 的目标交互性为 ${i.target} tok/s/user 时，${i.presentLabel} 的吞吐量为 ${i.presentValue.toFixed(0)} tok/s/chip，每百万 token 成本为 ${fmtCost(i.presentCost)}；${i.missingLabel} 在该运行点暂无基准测试数据。`,
  (i) =>
    `在 ${i.modelLabel} 的 ${i.target} tok/s/user 运行点，${i.presentLabel} 的吞吐量为 ${i.presentValue.toFixed(0)} tok/s/chip，每百万 token 成本为 ${fmtCost(i.presentCost)}；${i.missingLabel} 在该运行点暂无数据。`,
  (i) =>
    `当 ${i.modelLabel} 的目标交互性为 ${i.target} tok/s/user 时，${i.presentLabel} 的吞吐量为 ${i.presentValue.toFixed(0)} tok/s/chip，每百万 token 成本为 ${fmtCost(i.presentCost)}；${i.missingLabel} 在该运行点尚未测试。`,
];

// ---------------------------------------------------------------------------
// compareTableNarrativeZh
// ---------------------------------------------------------------------------

/** 1:1 port of `AGENTIC_SCENARIO_INTRO` — see the English original for why. */
export const AGENTIC_SCENARIO_INTRO_ZH: AgenticScenarioIntro = {
  paragraph:
    'AgentX 回放真实的 coding agent 会话，而非定长 prompt。随着会话轮次增加，上下文不断增长；每个请求的大部分内容都可直接从 cache 读取，无需重新计算。因此，这项对比不仅取决于芯片本身的吞吐量，还会受到跨节点 KV 传输、prefix-aware routing 和 cache 容量等系统因素影响。定长序列工作负载仍是衡量 kernel 与芯片性能的清晰基线；两种场景从不同角度回答同一硬件的性能问题。',
  linkLabel: '进一步了解 AgentX',
  href: '/zh/agentx',
};

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
  const aLabel = HW_REGISTRY[a]?.label ?? a.toUpperCase();
  const bLabel = HW_REGISTRY[b]?.label ?? b.toUpperCase();
  const gpuLabel = `${aLabel} 与 ${bLabel}`;

  const fallback =
    firstUnderZh(
      [
        `${gpuLabel} 在 ${modelName} 上的推理基准测试：${AUTHOR_NAME} 发布的 ${SITE_NAME} 提供经过验证、可复现的开源结果，涵盖延迟、吞吐量和成本。`,
        `${gpuLabel} 在 ${modelName} 上的推理基准测试：${AUTHOR_NAME} 发布的 ${SITE_NAME} 提供经过验证的开源结果。`,
        `${gpuLabel} 在 ${modelName} 上的推理基准测试，来自 ${SITE_NAME}。`,
        `${gpuLabel} 在 ${modelName} 上的推理基准测试。`,
      ],
      META_DESCRIPTION_MAX,
    ) ?? `${gpuLabel} 推理基准测试`.slice(0, META_DESCRIPTION_MAX);

  const stat = computeCompareStat(a, b, ssrRows);
  if (!stat) return fallback;

  const tputClause =
    stat.tputPct > 0 ? `${stat.faster} 的单芯片吞吐量比 ${stat.slower} 高 ${stat.tputPct}%` : null;
  const costClause =
    stat.costPct > 0 ? `${stat.cheaper} 的成本效率比 ${stat.pricier} 高 ${stat.costPct}%` : null;

  let core: string;
  if (tputClause && costClause) core = `在 ${modelName} 上，${tputClause}；${costClause}。`;
  else if (tputClause) core = `在 ${modelName} 上，${tputClause}。`;
  else if (costClause) core = `在 ${modelName} 上，${costClause}。`;
  else return fallback;

  return (
    firstUnderZh(
      [
        `${core}数据来自 ${AUTHOR_NAME} 发布的 ${SITE_NAME} 开源基准测试，结果经过验证。`,
        `${core}数据来自 ${SITE_NAME} 开源基准测试，结果经过验证。`,
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
  const indexName = variant === 'per-dollar' ? '芯片每美元性能' : '芯片对比';
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

function jsonLdEntryForZh(key: string, summary: PairSummary, position: number) {
  const meta = HW_REGISTRY[key];
  const label = meta?.label ?? key.toUpperCase();
  const props: { name: string; value: string | number }[] = [{ name: '类别', value: '芯片' }];
  if (meta) {
    props.push(
      { name: '厂商', value: meta.vendor },
      { name: '架构', value: meta.arch },
      { name: 'TDP (W)', value: meta.tdp },
    );
  }
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
  const fullLabel = `${model.label} — ${aLabel} 与 ${bLabel}`;

  const itemListName =
    variant === 'per-dollar' ? `${fullLabel} — 每美元性能` : `${fullLabel} 推理基准测试`;
  const itemListDescription =
    variant === 'per-dollar'
      ? `比较 ${aLabel} 与 ${bLabel} 运行 ${model.label} 时的每百万 token 成本；芯片推理性能采用 Hyperscaler 自有设备 TCO 口径归一化，覆盖不同 LLM 工作负载。`
      : `对比 ${aLabel} 与 ${bLabel} 在不同 LLM 工作负载下运行 ${model.label} 时的 AI 推理基准测试结果。`;
  const datasetName =
    variant === 'per-dollar'
      ? `${model.label}：${aLabel} 与 ${bLabel} 每美元性能对比`
      : `${model.label}：${aLabel} 与 ${bLabel} 基准测试结果插值对比`;
  const datasetDescription =
    variant === 'per-dollar'
      ? `在相同交互性水平下，对比 ${aLabel} 与 ${bLabel} 运行 ${model.label} 时的每百万 token 成本；数据由基准测试结果插值得出，并采用 Hyperscaler 自有设备 TCO 口径。`
      : `在相同交互性水平下，对比 ${aLabel} 与 ${bLabel} 运行 ${model.label} 时的吞吐量、成本、能效和并发数；数据由基准测试结果插值得出。`;

  const comparisonRows = ssrRows
    .filter((row) => row.a || row.b)
    .map((row) => {
      const metrics: { name: string; value: string }[] = [
        { name: '模型', value: model.displayName },
        { name: '目标交互性（tok/s/user）', value: String(row.target) },
      ];
      if (row.a) {
        metrics.push(
          { name: `${aLabel} 吞吐量（tok/s/chip）`, value: row.a.value.toFixed(1) },
          { name: `${aLabel} 成本（$/M tok）`, value: row.a.cost.toFixed(3) },
          { name: `${aLabel} 能效（tok/s/MW）`, value: row.a.tpPerMw.toFixed(0) },
          { name: `${aLabel} 并发数`, value: String(Math.round(row.a.concurrency)) },
        );
      }
      if (row.b) {
        metrics.push(
          { name: `${bLabel} 吞吐量（tok/s/chip）`, value: row.b.value.toFixed(1) },
          { name: `${bLabel} 成本（$/M tok）`, value: row.b.cost.toFixed(3) },
          { name: `${bLabel} 能效（tok/s/MW）`, value: row.b.tpPerMw.toFixed(0) },
          { name: `${bLabel} 并发数`, value: String(Math.round(row.b.concurrency)) },
        );
      }
      return {
        '@type': 'Dataset',
        name: `${model.label}：目标交互性 ${row.target} tok/s/user 下的对比`,
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
        itemListElement: [jsonLdEntryForZh(a, summaryA, 1), jsonLdEntryForZh(b, summaryB, 2)],
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
              keywords: [
                ...new Set(
                  [
                    'AI 推理基准测试',
                    '芯片对比',
                    variant === 'per-dollar' ? '每百万 token 成本' : '推理延迟',
                    variant === 'per-dollar' ? '每美元性能' : '每秒 token 数',
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
                  name: `${model.label} 最新基准测试记录（JSON）`,
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
