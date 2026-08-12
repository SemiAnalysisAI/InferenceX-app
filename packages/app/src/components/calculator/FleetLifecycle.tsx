'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getModelReleaseDate } from '@semianalysisai/inferencex-constants';

import type { HardwareConfig } from '@/components/inference/types';
import { Card } from '@/components/ui/card';
import { type DataTableColumn, DataTable } from '@/components/ui/data-table';
import { ExternalLinkIcon } from '@/components/ui/external-link-icon';
import { Input } from '@/components/ui/input';
import { LabelWithTooltip } from '@/components/ui/label-with-tooltip';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import { TooltipProvider } from '@/components/ui/tooltip';
import { track } from '@/lib/analytics';
import { getGpuSpecs, getHardwareConfig } from '@/lib/constants';
import type { Model, Percentile, Sequence } from '@/lib/data-mappings';
import { readUrlParams, writeUrlParams } from '@/lib/url-state';
import { useLocale } from '@/lib/use-locale';
import { getDisplayLabel } from '@/lib/utils';

import { computeFleetStats, formatCompact } from './fleet';
import FleetLifecycleChart, {
  type LifecycleChartSeries,
  type LifecycleMetric,
} from './FleetLifecycleChart';
import { mergeProgressionsByChip, type ChipProgression } from './historical-best';
import {
  availabilityFromInterrupts,
  breakEvenPricePerMTok,
  computeLifecycle,
  type LifecycleAssumptions,
  type LifecycleSeries,
  type ThroughputStep,
} from './lifecycle';
import { getCostProviderLabel, getThroughputForType } from './ThroughputBarChart';
import type { CalculatorMode, CostProvider, CostType, InterpolatedResult } from './types';
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
      'A fixed fleet, from the day the model shipped. The chips never change; the software serving them does — so each rollout is a config that beat every config before it, climbing from what the fleet already served to its own numbers, and the gap to the cost line is the return on that work.',
    needMw:
      'Enter a facility power budget in the Fleet Projection section above to project lifecycle economics.',
    unsupportedSequence:
      'Not available for Agentic Traces: run history is keyed by input/output sequence length, which agentic traces do not have. Pick a fixed sequence to use this section.',
    noReleaseDate:
      'No release date is on file for this model, so the timeline is anchored to its first benchmark run instead.',
    loading: 'Loading run history…',
    errorPrefix: 'Could not load run history: ',
    noneMeasured:
      'No chip was measured at this interactivity on any run date. Move the target interactivity slider into a measured range — the ranges each chip has been measured over are listed below.',
    priceLabel: 'Token Price ($/M tok)',
    priceTooltip:
      "Sale price of tokens. Defaults to the price that exactly zeroes the cheapest visible fleet's margin at its latest config — the competitive floor, at which that chip earns nothing and every pricier chip is underwater. Derived from that fleet's TCO cost and its interpolated throughput. Everything above this line is your assumption, not a measurement.",
    priceReset: 'Reset to break-even',
    mtbiLabel: 'MTBI (days)',
    mtbiTooltip:
      'Mean time between interruptions. Combined with recovery time this becomes an availability haircut on revenue. Leave blank to model no interruptions.',
    recoveryLabel: 'Recovery (hours)',
    recoveryTooltip: 'Hours to restore service after one interruption.',
    rampLabel: 'Ramp (months)',
    rampTooltip:
      'Months for a config to roll out across the fleet. Every config gets one: it climbs from whatever the fleet was already serving to the new config\u2019s numbers. The first config climbs from zero and energises the racks as it goes, so cost ramps with it and the line opens at exactly zero. Your assumption, not a measurement; set it to 0 for configs that take effect instantly.',
    horizonLabel: 'Horizon (months from release)',
    horizonTooltip:
      "How far past the model's release date to project. Past the last sweep the latest config is held flat — that is what the fleet earns if optimisation stops, not a forecast of further gains.",
    colChip: 'Chip',
    colConfigNow: 'Config Now',
    colFirst: 'First Run',
    colLatest: 'Latest Best',
    colSteps: 'Improvements',
    colGain: 'Gain',
    colTpPerMw: (tokenType: string) => `${tokenType}tok/s/MW now`,
    colRevenue: 'Revenue $/day',
    colCost: 'Cost $/day',
    colMargin: 'Margin $/day',
    colPayback: 'Payback',
    colLifetime: 'Cumulative Margin',
    colAvailability: 'Availability',
    never: 'Never',
    monthsSuffix: 'mo',
    unmeasuredTitle: 'Not measured at this interactivity',
    unmeasuredIntro:
      'These chips have run history for this scenario but were never measured at the target interactivity, so no honest number exists for them. Their measured ranges:',
    unmeasuredRange: (min: number, max: number, dates: number) =>
      `measured ${min.toFixed(1)}–${max.toFixed(1)} tok/s/user across ${dates} run ${dates === 1 ? 'date' : 'dates'}`,
    unplottable: (chips: string) =>
      `No fleet could be sized for ${chips} at this power budget — the chip has no registered power figure, or its measured throughput sizes to nothing. Listed rather than dropped so the chart is never quietly missing a chip.`,
    note: 'Note:',
    disagg:
      ' Disaggregated inference configurations report throughput per decode chip or per prefill chip rather than per total chip, so a step won by a disaggregated config is not sized on quite the same basis as one won by an aggregated config. Both compete for the same line, since the question is what the silicon can be made to do — and the config named on each step says which kind won it.',
    hybrid:
      " One line per chip, not per software config: at any moment it follows whichever framework, precision and speculative-decoding combination was ahead, so the config serving the fleet changes along the line and each step names the one that took over. Legend entries still filter configs, which removes them from candidacy. Each step is a measured run date whose interpolated throughput at the target beat every earlier date; a sweep that failed to beat the incumbent is not a step, because the fleet kept serving the config it already had. A config does not take effect the instant a sweep finds it, so each one rolls out over the ramp window, climbing from what the fleet already served to its own numbers. Power and $/chip/hr are today's values from the TCO model, and cost is flat throughout because no config moves either term — it is the same silicon either way. Reads outside a run's measured interactivity range are excluded rather than clamped.",
    overlayExempt:
      ' Unofficial runs loaded via a run link are not shown here — the run-history API serves ingested official results only.',
    metricLabel: 'Y Axis',
    metricTooltip:
      'Which per-day rate to plot. Margin is revenue minus the flat fleet cost, so the break-even rule shows which side of it a fleet is on. Revenue drops the cost term, which makes the rollouts easier to compare across chips of very different cost — but a chip being higher no longer means it is more profitable.',
    metricMargin: 'Margin',
    metricRevenue: 'Revenue',
    chartY: 'Margin ($/day)',
    chartYRevenue: 'Revenue ($/day)',
    chartBreakEven: 'break-even',
    tipDate: 'Measured',
    tipConfig: 'Config',
    tipMargin: 'Margin/day',
    tipRevenue: 'Revenue/day',
    tipCost: 'Cost/day',
    tipCumulative: 'Cumulative',
    tipSinceFirst: 'Since first run',
    assumptions: (tier: string, chips: string, release: string) =>
      `Anchored at the ${release} release. Fleet sized by facility power at ${chips}; cost = chips × ${tier} $/chip/hr, flat for the whole window. Revenue is priced on the selected token type and reduced by the availability haircut. Price, ramp, MTBI, recovery and horizon are your assumptions — the throughput steps are not.`,
    source: 'Source: ',
  },
  zh: {
    title: '集群生命周期',
    description:
      '固定集群自模型发布之日起的表现。Chip 从未更换，变化的是为其提供服务的软件——每一次推广都是一个优于此前所有配置的新配置，从集群当前已提供的水平爬升至其自身水平，而与成本线之间的差距即为这些工作带来的回报。',
    needMw: '请在上方「集群规模测算」中输入设施功率预算，以测算生命周期经济性。',
    unsupportedSequence:
      '不支持 Agentic Traces：运行历史以输入/输出序列长度为键，而 agentic traces 没有该字段。请选择固定序列以使用本模块。',
    noReleaseDate: '该模型暂无发布日期记录，时间轴改以其首次基准测试运行为起点。',
    loading: '正在加载运行历史……',
    errorPrefix: '无法加载运行历史：',
    noneMeasured:
      '在任何运行日期下都没有 Chip 在该交互性下被实测过。请将目标交互性滑块移入已实测区间——各 Chip 的实测区间见下方列表。',
    priceLabel: 'Token 价格 ($/M tok)',
    priceTooltip:
      'Token 售价。默认取使当前可见集群中成本最低者在其最新配置下利润恰好为零的价格——即竞争底线：该价格下这款 Chip 不赚不亏，而所有更贵的 Chip 均为亏损。该值由该集群的 TCO 成本与其插值吞吐量推导。高于该线的部分属于你的假设，而非实测值。',
    priceReset: '重置为保本价',
    mtbiLabel: '平均无故障间隔 (天)',
    mtbiTooltip: '平均中断间隔时间。与恢复时间共同构成对收入的可用性折损。留空表示不建模中断。',
    recoveryLabel: '恢复时间 (小时)',
    recoveryTooltip: '一次中断后恢复服务所需的小时数。',
    rampLabel: '爬坡期 (月)',
    rampTooltip:
      '一个配置在集群中完成推广所需的月数。每个配置都有各自的推广曲线：从集群当前已提供的水平爬升至新配置的水平，首个配置从零开始爬升。成本在整个期间按满额计入——机架自通电起即开始计费，而非自满载起——因此首次推广在爬升过程中已需承担全额成本。这是您的假设而非实测值；设为 0 表示配置立即生效。',
    horizonLabel: '测算期 (自发布起月数)',
    horizonTooltip:
      '自模型发布日期起向后测算的月数。在最后一次扫描之后，最新配置将保持不变——这代表若优化停止时集群的收益，而非对后续提升的预测。',
    colChip: 'Chip',
    colConfigNow: '当前配置',
    colFirst: '首次运行',
    colLatest: '最新最佳',
    colSteps: '提升次数',
    colGain: '提升倍数',
    colTpPerMw: (tokenType: string) => `当前${tokenType} tok/s/MW`,
    colRevenue: '收入 $/天',
    colCost: '成本 $/天',
    colMargin: '利润 $/天',
    colPayback: '回本时间',
    colLifetime: '累计利润',
    colAvailability: '可用性',
    never: '无法回本',
    monthsSuffix: '个月',
    unmeasuredTitle: '该交互性下无实测数据',
    unmeasuredIntro:
      '以下 Chip 在该场景下有运行历史，但从未在目标交互性下被实测，因此无法给出可靠数值。其实测区间：',
    unmeasuredRange: (min: number, max: number, dates: number) =>
      `实测区间 ${min.toFixed(1)}–${max.toFixed(1)} tok/s/user，共 ${dates} 个运行日期`,
    unplottable: (chips: string) =>
      `在该功率预算下无法为 ${chips} 组建集群——该 Chip 缺少已登记的功耗数据，或其实测吞吐无法组成任何规模。此处列出而非直接剔除，以免图表静默遗漏 Chip。`,
    note: '注意：',
    disagg:
      '解耦推理配置按解码 Chip 或预填充 Chip 报告吞吐量，而非按 Chip 总数，因此其集群规模、成本与利润和聚合配置并非同类比较。因此由解耦配置取得的台阶与由聚合配置取得的台阶在集群规模基准上并不完全一致。两者均可竞争同一 Chip 的曲线——每一级台阶标注的配置即说明其类型。',
    hybrid:
      '每个 Chip 一条曲线，而非每个软件配置一条：曲线在任一时刻都跟随当时领先的框架、精度与投机解码组合，因此服务集群的配置会沿曲线变化，每一级台阶都标注接管的配置。图例项仍可筛选配置，被隐藏的配置将不参与竞争。每一级台阶都是一个实测运行日期，其在目标交互性下的插值吞吐量优于此前所有日期；未能超越现有配置的扫描不构成台阶，因为集群仍在运行原有配置。配置不会在扫描发现的瞬间生效，因此每个配置都会在推广期内从集群当前已提供的水平爬升至其自身水平。功率与 $/chip/hr 为 TCO 模型的当前值，成本在整个期间保持水平，因为任何配置都不会改变这两项——两种情况下都是同一款芯片。超出某次运行实测交互性区间的结果会被排除而非钳制。',
    overlayExempt:
      '通过运行链接加载的非官方运行不会显示在此——运行历史 API 仅提供已入库的官方结果。',
    metricLabel: 'Y 轴',
    metricTooltip:
      '选择绘制哪一项日均指标。利润为收入减去水平的集群成本，因此保本线可显示集群位于其哪一侧。收入则不计成本项，便于在成本差异很大的 Chip 之间比较推广曲线——但此时位置更高并不代表更赚钱。',
    metricMargin: '利润',
    metricRevenue: '收入',
    chartY: '利润 ($/天)',
    chartYRevenue: '收入 ($/天)',
    chartBreakEven: '保本线',
    tipDate: '实测于',
    tipConfig: '配置',
    tipMargin: '每日利润',
    tipRevenue: '每日收入',
    tipCost: '每日成本',
    tipCumulative: '累计',
    tipSinceFirst: '相比首次运行',
    assumptions: (tier: string, chips: string, release: string) =>
      `以 ${release} 发布日期为起点。集群规模按 ${chips} 的设施功率测算；成本 = Chip 数 × ${tier} $/chip/hr，在整个测算期内保持不变。收入按所选 token 类型计价，并扣除可用性折损。价格、爬坡期、平均无故障间隔、恢复时间与测算期为你的假设——吞吐量台阶不是。`,
    source: '来源：',
  },
} as const;

