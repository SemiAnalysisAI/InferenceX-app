'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { Card } from '@/components/ui/card';
import { TraceFlamegraph } from '@/components/datasets/trace-flamegraph';
import { useDatasetConversation } from '@/hooks/api/use-datasets';
import { useLocale } from '@/lib/use-locale';
import { compact, formatShare } from './format';
import { Stat } from './stat';

const STRINGS = {
  en: {
    loading: 'Loading conversation…',
    notFound: 'Conversation not found.',
    backToDataset: 'Back to dataset',
    breadcrumbDatasets: 'Datasets',
    breadcrumbConversation: 'conversation',
    mainTurns: 'Main turns',
    subagentGroups: 'Subagent groups',
    input: 'Input',
    output: 'Output',
    cached: 'Cached',
    cachedPct: 'Cached %',
    flamegraph: 'Flamegraph',
    flamegraphDesc:
      'One bar per turn, scaled to the largest turn. Subagent groups are collapsed by default — click a group to expand it. Each bar splits input into cached prefix and uncached suffix, plus generated output. Timestamps are elapsed from conversation start; subagent headers show their full active range. A colored bracket on the left groups requests in the same main-agent or subagent scope whose original execution intervals overlapped (ran in parallel).',
  },
  zh: {
    loading: '正在加载对话…',
    notFound: '未找到对话。',
    backToDataset: '返回数据集',
    breadcrumbDatasets: '数据集',
    breadcrumbConversation: '对话',
    mainTurns: '主轮次',
    subagentGroups: 'Subagent 组',
    input: '输入',
    output: '输出',
    cached: '缓存',
    cachedPct: '缓存 %',
    flamegraph: '火焰图',
    flamegraphDesc:
      '每轮一条柱状图，按最大轮次缩放。Subagent 组默认折叠——点击组标题可展开。每条柱将输入拆分为缓存前缀和未缓存后缀，加上生成的输出。时间戳为从对话开始的经过时间；subagent 标题显示其完整活动范围。左侧彩色括号将同一主 agent 或 subagent 作用域内原始执行区间重叠（并行运行）的请求分组。',
  },
} as const;

export function ConversationView({ slug, convId }: { slug: string; convId: string }) {
  const { data, isLoading, isError } = useDatasetConversation(slug, convId);
  const locale = useLocale();
  const t = STRINGS[locale];
  const prefix = locale === 'zh' ? '/zh' : '';

  const params = useSearchParams();
  const turnRaw = params.get('turn');
  const sourceRaw = params.get('raw');
  const sourceInner = params.get('inner');
  const highlight = {
    turn: turnRaw !== null && /^\d+$/u.test(turnRaw) ? Number(turnRaw) : null,
    raw: sourceRaw !== null && /^\d+$/u.test(sourceRaw) ? Number(sourceRaw) : null,
    inner: sourceInner !== null && /^\d+$/u.test(sourceInner) ? Number(sourceInner) : null,
    agent: params.get('sa'),
  };

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-muted-foreground">{t.loading}</div>;
  }
  if (isError || !data) {
    return (
      <div className="py-12 text-center text-sm text-destructive">
        {t.notFound}{' '}
        <Link href={`${prefix}/datasets/${slug}`} className="text-primary underline">
          {t.backToDataset}
        </Link>
      </div>
    );
  }

  const cachedPct = formatShare(data.total_cached, data.total_in);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Link href={`${prefix}/datasets`} className="hover:text-foreground">
            {t.breadcrumbDatasets}
          </Link>
          <span>/</span>
          <Link href={`${prefix}/datasets/${slug}`} className="hover:text-foreground">
            {slug}
          </Link>
          <span>/</span>
          <span className="text-foreground">{t.breadcrumbConversation}</span>
        </div>
        <h1 className="break-all font-mono text-lg font-semibold text-foreground">
          {data.conv_id}
        </h1>
        {data.models.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {data.models.map((m) => (
              <span
                key={m}
                className="rounded-md border border-border/40 px-2 py-0.5 text-xs text-foreground"
              >
                {m}
              </span>
            ))}
          </div>
        )}
      </div>

      <Card className="p-4">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label={t.mainTurns} value={String(data.num_turns)} />
          <Stat label={t.subagentGroups} value={String(data.num_subagent_groups)} />
          <Stat label={t.input} value={`${compact(data.total_in)} tok`} />
          <Stat label={t.output} value={`${compact(data.total_out)} tok`} />
          <Stat label={t.cached} value={`${compact(data.total_cached)} tok`} />
          <Stat label={t.cachedPct} value={cachedPct} />
        </dl>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-lg font-semibold text-foreground">{t.flamegraph}</h2>
        <p className="mb-4 text-xs text-muted-foreground">{t.flamegraphDesc}</p>
        <TraceFlamegraph
          structure={data.structure}
          highlightTurn={highlight.turn}
          highlightRawIndex={highlight.raw}
          highlightInnerIndex={highlight.inner}
          highlightAgentId={highlight.agent}
        />
      </Card>
    </div>
  );
}
