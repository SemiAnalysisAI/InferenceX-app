'use client';

import { useMemo } from 'react';

import { useThemeColors } from '@/hooks/useThemeColors';
import {
  buildLadder,
  exampleGpuWatts,
  LADDER_EXAMPLE_TDP_FRACTION,
  LADDER_HARDWARE,
  LADDER_TARGET_INTERACTIVITY,
  ladderLabel,
} from '@/lib/powerx/ladder';
import { pickPoint, viewsInferenceUrl } from '@/lib/powerx/views-api';

import { hardwareStore } from './hardware-store';
import { useCountUp, useInView, useReducedMotion } from './motion';
import { PowerLadder } from './power-ladder';
import {
  formatWatts,
  GrammarSwatch,
  type Provenance,
  useHydrated,
  useView,
  WidgetFrame,
  type WidgetProps,
} from './widget-chrome';

const STRINGS = {
  en: {
    point: (label: string, x: number, concurrency: number, date: string) =>
      `${label} · ${x.toFixed(0)} tok/s/user · concurrency ${concurrency} · ${date}`,
    example: (label: string) =>
      `${label} · example input at ${Math.round(LADDER_EXAMPLE_TDP_FRACTION * 100)} % of TDP`,
    loading: 'Loading the measured point…',
    rows: {
      gpu: ['Measured GPU power', 'W per GPU'],
      it: ['IT power', 'W per GPU, before PUE'],
      gpusPerMw: ['GPUs per MW of IT', 'the capacity number'],
      tdp: ['Share of TDP', 'measured over rated'],
      facility: ['Facility power', 'W per GPU, IT × PUE'],
      allIn: ['All-in provisioned', 'W per GPU, vendor'],
    },
  },
  zh: {
    point: (label: string, x: number, concurrency: number, date: string) =>
      `${label} · ${x.toFixed(0)} tok/s/user · 并发 ${concurrency} · ${date}`,
    example: (label: string) =>
      `${label} · 示例输入，TDP 的 ${Math.round(LADDER_EXAMPLE_TDP_FRACTION * 100)} %`,
    loading: '正在加载实测数据点…',
    rows: {
      gpu: ['实测 GPU 功耗', 'W / GPU'],
      it: ['IT 功率', 'W / GPU，不含 PUE'],
      gpusPerMw: ['每 MW IT 可部署的 GPU 数', '容量规划用的数字'],
      tdp: ['TDP 占比', '实测 ÷ 标称'],
      facility: ['数据中心功率', 'W / GPU，IT × PUE'],
      allIn: ['全系统 provisioned', 'W / GPU，厂商值'],
    },
  },
} as const;

type RowKey = keyof (typeof STRINGS)['en']['rows'];
const ROW_KIND: Record<RowKey, Provenance> = {
  gpu: 'measured',
  it: 'modeled',
  gpusPerMw: 'modeled',
  tdp: 'rated',
  facility: 'modeled',
  allIn: 'rated',
};
const ROW_ORDER = Object.keys(ROW_KIND) as RowKey[];
const READOUT_STAGGER_MS = 70;
const watts = (value: number) => `${formatWatts(value)} W`;

/** One readout that counts up when the grid scrolls into view and eases on a chip switch. */
function Readout({
  value,
  format,
  index,
  active,
}: {
  value: number;
  format: (value: number) => string;
  index: number;
  active: boolean;
}) {
  const reduced = useReducedMotion();
  const shown = useCountUp(value, {
    active,
    reduced,
    delayMs: index * READOUT_STAGGER_MS,
    durationMs: 900,
  });
  return <>{format(shown)}</>;
}

export function WorkedExampleWidget({ locale, alt }: WidgetProps) {
  const t = STRINGS[locale];
  const [hardware] = hardwareStore.use();
  const url = viewsInferenceUrl('y_measuredAvgPower', LADDER_HARDWARE);
  const view = useView(url);
  const { resolveColor } = useThemeColors({
    highContrast: false,
    activeKeys: [...LADDER_HARDWARE],
  });
  const point =
    view.status === 'ok'
      ? pickPoint(view.data.series, hardware, LADDER_TARGET_INTERACTIVITY)
      : null;
  const gpuWatts = point?.y ?? exampleGpuWatts(hardware);
  const ladder = useMemo(() => buildLadder(hardware, gpuWatts), [hardware, gpuWatts]);
  const hydrated = useHydrated();
  const color = hydrated ? resolveColor(hardware) : 'var(--foreground)';
  const label = ladderLabel(hardware);
  const [ladderRef, ladderInView] = useInView({ threshold: 0.35 });
  const [readoutsRef, readoutsInView] = useInView<HTMLDListElement>({ threshold: 0.35 });

  const values: Record<RowKey, { value: number; format: (value: number) => string }> | null =
    view.status === 'loading' || !ladder
      ? null
      : {
          gpu: { value: ladder.gpuWatts, format: watts },
          it: { value: ladder.itWatts, format: watts },
          gpusPerMw: {
            value: ladder.gpusPerMw,
            format: (value) => Math.round(value).toLocaleString('en-US'),
          },
          tdp: { value: ladder.percentOfTdp, format: (value) => `${value.toFixed(0)} %` },
          facility: { value: ladder.facilityWatts, format: watts },
          allIn: { value: ladder.allInWatts, format: watts },
        };

  return (
    <WidgetFrame name="worked-example" alt={alt}>
      <p className="font-mono text-xs text-muted-foreground" data-testid="powerx-example-source">
        {view.status === 'loading'
          ? t.loading
          : point
            ? t.point(point.label, point.x, point.concurrency, point.date)
            : t.example(label)}
      </p>
      <div ref={ladderRef} className="mt-4 min-h-20">
        {view.status !== 'loading' && ladder && (
          <PowerLadder
            ladder={ladder}
            color={color}
            locale={locale}
            compact
            active={ladderInView}
          />
        )}
      </div>
      {values && (
        <dl
          ref={readoutsRef}
          className="mt-4 grid grid-cols-2 gap-x-8 gap-y-4 border-t border-border/60 pt-4 sm:grid-cols-3"
        >
          {ROW_ORDER.map((key, index) => (
            <div key={key} className="min-w-0">
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <GrammarSwatch
                  kind={ROW_KIND[key]}
                  color={ROW_KIND[key] === 'rated' ? 'var(--muted-foreground)' : color}
                />
                {t.rows[key][0]}
              </dt>
              <dd className="mt-1 font-mono text-xl font-semibold text-foreground tabular-nums">
                <Readout
                  value={values[key].value}
                  format={values[key].format}
                  index={index}
                  active={readoutsInView}
                />
              </dd>
              <dd className="text-xs text-muted-foreground">{t.rows[key][1]}</dd>
            </div>
          ))}
        </dl>
      )}
    </WidgetFrame>
  );
}
