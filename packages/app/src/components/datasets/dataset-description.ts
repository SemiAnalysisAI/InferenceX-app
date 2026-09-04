import type { DatasetRecord } from '@/hooks/api/use-datasets';

const CONTEXT_LIMITED_DESCRIPTION = {
  en: 'AgentX conversation traces with requests over 256,000 input + output tokens removed, preserving relative timing and subagent overlap.',
  zh: 'AgentX 会话 trace，已移除 input 与 output 合计超过 256,000 token 的请求，并保留其余请求的相对时间与 subagent 重叠关系。',
} as const;

/** Keep stored descriptions authoritative; fill only this known metadata gap.
 * Source: https://huggingface.co/datasets/semianalysisai/cc-traces-weka-062126-256k#256k-filter-rule
 */
export function getDatasetDescription(
  dataset: Pick<DatasetRecord, 'slug' | 'description'>,
  locale: 'en' | 'zh',
): string | null {
  if (dataset.description?.trim()) return dataset.description;
  if (dataset.slug === 'cc-traces-weka-062126-256k') return CONTEXT_LIMITED_DESCRIPTION[locale];
  return null;
}
