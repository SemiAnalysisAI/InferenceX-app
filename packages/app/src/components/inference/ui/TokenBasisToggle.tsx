'use client';

import { useInferenceActions, useInferenceDisplay } from '@/components/inference/InferenceContext';
import { Label } from '@/components/ui/label';
import { InfoHelp } from '@/components/ui/option-info';
import { Switch } from '@/components/ui/switch';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';

const STRINGS = {
  en: {
    label: 'Horace He Metric',
    help: "Uncached suffix + output token basis. Counts only each turn's new input plus output, excluding the prompt prefix that earlier turns of the same conversation already sent. The excluded share is the trace's theoretical (infinite-cache) cacheable prefix, not the server's observed cache hits, so it doesn't depend on how well a system caches. This is an approximation, not an exact per-request count: the theoretical hit rate is measured in KV blocks and applied to the run's measured input throughput.",
  },
  zh: {
    label: 'Horace He 指标',
    help: '未缓存 suffix + 输出 token 口径。仅计入每轮新增的输入与输出，不计同一对话此前各轮已发送过的 prompt prefix。扣除的比例取自 trace 的理论（无限 cache）可缓存 prefix，而非服务端实测的 cache 命中，因此与系统的 cache 表现无关。该值为近似值，并非逐请求精确统计：理论命中率按 KV block 计算，再应用于本次运行实测的输入吞吐量。',
  },
} as const;

export function TokenBasisToggle() {
  const { tokenBasis } = useInferenceDisplay();
  const { setTokenBasis } = useInferenceActions();
  const t = STRINGS[useLocale()];

  return (
    <div className="flex items-center gap-1.5">
      <Switch
        id="token-basis-switch"
        data-testid="token-basis-toggle"
        checked={tokenBasis === 'uncached'}
        onCheckedChange={(checked) => {
          const basis = checked ? 'uncached' : 'total';
          setTokenBasis(basis);
          track('inference_token_basis_changed', { basis });
        }}
      />
      <Label htmlFor="token-basis-switch" className="text-xs font-normal text-muted-foreground">
        {t.label}
      </Label>
      <InfoHelp
        label={t.label}
        value="token-basis-switch"
        analyticsEvent="selector_help_opened"
        align="end"
      >
        {t.help}
      </InfoHelp>
    </div>
  );
}
