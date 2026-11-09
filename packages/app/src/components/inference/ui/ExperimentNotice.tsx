'use client';
import { useExperiment } from '@/hooks/api/use-experiment';
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';
import {
  experimentDetailHref,
  experimentQualificationNote,
  LATEST_WEKA_EXPERIMENT,
} from '@/lib/benchmarks/experiment-benchmarks';

const STRINGS = {
  en: {
    title: 'B300 Kimi K3 · bespoke comparison',
    note: '10 WEKA AMG observations (including repeats), 5 Mooncake DRAM points, and C150 † separately flagged alongside the archived published B300 reference. C150 completed the hour but recovered one missing cache object: 1 request / 2,944 tokens recomputed, zero HTTP errors. It is excluded from the clean frontier and uses GPU-memory utilization 0.89 rather than 0.90.',
    limits:
      'These are different serving and harness builds, not an isolated storage A/B test. Native Mooncake uses retained vLLM 728d, SDK 0.3.11, a 2 TiB DRAM pool, 80 CPUs and one 400G RoCE rail; published used 5894 and 2,248 GiB. Native AIPerf 0.12 and WEKA AgentX 1.0.12 also differ. The comparison groups the new runs under 2026-10-31; tooltips retain their actual measurement dates. Published snapshot latency is available at p90. “Uncached tokens” subtracts theoretically reusable input, not measured cache hits.',
    details: 'Run evidence and configuration',
    repeat: 'repeat',
    flagged: 'recovered cache miss · outside clean frontier',
    api: 'Campaign data',
  },
  zh: {
    title: 'B300 Kimi K3 · 专项测试对比',
    note: '展示 10 个 WEKA AMG 测量结果（含重复运行）、5 个 Mooncake DRAM 数据点，以及单独标记的 C150 †，并与已归档的 B300 发布数据对比。C150 完成了完整一小时测试，但因一个 cache object 缺失触发恢复：1 个请求、2,944 个 token 被重新计算，HTTP 错误为零。该点不纳入无读取故障的 frontier，GPU-memory utilization 为 0.89，其余点为 0.90。',
    limits:
      '各组使用的 serving 和 harness 构建不同，不能视为仅改变存储的 A/B 测试。原生 Mooncake 使用保留的 vLLM 728d、SDK 0.3.11、2 TiB DRAM、80 个 CPU 和一条 400G RoCE 链路；发布数据使用 5894 和 2,248 GiB。原生客户端为 AIPerf 0.12，WEKA 为 AgentX 1.0.12。新运行统一归入 2026-10-31 对比曲线，提示框保留实际测量日期。发布快照仅提供 p90 延迟。Uncached tokens 扣除的是理论可复用输入，并非实测 cache hit。',
    details: '运行证据与配置',
    repeat: '重复运行',
    flagged: '已恢复的 cache miss · 不纳入无读取故障的 frontier',
    api: '测试数据 API',
  },
};

const LATEST_STRINGS = {
  en: {
    ...STRINGS.en,
    title: 'Latest WEKA vs Internal Mooncake · 3 Hours / 20-Minute Trace-Idle Cap',
    note: '13 latest-WEKA runs and 9 internal B300 Mooncake runs. WEKA uses 1,200 GiB FP8 KDA-state DRAM plus 8 TiB WEKA attention-KV storage; Mooncake uses 2,248 GiB DRAM over EFA. Speculation is off.',
    limits:
      'Lines show the clean frontier; triangles flag C128 (read-byte counter integrity) and C140/C180 (DRAM-cache recoveries). The internal baseline pools four serving variants, retained in run details. This three-hour scenario excludes the published one-hour curve. Different images, clusters/transports and cache contents prevent a backend-only comparison.',
    flagged: 'flagged · outside clean frontier',
  },
  zh: {
    ...STRINGS.zh,
    title: '最新 WEKA 对比内部 Mooncake · 3 小时 / 20 分钟 trace-idle cap',
    note: '包含 13 次最新 WEKA 运行和 9 次内部 B300 Mooncake 运行。WEKA 使用 1,200 GiB FP8 KDA-state DRAM 和 8 TiB WEKA attention-KV 存储；Mooncake 通过 EFA 使用 2,248 GiB DRAM。Speculation 均关闭。',
    limits:
      '连线表示无异常结果的 Pareto 前沿；三角形标记 C128（读取字节计数器完整性异常）及 C140/C180（DRAM-cache 恢复）。内部基线合并四种 serving 配置，详情保留各自配置。此三小时场景不叠加已发布的一小时曲线。镜像、集群/传输方式和缓存内容存在差异，不能将性能差异仅归因于后端。',
    flagged: '存在异常标记 · 不纳入无异常结果的 Pareto 前沿',
  },
};

export function ExperimentNotice({ enabled }: { enabled: boolean }) {
  const { data } = useExperiment(enabled);
  const locale = useLocale();
  if (!data) return null;
  const t = (data.campaign.slug === LATEST_WEKA_EXPERIMENT ? LATEST_STRINGS : STRINGS)[locale];
  return (
    <aside
      className="rounded-lg border border-border bg-card p-4 text-sm space-y-2"
      data-testid="experiment-notice"
    >
      <p className="font-semibold">{t.title}</p>
      <p>{t.note}</p>
      <p className="text-muted-foreground">{t.limits}</p>
      <details
        onToggle={(event) =>
          track('inference_experiment_evidence_toggle', { enabled: event.currentTarget.open })
        }
      >
        <summary className="cursor-pointer font-medium">
          {t.details} ({data.runs.length})
        </summary>
        <ul className="mt-2 grid gap-1 md:grid-cols-2">
          {data.runs.map((run) => (
            <li key={run.run_id}>
              <a
                className="underline"
                href={experimentDetailHref(data.campaign.slug, run.run_id)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track('inference_experiment_run_open', { run_id: run.run_id })}
              >
                {run.series === 'weka' ? 'WEKA AMG' : 'Mooncake DRAM'} · C{run.concurrency}
                {run.replicate ? ` · ${t.repeat} ${run.replicate}` : ''} · {run.run_id}
              </a>
              {!run.frontier_eligible && (
                <span
                  title={experimentQualificationNote(
                    {
                      campaign: data.campaign.slug,
                      runId: run.run_id,
                      replicate: run.replicate,
                      frontierEligible: false,
                      detailHref: '',
                      qualificationCode:
                        typeof run.health.qualification_code === 'string'
                          ? run.health.qualification_code
                          : undefined,
                    },
                    locale,
                  )}
                >
                  {' '}
                  — {t.flagged}
                </span>
              )}
            </li>
          ))}
        </ul>
        <a
          className="mt-2 inline-block underline"
          href={`/api/v1/experiments/${data.campaign.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track('inference_experiment_api_open', { campaign: data.campaign.slug })}
        >
          {t.api}
        </a>
      </details>
    </aside>
  );
}
