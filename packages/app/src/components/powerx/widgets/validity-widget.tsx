'use client';

import { track } from '@/lib/analytics/analytics';
import {
  MAX_SAMPLE_GAP_SECONDS,
  VALIDITY_CHECKS,
  type ValidityCheckId,
} from '@/lib/powerx/validity-rules';

import { WidgetFrame, type WidgetProps } from './widget-chrome';

const STRINGS = {
  en: {
    checks: {
      devices: {
        title: 'Every expected GPU reported for the whole window',
        detail:
          'The validator lists the devices the topology expects and the devices that appear in samples.csv; one missing GPU fails the point.',
        audit: 'observed_gpu_ids · expected GPU count',
      },
      gap: {
        title: `No gap between samples longer than ${MAX_SAMPLE_GAP_SECONDS} s`,
        detail:
          'A stalled exporter leaves holes the trapezoid integral would paper over, so the largest per-GPU gap is checked against the limit.',
        audit: 'max_sample_gap_s · sample_count',
      },
      clock: {
        title: 'Telemetry window matches the client window within 0.5 s or 1 %',
        detail:
          'The head node writes the window from its own clock; the benchmark client reports its own start and end. The two must agree within max(0.5 s, 1 % of the window).',
        audit: 'window_start_unix · window_end_unix',
      },
      producer: {
        title: 'Producer commit matches the pinned version, exporter image recorded',
        detail:
          'The code that wrote the samples is identified by its git commit and must equal the pin the validator was built with; the exporter image digest is stored beside it.',
        audit: 'producer_sha · exporter_image_sha256',
      },
      tokens: {
        title: 'Token counts the energy is divided by are positive',
        detail:
          'Joules per token needs a denominator. A window with zero output tokens keeps its watts but cannot carry an energy metric.',
        audit: 'joules_per_output_token denominator',
      },
    },
    reason: 'Reason code',
    audit: 'Audit fields',
    source: 'Validator',
    verdict:
      'All five pass: Validated. Any failure: Historical, throughput kept, energy and modeled power dropped.',
  },
  zh: {
    checks: {
      devices: {
        title: '所有预期 GPU 在整个窗口内都有上报',
        detail:
          '验证器比对拓扑预期的设备与 samples.csv 中出现的设备，缺少任意一颗 GPU，该点即失效。',
        audit: 'observed_gpu_ids · 预期 GPU 数',
      },
      gap: {
        title: `样本间隔不超过 ${MAX_SAMPLE_GAP_SECONDS} s`,
        detail:
          'exporter 卡住会留下空洞，梯形积分会把它抹平，所以要用每颗 GPU 的最大间隔与上限比较。',
        audit: 'max_sample_gap_s · sample_count',
      },
      clock: {
        title: '遥测窗口与客户端窗口相差不超过 0.5 s 或 1 %',
        detail:
          '头节点按自己的时钟写窗口，基准测试客户端上报自己的起止时间，两者必须在 max(0.5 s, 窗口的 1 %) 内一致。',
        audit: 'window_start_unix · window_end_unix',
      },
      producer: {
        title: '采集端 commit 与固定版本一致，并记录 exporter 镜像',
        detail:
          '写入样本的代码由其 git commit 标识，必须等于验证器构建时固定的版本；exporter 镜像摘要一并记录。',
        audit: 'producer_sha · exporter_image_sha256',
      },
      tokens: {
        title: '用作能量分母的 token 数为正',
        detail: '每 token 焦耳数需要分母。输出 token 为零的窗口保留瓦特数，但不能给出能量指标。',
        audit: 'joules_per_output_token 的分母',
      },
    },
    reason: '原因代码',
    audit: '审计字段',
    source: '验证器',
    verdict: '五项全部通过：Validated。任一失败：Historical，保留吞吐量，去掉能量和建模功耗。',
  },
} as const;

export function ValidityWidget({ locale, alt }: WidgetProps) {
  const t = STRINGS[locale];
  return (
    <WidgetFrame name="validity" alt={alt}>
      <ol className="motion-details divide-y divide-border/60 border-y border-border/60">
        {VALIDITY_CHECKS.map((check, index) => {
          const copy = t.checks[check.id as ValidityCheckId];
          return (
            <li key={check.id}>
              <details
                className="group"
                onToggle={(event) => {
                  if (event.currentTarget.open) {
                    track('powerx_tutorial_validity_check_opened', { value: check.id });
                  }
                }}
              >
                <summary className="flex min-h-11 cursor-pointer list-none items-baseline gap-4 py-3 text-base text-foreground marker:hidden [&::-webkit-details-marker]:hidden">
                  <span className="w-6 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="min-w-0 flex-1 leading-6">{copy.title}</span>
                  <span
                    aria-hidden="true"
                    className="shrink-0 text-muted-foreground transition-transform duration-(--motion-dur-base) ease-[var(--motion-ease-standard)] group-open:rotate-45 motion-reduce:transition-none"
                  >
                    +
                  </span>
                </summary>
                <div className="pb-4 pl-10 text-sm leading-6 text-muted-foreground">
                  <p>{copy.detail}</p>
                  <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
                    <dt>{t.reason}</dt>
                    <dd>
                      <code className="font-mono text-foreground">{check.reason}</code>
                    </dd>
                    <dt>{t.audit}</dt>
                    <dd className="font-mono">{copy.audit}</dd>
                    <dt>{t.source}</dt>
                    <dd className="font-mono">{check.source}</dd>
                  </dl>
                </div>
              </details>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{t.verdict}</p>
    </WidgetFrame>
  );
}
