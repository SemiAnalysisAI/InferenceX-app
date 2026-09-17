'use client';

import { Label } from '@/components/ui/label';
import { SegmentedToggle, type SegmentedToggleOption } from '@/components/ui/segmented-toggle';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { track } from '@/lib/analytics';
import { useLocale } from '@/lib/use-locale';

import {
  SMOOTHING_WINDOWS_S,
  type SmoothingWindowS,
  type TelemetryDisplayMode,
  type TelemetryDisplayState,
} from './telemetry-smoothing';

const STRINGS = {
  en: {
    display: 'Display',
    points: 'Points',
    rolling: 'Rolling average',
    window: 'Window',
    windowOption: (s: number) => `${s} s`,
  },
  zh: {
    display: '显示方式',
    points: '数据点',
    rolling: '滚动平均',
    window: '窗口',
    windowOption: (s: number) => `${s} 秒`,
  },
} as const;

interface Props {
  value: TelemetryDisplayState;
  onChange: (next: TelemetryDisplayState) => void;
  /** Analytics event prefix, e.g. `gpu_metrics` → `gpu_metrics_display_mode_changed`. */
  analyticsPrefix: string;
  /** Prefix for control ids so two charts on one page do not collide. */
  idPrefix: string;
  className?: string;
}

/**
 * Display-mode controls shared by the PowerX explorer and the per-point PowerX
 * tab: raw samples vs. a time-window rolling average.
 */
export function TelemetryDisplayControls({
  value,
  onChange,
  analyticsPrefix,
  idPrefix,
  className,
}: Props) {
  const locale = useLocale();
  const t = STRINGS[locale];

  const modeOptions: SegmentedToggleOption<TelemetryDisplayMode>[] = [
    { value: 'points', label: t.points, testId: `${idPrefix}-mode-points` },
    { value: 'rolling', label: t.rolling, testId: `${idPrefix}-mode-rolling` },
  ];

  return (
    <div className={className} data-testid={`${idPrefix}-controls`}>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="space-y-1">
          <Label id={`${idPrefix}-mode-label`}>{t.display}</Label>
          <SegmentedToggle
            value={value.mode}
            options={modeOptions}
            role="group"
            ariaLabel={t.display}
            onValueChange={(mode) => {
              track(`${analyticsPrefix}_display_mode_changed`, { mode });
              onChange({ ...value, mode });
            }}
          />
        </div>
        {value.mode === 'rolling' && (
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-window`}>{t.window}</Label>
            <Select
              value={String(value.windowS)}
              onValueChange={(raw) => {
                const windowS = Number(raw) as SmoothingWindowS;
                track(`${analyticsPrefix}_smoothing_window_changed`, { windowS });
                onChange({ ...value, windowS });
              }}
            >
              <SelectTrigger id={`${idPrefix}-window`} className="w-24" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SMOOTHING_WINDOWS_S.map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    {t.windowOption(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </div>
  );
}
