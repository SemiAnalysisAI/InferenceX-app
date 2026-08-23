'use client';

import { BarChart3, Table2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getModelReleaseDate } from '@semianalysisai/inferencex-constants';

import type { HardwareConfig } from '@/components/inference/types';
import { Card } from '@/components/ui/card';
import { type DataTableColumn, DataTable } from '@/components/ui/data-table';
import { ExternalLinkIcon } from '@/components/ui/external-link-icon';
import { Input } from '@/components/ui/input';
import { LabelWithTooltip } from '@/components/ui/label-with-tooltip';
import { ChartButtons } from '@/components/ui/chart-buttons';
import { SegmentedToggle, type SegmentedToggleOption } from '@/components/ui/segmented-toggle';
import { TooltipProvider } from '@/components/ui/tooltip';
import { track } from '@/lib/analytics';
import { exportToCsv } from '@/lib/csv-export';
import { getGpuSpecs, getHardwareConfig } from '@/lib/constants';
import {
  getModelLabel,
  getSequenceLabel,
  Sequence,
  type Model,
  type Percentile,
} from '@/lib/data-mappings';
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
  outputTokPerChip,
  splitTokenStreams,
  breakEvenPricePerMTok,
  computeLifecycle,
  effectiveTokPerSec,
  MS_PER_MONTH,
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
  /**
   * The facility power budget, raw. Owned by the parent because the URL seed and
   * the fleet-sizing basis are shared, but the *input* lives here: this section
   * is the only thing that consumes it, and a control in one section feeding a
   * table in another is what the old Fleet Projection split got wrong.
   */
  mwInput: string;
  onMwInputChange: (raw: string) => void;
  /** Resolves a series colour from the calculator's theme palette. */
  colorResolver: (hwKey: string) => string;
}

type LifecycleView = 'chart' | 'table';

const LIFECYCLE_VIEW_OPTIONS: SegmentedToggleOption<LifecycleView>[] = [
  {
    value: 'chart',
    label: 'Chart',
    icon: <BarChart3 className="size-3.5" />,
    testId: 'calculator-lifecycle-chart-view-btn',
  },
  {
    value: 'table',
    label: 'Table',
    icon: <Table2 className="size-3.5" />,
    testId: 'calculator-lifecycle-table-view-btn',
  },
];

