'use client';

import { useId } from 'react';

import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { modeledItWattsPerGpu } from '@/lib/power/power-basis';
import { FACILITY_PUE_NOTE, formatPueRange } from '@/lib/power/facility-pue';
import { Switch } from '@/components/ui/switch';
import type { InferenceData } from '@/components/inference/types';
import {
  usePowerXIncludeFacility,
  useSetPowerXIncludeFacility,
} from '@/components/inference/ui/powerx-surface';

const STRINGS = {
  en: {
    title: 'PowerX',
    description:
      'Measured GPU power and energy per token for every benchmark point, with a modeled IT and facility breakdown.',
    includeFacility: (pue: string) => `Include facility (PUE ${pue})`,
    includeFacilityHelp:
      'Appends the PUE overhead after the IT stack; on by default. Turn off for IT only.',
  },
  zh: {
    title: 'PowerX 功耗',
    description:
      '每个基准测试点的实测 GPU 功耗与每 Token 能耗，并附模型估算的 IT 与数据中心功耗构成。',
    includeFacility: (pue: string) => `计入数据中心开销（PUE ${pue}）`,
    includeFacilityHelp: '在 IT 堆叠之后追加 PUE 开销；默认开启，关闭后仅显示 IT。',
  },
} as const;

export function usePowerXStrings() {
  return STRINGS[useLocale()];
}

/** Where the default point lands: a mid-range interactivity. */
const READOUT_INTERACTIVITY = 80;

/** The point a summary reads when nothing is picked: the one nearest mid-range interactivity. */
export function defaultReadoutPoint(points: readonly InferenceData[]): InferenceData | null {
  const candidates = points.filter((point) => !point.powerVariant);
  const modeled = candidates.filter(
    (point) => point.itModeledWatts !== undefined || modeledItWattsPerGpu(point) !== null,
  );
  const pool = modeled.length > 0 ? modeled : candidates;
  let best: InferenceData | null = null;
  let distance = Infinity;
  for (const point of pool) {
    if (!(point.x > 0)) continue;
    const d = Math.abs(Math.log(point.x / READOUT_INTERACTIVITY));
    if (d < distance) {
      distance = d;
      best = point;
    }
  }
  return best;
}

/**
 * The Breakdown view's Include facility switch. `pues` are the PUEs of the visible chips;
 * the label shows their range, since air- and liquid-cooled systems differ.
 */
export function PowerXFacilitySwitch({
  pues,
  compact = false,
}: {
  pues: readonly number[];
  /** Chart Config form: one row; the PUE note moves into the hover title. */
  compact?: boolean;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const includeFacility = usePowerXIncludeFacility();
  const setIncludeFacility = useSetPowerXIncludeFacility();
  const id = useId();
  if (!setIncludeFacility) return null;
  return (
    <div className="flex min-w-0 flex-col gap-1" data-testid="powerx-facility-switch">
      <label
        htmlFor={id}
        className="flex min-h-11 items-center gap-2 text-xs whitespace-nowrap md:min-h-9"
        title={compact ? FACILITY_PUE_NOTE[locale] : undefined}
      >
        <Switch
          id={id}
          checked={includeFacility}
          onCheckedChange={(checked) => {
            setIncludeFacility(checked);
            track('inference_powerx_facility_toggled', { enabled: checked });
          }}
          title={t.includeFacilityHelp}
        />
        <span className="font-medium text-foreground">
          {t.includeFacility(formatPueRange(pues))}
        </span>
      </label>
      {!compact && (
        <span className="text-xs text-muted-foreground" data-testid="powerx-facility-note">
          {FACILITY_PUE_NOTE[locale]}
        </span>
      )}
    </div>
  );
}
