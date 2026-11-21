'use client';

import { Button } from '@/components/ui/button';
import type { InferenceData } from '@/components/inference/types';
import type { PowerTimelineTrace } from '@/components/inference/utils/powerTimeline';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { NVL72_GPUS_PER_RACK } from '@/lib/power/load-swing-stats';
import { cn } from '@/lib/shared/utils';

import { formatLoadSwingWatts, loadSwingPercentTdp } from './load-swing-rows';

import { powerXInsight, type PoolPair, type PowerXInsight } from './powerx-insight';
import type { PowerXRole } from './powerx-role';
import { POWERX_VIEW_ANALYTICS_ID, type PowerXView } from './powerx-views';

const rate = (value: number) => String(value >= 10 ? Math.round(value) : value.toFixed(1));
const watts = (value: number) => Math.round(value).toLocaleString('en-US');
const pct = (value: number) => `${Math.round(value * 100)}%`;
const pctOf = (value: number) => `${Math.round(value)}%`;
const joules = (value: number) =>
  value >= 100 ? Math.round(value).toLocaleString('en-US') : value.toFixed(value >= 10 ? 1 : 2);
const times = (value: number) => `${value.toFixed(1)}×`;

const joinEn = (items: readonly string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
const joinZh = (items: readonly string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join('、')} 和 ${items.at(-1)}`;

type Pool = 'prefill' | 'decode';

const STRINGS = {
  en: {
    label: 'PowerX insight',
    pools: { prefill: 'Prefill', decode: 'Decode' } satisfies Record<Pool, string>,
    poolGpus: { prefill: 'Prefill GPUs', decode: 'Decode GPUs' } satisfies Record<Pool, string>,
    split: 'Prefill vs decode',
    available: (hw: readonly string[]) => `available for ${joinEn(hw)} in this view`,
    showSplit: 'Show prefill vs decode',
    backToAll: 'Back to all GPUs',
    energyAll: (x: string, share: string, hw: string) =>
      `At ${x} tok/s/user, ${share} of the energy behind each output token on ${hw} goes to the prefill GPUs.`,
    energyRole: (pool: Pool, j: string, share: string, hw: string, x: string) =>
      `${pool === 'prefill' ? 'Prefill' : 'Decode'} GPUs spend ${j} J per output token on ${hw} at ${x} tok/s/user, ${share} of the total.`,
    energySplit: (p: string, d: string, hw: string, x: string) =>
      `Prefill GPUs spend ${p} J and decode GPUs ${d} J per output token on ${hw} at ${x} tok/s/user.`,
    energyCaption: 'Share of measured J per output token',
    headroomAll: (
      x: string,
      hw: string,
      d: string,
      dPct: string,
      head: string,
      p: string,
      pPct: string,
    ) =>
      `At ${x} tok/s/user on ${hw}, decode GPUs average ${d} W (${dPct} of TDP), leaving ${head} headroom; prefill GPUs average ${p} W (${pPct}).`,
    headroomAllNoTdp: (x: string, hw: string, d: string, p: string) =>
      `At ${x} tok/s/user on ${hw}, decode GPUs average ${d} W and prefill GPUs ${p} W each.`,
    powerRole: (pool: Pool, w: string, hw: string, x: string, tdp: string | null) =>
      `${pool === 'prefill' ? 'Prefill' : 'Decode'} GPUs average ${w} W each on ${hw} at ${x} tok/s/user${tdp ? ` (${tdp} of TDP)` : ''}.`,
    powerSplit: (p: string, d: string, hw: string, x: string) =>
      `Prefill GPUs average ${p} W each and decode GPUs ${d} W on ${hw} at ${x} tok/s/user.`,
    powerCaption: 'Average draw per GPU as % of TDP',
    powerCaptionNoTdp: 'Average draw per GPU',
    whereAll: (x: string, hw: string, share: string, uplift: string | null) =>
      `At ${x} tok/s/user on ${hw}, prefill GPUs draw ${share} of the GPU layer${uplift ? `; with server, network and facility each GPU costs ${uplift} its own draw` : ''}.`,
    whereRole: (pool: Pool, n: number, share: string, hw: string, x: string) =>
      `The ${n} ${pool === 'prefill' ? 'prefill' : 'decode'} GPUs draw ${share} of the GPU layer on ${hw} at ${x} tok/s/user.`,
    whereSplit: (p: string, d: string, hw: string, x: string) =>
      `Prefill GPUs draw ${p} of the GPU layer and decode GPUs ${d} on ${hw} at ${x} tok/s/user.`,
    whereCaption: (p: number, d: number) => `Share of GPU layer · ${p} prefill + ${d} decode GPUs`,
    swingAll: (hw: string, conc: number, w: string, tdp: string | null, kw: string) =>
      `On ${hw} at c${conc}, GPU power swings by up to ${w} per GPU within 5 s${tdp ? ` (${tdp} of TDP)` : ''}, or ${kw} per NVL72 rack if all ${NVL72_GPUS_PER_RACK} GPUs swing together.`,
  },
  zh: {
    label: 'PowerX 洞察',
    pools: { prefill: '预填充', decode: '解码' } satisfies Record<Pool, string>,
    poolGpus: { prefill: '预填充 GPU', decode: '解码 GPU' } satisfies Record<Pool, string>,
    split: '预填充 vs 解码',
    available: (hw: readonly string[]) => `本视图中 ${joinZh(hw)} 可用`,
    showSplit: '查看预填充 vs 解码',
    backToAll: '返回全部 GPU',
    energyAll: (x: string, share: string, hw: string) =>
      `在 ${x} tok/s/user 时，${hw} 上每个输出 Token 背后的能耗有 ${share} 来自预填充 GPU。`,
    energyRole: (pool: Pool, j: string, share: string, hw: string, x: string) =>
      `在 ${x} tok/s/user 时，${hw} 的${pool === 'prefill' ? '预填充' : '解码'} GPU 每个输出 Token 消耗 ${j} J，占总量的 ${share}。`,
    energySplit: (p: string, d: string, hw: string, x: string) =>
      `在 ${x} tok/s/user 时，${hw} 的预填充 GPU 每个输出 Token 消耗 ${p} J，解码 GPU 消耗 ${d} J。`,
    energyCaption: '占实测每输出 Token 焦耳数的比例',
    headroomAll: (
      x: string,
      hw: string,
      d: string,
      dPct: string,
      head: string,
      p: string,
      pPct: string,
    ) =>
      `在 ${x} tok/s/user 时，${hw} 的解码 GPU 平均 ${d} W（TDP 的 ${dPct}），余量 ${head}；预填充 GPU 平均 ${p} W（${pPct}）。`,
    headroomAllNoTdp: (x: string, hw: string, d: string, p: string) =>
      `在 ${x} tok/s/user 时，${hw} 的解码 GPU 平均每卡 ${d} W，预填充 GPU 平均每卡 ${p} W。`,
    powerRole: (pool: Pool, w: string, hw: string, x: string, tdp: string | null) =>
      `在 ${x} tok/s/user 时，${hw} 的${pool === 'prefill' ? '预填充' : '解码'} GPU 平均每卡 ${w} W${tdp ? `（TDP 的 ${tdp}）` : ''}。`,
    powerSplit: (p: string, d: string, hw: string, x: string) =>
      `在 ${x} tok/s/user 时，${hw} 的预填充 GPU 平均每卡 ${p} W，解码 GPU 平均每卡 ${d} W。`,
    powerCaption: '每 GPU 平均功耗占 TDP 的比例',
    powerCaptionNoTdp: '每 GPU 平均功耗',
    whereAll: (x: string, hw: string, share: string, uplift: string | null) =>
      `在 ${x} tok/s/user 时，${hw} 的预填充 GPU 占 GPU 层功耗的 ${share}${uplift ? `；计入服务器、网络与数据中心后，每个 GPU 的总功耗是其自身功耗的 ${uplift}` : ''}。`,
    whereRole: (pool: Pool, n: number, share: string, hw: string, x: string) =>
      `在 ${x} tok/s/user 时，${hw} 的 ${n} 个${pool === 'prefill' ? '预填充' : '解码'} GPU 占 GPU 层功耗的 ${share}。`,
    whereSplit: (p: string, d: string, hw: string, x: string) =>
      `在 ${x} tok/s/user 时，${hw} 的预填充 GPU 占 GPU 层功耗的 ${p}，解码 GPU 占 ${d}。`,
    whereCaption: (p: number, d: number) => `占 GPU 层功耗的比例 · ${p} 个预填充 + ${d} 个解码 GPU`,
    swingAll: (hw: string, conc: number, w: string, tdp: string | null, kw: string) =>
      `${hw} 在 c${conc} 下，GPU 功耗 5 秒内的最大波动为每 GPU ${w}${tdp ? `（TDP 的 ${tdp}）` : ''}；若 NVL72 机架内 ${NVL72_GPUS_PER_RACK} 颗 GPU 同步波动，相当于每机架 ${kw}。`,
  },
} as const;

type Strings = (typeof STRINGS)[keyof typeof STRINGS];

export interface PowerXInsightCardProps {
  view: PowerXView;
  role: PowerXRole;
  /** The chart's visible rows (overlay rows included); numbers are computed from these. */
  points: readonly InferenceData[];
  /** Over time: the traces the load-swings table reads; the All GPUs card reads its swing. */
  traces?: readonly PowerTimelineTrace[];
  onRoleChange: (role: PowerXRole) => void;
  hardwareLabel: (hwKey: string) => string;
}

interface Copy {
  headline: string;
  caption: string;
  bars: { kind: 'share'; share: PoolPair } | { kind: 'tdp'; percent: PoolPair } | null;
}

function insightCopy(t: Strings, insight: PowerXInsight, hw: string): Copy {
  const { finding, role, point } = insight;
  const x = rate(point.x);
  const pool: Pool | null = role === 'prefill' || role === 'decode' ? role : null;
  if (finding.kind === 'swing') {
    const tdp = loadSwingPercentTdp(finding.deltaWatts, finding.tdpWatts);
    return {
      headline: t.swingAll(
        hw,
        point.conc,
        formatLoadSwingWatts(finding.deltaWatts, false),
        tdp === null ? null : `${tdp}%`,
        formatLoadSwingWatts(finding.deltaWatts, true),
      ),
      caption: '',
      bars: null,
    };
  }
  if (finding.kind === 'energy') {
    const headline =
      role === 'all'
        ? t.energyAll(x, pct(finding.share.prefill), hw)
        : pool
          ? t.energyRole(pool, joules(finding.joules[pool]), pct(finding.share[pool]), hw, x)
          : t.energySplit(joules(finding.joules.prefill), joules(finding.joules.decode), hw, x);
    return {
      headline,
      caption: t.energyCaption,
      bars: { kind: 'share', share: finding.share },
    };
  }
  if (finding.kind === 'power') {
    const tdp = finding.percentTdp;
    let headline: string;
    if (role === 'all') {
      headline = tdp
        ? t.headroomAll(
            x,
            hw,
            watts(finding.watts.decode),
            pctOf(tdp.decode),
            pctOf(Math.max(0, 100 - tdp.decode)),
            watts(finding.watts.prefill),
            pctOf(tdp.prefill),
          )
        : t.headroomAllNoTdp(x, hw, watts(finding.watts.decode), watts(finding.watts.prefill));
    } else if (pool) {
      headline = t.powerRole(
        pool,
        watts(finding.watts[pool]),
        hw,
        x,
        tdp ? pctOf(tdp[pool]) : null,
      );
    } else {
      headline = t.powerSplit(watts(finding.watts.prefill), watts(finding.watts.decode), hw, x);
    }
    return {
      headline,
      caption: tdp ? t.powerCaption : t.powerCaptionNoTdp,
      bars: tdp ? { kind: 'tdp', percent: tdp } : null,
    };
  }
  const headline =
    role === 'all'
      ? t.whereAll(
          x,
          hw,
          pct(finding.share.prefill),
          finding.facilityUplift === null ? null : times(finding.facilityUplift),
        )
      : pool
        ? t.whereRole(pool, finding.gpus[pool], pct(finding.share[pool]), hw, x)
        : t.whereSplit(pct(finding.share.prefill), pct(finding.share.decode), hw, x);
  return {
    headline,
    caption: t.whereCaption(finding.gpus.prefill, finding.gpus.decode),
    bars: { kind: 'share', share: finding.share },
  };
}

const POOL_FILL: Record<Pool, string> = {
  prefill: 'bg-foreground/70',
  decode: 'bg-foreground/25',
};

function PoolBars({
  bars,
  role,
  t,
}: {
  bars: NonNullable<Copy['bars']>;
  role: PowerXRole;
  t: Strings;
}) {
  const dim = (pool: Pool) => (role === 'prefill' || role === 'decode') && role !== pool;
  if (bars.kind === 'share') {
    return (
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
        {(['prefill', 'decode'] as const).map((pool) => (
          <span
            key={pool}
            className={cn(POOL_FILL[pool], dim(pool) && 'opacity-30')}
            style={{ width: `${bars.share[pool] * 100}%` }}
          />
        ))}
      </div>
    );
  }
  return (
    <div
      className="grid w-full grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1"
      aria-hidden="true"
    >
      {(['prefill', 'decode'] as const).map((pool) => (
        <div key={pool} className={cn('contents', dim(pool) && '[&>*]:opacity-40')}>
          <span className="text-3xs leading-none text-muted-foreground">{t.pools[pool]}</span>
          <span className="block h-1.5 overflow-hidden rounded-full bg-muted">
            <span
              className={cn('block h-full', POOL_FILL[pool])}
              style={{ width: `${Math.min(100, Math.max(0, bars.percent[pool]))}%` }}
            />
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * One compact finding above the PowerX chart that points at the GPU role control: under
 * All GPUs it leads to Prefill vs decode, under a role it states that role's figure and
 * leads back. Renders nothing when no visible row is disaggregated.
 */
export function PowerXInsightCard({
  view,
  role,
  points,
  traces,
  onRoleChange,
  hardwareLabel,
}: PowerXInsightCardProps) {
  const t = STRINGS[useLocale()];
  const insight = powerXInsight({ view, role, points, traces });
  if (!insight) return null;
  const hw = hardwareLabel(insight.point.hwKey);
  const copy = insightCopy(t, insight, hw);
  const labels = [...new Set(insight.hardware.map(hardwareLabel))];
  const kicker =
    role === 'all'
      ? `${t.split} · ${t.available(labels)}`
      : `${role === 'split' ? t.split : t.poolGpus[role]} · ${hw}`;
  const onClick = () => {
    if (role === 'all') {
      track('powerx_insight_split_clicked', { view: POWERX_VIEW_ANALYTICS_ID[view] });
      onRoleChange('split');
    } else {
      track('powerx_insight_back_clicked', { view: POWERX_VIEW_ANALYTICS_ID[view], role });
      onRoleChange('all');
    }
  };
  return (
    <aside
      aria-label={t.label}
      data-testid="powerx-insight-card"
      data-view={view}
      data-role={role}
      data-finding={insight.finding.kind}
      className="mb-2 flex min-w-0 flex-col gap-2 rounded-lg border border-border/60 bg-card px-3 py-2 sm:flex-row sm:items-center sm:gap-4"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-muted-foreground" title={kicker}>
          {kicker}
        </p>
        <p className="text-sm text-foreground" data-testid="powerx-insight-headline">
          {copy.headline}
        </p>
      </div>
      <div className="flex min-w-0 items-center gap-3 sm:shrink-0">
        {copy.bars && (
          <div className="flex w-36 min-w-0 flex-col gap-1 sm:w-40">
            <PoolBars bars={copy.bars} role={role} t={t} />
            <span className="text-3xs leading-tight text-muted-foreground">{copy.caption}</span>
          </div>
        )}
        <Button
          type="button"
          variant="outline"
          size="xs"
          className="ml-auto shrink-0"
          data-testid="powerx-insight-action"
          onClick={onClick}
        >
          {role === 'all' ? t.showSplit : t.backToAll}
        </Button>
      </div>
    </aside>
  );
}
