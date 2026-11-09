'use client';

import type { InterTurnGaps } from '@/lib/benchmarks/inter-turn-gaps';
import { useLocale } from '@/lib/i18n/use-locale';
import { Distribution } from './distribution';
import { ExpandableChart } from './expandable-chart';

export function InterTurnGapCard({
  data,
  phase,
}: {
  data: InterTurnGaps;
  phase: 'profiling' | 'warmup';
}) {
  const locale = useLocale();
  const zh = locale === 'zh';
  return (
    <ExpandableChart
      title={zh ? '轮次间隔分布' : 'Inter-turn gap distribution'}
      testId="inter-turn-gap-chart"
      render={(size) => (
        <>
          <p className="mb-2 text-xs text-muted-foreground">
            {zh
              ? '同一会话内，上一轮响应结束至下一轮请求发送的实测时间。'
              : 'Observed time from response completion to the next request in the same session.'}
          </p>
          <Distribution
            values={data[phase]}
            unit={zh ? '秒' : 'seconds'}
            sampleKind="gaps"
            formatValue={(value) =>
              Number(value.toPrecision(3)).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US', {
                maximumSignificantDigits: 3,
              })
            }
            {...size}
          />
        </>
      )}
    />
  );
}
