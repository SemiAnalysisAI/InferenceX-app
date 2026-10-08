import type { Metadata } from 'next';

import { SITE_URL } from '@semianalysisai/inferencex-constants';

import { EXPLORER_BASE_PATH } from '@/lib/agentic-workload-explorer/paths';
import { enAlternates, type Locale, ZH_OG_LOCALE, zhAlternates } from '@/lib/i18n';

interface SectionCopy {
  title: string;
  description: string;
}

/** Explorer sections with their own route, keyed by explorer-relative path. */
export const EXPLORER_SECTION_META = {
  '/sessions': {
    en: {
      title: 'Sessions',
      description:
        'Every anonymized coding-agent session in the snapshot with request counts, token totals, cost, and prefix-cache hit rates.',
    },
    zh: {
      title: '会话',
      description: '快照中每个匿名 coding agent 会话的请求数、token 总量、成本与前缀缓存命中率。',
    },
  },
  '/trends': {
    en: {
      title: 'Trends',
      description: 'Daily request, token, cache and cost trends across the snapshot window.',
    },
    zh: { title: '趋势', description: '快照时间窗口内请求数、token、缓存与成本的每日趋势。' },
  },
  '/latency': {
    en: {
      title: 'Latency',
      description:
        'Time to first token, time per output token, and prefill speed distributions by model and context size.',
    },
    zh: {
      title: '延迟',
      description:
        '按模型和上下文长度划分的首 token 延迟（TTFT）、每输出 token 时间（TPOT）与 prefill 速度分布。',
    },
  },
  '/graphs': {
    en: {
      title: 'Graphs',
      description:
        'Distributions of context length, output length, cache reuse and request spacing within agent sessions.',
    },
    zh: {
      title: '图表',
      description: '智能体会话中上下文长度、输出长度、缓存复用与请求间隔的分布。',
    },
  },
  '/session-reuse': {
    en: {
      title: 'Session Reuse',
      description:
        'How much of each request prefix is reused from earlier requests in the same session.',
    },
    zh: { title: '会话复用', description: '每个请求的前缀中有多少复用自同一会话的先前请求。' },
  },
  '/tool-analytics': {
    en: {
      title: 'Tools',
      description:
        'Tool-call frequency, sequences, error rates and output sizes across agent sessions.',
    },
    zh: { title: '工具', description: '智能体会话中工具调用的频率、调用序列、错误率与输出大小。' },
  },
  '/costs': {
    en: {
      title: 'Costs',
      description: 'List-price cost of the snapshot traffic by model and token type.',
    },
    zh: { title: '成本', description: '按模型与 token 类型统计的快照流量标价成本。' },
  },
  '/fast-mode': {
    en: {
      title: 'Fast Mode',
      description: 'Usage, latency and cost of fast-mode requests compared with standard requests.',
    },
    zh: { title: 'Fast Mode', description: 'Fast Mode 请求与标准请求在用量、延迟和成本上的对比。' },
  },
  '/models': {
    en: { title: 'Models', description: 'Request volume, tokens and latency by model.' },
    zh: { title: '模型', description: '按模型统计的请求量、token 与延迟。' },
  },
  '/traffic': {
    en: { title: 'Traffic', description: 'Request rate and concurrency over time.' },
    zh: { title: '流量', description: '请求速率与并发随时间的变化。' },
  },
  '/session-insights': {
    en: {
      title: 'Session Insights',
      description: 'Session length, duration, subagent use and context growth across sessions.',
    },
    zh: { title: '会话洞察', description: '各会话的长度、时长、subagent 使用情况与上下文增长。' },
  },
  '/errors': {
    en: {
      title: 'Errors',
      description: 'Upstream error rates and error types by model and endpoint.',
    },
    zh: { title: '错误', description: '按模型和端点统计的上游错误率与错误类型。' },
  },
  '/platform': {
    en: {
      title: 'Platform',
      description: 'Agent harness, operating system and client platform breakdowns.',
    },
    zh: { title: '平台', description: '按智能体 harness、操作系统与客户端平台划分的分布。' },
  },
  '/cache': {
    en: {
      title: 'Cache',
      description: 'Prompt-cache read and write volumes, hit rates, and daily cache heatmaps.',
    },
    zh: { title: '缓存', description: 'Prompt cache 的读写量、命中率与每日缓存热力图。' },
  },
  '/streaming': {
    en: {
      title: 'Streaming',
      description: 'Streaming versus non-streaming requests and inter-chunk timing.',
    },
    zh: { title: '流式输出', description: '流式与非流式请求对比，以及流式分块间隔时间。' },
  },
  '/web-search': {
    en: { title: 'Web Search', description: 'Server-side web search usage within agent sessions.' },
    zh: { title: 'Web 搜索', description: '智能体会话中服务端 Web 搜索的使用情况。' },
  },
  '/proxy-health': {
    en: { title: 'Endpoints', description: 'Request volume and error rates by upstream endpoint.' },
    zh: { title: '端点', description: '按上游端点统计的请求量与错误率。' },
  },
} as const satisfies Record<string, Record<Locale, SectionCopy>>;

