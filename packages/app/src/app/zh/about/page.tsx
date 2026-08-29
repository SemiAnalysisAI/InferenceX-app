import type { Metadata } from 'next';
import Link from 'next/link';

import { Card } from '@/components/ui/card';
import { FAQ_ITEMS_ZH } from '@/components/about/faq-data-zh';
import { AgentXFaq } from '@/components/about/agentx-faq';
import { buildFaqJsonLd, FaqList } from '@/components/about/faq';
import { PromoVideo } from '@/components/about/promo-video';
import { JsonLd } from '@/components/json-ld';
import { zhAlternates, ZH_OG_LOCALE, ZH_LANG_TAG } from '@/lib/i18n';
import { GITHUB_OWNER, GITHUB_REPO, SITE_URL } from '@semianalysisai/inferencex-constants';

const faqJsonLd = buildFaqJsonLd(FAQ_ITEMS_ZH, ZH_LANG_TAG);

const ABOUT_DESCRIPTION =
  'InferenceX 对比各类加速器与服务栈的智能体推理和固定序列 AI 推理性能。AgentX 是其长上下文多轮编码场景。';

export const metadata: Metadata = {
  title: '关于',
  description: ABOUT_DESCRIPTION,
  alternates: zhAlternates('/about'),
  openGraph: {
    title: '关于 | InferenceX',
    description: ABOUT_DESCRIPTION,
    url: `${SITE_URL}/zh/about`,
    locale: ZH_OG_LOCALE,
  },
  twitter: {
    title: '关于 | InferenceX',
    description: ABOUT_DESCRIPTION,
  },
};

export default function AboutPageZh() {
  return (
    <main className="relative">
      <JsonLd data={faqJsonLd} />
      <div className="container mx-auto px-4 lg:px-8 flex flex-col gap-6 lg:gap-4 pb-8">
        <section>
          <PromoVideo />
        </section>

        <section>
          <Card>
            <h2 className="text-lg font-semibold mb-2">
              持续运行的开源智能体推理基准测试，受到万亿美元级、吉瓦规模 Token 工厂运营方的信赖
            </h2>
            <p className="text-muted-foreground mb-2">
              随着全球迈向 AGI
              的进程呈指数级加速，软件开发和模型发布也日新月异。静态基准测试很快就会过时；参与者提交的镜像往往专为基准测试打造，无法反映真实环境中的性能。
            </p>
            <p className="text-muted-foreground mb-2">
              <strong>InferenceX&trade;</strong>（原名
              InferenceMAX）是我们独立、厂商中立、可复现的基准测试平台。它测试固定序列推理服务和
              AgentX 长上下文多轮智能体编码工作负载，覆盖 ML 社区实际可用的各类 AI 加速器与服务栈。
            </p>
            <p className="text-muted-foreground">
              我们的开放数据与洞察已被 ML 社区广泛采用，包括万亿美元级 Token 工厂和 AI
              实验室的容量规划策略团队，以及多家数十亿美元级
              NeoCloud。了解更多详情请阅读我们的文章：{' '}
              <Link
                href="/zh/blog/inferencemax-open-source-inference-benchmarking"
                className="text-brand hover:underline font-medium"
              >
                InferenceX v1
              </Link>
              、{' '}
              <Link
                href="/zh/blog/inferencex-v2-nvidia-blackwell-vs-amd-vs-hopper"
                className="text-brand hover:underline font-medium"
              >
                InferenceX v2
              </Link>
              。
            </p>
          </Card>
        </section>

        <AgentXFaq locale="zh" />

        <section id="reproducibility" className="scroll-mt-24">
          <Card>
            <h2 className="text-lg font-semibold mb-2">可复现性</h2>
            <p className="text-muted-foreground mb-4">
              仪表板上的每一个数据点均来自公开的 GitHub Actions
              工作流运行。测试配方、日志、产物以及数据库记录端到端关联，任何人都可以审计、重新运行或
              fork 基准测试。
            </p>
            <ol className="space-y-3 text-sm text-muted-foreground mb-4">
              <li className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand font-semibold text-xs">
                  1
                </span>
                <div>
                  <strong className="text-foreground">配方提交至仓库。</strong>{' '}
                  每种硬件、框架、模型和精度的组合都是一个提交到公开仓库的 shell
                  脚本。镜像、命令行和并行度均在源码中固定。
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand font-semibold text-xs">
                  2
                </span>
                <div>
                  <strong className="text-foreground">在真实硬件上运行。</strong> GitHub Actions
                  将工作流调度到实际的目标加速器（NVIDIA、AMD
                  等）上，并在运行过程中公开流式输出完整的任务日志。
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand font-semibold text-xs">
                  3
                </span>
                <div>
                  <strong className="text-foreground">上传产物。</strong> 请求延迟、token 计数、芯片
                  功耗遥测数据和评估样本均附加到运行页面。GitHub Actions 保留这些产物 90
                  天，同时每周发布完整基准测试数据库的快照作为公开的 GitHub
                  Release，以实现更长期的可审计性。
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand font-semibold text-xs">
                  4
                </span>
                <div>
                  <strong className="text-foreground">导入仪表板。</strong>{' '}
                  成功的运行将被加载到数据库中并在此展示。每个图表 tooltip
                  都附带一个直接链接，指向生成该数据点的 GitHub Actions
                  运行。点击任意数据点即可审计其来源。
                </div>
              </li>
            </ol>
            <div className="flex flex-wrap gap-3 text-sm">
              <Link
                href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/actions?query=branch%3Amain+event%3Apush`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 hover:bg-accent transition-colors"
              >
                浏览工作流运行
              </Link>
              <Link
                href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/tree/main/benchmarks`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 hover:bg-accent transition-colors"
              >
                查看基准测试配方
              </Link>
              <Link
                href="https://github.com/SemiAnalysisAI/InferenceX-app/releases?q=db-dump"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 hover:bg-accent transition-colors"
              >
                每周数据库快照
              </Link>
              <Link
                href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 hover:bg-accent transition-colors"
              >
                源代码仓库
              </Link>
            </div>
          </Card>
        </section>

        <FaqList title="常见问题" items={FAQ_ITEMS_ZH} />
      </div>
    </main>
  );
}
