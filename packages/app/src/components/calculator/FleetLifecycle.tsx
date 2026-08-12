'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { HardwareConfig } from '@/components/inference/types';
import { Card } from '@/components/ui/card';
import { type DataTableColumn, DataTable } from '@/components/ui/data-table';
import { ExternalLinkIcon } from '@/components/ui/external-link-icon';
import { Input } from '@/components/ui/input';
import { LabelWithTooltip } from '@/components/ui/label-with-tooltip';
import { TooltipProvider } from '@/components/ui/tooltip';
import { track } from '@/lib/analytics';
import { getGpuSpecs, getHardwareConfig } from '@/lib/constants';
import type { Model, Percentile, Sequence } from '@/lib/data-mappings';
import { readUrlParams, writeUrlParams } from '@/lib/url-state';
import { useLocale } from '@/lib/use-locale';
import { getDisplayLabel } from '@/lib/utils';

import { computeFleetStats, formatCompact } from './fleet';
import FleetLifecycleChart, { type LifecycleChartSeries } from './FleetLifecycleChart';
import type { HistoricalBestEntry } from './historical-best';
import {
  breakEvenPricePerMTok,
  computeLifecycle,
  DECOMMISSION_MONTHS,
  type LifecycleAssumptions,
  type LifecycleSeries,
} from './lifecycle';
import { getCostProviderLabel, getThroughputForType } from './ThroughputBarChart';
import type { CalculatorMode, CostProvider, CostType } from './types';
import { useHistoricalBest } from './useHistoricalBest';

interface FleetLifecycleProps {
  hardwareConfig: HardwareConfig;
  costProvider: CostProvider;
  costType: CostType;
  /** Current target interactivity (tok/s/user) from the calculator's slider. */
  targetValue: number;
  mode: CalculatorMode;
  /** Legend visibility by base hwKey — shared with the chart above. */
  visibleHwKeys: Set<string>;
  selectedModel: Model;
  selectedSequence: Sequence;
  selectedPrecisions: string[];
  selectedPercentile?: Percentile;
  /** Facility power budget in MW, shared with the fleet planner. */
  mw: number | null;
  /** Resolves a series colour from the calculator's theme palette. */
  colorResolver: (hwKey: string) => string;
}