const STRINGS = {
  en: {
    title: 'Fleet Lifecycle',
    viewChart: 'Chart',
    viewTable: 'Table',
    viewAria: 'View mode',
    captionTarget: (target: number) => `${target.toFixed(0)} tok/s/user`,
    captionPrices: (input: string, output: string, cachedPct: string | null) =>
      `$${input} in / $${output} out per M tok${cachedPct === null ? '' : `, cached ${cachedPct}%`}`,
    description:
      'A fixed fleet, from the day the model shipped. The chips never change; the software serving them does — so each rollout is a config that beat every config before it, climbing from what the fleet already served to its own numbers, and the gap to the cost line is the return on that work.',
    tooSmall:
      'This power budget is too small to power a single chip of the shown hardware — try a larger value.',
    mwLabel: 'Facility Power (MW)',
    mwTooltip:
      'Total facility power budget in megawatts. Chip count uses all-in power per chip (host, networking, cooling) from the SemiAnalysis Datacenter Industry Model — not bare TDP.',
    mwPlaceholder: 'e.g. 10',
    colChips: 'Chips',
    colUsers: 'Concurrent Users now',
    needMw: 'Enter a facility power budget to project lifecycle economics.',
    noReleaseDate:
      'No release date is on file for this model, so the timeline is anchored to its first benchmark run instead.',
    loading: 'Loading run history…',
    errorPrefix: 'Could not load run history: ',
    noneMeasured:
      'No chip was measured at this interactivity on any run date. Move the target interactivity slider into a measured range — the ranges each chip has been measured over are listed below.',
    priceLabel: 'Token Price — input, output ($/M tok)',
    priceInputLabel: 'Input token price, $ per million',
    outputPriceInputLabel: 'Output token price, $ per million',
    priceTooltip:
      "Sale price of tokens, input and output separately — providers bill output at a multiple of input, and the two streams are wildly unequal: 8 input tokens per output token on a fixed 8k/1k sequence, around 130 on agentic traces. Revenue counts both, whichever token type the cost matrix above is set to. The pair defaults to the prices that exactly zero the cheapest visible fleet's margin at its latest config — the competitive floor, at which that chip earns nothing and every pricier chip is underwater — seeded at 4x output over input, which is roughly where the major vendors price. Break-even with two prices is a line rather than a point, so a reset scales both and keeps whatever ratio you have set. Everything above that line is your assumption, not a measurement.",
    priceReset: 'Reset to break-even',
    mtbiLabel: 'MTBI (days)',
    mtbiTooltip:
      'Mean time between interruptions. Combined with recovery time this becomes an availability haircut on revenue. Leave blank to model no interruptions.',
    recoveryLabel: 'Recovery (hours)',
    recoveryTooltip: 'Hours to restore service after one interruption.',
    rampLabel: 'Ramp (months)',
    rampTooltip:
      'Months for a config to roll out across the fleet. Every config gets one: it climbs from whatever the fleet was already serving to the new config\u2019s numbers, and the first climbs from zero. Cost runs at full rate throughout \u2014 racks bill from the moment they are energised, not from the moment they are loaded \u2014 so the first rollout opens at a full day\u2019s cost against no revenue, which is the deepest the margin line ever goes. Your assumption, not a measurement; set it to 0 for configs that take effect instantly.',
    horizonLabel: 'Horizon (months from release)',
    horizonTooltip:
      "How far past the model's release date to project. Past the last sweep the latest config is held flat — that is what the fleet earns if optimisation stops, not a forecast of further gains.",
    cacheLabel: 'Cached input (% of price)',
    cacheTooltip:
      'What a cached input token sells for, as a percentage of the price above. Agentic traces reuse enormous prefixes — a median 133 input tokens per output token, of which a median 92% are served from cache on these runs — and providers bill a cache read at a fraction of a fresh token, so charging full price for all of them overstates margin by close to an order of magnitude. The cached fraction is measured per config, not assumed; only the percentage is yours. Set it to 100 to bill every token the same. Fixed sequences record no cache hits at all, which is why this input only appears for agentic traces.',
    singleRung:
      'Every chip here has been measured on a single run date, so each line is one config held flat — the staircase this section exists to show needs several dates per config, and agentic trace history does not go back far enough yet. The levels are measured; the absence of steps is a gap in the history, not a finding about the hardware.',
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
      'These chips have run history for this scenario but no single run date was measured across the target interactivity, so no honest number exists for them. The nearest interactivity each one actually reached:',
    unmeasuredRange: (below: number | null, above: number | null, dates: number) => {
      const dateLabel = `${dates} run ${dates === 1 ? 'date' : 'dates'}`;
      if (below === null && above === null) return `nothing measured (${dateLabel})`;
      if (below === null)
        return `nothing below; nearest above ${above!.toFixed(1)} tok/s/user (${dateLabel})`;
      if (above === null)
        return `nearest below ${below.toFixed(1)} tok/s/user; nothing above (${dateLabel})`;
      return `nearest ${below.toFixed(1)} below and ${above.toFixed(1)} above, tok/s/user (${dateLabel})`;
    },
    unplottable: (chips: string) =>
      `No fleet could be sized for ${chips} at this power budget — the chip has no registered power figure, or its measured throughput sizes to nothing. Listed rather than dropped so the chart is never quietly missing a chip.`,
    note: 'Note:',
    disagg:
      ' A step can be won by a disaggregated configuration, and the handover is a like-for-like comparison: total tok/s/chip is reported per chip overall for both kinds, and prefill and decode chips are the same silicon, so neither the sizing nor the cost line moves at the switch. Where this section needs an input- or output-token figure — to rank a step, or to price the two streams apart — it derives one from that total and the run’s measured token mix, rather than reading the per-chip input and output rates directly. Those two are reported per prefill and per decode chip on a disaggregated run, which is why the throughput charts elsewhere caveat them as not apples-to-apples; deriving instead keeps every comparison here on one denominator. What the fleet does change is its shape — the winning config’s prefill:decode ratio is assumed to apply across the whole fleet from the moment that config rolls out, which in practice is a redeployment the ramp window stands in for rather than a measurement. The config named on each step says which kind won it.',
    hybrid:
      " One line per chip, not per software config: at any moment it follows whichever framework, precision and speculative-decoding combination was ahead, so the config serving the fleet changes along the line and each step names the one that took over. Legend entries still filter configs, which removes them from candidacy. Each step is a measured run date whose interpolated throughput at the target beat every earlier date; a sweep that failed to beat the incumbent is not a step, because the fleet kept serving the config it already had. A config does not take effect the instant a sweep finds it, so each one rolls out over the ramp window, climbing from what the fleet already served to its own numbers. Power and $/chip/hr are today's values from the TCO model, and cost is flat throughout because no config moves either term — it is the same silicon either way. Reads outside a run's measured interactivity range are excluded rather than clamped.",
    overlayExempt:
      ' Unofficial runs loaded via a run link are not shown here — the run-history API serves ingested official results only.',
    metricLabel: 'Y Axis',
    metricTooltip:
      'What to plot. Margin is the per-day revenue minus the flat fleet cost, so the break-even rule shows which side of it a fleet is on. Revenue is the same rate with the cost term dropped, which makes rollouts easier to compare across chips of very different cost — but a chip being higher no longer means it is more profitable. Cumulative Revenue is the running total taken in since launch, not a rate; it compounds that caveat, because the largest area under a revenue curve may still never have covered its cost.',
    metricMargin: 'Margin',
    metricMarginPerMw: 'Margin/MW',
    metricRevenue: 'Revenue',
    metricCumulativeRevenue: 'Cum. Revenue',
    chartY: 'Margin ($/day)',
    chartYMarginPerMw: 'Margin ($/MW/day)',
    chartYRevenue: 'Revenue ($/day)',
    chartYCumulativeRevenue: 'Cumulative Revenue ($)',
    chartBreakEven: 'break-even',
    tipDate: 'Measured',
    tipConfig: 'Config',
    tipMargin: 'Margin/day',
    tipRevenue: 'Revenue/day',
    tipCumulativeRevenue: 'Cumulative revenue',
    tipCost: 'Cost/day',
    tipCumulative: 'Cumulative margin',
    tipSinceFirst: 'Since first run',
    tipRunLink: 'Open run',
    chartInstructions:
      'Hover to read every chip at that date · Click to freeze the readout, click again to release · Shift+Scroll to zoom horizontally · Drag to pan · Double-click to reset',
    assumptions: (tier: string, chips: string, release: string) =>
      `Anchored at the ${release} release. Fleet sized by facility power at ${chips}; cost = chips × ${tier} $/chip/hr, flat for the whole window. Revenue is priced on the selected token type and reduced by the availability haircut. Price, ramp, MTBI, recovery and horizon are your assumptions — the throughput steps are not.`,
    source: 'Source: ',
  },
  zh: {
    title: '集群生命周期',
    viewChart: '图表',
    viewTable: '表格',
    viewAria: '显示模式',
    captionTarget: (target: number) => `${target.toFixed(0)} tok/s/用户`,
    captionPrices: (input: string, output: string, cachedPct: string | null) =>
      `输入 $${input} / 输出 $${output} 每百万 token${cachedPct === null ? '' : `，缓存 ${cachedPct}%`}`,
    description:
      '固定集群自模型发布之日起的表现。Chip 从未更换，变化的是为其提供服务的软件——每一次推广都是一个优于此前所有配置的新配置，从集群当前已提供的水平爬升至其自身水平，而与成本线之间的差距即为这些工作带来的回报。',
    tooSmall: '该功率预算不足以为所示任一 Chip 供电——请尝试更大的数值。',
    mwLabel: '设施功率 (MW)',
    mwTooltip:
      '设施总功率预算（兆瓦）。Chip 数量按每 Chip 全含功率（主机、网络、散热）计算，数据来自 SemiAnalysis Datacenter Industry Model，而非裸 TDP。',
    mwPlaceholder: '如 10',
    colChips: 'Chip 数',
    colUsers: '当前并发用户数',
    needMw: '输入设施功率预算，以测算生命周期经济性。',
    noReleaseDate: '该模型暂无发布日期记录，时间轴改以其首次基准测试运行为起点。',
    loading: '正在加载运行历史……',
    errorPrefix: '无法加载运行历史：',
    noneMeasured:
      '在任何运行日期下都没有 Chip 在该交互性下被实测过。请将目标交互性滑块移入已实测区间——各 Chip 的实测区间见下方列表。',
    priceLabel: 'Token 价格 — 输入、输出 ($/M tok)',
    priceInputLabel: '输入 token 价格，$/百万',
    outputPriceInputLabel: '输出 token 价格，$/百万',
    priceTooltip:
      'Token 售价，输入与输出分别设定——服务商对输出 token 的计价通常是输入的数倍，而两类 token 的数量极不均衡：固定 8k/1k 序列下每个输出 token 对应 8 个输入 token，agentic traces 下约为 130 个。无论上方成本矩阵选择哪种 token 类型，收入均同时计入两者。二者默认取使当前可见集群中成本最低者在其最新配置下利润恰好为零的价格——即竞争底线：该价格下这款 Chip 不赚不亏，而所有更贵的 Chip 均为亏损——并按输出为输入 4 倍的比例设定，这与主流厂商的定价大致相当。在双价格下保本点是一条直线而非一个点，因此重置会按你当前设定的比例同时缩放两个价格。高于该线的部分属于你的假设，而非实测值。',
    priceReset: '重置为保本价',
    mtbiLabel: '平均无故障间隔 (天)',
    mtbiTooltip: '平均中断间隔时间。与恢复时间共同构成对收入的可用性折损。留空表示不建模中断。',
    recoveryLabel: '恢复时间 (小时)',
    recoveryTooltip: '一次中断后恢复服务所需的小时数。',
    rampLabel: '爬坡期 (月)',
    rampTooltip:
      '一个配置在集群中完成推广所需的月数。每个配置都有各自的推广曲线：从集群当前已提供的水平爬升至新配置的水平，首个配置从零开始爬升。成本在整个期间按满额计入——机架自通电起即开始计费，而非自满载起——因此首次推广开始时即需承担一整天的成本而收入为零，这正是利润率曲线的全程最低点。这是您的假设而非实测值；设为 0 表示配置立即生效。',
    horizonLabel: '测算期 (自发布起月数)',
    horizonTooltip:
      '自模型发布日期起向后测算的月数。在最后一次扫描之后，最新配置将保持不变——这代表若优化停止时集群的收益，而非对后续提升的预测。',
    cacheLabel: '缓存输入 (占价格百分比)',
    cacheTooltip:
      '一个缓存输入 token 的售价，以上方价格的百分比表示。Agentic traces 会复用极长的前缀——中位数为每个输出 token 对应 133 个输入 token，其中中位数 92% 在本批运行中由缓存提供——而服务商对缓存读取仅按新鲜 token 价格的一小部分计费，因此若对全部 token 按满价计费，将使利润被高估近一个数量级。缓存占比按各配置实测得出，并非假设；仅该百分比属于您的假设。设为 100 表示所有 token 同价。固定序列完全没有缓存命中记录，因此该输入项仅在 Agentic Traces 下出现。',
    singleRung:
      '此处每款 Chip 都只有单一运行日期的实测数据，因此每条线都是一个配置的水平延伸——本模块所要呈现的阶梯需要同一配置在多个日期上的数据，而 agentic traces 的历史尚不够长。图中的水平值是实测的；缺少台阶反映的是历史数据的空缺，而非关于硬件的结论。',
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
      '以下 Chip 在该场景下有运行历史，但没有任何单次运行的实测范围覆盖目标交互性，因此无法给出可靠数值。各自最接近的实测交互性：',
    unmeasuredRange: (below: number | null, above: number | null, dates: number) => {
      const dateLabel = `共 ${dates} 个运行日期`;
      if (below === null && above === null) return `无实测数据（${dateLabel}）`;
      if (below === null)
        return `下方无实测；上方最近 ${above!.toFixed(1)} tok/s/user（${dateLabel}）`;
      if (above === null)
        return `下方最近 ${below.toFixed(1)} tok/s/user；上方无实测（${dateLabel}）`;
      return `最近实测为下方 ${below.toFixed(1)}、上方 ${above.toFixed(1)} tok/s/user（${dateLabel}）`;
    },
    unplottable: (chips: string) =>
      `在该功率预算下无法为 ${chips} 组建集群——该 Chip 缺少已登记的功耗数据，或其实测吞吐无法组成任何规模。此处列出而非直接剔除，以免图表静默遗漏 Chip。`,
    note: '注意：',
    disagg:
      '台阶可以由解耦配置取得，且该次交接是同类比较：两种部署方式的总 tok/s/chip 均按 Chip 总数报告，且预填充与解码使用的是同一种硅片，因此切换时集群规模与成本线均不发生变化。当本模块需要输入或输出 token 的单独数值时（用于台阶排序，或将两类 token 分别计价），它由该总量与该次运行实测的 token 构成比推导得出，而非直接读取每芯片的输入/输出速率——在解耦部署下这两个速率分别按预填充芯片与解码芯片计算，这也正是别处吞吐图表标注其不可直接比较的原因；改为推导可使本模块的所有比较统一在同一分母上。真正改变的是集群的形态——自该配置开始推广起，其预填充:解码比例被假定应用于整个集群，这在实际中是一次重新部署，由爬坡期窗口代为体现，而非实测值。每一级台阶标注的配置即说明其类型。',
    hybrid:
      '每个 Chip 一条曲线，而非每个软件配置一条：曲线在任一时刻都跟随当时领先的框架、精度与投机解码组合，因此服务集群的配置会沿曲线变化，每一级台阶都标注接管的配置。图例项仍可筛选配置，被隐藏的配置将不参与竞争。每一级台阶都是一个实测运行日期，其在目标交互性下的插值吞吐量优于此前所有日期；未能超越现有配置的扫描不构成台阶，因为集群仍在运行原有配置。配置不会在扫描发现的瞬间生效，因此每个配置都会在推广期内从集群当前已提供的水平爬升至其自身水平。功率与 $/chip/hr 为 TCO 模型的当前值，成本在整个期间保持水平，因为任何配置都不会改变这两项——两种情况下都是同一款芯片。超出某次运行实测交互性区间的结果会被排除而非钳制。',
    overlayExempt:
      '通过运行链接加载的非官方运行不会显示在此——运行历史 API 仅提供已入库的官方结果。',
    metricLabel: 'Y 轴',
    metricTooltip:
      '选择绘制的内容。利润为日均收入减去水平的集群成本，因此保本线可显示集群位于其哪一侧。收入为同一日均指标去掉成本项，便于在成本差异很大的 Chip 之间比较推广曲线——但此时位置更高并不代表更赚钱。累计收入是自上线以来的累计总额，而非日均指标；它进一步放大了上述注意事项——收入曲线下面积最大的 Chip 仍可能从未收回成本。',
    metricMargin: '利润',
    metricMarginPerMw: '每 MW 利润',
    metricRevenue: '收入',
    metricCumulativeRevenue: '累计收入',
    chartY: '利润 ($/天)',
    chartYMarginPerMw: '每 MW 利润 ($/MW/天)',
    chartYRevenue: '收入 ($/天)',
    chartYCumulativeRevenue: '累计收入 ($)',
    chartBreakEven: '保本线',
    tipDate: '实测于',
    tipConfig: '配置',
    tipMargin: '每日利润',
    tipRevenue: '每日收入',
    tipCumulativeRevenue: '累计收入',
    tipCost: '每日成本',
    tipCumulative: '累计利润',
    tipSinceFirst: '相比首次运行',
    tipRunLink: '查看运行',
    chartInstructions:
      '悬停可读取该日期下所有 Chip 的数值 · 点击可冻结读数，再次点击解除 · Shift+滚轮 横向缩放 · 拖动平移 · 双击重置',
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
  /**
   * A cached input token sells for a tenth of a fresh one — the ratio DeepSeek
   * and Anthropic both publish, and the order of magnitude the others sit at.
   * An assumption like the rest; the cached *fraction* it applies to is measured.
   */
  cachedInputPct: 10,
  /**
   * An output token sells for four times an input one until the user says
   * otherwise — DeepSeek's own published API pricing is $0.27 / $1.10, and the
   * major vendors sit between 2x and 5x. Only used to seed the pair and to hold
   * their ratio through a reset; once both fields exist they are what is billed.
   */
  outputPriceMultiple: 4,
};

/**
 * A price for a field, in as few digits as say it.
 *
 * `toFixed(4)` alone is wrong at the bottom of the range: a fleet cheap enough,
 * or a ratio small enough, produces a real price below 0.00005 and rounds it to
 * "0.0000" — a field that reads as "these tokens are free" when they are not.
 * Small values fall back to significant digits instead.
 */
function formatPrice(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0';
  return value < 0.0001 ? value.toPrecision(3) : value.toFixed(4);
}

/**
 * Same price, for reading rather than editing.
 *
 * The input fields are padded to four decimals so a seeded break-even figure
 * lines up as you type into it; a caption is prose, and `$12.0000` there reads
 * as spurious precision. Trailing zeros are dropped — `12`, `12.5`, `0.1234` —
 * which keeps sub-cent prices intact, since a break-even figure on a large fleet
 * routinely lands below a cent and rounding it to one would print `$0`.
 */
function formatCaptionPrice(value: number): string {
  const fixed = formatPrice(value);
  return fixed.includes('.') ? fixed.replace(/\.?0+$/u, '') : fixed;
}

function parseNonNegative(raw: string): number | null {
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Resolve the two-field price seed from a share link.
 *
 * `c_price` predates the input/output split, so an old link supplies only the
 * input side. Preserve that explicit value and derive its missing peer at the
 * default ratio; otherwise marking the pair as URL-owned leaves output blank and
 * silently bills every output token at $0. The symmetric case makes a manually
 * authored output-only link complete for the same reason.
 */
function initialPriceInputs(params: ReturnType<typeof readUrlParams>): {
  input: string;
  output: string;
  edited: boolean;
} {
  let input = params.c_price ?? '';
  let output = params.c_oprice ?? '';
  const parsedInput = parseNonNegative(input);
  const parsedOutput = parseNonNegative(output);

  if (input && !output && parsedInput !== null) {
    output = formatPrice(parsedInput * DEFAULTS.outputPriceMultiple);
  } else if (!input && output && parsedOutput !== null) {
    input = formatPrice(parsedOutput / DEFAULTS.outputPriceMultiple);
  }

  return { input, output, edited: Boolean(input || output) };
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
  /** Chips the power budget provisions — flat across the whole lifecycle. */
  gpus: number;
  /** Streams the fleet serves at the target interactivity on its latest config. */
  concurrentUsersNow: number;
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
  mwInput,
  onMwInputChange,
  colorResolver,
}: FleetLifecycleProps) {
  const locale = useLocale();
  const t = STRINGS[locale];
  /** A zero or blank budget sizes no fleet, so it is treated as unset. */
  const mw = useMemo(() => {
    const parsed = parseNonNegative(mwInput);
    return parsed !== null && parsed > 0 ? parsed : null;
  }, [mwInput]);

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
  const [cacheInput, setCacheInput] = useState(
    () => readUrlParams().c_cache ?? String(DEFAULTS.cachedInputPct),
  );
  /**
   * Only agentic runs record a cache hit rate, so only they can be discounted.
   * The control is hidden elsewhere rather than shown as a no-op — a knob that
   * moves nothing is worse than no knob.
   */
  const isAgentic = selectedSequence === Sequence.AgenticTraces;
  const cacheReadRatio = isAgentic
    ? Math.min(1, (parseNonNegative(cacheInput) ?? DEFAULTS.cachedInputPct) / 100)
    : 1;

  const [horizonInput, setHorizonInput] = useState(() => readUrlParams().c_life ?? '');
  // Like the price, the horizon is seeded from the data until the user takes it
  // over: a fixed 60-month default spends most of the axis on a flat tail
  // projecting the last config forward, which carries no information.
  const horizonEdited = useRef(Boolean(readUrlParams().c_life));
  const [yMetric, setYMetric] = useState<LifecycleMetric>(() => {
    const seeded = readUrlParams().c_ly;
    // Allowlisted rather than cast: the param is user-editable, and an unknown
    // value must fall back to the default instead of reaching `metricValue`.
    return seeded === 'revenue' || seeded === 'cumulativeRevenue' || seeded === 'marginPerMw'
      ? seeded
      : 'margin';
  });
  const [initialPrices] = useState(() => initialPriceInputs(readUrlParams()));
  const [priceInput, setPriceInput] = useState(initialPrices.input);
  const [outputPriceInput, setOutputPriceInput] = useState(initialPrices.output);
  // A price arriving from the URL is the user's, so it must not be overwritten
  // by the break-even default. Either field counts: they are seeded as a pair,
  // so re-seeding one after the user set the other would silently move the ratio
  // they chose.
  const priceEdited = useRef(initialPrices.edited);
  /**
   * Ratio the pair is seeded at, and restored to by a reset.
   *
   * State rather than derived from the two fields: deriving it would make the
   * seed depend on the values the seed just wrote, and the re-seed that follows a
   * reset would read the ratio it had itself produced. Only a user edit moves it,
   * so a reader who set 3x gets 3x back rather than the default.
   */
  const [seedMultiple, setSeedMultiple] = useState(() => {
    const input = parseNonNegative(initialPrices.input);
    const output = parseNonNegative(initialPrices.output);
    if (input !== null && input > 0 && output !== null && output > 0) return output / input;
    return DEFAULTS.outputPriceMultiple;
  });

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
      // Chip count is mw / all-in power, so it is the same at every rung. Users
      // is not: the fleet streams more of them as throughput improves, so it is
      // the *latest* rung's figure, matching the `tok/s/MW now` column.
      let gpus: number | null = null;
      let concurrentUsersNow: number | null = null;
      // Power the fleet actually occupies, not the budget: chip counts are whole,
      // so the last fraction of a chip's worth of the budget is never provisioned.
      let provisionedMw: number | null = null;

      for (const step of progression.steps) {
        const stats = computeFleetStats({
          mw,
          powerKwPerGpu: specs.power,
          costPerGpuHour: specs[costProvider],
          tputPerGpu: getThroughputForType(step.result, costType),
          // Through the accessor even though this one is always the output rate:
          // the cost-matrix rule exists so every throughput read goes through one
          // chokepoint, and a direct field read silently diverges if it gains logic.
          outputTputPerGpu: outputTokPerChip(
            getThroughputForType(step.result, 'total'),
            step.result.inputTokenShare,
            getThroughputForType(step.result, 'output'),
          ),
          interactivity: targetValue,
        });
        if (!stats) continue;
        costPerHour ??= stats.costPerHour;
        provisionedMw ??= (stats.gpus * specs.power) / 1000;
        gpus ??= stats.gpus;
        concurrentUsersNow = stats.concurrentUsers;
        steps.push({
          month: (Date.parse(`${step.date}T00:00:00Z`) - anchorMs) / MS_PER_MONTH,
          // Always the total-token rate, never the cost-type one: the fleet sells
          // everything it produces, whichever token type the cost matrix above is
          // expressed in. Split by the measured mix so both streams stay on the
          // per-chip denominator the fleet was sized and costed on.
          ...splitTokenStreams(
            stats.gpus * getThroughputForType(step.result, 'total'),
            step.result.inputTokenShare,
            step.result.cacheHitRate,
            cacheReadRatio,
          ),
        });
      }

      if (
        steps.length === 0 ||
        costPerHour === null ||
        provisionedMw === null ||
        gpus === null ||
        concurrentUsersNow === null
      ) {
        absent.push(progression.baseGpu);
        return [];
      }
      return [{ progression, steps, costPerHour, provisionedMw, gpus, concurrentUsersNow }];
    });
    return { fleets: sized, unplottable: absent };
  }, [mw, anchorMs, visibleProgressions, costProvider, costType, targetValue, cacheReadRatio]);

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
      // Two prices make break-even a line, not a point. Fixing the ratio picks
      // one solution off it: solve the input price against a rate that already
      // counts each output token as `multiple` input tokens' worth of revenue.
      const price = breakEvenPricePerMTok(
        costPerHour,
        effectiveTokPerSec(latest.billableInputTokPerSec, latest.outputTokPerSec, seedMultiple),
        availability,
      );
      if (price === null) continue;
      if (cheapest === null || price < cheapest) cheapest = price;
    }
    return cheapest;
  }, [fleets, availability, seedMultiple]);

  // Seed and re-seed both prices from break-even until the user takes them over.
  useEffect(() => {
    if (priceEdited.current || breakEven === null) return;
    setPriceInput(formatPrice(breakEven));
    setOutputPriceInput(formatPrice(breakEven * seedMultiple));
  }, [breakEven, seedMultiple]);

  const assumptions = useMemo<LifecycleAssumptions>(
    () => ({
      mtbiDays: parseNonNegative(mtbiInput) ?? 0,
      recoveryHours: parseNonNegative(recoveryInput) ?? 0,
      inputPricePerMTok: parseNonNegative(priceInput) ?? 0,
      outputPricePerMTok: parseNonNegative(outputPriceInput) ?? 0,
      rampMonths: parseNonNegative(rampInput) ?? 0,
    }),
    [mtbiInput, recoveryInput, priceInput, outputPriceInput, rampInput],
  );

  const rows = useMemo<LifecycleRow[]>(
    () =>
      fleets.flatMap(
        ({ progression, steps, costPerHour, provisionedMw, gpus, concurrentUsersNow }) => {
          const series = computeLifecycle({
            steps,
            costPerHour,
            provisionedMw,
            horizonMonths,
            assumptions,
          });
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
              gpus,
              concurrentUsersNow,
              disagg: progression.disagg,
              series,
            },
          ];
        },
      ),
    [fleets, horizonMonths, assumptions, hardwareConfig],
  );

  const hasDisagg = useMemo(() => rows.some((r) => r.disagg), [rows]);

  /**
   * Every plotted chip is a single measured date, so no line has a step in it.
   * Worth saying out loud: a flat line here means the history is one date deep,
   * not that the software stopped improving.
   */
  const allSingleRung = useMemo(
    () => rows.length > 0 && rows.every((r) => r.progression.steps.length < 2),
    [rows],
  );

  const [view, setView] = useState<LifecycleView>('chart');

  const viewOptions = useMemo<SegmentedToggleOption<LifecycleView>[]>(
    () =>
      LIFECYCLE_VIEW_OPTIONS.map((option) => ({
        ...option,
        label: option.value === 'chart' ? t.viewChart : t.viewTable,
      })),
    [t],
  );

  /**
   * The same options without test ids. The toggle is rendered twice — once in the
   * button row, once in the caption for narrow screens — and two elements sharing
   * a test id makes every `cy.click` on it ambiguous.
   */
  const mobileViewOptions = useMemo<SegmentedToggleOption<LifecycleView>[]>(
    () => viewOptions.map(({ testId: _testId, ...option }) => option),
    [viewOptions],
  );

  const handleViewChange = useCallback((value: LifecycleView) => {
    setView(value);
    track('calculator_lifecycle_view_changed', { view: value });
  }, []);
  const chartData = useMemo<LifecycleChartSeries[]>(
    () =>
      rows.map((r) => {
        // Step risers are keyed by month so the tooltip can name the run behind
        // each one; months come from the same arithmetic the schedule used.
        const stepInfo = new Map<
          number,
          { date: string; config: string; factor: number; runUrls: string[] }
        >();
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
            runUrls: step.runUrls,
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
    (
      setter: (v: string) => void,
      param: 'c_mtbi' | 'c_rec' | 'c_life' | 'c_ramp' | 'c_cache',
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

  const handleMetricChange = useCallback((value: LifecycleMetric) => {
    setYMetric(value);
    writeUrlParams({ c_ly: value === 'margin' ? '' : value });
    track('calculator_lifecycle_metric_set', { value });
  }, []);

  const handlePriceChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      priceEdited.current = true;
      setPriceInput(raw);
      const input = parseNonNegative(raw);
      const output = parseNonNegative(outputPriceInput);
      if (input !== null && input > 0 && output !== null && output > 0) {
        setSeedMultiple(output / input);
      }
      writeUrlParams({ c_price: parseNonNegative(raw) === null ? '' : raw });
      track('calculator_lifecycle_price_set', { value: raw });
    },
    [outputPriceInput],
  );

  const handleOutputPriceChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      priceEdited.current = true;
      setOutputPriceInput(raw);
      const input = parseNonNegative(priceInput);
      const output = parseNonNegative(raw);
      if (input !== null && input > 0 && output !== null && output > 0) {
        setSeedMultiple(output / input);
      }
      writeUrlParams({ c_oprice: parseNonNegative(raw) === null ? '' : raw });
      track('calculator_lifecycle_output_price_set', { value: raw });
    },
    [priceInput],
  );

  const handlePriceReset = useCallback(() => {
    priceEdited.current = false;
    if (breakEven !== null) {
      // Scale both, keeping whatever ratio the user had set — the pair is what
      // break-even is solved for, so resetting one alone would land off the line.
      setPriceInput(formatPrice(breakEven));
      setOutputPriceInput(formatPrice(breakEven * seedMultiple));
    }
    writeUrlParams({ c_price: '', c_oprice: '' });
    track('calculator_lifecycle_price_reset', {});
  }, [breakEven, seedMultiple]);

  /**
   * The table's own numbers, not the chart's samples: one row per chip, which is
   * what a reader who asked for this section is comparing.
   */
  const handleExportCsv = useCallback(() => {
    const headers = [
      t.colChip,
      t.colConfigNow,
      t.colFirst,
      t.colLatest,
      t.colSteps,
      t.colGain,
      t.colChips,
      t.colTpPerMw(tokenTypeLabel),
      t.colUsers,
      t.colRevenue,
      t.colCost,
      t.colMargin,
      t.colPayback,
      t.colLifetime,
      t.colAvailability,
    ];
    const body = rows.map((r) => [
      r.label,
      r.configNow,
      r.progression.steps[0]?.date ?? '',
      r.progression.steps.at(-1)?.date ?? '',
      r.series.improvementCount,
      r.series.improvementFactor,
      r.gpus,
      r.tpPerMw,
      r.concurrentUsersNow,
      r.series.revenuePerDay,
      r.series.costPerDay,
      r.series.marginPerDay,
      r.series.paybackMonth ?? '',
      r.series.lifetimeMargin,
      r.series.availability,
    ]);
    exportToCsv(`InferenceX_fleet_lifecycle_${selectedModel}`, headers, body, [
      // The assumptions are not in the rows, and a CSV read six months later
      // cannot be reconstructed without them.
      `Assumptions: input $${priceInput}/M tok, output $${outputPriceInput}/M tok, ramp ${rampInput} mo, MTBI ${mtbiInput} d, recovery ${recoveryInput} h, horizon ${horizonInput} mo, power ${mw ?? ''} MW`,
    ]);
  }, [
    rows,
    t,
    tokenTypeLabel,
    selectedModel,
    priceInput,
    outputPriceInput,
    rampInput,
    mtbiInput,
    recoveryInput,
    horizonInput,
    mw,
  ]);

  /**
   * The two token prices, for the caption. Revenue — and so every margin plotted
   * here — is linear in these, and on the margin metrics they are *seeded* from
   * break-even rather than typed, so a reader comparing two screenshots needs to
   * see them next to the MW figure to know whether they are looking at the same
   * scenario.
   *
   * Null until the seed lands: the fields start empty and a break-even effect
   * fills them, and `$/M tok` with nothing in front of it is worse than silence.
   * The cached tier is quoted only for agentic, which is the only sequence that
   * measures a hit rate for it to apply to — and there it is load-bearing, since
   * most input tokens bill at it rather than at the input price beside it.
   */
  const captionPrices = useMemo(() => {
    const input = parseNonNegative(priceInput);
    const output = parseNonNegative(outputPriceInput);
    if (input === null || output === null) return null;
    return t.captionPrices(
      formatCaptionPrice(input),
      formatCaptionPrice(output),
      isAgentic ? String(Math.round(cacheReadRatio * 100)) : null,
    );
  }, [priceInput, outputPriceInput, isAgentic, cacheReadRatio, t]);

  /**
   * The figure's own header, in the same shape the bar chart above uses: title,
   * then the provenance a reader needs to know what they are looking at. The
   * chart renders it as its caption; the table view renders it as a figcaption,
   * so switching tabs never loses the heading.
   */
  const caption = (
    <>
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-lg font-semibold">{t.title}</h2>
        <SegmentedToggle
          value={view}
          options={mobileViewOptions}
          onValueChange={handleViewChange}
          ariaLabel={t.viewAria}
          className="md:hidden shrink-0"
        />
      </div>
      <p className="text-sm text-muted-foreground mb-2">
        {getModelLabel(selectedModel)} • {getSequenceLabel(selectedSequence, locale)} •{' '}
        {t.captionTarget(targetValue)}
        {mw ? ` • ${mw} MW` : ''}
        {captionPrices === null ? '' : ` • ${captionPrices}`} • {t.source}SemiAnalysis
      </p>
    </>
  );

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
        // The physical sizing the whole projection rests on. It used to live in a
        // separate Fleet Projection section, which meant the budget that produced
        // it and the economics that consume it were three sections apart.
        header: t.colChips,
        align: 'right',
        cell: (r) => formatCompact(r.gpus, 0),
        sortValue: (r) => r.gpus,
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
        // Streams, not tokens: the same fleet throughput read as demand served.
        header: t.colUsers,
        align: 'right',
        cell: (r) => formatCompact(r.concurrentUsersNow, 0),
        sortValue: (r) => r.concurrentUsersNow,
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
    ...(isAgentic
      ? [
          {
            id: 'calc-lifecycle-cache',
            label: t.cacheLabel,
            tooltip: t.cacheTooltip,
            value: cacheInput,
            onChange: handleAssumption(setCacheInput, 'c_cache', 'calculator_lifecycle_cache_set'),
          },
        ]
      : []),
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
                aria-label={t.priceInputLabel}
                className="w-24 h-9"
              />
              <Input
                id="calc-lifecycle-output-price"
                data-testid="calc-lifecycle-output-price-input"
                type="number"
                min={0}
                step="any"
                value={outputPriceInput}
                onChange={handleOutputPriceChange}
                aria-label={t.outputPriceInputLabel}
                className="w-24 h-9"
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
                  value: 'marginPerMw',
                  label: t.metricMarginPerMw,
                  testId: 'calc-lifecycle-metric-margin-per-mw',
                },
                {
                  value: 'revenue',
                  label: t.metricRevenue,
                  testId: 'calc-lifecycle-metric-revenue',
                },
                {
                  value: 'cumulativeRevenue',
                  label: t.metricCumulativeRevenue,
                  testId: 'calc-lifecycle-metric-cumulative-revenue',
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
          <figure data-testid="calculator-lifecycle-figure" className="relative rounded-lg">
            <ChartButtons
              chartId="fleet-lifecycle"
              analyticsPrefix="calculator_lifecycle"
              zoomResetEvent="d3chart_zoom_reset_fleet-lifecycle"
              onExportCsv={handleExportCsv}
              exportFileName={`InferenceX_fleet_lifecycle_${selectedModel}`}
              // A PNG of a paginated HTML table is not a useful artefact; the CSV
              // is the export for that view.
              hideImageExport={view === 'table'}
              leadingControls={
                <SegmentedToggle
                  value={view}
                  options={viewOptions}
                  onValueChange={handleViewChange}
                  ariaLabel={t.viewAria}
                  testId="calculator-lifecycle-view-toggle"
                  className="shrink-0"
                />
              }
            />
            {view === 'table' ? (
              <>
                <figcaption>{caption}</figcaption>
                <DataTable
                  data={rows}
                  columns={columns}
                  testId="calculator-lifecycle-table"
                  analyticsPrefix="calculator_lifecycle_table"
                  // One row per chip, every one of them named in the legend and on
                  // the chart. A search box over five rows is furniture.
                  searchable={false}
                />
              </>
            ) : (
              <FleetLifecycleChart
                data={chartData}
                metric={yMetric}
                anchorMs={anchorMs}
                yLabel={
                  yMetric === 'revenue'
                    ? t.chartYRevenue
                    : yMetric === 'cumulativeRevenue'
                      ? t.chartYCumulativeRevenue
                      : yMetric === 'marginPerMw'
                        ? t.chartYMarginPerMw
                        : t.chartY
                }
                caption={caption}
                breakEvenLabel={t.chartBreakEven}
                instructions={t.chartInstructions}
                labels={{
                  date: t.tipDate,
                  config: t.tipConfig,
                  marginPerDay: t.tipMargin,
                  revenuePerDay: t.tipRevenue,
                  cumulativeRevenue: t.tipCumulativeRevenue,
                  costPerDay: t.tipCost,
                  cumulative: t.tipCumulative,
                  runLink: t.tipRunLink,
                  sinceFirst: t.tipSinceFirst,
                }}
              />
            )}
          </figure>
        ) : (
          /* Nothing to plot has two causes, and blaming the wrong one sends the
             reader to the wrong control: chips were selected but none could be
             sized (the budget), versus nothing measured at this speed (the
             slider). `unplottable` distinguishes them. */
          <p className="text-sm text-muted-foreground" data-testid="calculator-lifecycle-none">
            {unplottable.length > 0 ? t.tooSmall : t.noneMeasured}
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
                  {t.unmeasuredRange(u.nearestBelow, u.nearestAbove, u.datesConsidered)}
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

        {allSingleRung && (
          <p
            className="text-muted-foreground text-xs border-l-2 border-amber-500 pl-2 bg-amber-500/5 py-1"
            data-testid="calculator-lifecycle-single-rung"
          >
            <strong>{t.note}</strong> {t.singleRung}
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
            {/* Outside `body()` on purpose: every other control is only meaningful
                once a fleet exists, but this is the one that brings it into being,
                so it has to render in the empty state too. */}
            <div className="flex flex-col space-y-1.5">
              <LabelWithTooltip htmlFor="calc-fleet-mw" label={t.mwLabel} tooltip={t.mwTooltip} />
              <Input
                id="calc-fleet-mw"
                data-testid="calc-fleet-mw-input"
                type="number"
                min={0}
                step="any"
                placeholder={t.mwPlaceholder}
                value={mwInput}
                onChange={(e) => onMwInputChange(e.target.value)}
                onBlur={() => track('calculator_fleet_mw_set', { mw: mwInput })}
                className="w-32 h-9"
              />
            </div>
            {body()}
          </div>
        </Card>
      </section>
    </TooltipProvider>
  );
}
