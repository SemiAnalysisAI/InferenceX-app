'use client';

import { useLocale } from '@/lib/i18n/use-locale';
import { VIDEO_MODELS } from './models';
import type { videoReleaseCoverage } from './release-coverage';

const STRINGS = {
  en: {
    title: 'Model and engine coverage',
    scope:
      'Loaded published sources with recorded engine and workload identities. Chart eligibility requires at least 10 valid clips per cell; perceptual quality is separate.',
    not_published: 'No identified published source',
    failed: 'Failed source retained',
    history_only: 'History only',
    sample_floor_met: 'Sample floor met',
    source: 'Source run',
    plan: 'Plan',
  },
  zh: {
    title: '模型与引擎覆盖',
    scope:
      '已加载且记录了引擎和工作负载身份的已发布来源。图表要求每个 cell 至少 10 条有效视频；感知质量单独评估。',
    not_published: '尚无身份完整的已发布来源',
    failed: '已保留失败来源',
    history_only: '仅历史记录',
    sample_floor_met: '已达到样本门槛',
    source: '来源运行',
    plan: 'Plan',
  },
};

export default function VideoReleaseCoverage({
  rows,
}: {
  rows: ReturnType<typeof videoReleaseCoverage>;
}) {
  const s = STRINGS[useLocale()];
  return (
    <section
      className="rounded-lg border p-4"
      data-testid="video-engine-coverage"
      aria-label={s.title}
    >
      <h3 className="text-sm font-semibold">{s.title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{s.scope}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {rows.map((row) => {
          const source = row.sources[0];
          return (
            <div
              key={`${row.model}:${row.engine}`}
              className="min-w-0 rounded border p-3"
              data-model={row.model}
              data-engine={row.engine}
            >
              <p className="text-sm font-medium">
                {VIDEO_MODELS[row.model].label} · {row.engine === 'sglang' ? 'SGLang' : 'vLLM-Omni'}
              </p>
              <p className="text-xs text-muted-foreground">{s[row.status]}</p>
              {source && (
                <div className="mt-1 break-all text-xs text-muted-foreground">
                  <p>
                    {row.engine} @ {source.producer.engine.revision}
                  </p>
                  <p>
                    {s.plan}: {source.producer.planSha256}
                  </p>
                  <a
                    href={`https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${source.runId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    {s.source} {source.runId}
                  </a>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
