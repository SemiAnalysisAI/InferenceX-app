'use client';

import { type ReactNode, useId } from 'react';

import { Badge } from '@/components/ui/badge';
import { useIsCoarsePointer } from '@/hooks/useMediaQuery';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import {
  gpusPerMegawatt,
  modeledFacilityWattsPerGpu,
  modeledItWattsPerGpu,
} from '@/lib/power/power-basis';
import { FACILITY_PUE_NOTE, formatPueRange } from '@/lib/power/facility-pue';
import { getHardwareConfig } from '@/lib/catalog/constants';
import { Switch } from '@/components/ui/switch';
import type { InferenceData } from '@/components/inference/types';
import {
  usePowerXActivePoint,
  usePowerXIncludeFacility,
  useSetPowerXIncludeFacility,
} from '@/components/inference/ui/powerx-surface';

import { PowerBasisPill } from './PowerBasisPill';
import { getDisplayLabel } from '@/lib/shared/utils';

import type { PowerXRole } from './powerx-role';

const STRINGS = {
  en: {
    title: 'PowerX',
    description:
      'Measured GPU power and energy per token for every benchmark point, with a modeled IT and facility breakdown.',
    readout: {
      it: 'IT',
      wPerGpu: 'W/GPU',
      gpusPerMw: 'GPUs/MW',
      facility: 'Facility',
      atPue: (pue: string) => `W/GPU at PUE ${pue}`,
      gpu: 'GPU',
      measured: 'W',
      noModel: 'No IT model for this setup yet',
      wholeDeployment: 'whole deployment',
      prefill: 'Prefill',
      decode: 'Decode',
      poolGpus: (count: number, role: 'prefill' | 'decode') => `${count} ${role} GPUs`,
      pinned: 'Pinned point',
      hovered: 'Hovered point',
      scrubbed: 'Point under your finger · tap it for details',
      nearest: (x: string) => `Near ${x} tok/s/user · hover a point to change`,
      nearestTouch: (x: string) => `Near ${x} tok/s/user · drag across the chart to change`,
      at: (conc: number, x: string) => `c${conc} · ${x} tok/s/user`,
    },
    includeFacility: (pue: string) => `Include facility (PUE ${pue})`,
    includeFacilityHelp:
      'Appends the PUE overhead after the IT stack; on by default. Turn off for IT only.',
  },
  zh: {
    title: 'PowerX 功耗',
    description:
      '每个基准测试点的实测 GPU 功耗与每 Token 能耗，并附模型估算的 IT 与数据中心功耗构成。',
    readout: {
      it: 'IT',
      wPerGpu: 'W/GPU',
      gpusPerMw: 'GPU/MW',
      facility: '数据中心',
      atPue: (pue: string) => `W/GPU（PUE ${pue}）`,
      gpu: 'GPU',
      measured: 'W',
      noModel: '该配置暂无 IT 功耗模型',
      wholeDeployment: '整个部署',
      prefill: '预填充',
      decode: '解码',
      poolGpus: (count: number, role: 'prefill' | 'decode') =>
        `${count} 块${role === 'prefill' ? '预填充' : '解码'} GPU`,
      pinned: '已固定的数据点',
      hovered: '悬停的数据点',
      scrubbed: '手指所在的数据点 · 点按可查看详情',
      nearest: (x: string) => `接近 ${x} tok/s/user · 悬停数据点可切换`,
      nearestTouch: (x: string) => `接近 ${x} tok/s/user · 在图上拖动可切换`,
      at: (conc: number, x: string) => `c${conc} · ${x} tok/s/user`,
    },
    includeFacility: (pue: string) => `计入数据中心开销（PUE ${pue}）`,
    includeFacilityHelp: '在 IT 堆叠之后追加 PUE 开销；默认开启，关闭后仅显示 IT。',
  },
} as const;

export function usePowerXStrings() {
  return STRINGS[useLocale()];
}

const rate = (value: number) =>
  value >= 100 ? Math.round(value).toLocaleString('en-US') : value.toFixed(1);
const watts = (value: number) => Math.round(value).toLocaleString('en-US');
/** Where the readout lands before anyone hovers: a mid-range interactivity. */
const READOUT_INTERACTIVITY = 80;

/** The chart point the readout describes when nothing is hovered or pinned. */
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

function ReadoutBadge({ children, testId }: { children: ReactNode; testId: string }) {
  return (
    <Badge variant="outline" data-testid={testId} className="gap-1 py-0 text-muted-foreground">
      {children}
    </Badge>
  );
}

/** The chart's y metric, so the touch readout can state the value a tooltip would. */
export interface PowerXReadoutMetric {
  label: string;
  value: (point: InferenceData) => string;
}

/**
 * The readout row under the chart caption, in the TCO badge row's style: IT W
 * per GPU, GPUs per MW and the facility figure for the hovered or pinned point
 * (or the point nearest 80 tok/s/user). On a coarse pointer the chart has no
 * hover tooltip: a finger dragged across it scrubs the nearest point into this
 * row, which then leads with the chart's own y value.
 */