const DEFAULTS = {
  mtbiDays: 24,
  recoveryHours: 12,
  // A nominal quarter to bring a fleet to full load. Purely an assumption, and
  // labelled as one — no measurement in this repo speaks to it.
  rampMonths: 3,
};

const MS_PER_MONTH = (365.25 / 12) * 24 * 3600 * 1000;

function parseNonNegative(raw: string): number | null {
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function getLabel(hwKey: string, hardwareConfig: HardwareConfig): string {
  const config = hardwareConfig[hwKey] || getHardwareConfig(hwKey);
  return config ? getDisplayLabel(config) : hwKey;
}

/**
 * The software half of a hwKey's label — what distinguishes it from bare silicon.
 * Display labels put it in parentheses ("B200 (SGLang, MTP)"); when they don't,
 * fall back to the hwKey's own suffix so the cell is never blank for a config
 * that genuinely differs.
 */
function configSuffix(hwKey: string, baseGpu: string, hardwareConfig: HardwareConfig): string {
  if (hwKey === baseGpu) return '—';
  const label = getLabel(hwKey, hardwareConfig);
  const parenthetical = /\((?<inner>[^)]*)\)/u.exec(label);
  if (parenthetical?.groups?.inner) return parenthetical.groups.inner;
  const suffix = hwKey.slice(baseGpu.length).replace(/^_/u, '').replaceAll('_', ', ');
  return suffix || '—';
}

