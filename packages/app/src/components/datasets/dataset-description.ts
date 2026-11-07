import type { DatasetRecord } from '@/hooks/api/use-datasets';

const CONTEXT_LIMITED_DESCRIPTION = {
  en: 'AgentX conversation traces with requests over 256,000 input + output tokens removed, preserving relative timing and subagent overlap.',
  zh: 'AgentX 会话 trace，已移除 input 与 output 合计超过 256,000 token 的请求，并保留其余请求的相对时间与 subagent 重叠关系。',
} as const;

/** Chinese copy for dataset descriptions stored in English in the database, keyed by slug. */
const DESCRIPTION_ZH: Record<string, string> = {
  'cc-traces-weka-062126':
    '为 InferenceX 智能体基准测试采集的真实 Claude Code 智能体会话 trace。每个会话由一系列 turn（及 subagent 组）构成，记录每个 turn 的 input/output token 数，以及用于计算前缀缓存复用的 64-token KV block hash ID。',
};

export function getDatasetDescription(
  dataset: Pick<DatasetRecord, 'slug' | 'description'>,
  locale: 'en' | 'zh',
): string | null {
  if (locale === 'zh' && DESCRIPTION_ZH[dataset.slug]) return DESCRIPTION_ZH[dataset.slug];
  if (dataset.description?.trim()) return dataset.description;
  if (dataset.slug === 'cc-traces-weka-062126-256k') return CONTEXT_LIMITED_DESCRIPTION[locale];
  return null;
}
