/**
 * @file run-pages-zh.ts
 * @description Simplified Chinese copy builders for the `/zh/run/<pair>`
 * pages. Same structure as the English builders in `run-pages.ts`; model
 * names, hardware SKUs, and framework names stay in English per
 * `docs/chinese-copy.md`.
 */

import type { RunPageEntry } from '@/lib/run-pages';

export function runPageTitleZh(entry: RunPageEntry): string {
  const chipLabel = entry.chip.label;
  return `${entry.model.seoName} 在 ${chipLabel} 上的实测推理吞吐与成本`;
}

export function runPageHeadingZh(entry: RunPageEntry): string {
  const chipLabel = entry.chip.label;
  return `在 ${chipLabel} 上运行 ${entry.model.seoName}`;
}

/** Static fallback meta description; the route swaps in a stat-led one when
 *  live numbers are available. */
export function runPageDescriptionZh(entry: RunPageEntry): string {
  const chipTitle = entry.chip.title;
  return `${entry.model.seoName} 在 ${chipTitle} 上的实时基准数据：单 GPU 每秒 token 数、每百万 token 成本，以及产生这些结果的推理配置。`;
}

export function runPageKeywordsZh(entry: RunPageEntry): string[] {
  const model = entry.model.seoName;
  const chipLabel = entry.chip.label;
  return [
    `${model} ${chipLabel} 基准测试`,
    `在 ${chipLabel} 上运行 ${model}`,
    `${model} ${chipLabel} 吞吐量`,
    `${model} ${chipLabel} 每秒 token 数`,
    `${model} ${chipLabel} 每百万 token 成本`,
    `${model} ${chipLabel} 推理性能`,
    `${model} 推理硬件`,
    `${model} 部署 ${chipLabel}`,
  ];
}

export function runPageFaqQuestionsZh(entry: RunPageEntry): {
  throughput: string;
  cost: string;
  serving: string;
  methodology: string;
} {
  const model = entry.model.seoName;
  const chipLabel = entry.chip.label;
  return {
    throughput: `${model} 在 ${chipLabel} 上能跑多快？`,
    cost: `在 ${chipLabel} 上部署 ${model} 的成本是多少？`,
    serving: `哪些推理引擎可以在 ${chipLabel} 上运行 ${model}？`,
    methodology: `这些 ${model} 数据是如何测得的？`,
  };
}
