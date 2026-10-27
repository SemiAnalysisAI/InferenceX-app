'use client';

import { useMemo } from 'react';

import { track } from '@/lib/analytics/analytics';
import {
  decodeValidity,
  encodeValidity,
  evaluateValidity,
  EXPECTED_GPUS,
  MAX_GAP_INPUT_SECONDS,
  MAX_MISMATCH_INPUT_SECONDS,
  MAX_SAMPLE_GAP_SECONDS,
  type ProducerState,
  type TokenState,
  type ValidityInput,
  type ValidityReason,
  WINDOW_LENGTHS,
  type WindowLength,
} from '@/lib/powerx/validity-rules';

import {
  ChipRow,
  OutputBadge,
  OutputHeader,
  RangeRow,
  useWidgetHash,
  WidgetCard,
  type WidgetProps,
} from './widget-chrome';

const STRINGS = {
  en: {
    gap: 'Largest sample gap',
    gapReadout: (seconds: number) => `${seconds.toFixed(1)} s`,
    gapHint: `limit ${MAX_SAMPLE_GAP_SECONDS.toFixed(1)} s`,
    gpus: 'GPUs reported',
    gpusReadout: (reported: number) => `${reported} of ${EXPECTED_GPUS}`,
    gpusHint: 'every expected GPU must report',
    mismatch: 'Window mismatch',
    mismatchReadout: (seconds: number) => `${seconds.toFixed(2)} s`,
    mismatchHint: (tolerance: number) => `tolerance max(0.5 s, 1 %) = ${tolerance.toFixed(1)} s`,
    window: 'Window length',
    windowOption: (seconds: number) => `${seconds} s`,
    windowSubtitle: (tolerance: number) => `±${tolerance.toFixed(1)} s`,
    producer: 'Producer pin',
    producers: {
      matches: { label: 'Matches', subtitle: 'collector commit = pin' },
      differs: { label: 'Differs', subtitle: 'collector rebuilt' },
    },
    tokens: 'Token count',
    tokenStates: {
      positive: { label: 'Positive', subtitle: 'client counted output tokens' },
      zero: { label: 'Zero', subtitle: 'nothing to divide by' },
    },
    validated: 'Validated',
    historical: 'Historical',
    verdictTitle: 'The verdict the offline validator writes to power_validation_<result>.json',
    reasons: 'reason_codes',
    none: 'none',
    meanings: {
      sample_gap_exceeded: 'a GPU went more than 3 s between samples',
      expected_device_missing: 'an expected GPU has no samples in the window',
      measurement_window_clock_mismatch: 'the window and the client disagree on its length',
      producer_commit_mismatch: 'the collector was not the pinned commit',
      invalid_output_token_count: 'the energy denominator is not positive',
    } satisfies Record<ValidityReason, string>,
    keeps: 'Keeps: throughput and interactivity.',
    loses: 'Loses: energy per token, measured watts, modeled IT and Facility.',
    keepsAll: 'Keeps everything: measured watts, energy per token, modeled IT and Facility.',
  },
  zh: {
    gap: '最大采样间隔',
    gapReadout: (seconds: number) => `${seconds.toFixed(1)} s`,
    gapHint: `上限 ${MAX_SAMPLE_GAP_SECONDS.toFixed(1)} s`,
    gpus: '上报的 GPU 数',
    gpusReadout: (reported: number) => `${reported} / ${EXPECTED_GPUS}`,
    gpusHint: '所有预期 GPU 都必须上报',
    mismatch: '窗口偏差',
    mismatchReadout: (seconds: number) => `${seconds.toFixed(2)} s`,
    mismatchHint: (tolerance: number) => `容差 max(0.5 s, 1 %) = ${tolerance.toFixed(1)} s`,
    window: '窗口长度',
    windowOption: (seconds: number) => `${seconds} s`,
    windowSubtitle: (tolerance: number) => `±${tolerance.toFixed(1)} s`,
    producer: '采集端版本',
    producers: {
      matches: { label: '一致', subtitle: '采集端 commit = 固定版本' },
      differs: { label: '不一致', subtitle: '采集端被重新构建' },
    },
    tokens: 'token 数',
    tokenStates: {
      positive: { label: '大于零', subtitle: '客户端统计到输出 token' },
      zero: { label: '为零', subtitle: '没有可用的分母' },
    },
    validated: 'Validated',
    historical: 'Historical',
    verdictTitle: '离线验证器写入 power_validation_<result>.json 的判定',
    reasons: 'reason_codes',
    none: '无',
    meanings: {
      sample_gap_exceeded: '某颗 GPU 相邻样本间隔超过 3 s',
      expected_device_missing: '某颗预期 GPU 在窗口内没有样本',
      measurement_window_clock_mismatch: '窗口长度与客户端记录不一致',
      producer_commit_mismatch: '采集端不是固定的 commit',
      invalid_output_token_count: '能量分母不是正数',
    } satisfies Record<ValidityReason, string>,
    keeps: '保留：吞吐量和交互性。',
    loses: '失去：每 token 能量、实测瓦特数、建模的 IT 和 Facility。',
    keepsAll: '全部保留：实测瓦特数、每 token 能量、建模的 IT 和 Facility。',
  },
} as const;