export type ExplorerSectionPath = keyof typeof EXPLORER_SECTION_META;

/** Session-detail tabs, keyed by the tab segment after `/sessions/[id]/`. */
export const EXPLORER_SESSION_TAB_META = {
  conversation: { en: 'Conversation', zh: '对话' },
  raw: { en: 'Raw Trace', zh: '原始 Trace' },
  statistics: { en: 'Statistics', zh: '统计' },
  'prefill-vs-decode': { en: 'Prefill vs Decode', zh: 'Prefill 与 Decode' },
  flamegraph: { en: 'Flamegraph', zh: '火焰图' },
  'tokens-over-time': { en: 'Tokens Over Time', zh: 'Token 时间分布' },
  timeline: { en: 'Timeline', zh: '时间线' },
  flow: { en: 'Flow', zh: '流程图' },
  'radix-tree': { en: 'Radix Tree', zh: 'Radix Tree' },
} as const satisfies Record<string, Record<Locale, string>>;

export type ExplorerSessionTab = keyof typeof EXPLORER_SESSION_TAB_META;

const SUFFIX = { en: 'Agentic Workload Explorer', zh: 'Agentic Workload Explorer' } as const;

function localizedMetadata(
  enPath: string,
  locale: Locale,
  title: string,
  description: string,
  indexable: boolean,
): Metadata {
  const fullTitle = `${title} | ${SUFFIX[locale]}`;
  const url = `${SITE_URL}${locale === 'zh' ? '/zh' : ''}${enPath}`;
  return {
    title: fullTitle,
    description,
    alternates: locale === 'zh' ? zhAlternates(enPath) : enAlternates(enPath),
    openGraph: {
      title: `${fullTitle} | InferenceX`,
      description,
      url,
      ...(locale === 'zh' && { locale: ZH_OG_LOCALE }),
    },
    twitter: { title: `${fullTitle} | InferenceX`, description },
    ...(!indexable && { robots: { index: false, follow: true } }),
  };
}

/** Metadata for an explorer section page in either locale. */
export function explorerSectionMetadata(section: ExplorerSectionPath, locale: Locale): Metadata {
  const copy = EXPLORER_SECTION_META[section][locale];
  return localizedMetadata(
    `${EXPLORER_BASE_PATH}${section}`,
    locale,
    copy.title,
    copy.description,
    true,
  );
}

/** Metadata for one session-detail tab; session pages are never indexed. */
export function explorerSessionMetadata(
  id: string,
  tab: ExplorerSessionTab,
  locale: Locale,
): Metadata {
  const label = EXPLORER_SESSION_TAB_META[tab][locale];
  const description =
    locale === 'zh'
      ? `匿名 coding agent 会话 ${id} 的${label}视图。`
      : `${label} view of anonymized coding-agent session ${id}.`;
  return localizedMetadata(
    `${EXPLORER_BASE_PATH}/sessions/${encodeURIComponent(id)}/${tab}`,
    locale,
    `${label} · ${id}`,
    description,
    false,
  );
}