export function PowerXReadout({
  points,
  yMetric,
  role = 'all',
}: {
  points: readonly InferenceData[];
  yMetric?: PowerXReadoutMetric;
  /** Under a GPU role the row adds each pool's W per GPU and tags IT / facility as whole-deployment. */
  role?: PowerXRole;
}) {
  const locale = useLocale();
  const t = STRINGS[locale].readout;
  const active = usePowerXActivePoint();
  const touch = useIsCoarsePointer();
  const point = active?.point ?? defaultReadoutPoint(points);
  if (!point) return null;
  const it = point.itModeledWatts?.y ?? modeledItWattsPerGpu(point);
  const facility = point.utilityModeledWatts?.y ?? modeledFacilityWattsPerGpu(point);
  const pue =
    point.modeledSystemPower?.status === 'supported' ? point.modeledSystemPower.pue : null;
  const gpu = point.measuredAvgPower?.y ?? null;
  const perMw = gpusPerMegawatt(it);
  const source =
    active?.source === 'pinned'
      ? t.pinned
      : active?.source === 'scrub'
        ? t.scrubbed
        : active?.source === 'hover'
          ? t.hovered
          : touch
            ? t.nearestTouch(String(READOUT_INTERACTIVITY))
            : t.nearest(String(READOUT_INTERACTIVITY));
  const label = getDisplayLabel(getHardwareConfig(point.hwKey, point.model));
  const pools =
    role === 'all'
      ? []
      : (['prefill', 'decode'] as const).flatMap((pool) => {
          const value =
            pool === 'prefill' ? point.measuredPrefillAvgPower?.y : point.measuredDecodeAvgPower?.y;
          const gpus = pool === 'prefill' ? point.num_prefill_gpu : point.num_decode_gpu;
          return point.disagg && typeof value === 'number' && Number.isFinite(value)
            ? [{ pool, watts: value, gpus: gpus ?? null }]
            : [];
        });
  const whole = pools.length > 0 ? ` · ${t.wholeDeployment}` : '';
  return (
    <p
      className="mb-2 flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground"
      data-testid="powerx-readout"
      data-source={active?.source ?? 'nearest'}
      aria-live="polite"
    >
      <span className="min-w-0 truncate font-medium text-foreground">
        {label}{' '}
        <span className="font-normal text-muted-foreground">{t.at(point.conc, rate(point.x))}</span>
      </span>
      {touch && yMetric && (
        <ReadoutBadge testId="powerx-readout-y">
          {yMetric.label}:{' '}
          <span className="font-medium text-foreground tabular-nums">{yMetric.value(point)}</span>
        </ReadoutBadge>
      )}
      {it === null ? (
        <span data-testid="powerx-readout-no-model">{t.noModel}</span>
      ) : (
        <>
          <ReadoutBadge testId="powerx-readout-it">
            {t.it}: <span className="font-medium text-foreground tabular-nums">{watts(it)}</span>{' '}
            {t.wPerGpu}
            {whole}
            <PowerBasisPill tag="it" className="ml-0" />
          </ReadoutBadge>
          {perMw !== null && (
            <ReadoutBadge testId="powerx-readout-gpus-per-mw">
              <span className="font-medium text-foreground tabular-nums">{watts(perMw)}</span>{' '}
              {t.gpusPerMw}
              <PowerBasisPill tag="it" className="ml-0" />
            </ReadoutBadge>
          )}
          {facility !== null && pue !== null && (
            <ReadoutBadge testId="powerx-readout-facility">
              {t.facility}:{' '}
              <span className="font-medium text-foreground tabular-nums">{watts(facility)}</span>{' '}
              {t.atPue(String(pue))}
              {whole}
              <PowerBasisPill tag="facility" className="ml-0" />
            </ReadoutBadge>
          )}
        </>
      )}
      {gpu !== null && (
        <ReadoutBadge testId="powerx-readout-gpu">
          {t.gpu}: <span className="font-medium text-foreground tabular-nums">{watts(gpu)}</span>{' '}
          {t.measured}
          <PowerBasisPill tag="gpu" className="ml-0" />
        </ReadoutBadge>
      )}
      {pools.map(({ pool, watts: poolWatts, gpus }) => (
        <ReadoutBadge key={pool} testId={`powerx-readout-${pool}`}>
          {t[pool]}:{' '}
          <span className="font-medium text-foreground tabular-nums">{watts(poolWatts)}</span>{' '}
          {t.measured}
          {gpus !== null && ` · ${t.poolGpus(gpus, pool)}`}
          <PowerBasisPill tag="gpu" className="ml-0" />
        </ReadoutBadge>
      ))}
      <span className="no-export text-2xs" data-testid="powerx-readout-source">
        {source}
      </span>
    </p>
  );
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
  /** Toolbar form: one row; the PUE note moves into the hover title. */
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