/**
 * Signed money. Carries a trillions step: a cumulative margin at a
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

/** Short label for the config behind a step, for the tooltip. */
function configLabel(result: InterpolatedResult): string {
  const point = result.nearestPoints[0];
  if (!point) return '';
  const parts = [point.precision?.toUpperCase()].filter(Boolean) as string[];
  if (point.disagg) parts.push('disagg');
  if (result.concurrency > 0) parts.push(`conc ${result.concurrency}`);
  return parts.join(' · ');
}

/** A run date, linked to its workflow run when one is recorded. */
function runLink(date: string, runUrls: string[]) {
  if (runUrls.length === 0) return <>{date}</>;
  return (
    <Link href={runUrls[0]!} target="_blank" className="underline hover:text-foreground">
      {date}
      <ExternalLinkIcon />
    </Link>
  );
}

interface LifecycleRow {
  progression: ChipProgression;
  label: string;
  /** The config the chip is running at the latest rung, e.g. "SGLang, MTP". */
  configNow: string;
  /** A real hwKey to resolve the series colour from. */
  colorKey: string;
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

  const [mtbiInput, setMtbiInput] = useState(
    () => readUrlParams().c_mtbi ?? String(DEFAULTS.mtbiDays),
  );
  const [recoveryInput, setRecoveryInput] = useState(
    () => readUrlParams().c_rec ?? String(DEFAULTS.recoveryHours),
  );
  const [rampInput, setRampInput] = useState(
    () => readUrlParams().c_ramp ?? String(DEFAULTS.rampMonths),
  );
  const [horizonInput, setHorizonInput] = useState(() => readUrlParams().c_life ?? '');
  // Like the price, the horizon is seeded from the data until the user takes it
  // over: a fixed 60-month default spends most of the axis on a flat tail
  // projecting the last config forward, which carries no information.
  const horizonEdited = useRef(Boolean(readUrlParams().c_life));
  const [yMetric, setYMetric] = useState<LifecycleMetric>(() =>
    readUrlParams().c_ly === 'revenue' ? 'revenue' : 'margin',
  );
  const [priceInput, setPriceInput] = useState(() => readUrlParams().c_price ?? '');
  // A price arriving from the URL is the user's, so it must not be overwritten
  // by the break-even default.
  const priceEdited = useRef(Boolean(readUrlParams().c_price));

