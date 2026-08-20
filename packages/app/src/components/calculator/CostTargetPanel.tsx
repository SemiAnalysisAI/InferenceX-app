'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';

import { track } from '@/lib/analytics';
import type { HardwareConfig } from '@/components/inference/types';
import { Card } from '@/components/ui/card';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { type DataTableColumn, DataTable } from '@/components/ui/data-table';
import { ExternalLinkIcon } from '@/components/ui/external-link-icon';
import { Input } from '@/components/ui/input';
import { LabelWithTooltip } from '@/components/ui/label-with-tooltip';
import { TooltipProvider } from '@/components/ui/tooltip';
import { getGpuSpecs, getHardwareConfig } from '@/lib/constants';
import { readUrlParams, writeUrlParams } from '@/lib/url-state';
import { getDisplayLabel } from '@/lib/utils';
import { useLocale } from '@/lib/use-locale';

import { computeFleetStats, formatCompact } from './fleet';
import { interpolateForGPU, maxInteractivityAtCost } from './interpolation';
import { outputTokPerChip } from './lifecycle';
import { getCostProviderLabel, getThroughputForType } from './ThroughputBarChart';
import type { CostProvider, CostType, GPUDataPoint } from './types';

/**
 * The inverse of the target-interactivity slider: the slider fixes a speed and
 * reads off the cost, this fixes a cost ceiling and reads off the highest speed
 * that stays under it. That is why it sits directly beneath the slider rather
 * than among the fleet-economics sections — it answers a question about the
 * operating point, not about a deployment's lifetime.
 *
 * Deliberately independent of the slider's own value: `gpuDataByGroupKey` is the
 * unfiltered frontier, so a chip that interpolates to nothing at the current
 * target still gets an answer here.
 */
interface CostTargetPanelProps {
  gpuDataByGroupKey: Record<string, GPUDataPoint[]>;
  hardwareConfig: HardwareConfig;
  costProvider: CostProvider;
  costType: CostType;
  /** Legend visibility by base hwKey. */
  visibleHwKeys: Set<string>;
  /**
   * Facility power budget, owned by the page. Only used to turn the answer into
   * concurrent users; the interactivity result itself does not need it.
   */
  mw: number | null;
}

