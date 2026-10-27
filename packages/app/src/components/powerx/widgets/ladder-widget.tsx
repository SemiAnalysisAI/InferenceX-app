'use client';

import { useMemo } from 'react';

import { useThemeColors } from '@/hooks/useThemeColors';
import { track } from '@/lib/analytics/analytics';
import {
  buildLadder,
  exampleGpuWatts,
  LADDER_EXAMPLE_TDP_FRACTION,
  LADDER_HARDWARE,
  LADDER_TARGET_INTERACTIVITY,
  type LadderHardware,
  ladderLabel,
} from '@/lib/powerx/ladder';
import { pickPoint, viewsInferenceUrl } from '@/lib/powerx/views-api';

import { hardwareStore } from './hardware-store';
import { useInView } from './motion';
import { PowerLadder } from './power-ladder';
import {
  Chips,
  GrammarLegend,
  useHydrated,
  useView,
  WidgetFrame,
  type WidgetProps,
} from './widget-chrome';

const STRINGS = {
  en: {
    hardware: 'Hardware',
    chipTitles: {
      b200: 'HGX chassis of 8; board power from DCGM',
      gb200: 'NVL72 rack of 72; module power from DCGM per compute tray',
      mi355x: 'OAM chassis of 8; package power from the AMD exporter',
    },
    measured: (x: number, concurrency: number, date: string) =>
      `Measured average · ${x.toFixed(0)} tok/s/user · concurrency ${concurrency} · ${date}`,
    measuredTitle: `The validated DeepSeek-V4-Pro AgentX point nearest ${LADDER_TARGET_INTERACTIVITY} tok/s/user, from the views API`,
    example: `Example input · ${Math.round(LADDER_EXAMPLE_TDP_FRACTION * 100)} % of TDP`,
    exampleTitle:
      'No validated power point is published for this chip yet, so the ladder runs on a stated input',
    loading: 'Loading the measured point…',
    context: {
      b200: 'On an HGX chassis the exporter reports GPU board power. Two x86 CPUs, 32 DIMMs, eight NICs, four PCIe switches, ten NVMe drives, fans and PSU loss are modeled around it, and PUE 1.3 covers air cooling.',
      gb200:
        'On NVL72 the GPU module is measured per compute tray. The Grace socket is measured when the window passes the Grace check and modeled otherwise; NVSwitch trays, fans and power shelves are modeled, and PUE 1.1 covers liquid cooling.',
      mi355x:
        'On an AMD OAM chassis the exporter reports package power, a tighter boundary than NVIDIA board power, so the modeled share is a little larger. The chassis around it is modeled like HGX.',
    },
  },
  zh: {
    hardware: '硬件',
    chipTitles: {
      b200: '8 卡 HGX 机箱；DCGM 上报的板卡功耗',
      gb200: '72 卡 NVL72 机柜；DCGM 按计算托盘上报的模组功耗',
      mi355x: '8 卡 OAM 机箱；AMD exporter 上报的封装功耗',
    },
    measured: (x: number, concurrency: number, date: string) =>
      `实测平均值 · ${x.toFixed(0)} tok/s/user · 并发 ${concurrency} · ${date}`,
    measuredTitle: `views API 中最接近 ${LADDER_TARGET_INTERACTIVITY} tok/s/user 的 DeepSeek-V4-Pro AgentX 校验点`,
    example: `示例输入 · TDP 的 ${Math.round(LADDER_EXAMPLE_TDP_FRACTION * 100)} %`,
    exampleTitle: '这颗芯片尚未发布通过校验的功耗数据点，阶梯按给定输入计算',
    loading: '正在加载实测数据点…',
    context: {
      b200: 'HGX 机箱上 exporter 上报的是 GPU 板卡功耗。周围的 2 颗 x86 CPU、32 条 DIMM、8 块 NIC、4 颗 PCIe 交换芯片、10 块 NVMe 盘、风扇和 PSU 损耗都由模型估算，风冷按 PUE 1.3 计。',
      gb200:
        'NVL72 上按计算托盘实测 GPU 模组功耗。窗口通过 Grace 校验时 Grace socket 也是实测值，否则由模型估算；NVSwitch 托盘、风扇和电源架由模型估算，液冷按 PUE 1.1 计。',
      mi355x:
        'AMD OAM 机箱上 exporter 上报的是封装功耗，边界比 NVIDIA 的板卡功耗更窄，因此建模部分占比略高。机箱其余部分按 HGX 方式建模。',
    },
  },
} as const;

export function LadderWidget({ locale, alt }: WidgetProps) {
  const t = STRINGS[locale];
  const [hardware, setHardware] = hardwareStore.use();
  const view = useView(viewsInferenceUrl('y_measuredAvgPower', LADDER_HARDWARE));
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
  // The build plays once the bar is on screen after hydration; chip switches interpolate.
  const [ladderRef, ladderInView] = useInView({ threshold: 0.2 });

  return (
    <WidgetFrame name="ladder" alt={alt}>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <Chips<LadderHardware>
          label={t.hardware}
          size="lg"
          value={hardware}
          onChange={(next) => {
            setHardware(next);
            track('powerx_tutorial_ladder_hardware', { value: next });
          }}
          options={LADDER_HARDWARE.map((key) => ({
            value: key,
            label: ladderLabel(key),
            title: t.chipTitles[key],
          }))}
        />
        <p
          className="font-mono text-xs text-muted-foreground"
          title={point ? t.measuredTitle : t.exampleTitle}
          data-testid="powerx-ladder-source"
        >
          {view.status === 'loading'
            ? t.loading
            : point
              ? t.measured(point.x, point.concurrency, point.date)
              : t.example}
        </p>
      </div>
      <div ref={ladderRef} className="mt-5 min-h-28">
        {view.status !== 'loading' && ladder && (
          <PowerLadder ladder={ladder} color={color} locale={locale} active={ladderInView} />
        )}
      </div>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
        <p
          className="max-w-[64ch] text-sm leading-6 text-muted-foreground"
          data-testid="powerx-ladder-context"
        >
          {t.context[hardware]}
        </p>
        <GrammarLegend locale={locale} color={color} className="shrink-0" />
      </div>
    </WidgetFrame>
  );
}