const HASH_KEY = 'vd';

export function ValidityWidget({ locale, alt }: WidgetProps) {
  const t = STRINGS[locale];
  const [input, setInput] = useWidgetHash<ValidityInput>(HASH_KEY, encodeValidity, decodeValidity);
  const verdict = useMemo(() => evaluateValidity(input), [input]);

  function update(patch: Partial<ValidityInput>, action: string, value: string | number) {
    setInput({ ...input, ...patch });
    track(`powerx_tutorial_validity_${action}`, { value });
  }

  return (
    <WidgetCard name="validity" alt={alt}>
      <RangeRow
        label={t.gap}
        value={input.gapSeconds}
        min={0}
        max={MAX_GAP_INPUT_SECONDS}
        step={0.1}
        onChange={(gapSeconds) => update({ gapSeconds }, 'gap', gapSeconds)}
        readout={t.gapReadout(input.gapSeconds)}
        hint={t.gapHint}
      />
      <RangeRow
        label={t.gpus}
        value={input.reportedGpus}
        min={0}
        max={EXPECTED_GPUS}
        step={1}
        onChange={(reportedGpus) => update({ reportedGpus }, 'gpus', reportedGpus)}
        readout={t.gpusReadout(input.reportedGpus)}
        hint={t.gpusHint}
      />
      <RangeRow
        label={t.mismatch}
        value={input.mismatchSeconds}
        min={0}
        max={MAX_MISMATCH_INPUT_SECONDS}
        step={0.05}
        onChange={(mismatchSeconds) => update({ mismatchSeconds }, 'mismatch', mismatchSeconds)}
        readout={t.mismatchReadout(input.mismatchSeconds)}
        hint={t.mismatchHint(verdict.toleranceSeconds)}
      />
      <ChipRow<`${WindowLength}`>
        label={t.window}
        value={`${input.windowSeconds}`}
        onChange={(value) =>
          update({ windowSeconds: Number(value) as WindowLength }, 'window', value)
        }
        groups={[
          {
            options: WINDOW_LENGTHS.map((seconds) => ({
              value: `${seconds}` as `${WindowLength}`,
              label: t.windowOption(seconds),
              subtitle: t.windowSubtitle(Math.max(0.5, seconds * 0.01)),
            })),
          },
        ]}
      />
      <ChipRow<ProducerState>
        label={t.producer}
        value={input.producer}
        onChange={(producer) => update({ producer }, 'producer', producer)}
        groups={[
          {
            options: (['matches', 'differs'] as const).map((producer) => ({
              value: producer,
              ...t.producers[producer],
            })),
          },
        ]}
      />
      <ChipRow<TokenState>
        label={t.tokens}
        value={input.tokens}
        onChange={(tokens) => update({ tokens }, 'tokens', tokens)}
        groups={[
          {
            options: (['positive', 'zero'] as const).map((tokens) => ({
              value: tokens,
              ...t.tokenStates[tokens],
            })),
          },
        ]}
      />

      <OutputHeader>
        <OutputBadge tone={verdict.valid ? 'valid' : 'invalid'} title={t.verdictTitle}>
          <span data-testid="powerx-validity-verdict" className="text-sm">
            {verdict.valid ? t.validated : t.historical}
          </span>
        </OutputBadge>
        <span className="font-mono text-xs text-muted-foreground">
          {t.reasons}: {verdict.reasons.length === 0 ? `[${t.none}]` : verdict.reasons.length}
        </span>
      </OutputHeader>
      <div className="space-y-2 px-4 py-3 text-xs leading-5">
        {verdict.reasons.length > 0 && (
          <ul className="space-y-1">
            {verdict.reasons.map((reason) => (
              <li key={reason} className="flex flex-wrap gap-x-2">
                <code className="rounded bg-muted/60 px-1 font-mono text-foreground">{reason}</code>
                <span className="text-muted-foreground">{t.meanings[reason]}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-muted-foreground">
          {verdict.valid ? (
            t.keepsAll
          ) : (
            <>
              <span className="text-foreground">{t.keeps}</span> {t.loses}
            </>
          )}
        </p>
      </div>
    </WidgetCard>
  );
}
