'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';

import { track } from '@/lib/analytics';
import type { HardwareConfig } from '@/components/inference/types';
import { Card } from '@/components/ui/card';
import { type DataTableColumn, DataTable } from '@/components/ui/data-table';
import { ExternalLinkIcon } from '@/components/ui/external-link-icon';
import { Input } from '@/components/ui/input';
import { LabelWithTooltip } from '@/components/ui/label-with-tooltip';
import { TooltipProvider } from '@/components/ui/tooltip';
import { getGpuSpecs, getHardwareConfig } from '@/lib/constants';
import { readUrlParams, writeUrlParams } from '@/lib/url-state';
import { getDisplayLabel } from '@/lib/utils';
import { useLocale } from '@/lib/use-locale';

import { computeFleetStats, formatCompact, type FleetStats } from './fleet';
import { interpolateForGPU, maxInteractivityAtCost } from './interpolation';
import { getCostProviderLabel, getThroughputForType } from './ThroughputBarChart';
import type { CostProvider, CostType, GPUDataPoint, InterpolatedResult } from './types';

interface FleetPlannerProps {
  results: InterpolatedResult[];
  gpuDataByGroupKey: Record<string, GPUDataPoint[]>;
  hardwareConfig: HardwareConfig;
  costProvider: CostProvider;
  costType: CostType;
  /** Current target interactivity (tok/s/user) the results were interpolated at. */
  targetValue: number;
  /** Legend visibility by base hwKey — the cost-cap card must not depend on
   * `results`, which is filtered at the current slider target. */
  visibleHwKeys: Set<string>;
}