  /**
   * Anchor for the timeline. The model's release date is the honest zero — the
   * question is how far the software has come since the weights existed. Models
   * without a sourced release date fall back to their first measured run.
   */
  const releaseDate = getModelReleaseDate(selectedModel);
  /**
   * One series per chip, not per hwKey. The legend still filters hwKeys, so
   * hiding a framework removes it from candidacy for its chip's envelope — the
   * legend stays the control it always was, one level below the lines.
   */
  const visibleProgressions = useMemo(
    () =>
      mergeProgressionsByChip(historical.progressions.filter((p) => visibleHwKeys.has(p.hwKey))),
    [historical.progressions, visibleHwKeys],
  );

  const anchorDate = useMemo(() => {
    if (releaseDate) return releaseDate;
    let earliest: string | null = null;
    for (const p of visibleProgressions) {
      const first = p.steps[0]?.date;
      if (first && (earliest === null || first < earliest)) earliest = first;
    }
    return earliest;
  }, [releaseDate, visibleProgressions]);

  const anchorMs = useMemo(
    () => (anchorDate ? Date.parse(`${anchorDate}T00:00:00Z`) : Number.NaN),
    [anchorDate],
  );

  const visibleUnmeasured = useMemo(
    () => historical.unmeasured.filter((entry) => visibleHwKeys.has(entry.hwKey)),
    [historical.unmeasured, visibleHwKeys],
  );

