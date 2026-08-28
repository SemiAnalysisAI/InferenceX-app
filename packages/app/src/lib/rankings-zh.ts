/**
 * @file rankings-zh.ts
 * @description Simplified Chinese copy builders for the `/zh/rankings/<slug>`
 * pages. Same structure as the English builders in `rankings.ts`; model
 * names, hardware SKUs, and framework names stay in English per
 * `docs/chinese-copy.md`.
 */

import type { RankingPageEntry } from '@/lib/rankings';

export function rankingPageTitleZh(entry: RankingPageEntry): string {
  return entry.kind === 'fastest-gpu'
    ? `${entry.model.seoName} 推理最快 GPU 实时排行`
    : `运行 ${entry.model.seoName} 最省钱的 GPU：每百万 token 成本排行`;
}

export function rankingPageHeadingZh(entry: RankingPageEntry): string {
  return entry.kind === 'fastest-gpu'
    ? `${entry.model.seoName} 最快 GPU 排行`
    : `${entry.model.seoName} 最低成本 GPU 排行`;
}

/** Static fallback meta description; the route swaps in a stat-led one when
 *  live numbers are available. */
export function rankingPageDescriptionZh(entry: RankingPageEntry): string {
  return entry.kind === 'fastest-gpu'
    ? `哪款 GPU 跑 ${entry.model.seoName} 最快？基于实测单 GPU 每秒 token 数对 NVIDIA 与 AMD 硬件持续排名，数据持续更新。`
    : `哪款 GPU 跑 ${entry.model.seoName} 最省钱？按超大规模云 GPU 价格下实测的每百万 token 成本持续排名，数据持续更新。`;
}

export function rankingPageKeywordsZh(entry: RankingPageEntry): string[] {
  const model = entry.model.seoName;
  if (entry.kind === 'fastest-gpu') {
    return [
      `${model} 最快 GPU`,
      `${model} 最佳 GPU`,
      `${model} GPU 基准测试`,
      `${model} 每秒 token 数`,
      `${model} 推理速度`,
      `${model} GPU 排行`,
      `${model} H100 B200 MI355X 对比`,
      `${model} 推理硬件`,
    ];
  }
  return [
    `${model} 最便宜 GPU`,
    `${model} 每百万 token 成本`,
    `${model} 推理成本`,
    `运行 ${model} 最省钱的方案`,
    `${model} GPU 成本对比`,
    `${model} 部署成本`,
    `${model} token 单价`,
    `${model} 推理定价`,
  ];
}