const STRINGS = {
  en: {
    title: 'Fleet Lifecycle',
    description:
      "Project margin per day across a fleet's life, using each chip's best config ever measured at the target interactivity — not just its latest run.",
    needMw:
      'Enter a facility power budget in the Fleet Projection section above to project lifecycle economics.',
    unsupportedSequence:
      'Not available for Agentic Traces: run history is keyed by input/output sequence length, which agentic traces do not have. Pick a fixed sequence to use this section.',
    loading: 'Loading run history…',
    errorPrefix: 'Could not load run history: ',
    noneMeasured:
      'No chip was measured at this interactivity on any run date. Move the target interactivity slider into a measured range — the ranges each chip has been measured over are listed below.',
    priceLabel: 'Token Price ($/M tok)',
    priceTooltip:
      "Sale price of tokens. Defaults to the price that exactly zeroes the cheapest visible fleet's margin — the competitive floor, at which that chip earns nothing and every pricier chip is underwater. Derived from that fleet's TCO cost and its interpolated throughput, so between measured points it reads lower than the $/M tok the cost chart shows for the same config: that figure splines cost directly, and cost curves with 1/throughput, so interpolating it overstates cost away from a measured point. The two agree exactly at every measured point. Everything above this line is your assumption, not a measurement.",
    priceReset: 'Reset to break-even',
    ttfiLabel: 'Time to First Inference (months)',
    ttfiTooltip:
      'Months from committing capital to serving the first billable token. Cost accrues through this whole period; revenue does not.',
    rampLabel: 'Ramp (months)',
    rampTooltip:
      'Months from the first token to full serving rate, as capacity and utilisation come up.',
    mtbiLabel: 'MTBI (days)',
    mtbiTooltip:
      'Mean time between interruptions. Combined with recovery time this becomes an availability haircut on the plateau revenue rate. Leave blank to model no interruptions.',
    recoveryLabel: 'Recovery (hours)',
    recoveryTooltip: 'Hours to restore service after one interruption.',
    lifeLabel: 'Useful Life (months)',
    lifeTooltip:
      'Months of service at full rate after the ramp completes, before decommissioning begins.',
    colChip: 'Chip',
    colDate: 'Best Run',
    colTpPerMw: (tokenType: string) => `${tokenType}tok/s/MW`,
    colRevenue: 'Revenue $/day',
    colCost: 'Cost $/day',
    colMargin: 'Margin $/day',
    colPayback: 'Payback',
    colLifetime: 'Lifetime Margin',
    colAvailability: 'Availability',
    never: 'Never',
    monthsSuffix: 'mo',
    supersededTitle: 'Superseded the latest run',
    unmeasuredTitle: 'Not measured at this interactivity',
    unmeasuredIntro:
      'These chips have run history for this scenario but were never measured at the target interactivity, so no honest number exists for them. Their measured ranges:',
    unmeasuredRange: (min: number, max: number, dates: number) =>
      `measured ${min.toFixed(1)}–${max.toFixed(1)} tok/s/user across ${dates} run ${dates === 1 ? 'date' : 'dates'}`,
    note: 'Note:',
    disagg:
      ' Disaggregated inference configurations report throughput per decode chip or per prefill chip rather than per total chip, so their fleet sizes, costs and margins are not an apples-to-apples comparison with aggregated configs. They are drawn with dashed lines.',
    hybrid:
      " Throughput comes from the best run date shown per row; power and $/chip/hr are today's values from the TCO model. Interpolated reads outside a run's measured interactivity range are excluded rather than clamped, so a chip only appears if it was genuinely measured at the target.",
    overlayExempt:
      ' Unofficial runs loaded via a run link are not shown here — the run-history API serves ingested official results only.',
    chartY: 'Margin ($/day)',
    chartMonth: 'Months from capital commitment',
    chartBreakEven: 'break-even',
    tipMeasured: 'Measured',
    tipMargin: 'Margin/day',
    tipRevenue: 'Revenue/day',
    tipCost: 'Cost/day',
    tipCumulative: 'Cumulative',
    assumptions: (tier: string, chips: string) =>
      `Fleet sized by facility power at ${chips}. Cost = chips × ${tier} $/chip/hr and accrues from the moment capacity is energised, tapering over ${DECOMMISSION_MONTHS} months of decommissioning; revenue is priced on the selected token type and reduced by the availability haircut. Lifecycle timings above are your assumptions — no benchmark measures them.`,
    source: 'Source: ',
  },
  zh: {
    title: '集群生命周期',
    description:
      '按每款 Chip 在目标交互性下历史最佳配置（而非仅最新一次运行）测算其整个生命周期内的每日利润。',
    needMw: '请在上方「集群规模测算」中输入设施功率预算，以测算生命周期经济性。',
    unsupportedSequence:
      '不支持 Agentic Traces：运行历史以输入/输出序列长度为键，而 agentic traces 没有该字段。请选择固定序列以使用本模块。',
    loading: '正在加载运行历史……',
    errorPrefix: '无法加载运行历史：',
    noneMeasured:
      '在任何运行日期下都没有 Chip 在该交互性下被实测过。请将目标交互性滑块移入已实测区间——各 Chip 的实测区间见下方列表。',
    priceLabel: 'Token 价格 ($/M tok)',
    priceTooltip:
      'Token 售价。默认取使当前可见集群中成本最低者利润恰好为零的价格——即竞争底线：该价格下这款 Chip 不赚不亏，而所有更贵的 Chip 均为亏损。该值由该集群的 TCO 成本与其插值吞吐量推导，因此在实测点之间会低于成本图中同一配置的 $/M tok：后者直接对成本做样条插值，而成本与吞吐量成反比（1/throughput）为凸函数，因此在远离实测点处会高估成本。两者在每个实测点上完全一致。高于该线的部分属于你的假设，而非实测值。',
    priceReset: '重置为保本价',
    ttfiLabel: '首次推理时间 (月)',
    ttfiTooltip: '从投入资本到产出第一个可计费 token 的月数。该阶段持续产生成本，但没有收入。',
    rampLabel: '爬坡期 (月)',
    rampTooltip: '从第一个 token 到满负荷服务的月数，期间容量与利用率逐步提升。',
    mtbiLabel: '平均无故障间隔 (天)',
    mtbiTooltip:
      '平均中断间隔时间。与恢复时间共同构成对稳定期收入速率的可用性折损。留空表示不建模中断。',
    recoveryLabel: '恢复时间 (小时)',
    recoveryTooltip: '一次中断后恢复服务所需的小时数。',
    lifeLabel: '可用寿命 (月)',
    lifeTooltip: '爬坡完成后、退役开始前，按满负荷服务的月数。',
    colChip: 'Chip',
    colDate: '最佳运行',
    colTpPerMw: (tokenType: string) => `${tokenType} tok/s/MW`,
    colRevenue: '收入 $/天',
    colCost: '成本 $/天',
    colMargin: '利润 $/天',
    colPayback: '回本时间',
    colLifetime: '生命周期利润',
    colAvailability: '可用性',
    never: '无法回本',
    monthsSuffix: '个月',
    supersededTitle: '优于最新一次运行',
    unmeasuredTitle: '该交互性下无实测数据',
    unmeasuredIntro:
      '以下 Chip 在该场景下有运行历史，但从未在目标交互性下被实测，因此无法给出可靠数值。其实测区间：',
    unmeasuredRange: (min: number, max: number, dates: number) =>
      `实测区间 ${min.toFixed(1)}–${max.toFixed(1)} tok/s/user，共 ${dates} 个运行日期`,
    note: '注意：',
    disagg:
      '解耦推理配置按解码 Chip 或预填充 Chip 报告吞吐量，而非按 Chip 总数，因此其集群规模、成本与利润和聚合配置并非同类比较。此类配置以虚线绘制。',
    hybrid:
      '吞吐量来自每行所示的最佳运行日期；功率与 $/chip/hr 为 TCO 模型的当前值。超出某次运行实测交互性区间的插值结果会被排除而非钳制，因此只有在目标交互性下确有实测的 Chip 才会出现。',
    overlayExempt:
      '通过运行链接加载的非官方运行不会显示在此——运行历史 API 仅提供已入库的官方结果。',
    chartY: '利润 ($/天)',
    chartMonth: '自投入资本起的月数',
    chartBreakEven: '保本线',
    tipMeasured: '实测于',
    tipMargin: '每日利润',
    tipRevenue: '每日收入',
    tipCost: '每日成本',
    tipCumulative: '累计',
    assumptions: (tier: string, chips: string) =>
      `集群规模按 ${chips} 的设施功率测算。成本 = Chip 数 × ${tier} $/chip/hr，自容量通电起开始计入，并在 ${DECOMMISSION_MONTHS} 个月的退役期内递减；收入按所选 token 类型计价，并扣除可用性折损。上方生命周期时间参数为你的假设——没有任何基准测试可以测量它们。`,
    source: '来源：',
  },
} as const;

