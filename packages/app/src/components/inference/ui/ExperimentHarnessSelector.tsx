'use client';

import { useLocale } from '@/lib/i18n/use-locale';
import { useClientSearchParams } from '@/hooks/useClientSearch';
import { LATEST_WEKA_EXPERIMENT, WEKA_EXPERIMENT } from '@/lib/benchmarks/experiment-benchmarks';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const STRINGS = {
  en: {
    label: 'Harness / workload',
    latest: 'AgentX 1.0.12 · 3 hours · 20-minute idle cap',
    published: 'Published B300 baseline · 1 hour · 5-minute idle cap',
    historical: 'Archived bespoke 1-hour campaign (not imported)',
    note: 'Each selection has its own curves. Different harness versions, durations and idle caps are not directly comparable.',
  },
  zh: {
    label: 'Harness / 工作负载',
    latest: 'AgentX 1.0.12 · 3 小时 · 20 分钟 idle cap',
    published: '已发布 B300 基线 · 1 小时 · 5 分钟 idle cap',
    historical: '已归档的 1 小时专项测试（未导入）',
    note: '每个选项分别绘制曲线。Harness 版本、测试时长或 idle cap 不同的结果不可直接比较。',
  },
};

function selectProfile(profile: string) {
  const url = new URL(window.location.href);
  const next = new URLSearchParams();
  // A fresh scope drops stale date, legend and unofficial-run filters from the other workload.
  for (const key of ['i_xmode', 'i_xmetric', 'i_metric', 'i_tokens']) {
    const existing = url.searchParams.get(key);
    if (existing) next.set(key, existing);
  }
  next.set('experiment', profile);
  next.set('g_model', 'Kimi-K3');
  next.set('i_seq', 'agentic-traces');
  next.set('i_tokens', next.get('i_tokens') || 'uncached');
  next.set('i_metric', next.get('i_metric') || 'y_tpPerGpu');
  next.set('i_best', '0');
  next.set('i_optimal', '0');
  next.set(
    'i_active',
    profile === LATEST_WEKA_EXPERIMENT
      ? 'b300_vllm-weka-amg-latest,b300_vllm-mooncake-internal'
      : 'b300_vllm',
  );
  url.search = next.toString();
  window.location.assign(url.toString());
}

export function ExperimentHarnessSelector({ enabled }: { enabled: boolean }) {
  const locale = useLocale();
  const params = useClientSearchParams();
  const selection = params.get('experiment');
  if (!enabled || process.env.NEXT_PUBLIC_WEKA_PREVIEW !== '1') return null;
  const t = STRINGS[locale];
  const value =
    selection === LATEST_WEKA_EXPERIMENT || selection === WEKA_EXPERIMENT ? selection : 'published';

  return (
    <section
      className="rounded-lg border border-border bg-card p-4 space-y-2"
      data-testid="experiment-harness-selector"
    >
      <Label htmlFor="experiment-harness-profile">{t.label}</Label>
      <Select value={value} onValueChange={selectProfile}>
        <SelectTrigger id="experiment-harness-profile" className="w-full sm:w-auto">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={LATEST_WEKA_EXPERIMENT}>{t.latest}</SelectItem>
          <SelectItem value="published">{t.published}</SelectItem>
          {selection === WEKA_EXPERIMENT && (
            <SelectItem value={WEKA_EXPERIMENT} disabled>
              {t.historical}
            </SelectItem>
          )}
        </SelectContent>
      </Select>
      <p className="text-sm text-muted-foreground">{t.note}</p>
    </section>
  );
}
