'use client';

import { useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { track } from '@/lib/analytics';
import { useLocale } from '@/lib/use-locale';
import { formatApiPrice } from './api-reference';
import { VIDEO_MODELS, type VideoModel } from './models';
import { parseApiPrice } from './video-url-state';

const STRINGS = {
  en: {
    missing:
      'No verified API price for this model. Enter your own assumption to calculate API economics.',
    label: 'API price reference ($/video-second)',
    reset: 'Reset',
    resetTitle: 'Reset to the model reference, or clear if unavailable',
    reference: 'Reference',
    range: 'listed range',
    captured: 'captured',
    source: 'Source: ',
    disclaimer:
      'List price, not realized revenue; self-hosted TCO excludes utilization, CPU, storage and network.',
  },
  zh: {
    missing: '此模型暂无已验证 API 参考价。输入自定义假设后可计算 API 经济指标。',
    label: 'API 参考价（$/video-s）',
    reset: '重置',
    resetTitle: '恢复模型参考价；无参考价时清空',
    reference: '参考值',
    range: '标价区间',
    captured: '采集于',
    source: '来源：',
    disclaimer:
      '此处为 API 标价，而非实际收入；自托管 TCO 未计入利用率，也不含 CPU、存储与网络成本。',
  },
};

/**
 * The one editable economics input: USD an API bills per video-second. It
 * sits in the Benchmark config panel next to the frozen model and workload,
 * and its caption keeps the dated reference and source in view so a changed
 * price is always read against what was captured. Valid prices apply as they
 * are typed; an empty or non-positive box leaves the last valid price in
 * place and snaps back on blur.
 */
export default function VideoApiReference({
  value,
  model = 'h3',
  onChange,
}: {
  value: number | null;
  model?: VideoModel;
  onChange: (value: number | null) => void;
}) {
  const locale = useLocale();
  const s = STRINGS[locale];
  const id = useId();
  const referenceInfo = VIDEO_MODELS[model].apiReference;
  const reference = referenceInfo?.pricePerVideoSecondUsd ?? null;
  const [raw, setRaw] = useState(() => (value === null ? '' : String(value)));
  const [synced, setSynced] = useState(value);
  // Adopt a value set elsewhere (URL restore, reset) without clobbering text mid-edit.
  if (value !== synced) {
    setSynced(value);
    if (parseApiPrice(raw) !== value) setRaw(value === null ? '' : String(value));
  }
  const valueAtFocus = useRef(value);
  const commit = (next: number | null, reset = false) => {
    if (next === value) return;
    onChange(next);
    if (reset) track('video_api_price_changed', { value: String(next), reset: true });
  };
  return (
    <>
      <div className="flex min-w-0 flex-col gap-1.5" data-testid="video-api-reference">
        <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
          {s.label}
        </label>
        <div className="flex flex-wrap gap-2">
          <Input
            id={id}
            type="number"
            inputMode="decimal"
            min={0.0001}
            step={0.001}
            value={raw}
            aria-label={s.label}
            data-testid="video-api-price"
            className="min-w-20 flex-1 tabular-nums"
            onFocus={() => {
              valueAtFocus.current = value;
            }}
            onChange={(event) => {
              setRaw(event.target.value);
              const next = parseApiPrice(event.target.value);
              if (next !== null) commit(next);
            }}
            onBlur={() => {
              if (parseApiPrice(raw) === null) setRaw(value === null ? '' : String(value));
              if (value !== valueAtFocus.current) {
                track('video_api_price_changed', { value: value === null ? '' : String(value) });
              }
            }}
            onWheel={(event) => event.currentTarget.blur()}
          />
          <Button
            type="button"
            variant="outline"
            title={s.resetTitle}
            data-testid="video-api-price-reset"
            className="shrink-0"
            onClick={() => {
              setRaw(reference === null ? '' : String(reference));
              commit(reference, true);
            }}
          >
            {s.reset}
          </Button>
        </div>
      </div>
      <div
        className="col-span-full space-y-0.5 text-2xs text-muted-foreground"
        data-testid="video-api-reference-caption"
      >
        <p>
          {referenceInfo ? (
            <>
              {s.reference} {formatApiPrice(referenceInfo.pricePerVideoSecondUsd)}/video-s ·{' '}
              {s.range} {formatApiPrice(referenceInfo.rangeUsd[0])}–
              {formatApiPrice(referenceInfo.rangeUsd[1])} · {s.captured} {referenceInfo.capturedOn}{' '}
              · {s.source}
              {referenceInfo.label[locale]}
            </>
          ) : (
            s.missing
          )}
        </p>
        <p>{s.disclaimer}</p>
      </div>
    </>
  );
}