  /** Months from the anchor to the last measured sweep, across visible chips. */
  const measuredMonths = useMemo(() => {
    if (!Number.isFinite(anchorMs)) return null;
    let latest = -Infinity;
    for (const p of visibleProgressions) {
      const last = p.steps.at(-1)?.date;
      if (!last) continue;
      latest = Math.max(latest, (Date.parse(`${last}T00:00:00Z`) - anchorMs) / MS_PER_MONTH);
    }
    return Number.isFinite(latest) ? latest : null;
  }, [anchorMs, visibleProgressions]);

  useEffect(() => {
    if (horizonEdited.current || measuredMonths === null) return;
    // A short tail past the last sweep so the final step is readable rather than
    // pinned to the right edge.
    setHorizonInput(String(Math.max(1, Math.ceil(measuredMonths + 2))));
  }, [measuredMonths]);

  const horizonMonths = parseNonNegative(horizonInput) ?? 0;

  /**
   * Per chip: the step schedule (one rung per measured improvement) plus the flat
   * fleet cost. Chip count and $/chip/hr do not move when a config improves, so
   * cost is computed once from the opening rung.
   */
  const { fleets, unplottable } = useMemo(() => {
    if (!mw || !Number.isFinite(anchorMs)) return { fleets: [], unplottable: [] };
    // Chips that survived selection but cannot be turned into a fleet — no
    // registered power figure for the base GPU, or a throughput that sizes to
    // nothing. They are named below rather than dropped: a chip that is in the
    // legend and in no row, with no explanation, reads as a bug in the data.
    const absent: string[] = [];
    const sized = visibleProgressions.flatMap((progression) => {
      // Power and $/chip/hr come from the base GPU, so they are identical across
      // the hwKeys pooled into this line — which is what keeps cost flat even
      // though the winning config changes.
      const specs = getGpuSpecs(progression.baseGpu);
      const steps: ThroughputStep[] = [];
      let costPerHour: number | null = null;

      for (const step of progression.steps) {
        const stats = computeFleetStats({
          mw,
          powerKwPerGpu: specs.power,
          costPerGpuHour: specs[costProvider],
          tputPerGpu: getThroughputForType(step.result, costType),
          // Through the accessor even though this one is always the output rate:
          // the cost-matrix rule exists so every throughput read goes through one
          // chokepoint, and a direct field read silently diverges if it gains logic.
          outputTputPerGpu: getThroughputForType(step.result, 'output'),
          interactivity: targetValue,
        });
        if (!stats) continue;
        costPerHour ??= stats.costPerHour;
        steps.push({
          month: (Date.parse(`${step.date}T00:00:00Z`) - anchorMs) / MS_PER_MONTH,
          fleetTokPerSec: stats.fleetTokPerSec,
        });
      }

      if (steps.length === 0 || costPerHour === null) {
        absent.push(progression.baseGpu);
        return [];
      }
      return [{ progression, steps, costPerHour }];
    });
    return { fleets: sized, unplottable: absent };
  }, [mw, anchorMs, visibleProgressions, costProvider, costType, targetValue]);

