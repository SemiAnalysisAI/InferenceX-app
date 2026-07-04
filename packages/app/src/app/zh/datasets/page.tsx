import type { Metadata } from 'next';

import { Card } from '@/components/ui/card';
import { JsonLd } from '@/components/json-ld';
import { DatasetList } from '@/components/datasets/dataset-list';
import { zhAlternates, ZH_OG_LOCALE, ZH_LANG_TAG } from '@/lib/i18n';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const DESCRIPTION =
  'InferenceX agentic 基准测试所回放的真实 Claude Code 对话 trace——方法论、分布及逐对话火焰图。';

export const metadata: Metadata = {
  title: 'Agentic 数据集',
  description: DESCRIPTION,
  alternates: zhAlternates('/datasets'),
  openGraph: {
    title: 'Agentic 数据集 | InferenceX',
    description: DESCRIPTION,
    url: `${SITE_URL}/zh/datasets`,
    locale: ZH_OG_LOCALE,
  },
  twitter: { title: 'Agentic 数据集 | InferenceX', description: DESCRIPTION },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: 'InferenceX Agentic 数据集',
  description: DESCRIPTION,
  url: `${SITE_URL}/zh/datasets`,
  inLanguage: ZH_LANG_TAG,
};

export default function DatasetsPageZh() {
  return (
    <main className="relative">
      <JsonLd data={jsonLd} />
      <div className="container mx-auto flex flex-col gap-6 px-4 pb-8 lg:px-8">
        <section>
          <Card>
            <h1 className="mb-2 text-xl font-semibold text-foreground">Agentic 基准测试数据集</h1>
            <p className="mb-3 text-sm text-muted-foreground">
              InferenceX 的 agentic 基准测试并非回放合成 prompt——而是回放真实的 Claude Code
              编码会话，以<strong>对话 trace</strong>
              的形式捕获。每条 trace 是一次完整的多轮会话：包括主 agent 的各轮对话及其调用的所有
              subagent，附带每轮的 input/output token 数以及重建 prefix-cache 复用所需的 64-token
              KV-cache block hash。这些 trace 在 HuggingFace 上以{' '}
              <code>semianalysisai/cc-traces-weka-*</code> 公开发布（apache-2.0 协议）。
            </p>

            <h2 className="mb-1.5 mt-4 text-sm font-semibold text-foreground">Trace 的采集方式</h2>
            <p className="mb-3 text-sm text-muted-foreground">
              生产环境中的 Claude Code 会话通过日志代理录制，该代理捕获每个 API 请求的 input 和
              output token 数、使用的模型、时间指标（TTFT、token 间延迟），以及一组{' '}
              <code>hash_ids</code>（每个对应请求 input 的一个 64-token KV block）。Subagent
              调用被归组到其父轮次下。不存储任何 prompt 或 completion 文本——仅保存 token 计数和
              block hash，因此语料库可共享，同时仍然是忠实的工作负载回放。
            </p>

            <h2 className="mb-1.5 mt-4 text-sm font-semibold text-foreground">
              缓存前缀与未缓存后缀
            </h2>
            <p className="mb-3 text-sm text-muted-foreground">
              Agentic 工作负载以 prefix 复用为主：每轮都会重新发送不断增长的对话，因此大部分 input
              已在前几轮的 KV cache 中。我们精确重建了这一过程。在理想化的无限 cache
              下按顺序遍历对话，某一轮的<strong>缓存前缀</strong>是其 <code>hash_ids</code>{' '}
              中已出现过的最长前导序列；其余部分是需要（重新）计算的<strong>未缓存后缀</strong>
              。每个 block 为 64 个 token；拆分时会限制使缓存 + 未缓存等于该轮的有效
              input，即使最后一个 block 不完整。Subagent 在 spawn 时针对父 cache
              的快照运行（其上下文独立，不会合并回父级）。
            </p>

            <h2 className="mb-1.5 mt-4 text-sm font-semibold text-foreground">数据集变体</h2>
            <ul className="mb-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>
                <strong>full</strong> — 所有捕获的请求，不做修改。
              </li>
              <li>
                <strong>256k</strong> — 丢弃 input + output 超过 256,000 token 的请求，确保每轮都在
                256k 上下文窗口内（用于在配置 256k 最大上下文的引擎上进行基准测试）。
              </li>
            </ul>
          </Card>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-foreground">数据集</h2>
          <DatasetList />
        </section>
      </div>
    </main>
  );
}