const STRINGS = {
  en: {
    fleetTitle: 'Fleet Projection',
    fleetDescription:
      'Size a deployment by facility power: how many GPUs fit in your megawatt budget, and what they serve at the target interactivity above.',
    mwLabel: 'Facility Power (MW)',
    mwTooltip:
      'Total facility power budget in megawatts. GPU count uses all-in power per GPU (host, networking, cooling) from the SemiAnalysis Datacenter Industry Model — not bare TDP.',
    mwPlaceholder: 'e.g. 10',
    colGpu: 'GPU',
    colGpus: 'GPUs',
    colFleetTput: (tokenType: string) => `Fleet ${tokenType}tok/s`,
    colUsers: 'Concurrent Users',
    colCostHr: 'Fleet $/hr',
    colCostMo: 'Fleet $/mo',
    fleetEmpty: 'Enter a facility power budget to project fleet capacity and cost.',
    fleetTooSmall:
      'This power budget is too small to power a single GPU of the shown hardware — try a larger value.',
    fleetNoGpus: 'No GPUs are visible to project — enable hardware in the chart legend.',
    costCapTitle: 'Interactivity Within a Cost Target',
    costCapDescription:
      'Set a cost ceiling per million tokens and find the highest interactivity each GPU can serve without exceeding it.',
    costCapLabel: 'Cost Target ($/M tok)',
    costCapTooltip:
      'Maximum acceptable cost per million tokens (at the selected pricing tier and token type). The answer is the highest interactivity whose interpolated cost stays at or below this ceiling.',
    costCapPlaceholder: 'e.g. 0.50',
    colMaxInteractivity: 'Max Interactivity (tok/s/user)',
    colTputAtIv: 'Throughput (tok/s/gpu)',
    notReachable: 'Not reachable',
    costCapEmpty: 'Enter a cost target to find the serveable interactivity per GPU.',
    costCapNoGpus: 'No GPUs are visible to evaluate — enable hardware in the chart legend.',
    note: 'Note:',
    disaggFleet:
      ' Disaggregated inference configurations (e.g., MoRI SGLang, Dynamo TRTLLM) report throughput per decode GPU or per prefill GPU, rather than per total GPU count — fleet sizes and costs for those configs are not an apples-to-apples comparison with aggregated configs.',
    assumptions: (tier: string) =>
      `Assumes 100% utilization at this operating point and owned-datacenter economics: fleet cost = GPUs × ${tier} $/GPU/hr, months = 730 hr. Facility power is all-in per-GPU power (host, networking, cooling), not bare TDP.`,
    source: 'Source: ',
    tokenTypeTotal: '',
    tokenTypeInput: 'input ',
    tokenTypeOutput: 'output ',
  },
  zh: {
    fleetTitle: '集群规模测算',
    fleetDescription:
      '按设施功率规划部署：在给定兆瓦预算内可容纳多少 GPU，以及在上方目标交互性下的服务能力。',
    mwLabel: '设施功率 (MW)',
    mwTooltip:
      '设施总功率预算（兆瓦）。GPU 数量按每 GPU 全含功率（主机、网络、散热）计算，数据来自 SemiAnalysis Datacenter Industry Model，而非裸 TDP。',
    mwPlaceholder: '如 10',
    colGpu: 'GPU',
    colGpus: 'GPU 数',
    colFleetTput: (tokenType: string) => `集群${tokenType} tok/s`,
    colUsers: '并发用户数',
    colCostHr: '集群 $/hr',
    colCostMo: '集群 $/mo',
    fleetEmpty: '输入设施功率预算以测算集群容量与成本。',
    fleetTooSmall: '该功率预算不足以为所示任一 GPU 供电——请尝试更大的数值。',
    fleetNoGpus: '当前无可见 GPU 可测算——请在图表图例中启用硬件。',
    costCapTitle: '成本上限下的交互性',
    costCapDescription:
      '设定每百万 token 的成本上限，查看每款 GPU 在不超支前提下可提供的最高交互性。',
    costCapLabel: '成本上限 ($/M tok)',
    costCapTooltip:
      '每百万 token 的最高可接受成本（按所选定价层级和 token 类型）。结果为插值成本不超过该上限的最高交互性。',
    costCapPlaceholder: '如 0.50',
    colMaxInteractivity: '最高交互性 (tok/s/user)',
    colTputAtIv: '吞吐量 (tok/s/gpu)',
    notReachable: '无法达到',
    costCapEmpty: '输入成本上限以查看每款 GPU 可提供的交互性。',
    costCapNoGpus: '当前无可见 GPU 可评估——请在图表图例中启用硬件。',
    note: '注意：',
    disaggFleet:
      '解耦推理配置（如 MoRI SGLang、Dynamo TRTLLM）按解码 GPU 或预填充 GPU 报告吞吐量，而非按 GPU 总数——这类配置的集群规模与成本和聚合配置并非同类比较。',
    assumptions: (tier: string) =>
      `假设该操作点下 100% 利用率及自有数据中心经济模型：集群成本 = GPU 数 × ${tier} $/GPU/hr，每月按 730 小时计。设施功率为每 GPU 全含功率（主机、网络、散热），非裸 TDP。`,
    source: '来源：',
    tokenTypeTotal: '总',
    tokenTypeInput: '输入',
    tokenTypeOutput: '输出',
  },
} as const;

function getLabel(
  r: { hwKey: string; precision?: string },
  hardwareConfig: HardwareConfig,
): string {
  const config = hardwareConfig[r.hwKey] || getHardwareConfig(r.hwKey);
  const baseName = config ? getDisplayLabel(config) : r.hwKey;
  return r.precision ? `${baseName} (${r.precision.toUpperCase()})` : baseName;
}