  // Interrupts sell fewer tokens off the same racks, so they raise break-even.
  // The seeded price has to carry the same haircut the plotted margin does, or
  // the default lands slightly below break-even instead of on it.
  const availability = useMemo(
    () =>
      availabilityFromInterrupts(
        parseNonNegative(mtbiInput) ?? 0,
        parseNonNegative(recoveryInput) ?? 0,
      ),
    [mtbiInput, recoveryInput],
  );

  /**
   * Break-even of the cheapest visible fleet at its latest config — the
   * competitive floor as it stands today, not as it stood at release.
   */
  const breakEven = useMemo(() => {
    let cheapest: number | null = null;
    for (const { steps, costPerHour } of fleets) {
      const latest = steps.at(-1);
      if (!latest) continue;
      const price = breakEvenPricePerMTok(costPerHour, latest.fleetTokPerSec, availability);
      if (price === null) continue;
      if (cheapest === null || price < cheapest) cheapest = price;
    }
    return cheapest;
  }, [fleets, availability]);

  // Seed and re-seed the price from break-even until the user takes it over.
  useEffect(() => {
    if (priceEdited.current || breakEven === null) return;
    setPriceInput(breakEven.toFixed(4));
  }, [breakEven]);

  const assumptions = useMemo<LifecycleAssumptions>(
    () => ({
      mtbiDays: parseNonNegative(mtbiInput) ?? 0,
      recoveryHours: parseNonNegative(recoveryInput) ?? 0,
      pricePerMTok: parseNonNegative(priceInput) ?? 0,
      rampMonths: parseNonNegative(rampInput) ?? 0,
    }),
    [mtbiInput, recoveryInput, priceInput, rampInput],
  );