const STRINGS = {
  en: {
    toggleSection: 'Expand or fold this section',
    costCapTitle: 'Interactivity Within a Cost Target',
    costCapDescription:
      'Set a cost ceiling per million tokens and find the highest interactivity each chip can serve without exceeding it.',
    costCapLabel: 'Cost Target ($/M tok)',
    costCapTooltip:
      'Maximum acceptable cost per million tokens (at the selected pricing tier and token type). The answer is the highest interactivity whose interpolated cost stays at or below this ceiling.',
    costCapPlaceholder: 'e.g. 0.50',
    colGpu: 'Chip',
    colMaxInteractivity: 'Max Interactivity (tok/s/user)',
    colTputAtIv: 'Throughput (tok/s/chip)',
    colUsers: 'Concurrent Users',
    notReachable: 'Not reachable',
    costCapEmpty: 'Enter a cost target to find the serveable interactivity per chip.',
    costCapNoGpus: 'No chips are visible to evaluate — enable hardware in the chart legend.',
    note: 'Note:',
    disaggFleet:
      ' Disaggregated inference configurations (e.g., MoRI SGLang, Dynamo TRTLLM) report input and output throughput per prefill chip and per decode chip rather than per chip overall, so the interactivity a cost ceiling permits inherits that per-pool basis on the Input and Output token types. On Total it is per chip overall for both kinds.',
    assumptions: (tier: string) =>
      `Assumes 100% utilization at the answering operating point and owned-datacenter economics at the ${tier} tier. Concurrent users, when shown, is re-based onto chips overall.`,
    source: 'Source: ',
  },
  zh: {
    toggleSection: '展开或折叠此板块',
    costCapTitle: '成本上限下的交互性',
    costCapDescription:
      '设定每百万 token 的成本上限，查看每款 Chip 在不超支前提下可提供的最高交互性。',
    costCapLabel: '成本上限 ($/M tok)',
    costCapTooltip:
      '每百万 token 的最高可接受成本（按所选定价层级和 token 类型）。结果为插值成本不超过该上限的最高交互性。',
    costCapPlaceholder: '如 0.50',
    colGpu: 'Chip',
    colMaxInteractivity: '最高交互性 (tok/s/user)',
    colTputAtIv: '吞吐量 (tok/s/chip)',
    colUsers: '并发用户数',
    notReachable: '无法达到',
    costCapEmpty: '输入成本上限，以查看每款 Chip 可服务的交互性。',
    costCapNoGpus: '当前无可见 Chip 可评估——请在图表图例中启用硬件。',
    note: '注：',
    disaggFleet:
      ' 解耦推理配置（如 MoRI SGLang、Dynamo TRTLLM）的输入与输出吞吐量分别按预填充 Chip 与解码 Chip 报告，而非按 Chip 总数，因此在「输入」与「输出」token 类型下，成本上限所允许的交互性沿用了上述按池计的口径。在「总计」口径下，两种部署方式均按 Chip 总数计。',
    assumptions: (tier: string) =>
      `假设结果操作点下 100% 利用率，并采用 ${tier} 层级的自有数据中心经济模型。如显示并发用户数，则已改按 Chip 总数计。`,
    source: '来源：',
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

interface CostCapRow {
  resultKey: string;
  hwKey: string;
  precision?: string;
  /** null = cost target not reachable anywhere on this chip's frontier */
  maxInteractivity: number | null;
  tputAtIv: number | null;
  users: number | null;
}

export default function CostTargetPanel({
  gpuDataByGroupKey,
  hardwareConfig,
  costProvider,
  costType,
  visibleHwKeys,
  mw,
}: CostTargetPanelProps) {
  const locale = useLocale();
  const t = STRINGS[locale];

  const [costCapInput, setCostCapInput] = useState<string>(() => readUrlParams().c_costcap ?? '');
  const costCap = useMemo(() => parsePositive(costCapInput), [costCapInput]);

  const handleCostCapChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setCostCapInput(e.target.value);
    writeUrlParams({ c_costcap: parsePositive(e.target.value) ? e.target.value : '' });
  }, []);

  const handleCostCapBlur = useCallback(() => {
    track('calculator_cost_target_set', { costCap: costCapInput });
  }, [costCapInput]);

  // Gated ONLY by the legend's hw visibility — never by results interpolated at
  // the current slider target, which would hide a chip whose frontier is fine.
  const visibleGroupKeys = useMemo(
    () =>
      new Set(
        Object.keys(gpuDataByGroupKey).filter((groupKey) =>
          visibleHwKeys.has(groupKey.includes('__') ? groupKey.split('__')[0] : groupKey),
        ),
      ),
    [gpuDataByGroupKey, visibleHwKeys],
  );

  const hasDisagg = useMemo(
    () =>
      Object.entries(gpuDataByGroupKey).some(
        ([groupKey, points]) => visibleGroupKeys.has(groupKey) && points.some((p) => p.disagg),
      ),
    [visibleGroupKeys, gpuDataByGroupKey],
  );

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
              outputTputPerGpu: outputTokPerChip(
                atIv.value,
                atIv.inputTokenShare,
                atIv.outputTputValue,
              ),
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

  return (
    <TooltipProvider delayDuration={0}>
      <section data-testid="calculator-costcap-section">
        <Card>
          <CollapsibleSection
            title={t.costCapTitle}
            toggleLabel={t.toggleSection}
            testId="calculator-costcap-collapse"
            onToggle={(open) => track('calculator_section_toggled', { section: 'costcap', open })}
          >
            <div className="flex flex-col gap-4">
              <p className="text-muted-foreground text-sm">{t.costCapDescription}</p>
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
                  {hasDisagg && (
                    <p className="text-muted-foreground text-xs border-l-2 border-amber-500 pl-2 bg-amber-500/5 py-1">
                      <strong>{t.note}</strong>
                      {t.disaggFleet}
                    </p>
                  )}
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
                        SemiAnalysis Market July 2026 Pricing Surveys & AI Cloud TCO Model
                        <ExternalLinkIcon />
                      </Link>
                    </small>
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground" data-testid="calculator-costcap-empty">
                  {/* With a valid target set, empty means nothing is legend-visible
                      (unreachable chips still produce rows). */}
                  {costCap ? t.costCapNoGpus : t.costCapEmpty}
                </p>
              )}
            </div>
          </CollapsibleSection>
        </Card>
      </section>
    </TooltipProvider>
  );
}