function parsePositive(raw: string): number | null {
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

interface FleetRow {
  result: InterpolatedResult;
  stats: FleetStats;
}

interface CostCapRow {
  resultKey: string;
  hwKey: string;
  precision?: string;
  /** null = cost target not reachable anywhere on this GPU's frontier */
  maxInteractivity: number | null;
  tputAtIv: number | null;
  users: number | null;
}

export default function FleetPlanner({
  results,
  gpuDataByGroupKey,
  hardwareConfig,
  costProvider,
  costType,
  targetValue,
  visibleHwKeys,
}: FleetPlannerProps) {
  const locale = useLocale();
  const t = STRINGS[locale];

  const [mwInput, setMwInput] = useState<string>(() => readUrlParams().c_mw ?? '');
  const [costCapInput, setCostCapInput] = useState<string>(() => readUrlParams().c_costcap ?? '');

  const mw = useMemo(() => parsePositive(mwInput), [mwInput]);
  const costCap = useMemo(() => parsePositive(costCapInput), [costCapInput]);

  const handleMwChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setMwInput(e.target.value);
    writeUrlParams({ c_mw: parsePositive(e.target.value) ? e.target.value : '' });
  }, []);

  const handleMwBlur = useCallback(() => {
    track('calculator_fleet_mw_set', { mw: mwInput });
  }, [mwInput]);

  const handleCostCapChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setCostCapInput(e.target.value);
    writeUrlParams({ c_costcap: parsePositive(e.target.value) ? e.target.value : '' });
  }, []);

  const handleCostCapBlur = useCallback(() => {
    track('calculator_cost_target_set', { costCap: costCapInput });
  }, [costCapInput]);

  // ---- Fleet projection rows (at the calculator's current target interactivity) ----
  const fleetRows = useMemo<FleetRow[]>(() => {
    if (!mw) return [];
    const rows: FleetRow[] = [];
    for (const result of results) {
      const specs = getGpuSpecs(result.hwKey);
      const stats = computeFleetStats({
        mw,
        powerKwPerGpu: specs.power,
        costPerGpuHour: specs[costProvider],
        tputPerGpu: getThroughputForType(result, costType),
        outputTputPerGpu: result.outputTputValue,
        interactivity: targetValue,
      });
      if (stats) rows.push({ result, stats });
    }
    return rows;
  }, [mw, results, costProvider, costType, targetValue]);

  // Groups shown in the target-independent card: gated ONLY by the legend's
  // hw visibility — never by `results`, which is filtered at the current
  // slider target (a GPU with zero interpolated throughput at an extreme
  // target must still appear here, since its frontier is unchanged).
  const visibleGroupKeys = useMemo(
    () =>
      new Set(
        Object.keys(gpuDataByGroupKey).filter((groupKey) =>
          visibleHwKeys.has(groupKey.includes('__') ? groupKey.split('__')[0] : groupKey),
        ),
      ),
    [gpuDataByGroupKey, visibleHwKeys],
  );

  // Any visible group containing a disagg config taints both tables' per-GPU
  // numbers (fleet sizing AND cost-cap interactivity), so check the raw points
  // rather than only the fleet rows' bracketing frontier points.
  const hasDisagg = useMemo(
    () =>
      Object.entries(gpuDataByGroupKey).some(
        ([groupKey, points]) => visibleGroupKeys.has(groupKey) && points.some((p) => p.disagg),
      ),
    [visibleGroupKeys, gpuDataByGroupKey],
  );

  // ---- Cost-cap rows (independent of target interactivity) ----
  const costCapRows = useMemo<CostCapRow[]>(() => {
    if (!costCap) return [];
    const rows: CostCapRow[] = [];
    for (const [groupKey, points] of Object.entries(gpuDataByGroupKey)) {
      if (!visibleGroupKeys.has(groupKey)) continue;
      const hwKey = groupKey.includes('__') ? groupKey.split('__')[0] : groupKey;
      const precision = groupKey.includes('__') ? groupKey.split('__')[1] : undefined;

      const maxIv = maxInteractivityAtCost(points, costCap, costProvider, costType);
      if (maxIv === null) {
        rows.push({
          resultKey: groupKey,
          hwKey,
          precision,
          maxInteractivity: null,
          tputAtIv: null,
          users: null,
        });
        continue;
      }

      const atIv = interpolateForGPU(points, maxIv, 'interactivity_to_throughput', costProvider);
      const specs = getGpuSpecs(hwKey);
      const stats =
        atIv && mw
          ? computeFleetStats({
              mw,
              powerKwPerGpu: specs.power,
              costPerGpuHour: specs[costProvider],
              tputPerGpu: getThroughputForType(atIv, costType),
              outputTputPerGpu: atIv.outputTputValue,
              interactivity: maxIv,
            })
          : null;

      rows.push({
        resultKey: groupKey,
        hwKey,
        precision,
        maxInteractivity: maxIv,
        tputAtIv: atIv ? getThroughputForType(atIv, costType) : null,
        users: stats ? stats.concurrentUsers : null,
      });
    }
    // Highest achievable interactivity first; unreachable rows last.
    return rows.toSorted(
      (a, b) => (b.maxInteractivity ?? -Infinity) - (a.maxInteractivity ?? -Infinity),
    );
  }, [costCap, visibleGroupKeys, gpuDataByGroupKey, costProvider, costType, mw]);

  const tokenTypeLabel =
    costType === 'input'
      ? t.tokenTypeInput
      : costType === 'output'
        ? t.tokenTypeOutput
        : t.tokenTypeTotal;

  const fleetColumns = useMemo<DataTableColumn<FleetRow>[]>(
    () => [
      {
        header: t.colGpu,
        cell: (r) => getLabel(r.result, hardwareConfig),
        sortValue: (r) => getLabel(r.result, hardwareConfig),
        className: 'font-medium whitespace-nowrap',
      },
      {
        header: t.colGpus,
        align: 'right',
        cell: (r) => r.stats.gpus.toLocaleString(),
        sortValue: (r) => r.stats.gpus,
        className: 'tabular-nums',
      },
      {
        header: t.colFleetTput(tokenTypeLabel),
        align: 'right',
        cell: (r) => formatCompact(r.stats.fleetTokPerSec),
        sortValue: (r) => r.stats.fleetTokPerSec,
        className: 'tabular-nums',
      },
      {
        header: t.colUsers,
        align: 'right',
        cell: (r) => formatCompact(r.stats.concurrentUsers),
        sortValue: (r) => r.stats.concurrentUsers,
        className: 'tabular-nums',
      },
      {
        header: t.colCostHr,
        align: 'right',
        cell: (r) => `$${formatCompact(r.stats.costPerHour)}`,
        sortValue: (r) => r.stats.costPerHour,
        className: 'tabular-nums',
      },
      {
        header: t.colCostMo,
        align: 'right',
        cell: (r) => `$${formatCompact(r.stats.costPerMonth)}`,
        sortValue: (r) => r.stats.costPerMonth,
        className: 'tabular-nums',
      },
    ],
    [hardwareConfig, t, tokenTypeLabel],
  );

  const costCapColumns = useMemo<DataTableColumn<CostCapRow>[]>(() => {
    const columns: DataTableColumn<CostCapRow>[] = [
      {
        header: t.colGpu,
        cell: (r) => getLabel(r, hardwareConfig),
        sortValue: (r) => getLabel(r, hardwareConfig),
        className: 'font-medium whitespace-nowrap',
      },
      {
        header: t.colMaxInteractivity,
        align: 'right',
        cell: (r) =>
          r.maxInteractivity === null ? (
            <span className="text-muted-foreground">{t.notReachable}</span>
          ) : (
            r.maxInteractivity.toFixed(1)
          ),
        sortValue: (r) => r.maxInteractivity ?? -Infinity,
        className: 'tabular-nums',
      },
      {
        header: t.colTputAtIv,
        align: 'right',
        cell: (r) => (r.tputAtIv === null ? '—' : r.tputAtIv.toFixed(1)),
        sortValue: (r) => r.tputAtIv ?? -Infinity,
        className: 'tabular-nums',
      },
    ];
    if (mw) {
      columns.push({
        header: t.colUsers,
        align: 'right',
        cell: (r) => (r.users === null ? '—' : formatCompact(r.users)),
        sortValue: (r) => r.users ?? -Infinity,
        className: 'tabular-nums',
      });
    }
    return columns;
  }, [hardwareConfig, t, mw]);

  const disaggBanner = hasDisagg && (
    <p className="text-muted-foreground text-xs border-l-2 border-amber-500 pl-2 bg-amber-500/5 py-1">
      <strong>{t.note}</strong>
      {t.disaggFleet}
    </p>
  );

  const assumptionsFooter = (
    <>
      <p className="text-xs text-muted-foreground mt-3">
        {t.assumptions(getCostProviderLabel(costProvider))}
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
            SemiAnalysis Market August 2025 Pricing Surveys & AI Cloud TCO Model
            <ExternalLinkIcon />
          </Link>
        </small>
      </p>
    </>
  );

  return (
    <TooltipProvider delayDuration={0}>
      <section data-testid="calculator-fleet-section">
        <Card>
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-semibold mb-2">{t.fleetTitle}</h2>
              <p className="text-muted-foreground text-sm">{t.fleetDescription}</p>
            </div>
            <div className="flex flex-col space-y-1.5 max-w-48">
              <LabelWithTooltip htmlFor="calc-fleet-mw" label={t.mwLabel} tooltip={t.mwTooltip} />
              <Input
                id="calc-fleet-mw"
                data-testid="calc-fleet-mw-input"
                type="number"
                min={0}
                step="any"
                placeholder={t.mwPlaceholder}
                value={mwInput}
                onChange={handleMwChange}
                onBlur={handleMwBlur}
                className="w-32 h-9"
              />
            </div>
            {mw && fleetRows.length > 0 ? (
              <>
                <DataTable
                  data={fleetRows}
                  columns={fleetColumns}
                  testId="calculator-fleet-table"
                  analyticsPrefix="calculator_fleet_table"
                />
                {disaggBanner}
                {assumptionsFooter}
              </>
            ) : (
              <p className="text-sm text-muted-foreground" data-testid="calculator-fleet-empty">
                {/* Empty with MW set has two causes: nothing visible to project
                    (legend/slider filtered everything) vs. a budget below one GPU. */}
                {mw ? (results.length > 0 ? t.fleetTooSmall : t.fleetNoGpus) : t.fleetEmpty}
              </p>
            )}
          </div>
        </Card>
      </section>

      <section data-testid="calculator-costcap-section">
        <Card>
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-semibold mb-2">{t.costCapTitle}</h2>
              <p className="text-muted-foreground text-sm">{t.costCapDescription}</p>
            </div>
            <div className="flex flex-col space-y-1.5 max-w-48">
              <LabelWithTooltip
                htmlFor="calc-costcap"
                label={t.costCapLabel}
                tooltip={t.costCapTooltip}
              />
              <Input
                id="calc-costcap"
                data-testid="calc-costcap-input"
                type="number"
                min={0}
                step="any"
                placeholder={t.costCapPlaceholder}
                value={costCapInput}
                onChange={handleCostCapChange}
                onBlur={handleCostCapBlur}
                className="w-32 h-9"
              />
            </div>
            {costCap && costCapRows.length > 0 ? (
              <>
                <DataTable
                  data={costCapRows}
                  columns={costCapColumns}
                  testId="calculator-costcap-table"
                  analyticsPrefix="calculator_costcap_table"
                />
                {disaggBanner}
                {assumptionsFooter}
              </>
            ) : (
              <p className="text-sm text-muted-foreground" data-testid="calculator-costcap-empty">
                {/* With a valid target set, empty means nothing is legend-visible
                    (unreachable GPUs still produce rows). */}
                {costCap ? t.costCapNoGpus : t.costCapEmpty}
              </p>
            )}
          </div>
        </Card>
      </section>
    </TooltipProvider>
  );
}