  const rows = useMemo<LifecycleRow[]>(
    () =>
      fleets.flatMap(({ progression, steps, costPerHour }) => {
        const series = computeLifecycle({ steps, costPerHour, horizonMonths, assumptions });
        if (!series) return [];
        const latest = progression.steps.at(-1)!;
        const latestHwKey = latest.result.hwKey ?? progression.baseGpu;
        return [
          {
            progression,
            // The chip, not the config: the config is what changes along the line.
            label: getLabel(progression.baseGpu, hardwareConfig),
            configNow: configSuffix(latestHwKey, progression.baseGpu, hardwareConfig),
            // The palette is built over the *active* hwKeys, so a bare base key
            // resolves to the fallback grey. Colour the line by the config it is
            // running now, which is both a real key and the legend entry a reader
            // would look for.
            colorKey: latestHwKey,
            tpPerMw: latest.rankValue,
            disagg: progression.disagg,
            series,
          },
        ];
      }),
    [fleets, horizonMonths, assumptions, hardwareConfig],
  );

  const hasDisagg = useMemo(() => rows.some((r) => r.disagg), [rows]);

  const chartData = useMemo<LifecycleChartSeries[]>(
    () =>
      rows.map((r) => {
        // Step risers are keyed by month so the tooltip can name the run behind
        // each one; months come from the same arithmetic the schedule used.
        const stepInfo = new Map<number, { date: string; config: string; factor: number }>();
        for (const step of r.progression.steps) {
          const month = (Date.parse(`${step.date}T00:00:00Z`) - anchorMs) / MS_PER_MONTH;
          // The config is now the thing that changes along the line, so name the
          // framework that took over here, not just its precision.
          const hwKey = step.result.hwKey ?? r.progression.baseGpu;
          const software = configSuffix(hwKey, r.progression.baseGpu, hardwareConfig);
          const detail = configLabel(step.result);
          stepInfo.set(month, {
            date: step.date,
            config: [software === '—' ? '' : software, detail].filter(Boolean).join(' · '),
            factor: step.factorOverFirst,
          });
        }
        return {
          key: r.progression.key,
          label: r.label,
          color: colorResolver(r.colorKey),
          series: r.series,
          stepInfo,
        };
      }),
    [rows, colorResolver, anchorMs],
  );

  const tokenTypeLabel = costType === 'input' ? 'input ' : costType === 'output' ? 'output ' : '';