/** Defaults chosen to be recognisable planning figures, not precise claims. */
const DEFAULTS = {
  ttfiMonths: 6,
  rampMonths: 6,
  mtbiDays: 24,
  recoveryHours: 12,
  lifeMonths: 60,
};

function parseNonNegative(raw: string): number | null {
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function getLabel(hwKey: string, hardwareConfig: HardwareConfig): string {
  const config = hardwareConfig[hwKey] || getHardwareConfig(hwKey);
  return config ? getDisplayLabel(config) : hwKey;
}

/**
 * Signed money. Carries a trillions step: a lifetime margin at a
 * hyperscaler-sized power budget genuinely reaches it, and `$1532.50B` is
 * harder to read than `$1.53T`.
 */
function formatMoney(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(0)}`;
}

interface LifecycleRow {
  entry: HistoricalBestEntry;
  label: string;
  tpPerMw: number;
  disagg: boolean;
  series: LifecycleSeries;
}

export default function FleetLifecycle({
  hardwareConfig,
  costProvider,
  costType,
  targetValue,
  mode,
  visibleHwKeys,
  selectedModel,
  selectedSequence,
  selectedPrecisions,
  selectedPercentile,
  mw,
  colorResolver,
}: FleetLifecycleProps) {
  const locale = useLocale();
  const t = STRINGS[locale];

  const historical = useHistoricalBest({
    model: selectedModel,
    sequence: selectedSequence,
    precisions: selectedPrecisions,
    targetValue,
    mode,
    costProvider,
    costType,
    percentile: selectedPercentile,
    // The history payload is several MB — do not fetch it until the section can
    // actually produce something.
    enabled: Boolean(mw),
  });

  const [ttfiInput, setTtfiInput] = useState(
    () => readUrlParams().c_ttfi ?? String(DEFAULTS.ttfiMonths),
  );
  const [rampInput, setRampInput] = useState(
    () => readUrlParams().c_ramp ?? String(DEFAULTS.rampMonths),
  );
  const [mtbiInput, setMtbiInput] = useState(
    () => readUrlParams().c_mtbi ?? String(DEFAULTS.mtbiDays),
  );
  const [recoveryInput, setRecoveryInput] = useState(
    () => readUrlParams().c_rec ?? String(DEFAULTS.recoveryHours),
  );
  const [lifeInput, setLifeInput] = useState(
    () => readUrlParams().c_life ?? String(DEFAULTS.lifeMonths),
  );
  const [priceInput, setPriceInput] = useState(() => readUrlParams().c_price ?? '');
  // A price arriving from the URL is the user's, so it must not be overwritten
  // by the break-even default.
  const priceEdited = useRef(Boolean(readUrlParams().c_price));

  // Visible winners, in the legend's terms. Filtering here rather than in the
  // data hook means a legend toggle never rebuilds a frontier.
  const visibleBest = useMemo(
    () => historical.best.filter((entry) => visibleHwKeys.has(entry.hwKey)),
    [historical.best, visibleHwKeys],
  );

  const visibleUnmeasured = useMemo(
    () => historical.unmeasured.filter((entry) => visibleHwKeys.has(entry.hwKey)),
    [historical.unmeasured, visibleHwKeys],
  );

  /** Per-chip fleet sizing at the winning operating point. */
  const fleets = useMemo(() => {
    if (!mw) return [];
    return visibleBest.flatMap((entry) => {
      const specs = getGpuSpecs(entry.hwKey);
      const stats = computeFleetStats({
        mw,
        powerKwPerGpu: specs.power,
        costPerGpuHour: specs[costProvider],
        tputPerGpu: getThroughputForType(entry.result, costType),
        outputTputPerGpu: entry.result.outputTputValue,
        interactivity: targetValue,
      });
      return stats ? [{ entry, stats }] : [];
    });
  }, [mw, visibleBest, costProvider, costType, targetValue]);

  /**
   * Break-even of the cheapest visible fleet — the competitive floor, and the
   * only anchor a single global price input can honestly default to.
   */
  const breakEven = useMemo(() => {
    let cheapest: number | null = null;
    for (const { stats } of fleets) {
      const price = breakEvenPricePerMTok(stats.costPerHour, stats.fleetTokPerSec);
      if (price === null) continue;
      if (cheapest === null || price < cheapest) cheapest = price;
    }
    return cheapest;
  }, [fleets]);

  // Seed and re-seed the price from break-even until the user takes it over.
  useEffect(() => {
    if (priceEdited.current || breakEven === null) return;
    setPriceInput(breakEven.toFixed(4));
  }, [breakEven]);

  const assumptions = useMemo<LifecycleAssumptions>(
    () => ({
      ttfiMonths: parseNonNegative(ttfiInput) ?? 0,
      rampMonths: parseNonNegative(rampInput) ?? 0,
      mtbiDays: parseNonNegative(mtbiInput) ?? 0,
      recoveryHours: parseNonNegative(recoveryInput) ?? 0,
      lifeMonths: parseNonNegative(lifeInput) ?? 0,
      pricePerMTok: parseNonNegative(priceInput) ?? 0,
    }),
    [ttfiInput, rampInput, mtbiInput, recoveryInput, lifeInput, priceInput],
  );

  const rows = useMemo<LifecycleRow[]>(
    () =>
      fleets.flatMap(({ entry, stats }) => {
        const series = computeLifecycle({
          fleetTokPerSec: stats.fleetTokPerSec,
          costPerHour: stats.costPerHour,
          assumptions,
        });
        if (!series) return [];
        return [
          {
            entry,
            label: getLabel(entry.hwKey, hardwareConfig),
            tpPerMw: entry.rankValue,
            disagg: entry.result.nearestPoints.some((p) => p.disagg),
            series,
          },
        ];
      }),
    [fleets, assumptions, hardwareConfig],
  );

  const hasDisagg = useMemo(() => rows.some((r) => r.disagg), [rows]);

  const chartData = useMemo<LifecycleChartSeries[]>(
    () =>
      rows.map((r) => ({
        key: r.entry.hwKey,
        label: r.label,
        color: colorResolver(r.entry.hwKey),
        date: r.entry.date,
        disagg: r.disagg,
        series: r.series,
      })),
    [rows, colorResolver],
  );

  const tokenTypeLabel = costType === 'input' ? 'input ' : costType === 'output' ? 'output ' : '';

  const handleAssumption = useCallback(
    (
      setter: (v: string) => void,
      param: 'c_ttfi' | 'c_ramp' | 'c_mtbi' | 'c_rec' | 'c_life',
      event: string,
    ) =>
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value;
        setter(raw);
        writeUrlParams({ [param]: parseNonNegative(raw) === null ? '' : raw });
        track(event, { value: raw });
      },
    [],
  );

  const handlePriceChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    priceEdited.current = true;
    setPriceInput(raw);
    writeUrlParams({ c_price: parseNonNegative(raw) === null ? '' : raw });
    track('calculator_lifecycle_price_set', { value: raw });
  }, []);

  const handlePriceReset = useCallback(() => {
    priceEdited.current = false;
    if (breakEven !== null) setPriceInput(breakEven.toFixed(4));
    writeUrlParams({ c_price: '' });
    track('calculator_lifecycle_price_reset', {});
  }, [breakEven]);

  const columns = useMemo<DataTableColumn<LifecycleRow>[]>(
    () => [
      {
        header: t.colChip,
        cell: (r) => r.label,
        sortValue: (r) => r.label,
        className: 'font-medium whitespace-nowrap',
      },
      {
        header: t.colDate,
        // Provenance is not optional here: the number no longer comes from the
        // run date stamped above the chart.
        cell: (r) =>
          r.entry.runUrls.length > 0 ? (
            <span className="whitespace-nowrap">
              <Link
                href={r.entry.runUrls[0]!}
                target="_blank"
                className="underline hover:text-foreground"
              >
                {r.entry.date}
                <ExternalLinkIcon />
              </Link>
              {r.entry.supersededLatest && (
                <span className="ml-1 text-amber-600" title={t.supersededTitle}>
                  ↑
                </span>
              )}
            </span>
          ) : (
            <span className="whitespace-nowrap">
              {r.entry.date}
              {r.entry.supersededLatest && (
                <span className="ml-1 text-amber-600" title={t.supersededTitle}>
                  ↑
                </span>
              )}
            </span>
          ),
        sortValue: (r) => r.entry.date,
      },
      {
        header: t.colTpPerMw(tokenTypeLabel),
        align: 'right',
        cell: (r) => formatCompact(r.tpPerMw),
        sortValue: (r) => r.tpPerMw,
        className: 'tabular-nums',
      },
      {
        header: t.colRevenue,
        align: 'right',
        cell: (r) => formatMoney(r.series.revenuePerDay),
        sortValue: (r) => r.series.revenuePerDay,
        className: 'tabular-nums',
      },
      {
        header: t.colCost,
        align: 'right',
        cell: (r) => formatMoney(r.series.costPerDay),
        sortValue: (r) => r.series.costPerDay,
        className: 'tabular-nums',
      },
      {
        header: t.colMargin,
        align: 'right',
        cell: (r) => formatMoney(r.series.marginPerDay),
        sortValue: (r) => r.series.marginPerDay,
        className: 'tabular-nums',
      },
      {
        header: t.colPayback,
        align: 'right',
        cell: (r) =>
          r.series.paybackMonth === null ? (
            <span className="text-muted-foreground">{t.never}</span>
          ) : (
            `${r.series.paybackMonth.toFixed(1)} ${t.monthsSuffix}`
          ),
        sortValue: (r) => r.series.paybackMonth ?? Infinity,
        className: 'tabular-nums',
      },
      {
        header: t.colLifetime,
        align: 'right',
        cell: (r) => formatMoney(r.series.lifetimeMargin),
        sortValue: (r) => r.series.lifetimeMargin,
        className: 'tabular-nums',
      },
      {
        header: t.colAvailability,
        align: 'right',
        cell: (r) => `${(r.series.availability * 100).toFixed(2)}%`,
        sortValue: (r) => r.series.availability,
        className: 'tabular-nums',
      },
    ],
    [t, tokenTypeLabel],
  );

  const assumptionInputs: {
    id: string;
    label: string;
    tooltip: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  }[] = [
    {
      id: 'calc-lifecycle-ttfi',
      label: t.ttfiLabel,
      tooltip: t.ttfiTooltip,
      value: ttfiInput,
      onChange: handleAssumption(setTtfiInput, 'c_ttfi', 'calculator_lifecycle_ttfi_set'),
    },
    {
      id: 'calc-lifecycle-ramp',
      label: t.rampLabel,
      tooltip: t.rampTooltip,
      value: rampInput,
      onChange: handleAssumption(setRampInput, 'c_ramp', 'calculator_lifecycle_ramp_set'),
    },
    {
      id: 'calc-lifecycle-life',
      label: t.lifeLabel,
      tooltip: t.lifeTooltip,
      value: lifeInput,
      onChange: handleAssumption(setLifeInput, 'c_life', 'calculator_lifecycle_life_set'),
    },
    {
      id: 'calc-lifecycle-mtbi',
      label: t.mtbiLabel,
      tooltip: t.mtbiTooltip,
      value: mtbiInput,
      onChange: handleAssumption(setMtbiInput, 'c_mtbi', 'calculator_lifecycle_mtbi_set'),
    },
    {
      id: 'calc-lifecycle-recovery',
      label: t.recoveryLabel,
      tooltip: t.recoveryTooltip,
      value: recoveryInput,
      onChange: handleAssumption(setRecoveryInput, 'c_rec', 'calculator_lifecycle_recovery_set'),
    },
  ];

  const body = () => {
    if (historical.unsupportedSequence) {
      return (
        <p className="text-sm text-muted-foreground" data-testid="calculator-lifecycle-unsupported">
          {t.unsupportedSequence}
        </p>
      );
    }
    if (!mw) {
      return (
        <p className="text-sm text-muted-foreground" data-testid="calculator-lifecycle-empty">
          {t.needMw}
        </p>
      );
    }
    if (historical.error) {
      return (
        <p className="text-sm text-muted-foreground" data-testid="calculator-lifecycle-error">
          {t.errorPrefix}
          {historical.error}
        </p>
      );
    }
    if (historical.loading) {
      return (
        <p className="text-sm text-muted-foreground" data-testid="calculator-lifecycle-loading">
          {t.loading}
        </p>
      );
    }

    return (
      <>
        <div className="flex flex-wrap gap-4">
          <div className="flex flex-col space-y-1.5">
            <LabelWithTooltip
              htmlFor="calc-lifecycle-price"
              label={t.priceLabel}
              tooltip={t.priceTooltip}
            />
            <div className="flex items-center gap-2">
              <Input
                id="calc-lifecycle-price"
                data-testid="calc-lifecycle-price-input"
                type="number"
                min={0}
                step="any"
                value={priceInput}
                onChange={handlePriceChange}
                className="w-32 h-9"
              />
              {priceEdited.current && breakEven !== null && (
                <button
                  type="button"
                  onClick={handlePriceReset}
                  data-testid="calc-lifecycle-price-reset"
                  className="text-xs text-muted-foreground hover:text-foreground underline shrink-0"
                >
                  {t.priceReset}
                </button>
              )}
            </div>
          </div>
          {assumptionInputs.map((input) => (
            <div key={input.id} className="flex flex-col space-y-1.5">
              <LabelWithTooltip htmlFor={input.id} label={input.label} tooltip={input.tooltip} />
              <Input
                id={input.id}
                data-testid={`${input.id}-input`}
                type="number"
                min={0}
                step="any"
                value={input.value}
                onChange={input.onChange}
                className="w-32 h-9"
              />
            </div>
          ))}
        </div>

        {rows.length > 0 ? (
          <>
            <DataTable
              data={rows}
              columns={columns}
              testId="calculator-lifecycle-table"
              analyticsPrefix="calculator_lifecycle_table"
            />
            <FleetLifecycleChart
              data={chartData}
              yLabel={t.chartY}
              breakEvenLabel={t.chartBreakEven}
              labels={{
                month: t.chartMonth,
                marginPerDay: t.tipMargin,
                revenuePerDay: t.tipRevenue,
                costPerDay: t.tipCost,
                cumulative: t.tipCumulative,
                measured: t.tipMeasured,
              }}
            />
          </>
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="calculator-lifecycle-none">
            {t.noneMeasured}
          </p>
        )}

        {visibleUnmeasured.length > 0 && (
          <div
            className="text-xs text-muted-foreground"
            data-testid="calculator-lifecycle-unmeasured"
          >
            <strong>{t.unmeasuredTitle}.</strong> {t.unmeasuredIntro}
            <ul className="mt-1 list-disc pl-5">
              {visibleUnmeasured.map((u) => (
                <li key={u.hwKey}>
                  {getLabel(u.hwKey, hardwareConfig)} —{' '}
                  {t.unmeasuredRange(u.measuredMin, u.measuredMax, u.datesConsidered)}
                </li>
              ))}
            </ul>
          </div>
        )}

        {hasDisagg && (
          <p className="text-muted-foreground text-xs border-l-2 border-amber-500 pl-2 bg-amber-500/5 py-1">
            <strong>{t.note}</strong>
            {t.disagg}
          </p>
        )}

        <p className="text-muted-foreground text-xs border-l-2 border-border pl-2 py-1">
          <strong>{t.note}</strong>
          {t.hybrid}
          {t.overlayExempt}
        </p>

        <div>
          <p className="text-xs text-muted-foreground mt-1">
            {t.assumptions(getCostProviderLabel(costProvider), `${mw} MW`)}
          </p>
          <p className="text-muted-foreground mt-1">
            <small>
              {t.source}
              <Link
                target="_blank"
                className="underline hover:text-foreground"
                href="https://semianalysis.com/datacenter-industry-model/"
              >
                SemiAnalysis Datacenter Industry Model
                <ExternalLinkIcon />
              </Link>
              {' & '}
              <Link
                target="_blank"
                className="underline hover:text-foreground"
                href="https://semianalysis.com/ai-cloud-tco-model/"
              >
                SemiAnalysis Market July 2026 Pricing Surveys & AI Cloud TCO Model
                <ExternalLinkIcon />
              </Link>
            </small>
          </p>
        </div>
      </>
    );
  };

  return (
    <TooltipProvider delayDuration={0}>
      <section data-testid="calculator-lifecycle-section">
        <Card>
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-semibold mb-2">{t.title}</h2>
              <p className="text-muted-foreground text-sm">{t.description}</p>
            </div>
            {body()}
          </div>
        </Card>
      </section>
    </TooltipProvider>
  );
}