  const handleAssumption = useCallback(
    (setter: (v: string) => void, param: 'c_mtbi' | 'c_rec' | 'c_life' | 'c_ramp', event: string) =>
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value;
        setter(raw);
        writeUrlParams({ [param]: parseNonNegative(raw) === null ? '' : raw });
        track(event, { value: raw });
      },
    [],
  );

  const handleMetricChange = useCallback((value: LifecycleMetric) => {
    setYMetric(value);
    writeUrlParams({ c_ly: value === 'margin' ? '' : value });
    track('calculator_lifecycle_metric_set', { value });
  }, []);

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
        header: t.colConfigNow,
        // The line is one chip across many configs, so which config it ended on
        // is part of reading the row.
        cell: (r) => <span className="whitespace-nowrap">{r.configNow}</span>,
        sortValue: (r) => r.configNow,
        className: 'text-muted-foreground',
      },
      {
        header: t.colFirst,
        // Provenance is not optional: every rung of the line is a real sweep.
        cell: (r) => {
          const first = r.progression.steps[0]!;
          return <span className="whitespace-nowrap">{runLink(first.date, first.runUrls)}</span>;
        },
        sortValue: (r) => r.progression.steps[0]!.date,
      },
      {
        header: t.colLatest,
        cell: (r) => {
          const latest = r.progression.steps.at(-1)!;
          return <span className="whitespace-nowrap">{runLink(latest.date, latest.runUrls)}</span>;
        },
        sortValue: (r) => r.progression.steps.at(-1)!.date,
      },
      {
        header: t.colSteps,
        align: 'right',
        cell: (r) => String(r.series.improvementCount),
        sortValue: (r) => r.series.improvementCount,
        className: 'tabular-nums',
      },
      {
        header: t.colGain,
        align: 'right',
        cell: (r) => `${r.series.improvementFactor.toFixed(2)}×`,
        sortValue: (r) => r.series.improvementFactor,
        className: 'tabular-nums',
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

  const assumptionInputs = [
    {
      id: 'calc-lifecycle-horizon',
      label: t.horizonLabel,
      tooltip: t.horizonTooltip,
      value: horizonInput,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        horizonEdited.current = true;
        handleAssumption(setHorizonInput, 'c_life', 'calculator_lifecycle_horizon_set')(e);
      },
    },
    {
      id: 'calc-lifecycle-ramp',
      label: t.rampLabel,
      tooltip: t.rampTooltip,
      value: rampInput,
      onChange: handleAssumption(setRampInput, 'c_ramp', 'calculator_lifecycle_ramp_set'),
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
          <div className="flex flex-col space-y-1.5">
            <LabelWithTooltip label={t.metricLabel} tooltip={t.metricTooltip} />
            <SegmentedToggle<LifecycleMetric>
              value={yMetric}
              onValueChange={handleMetricChange}
              ariaLabel={t.metricLabel}
              testId="calc-lifecycle-metric"
              options={[
                { value: 'margin', label: t.metricMargin, testId: 'calc-lifecycle-metric-margin' },
                {
                  value: 'revenue',
                  label: t.metricRevenue,
                  testId: 'calc-lifecycle-metric-revenue',
                },
              ]}
            />
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

        {rows.length > 0 && Number.isFinite(anchorMs) ? (
          <>
            <DataTable
              data={rows}
              columns={columns}
              testId="calculator-lifecycle-table"
              analyticsPrefix="calculator_lifecycle_table"
            />
            <FleetLifecycleChart
              data={chartData}
              metric={yMetric}
              anchorMs={anchorMs}
              yLabel={yMetric === 'revenue' ? t.chartYRevenue : t.chartY}
              breakEvenLabel={t.chartBreakEven}
              labels={{
                date: t.tipDate,
                config: t.tipConfig,
                marginPerDay: t.tipMargin,
                revenuePerDay: t.tipRevenue,
                costPerDay: t.tipCost,
                cumulative: t.tipCumulative,
                sinceFirst: t.tipSinceFirst,
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

        {unplottable.length > 0 && (
          <p
            className="text-muted-foreground text-xs"
            data-testid="calculator-lifecycle-unplottable"
          >
            <strong>{t.note}</strong>{' '}
            {t.unplottable(unplottable.map((gpu) => getLabel(gpu, hardwareConfig)).join(', '))}
          </p>
        )}

        {!releaseDate && rows.length > 0 && (
          <p
            className="text-muted-foreground text-xs"
            data-testid="calculator-lifecycle-no-release"
          >
            <strong>{t.note}</strong> {t.noReleaseDate}
          </p>
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
            {t.assumptions(getCostProviderLabel(costProvider), `${mw} MW`, anchorDate ?? '—')}
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
