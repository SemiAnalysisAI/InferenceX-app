'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Heading } from '@/components/ui/heading';
import { exportToCsv } from '@/lib/csv-export';
import { useLocale } from '@/lib/use-locale';

import type { MeasuredProfitComparison as Comparison } from './measured-profit';
import { formatUsdCompact, isProfitEstimatorRow, HOURS_PER_YEAR } from './profit-estimator';

const COPY = {
  en: {
    title: 'Power planning comparison',
    description:
      'Source observations for the current run. Measured GPU power feeds a modeled chassis estimate; it is not measured whole-system power. AgentX system-power assumptions are not established yet.',
    assumptions:
      'Supported chassis profiles use CPU 20%, DRAM 20%, air cooling and PUE 1.3. Site cooling is unverified; DLC is not modeled. Planning adds 10% electrical headroom after PUE. Only complete measured chassis can size deployments.',
    cost: 'Both modes keep the selected bundled TCO $/GPU/hr and scale it with GPU count. No separate electricity saving is assumed; headroom is reserved capacity, not consumed energy. The chart above retains its provisioned baseline. Historical comparisons are not included below.',
    hardware: 'Hardware',
    source: 'Measured GPU power',
    provisioned: 'Provisioned planning',
    modeled: 'Modeled planning + 10%',
    details: 'Inputs and assumptions',
    unavailable: 'Unavailable',
    revenue: 'Revenue / year',
    profit: 'Profit / year',
    usePoint: 'Use point',
    missingPower: 'No validated GPU power',
    workload: 'Workload not supported by the system model',
    interpolation: 'Select an exact benchmark point; power is not interpolated',
    missing: 'Source observation unavailable',
    unsupported: 'System estimate unavailable',
    gpus: 'GPUs',
    deployments: 'deployments',
    perDeployment: 'Per deployment',
    chassis: 'Chassis AC',
    facility: 'Facility',
    planning: 'Planning',
    revision: 'Model revision',
  },
  zh: {
    title: '功耗规划对比',
    description:
      '展示本次运行的来源记录。以实测 GPU 功率估算机箱功率，不代表整机实测功率。AgentX 的系统功耗假设尚未确立。',
    assumptions:
      '支持的机箱模型采用 CPU 20%、DRAM 20%、风冷和 PUE 1.3。尚未核实测试站点的冷却方式；未对 DLC 建模。应用 PUE 后增加 10% 电力余量；部署容量仅按完整实测机箱计算。',
    cost: '两种方式均沿用所选综合 TCO $/GPU/hr，并按 GPU 数量计算总成本。不单独计入电费节省；余量是预留容量，不是耗电量。上方图表保留原有预配功率基准，下方不包含历史对比。',
    hardware: '硬件',
    source: '实测 GPU 功率',
    provisioned: '预配功率规划',
    modeled: '建模功率规划 + 10%',
    details: '输入与假设',
    unavailable: '不可用',
    revenue: '年收入',
    profit: '年利润',
    usePoint: '使用此运行点',
    missingPower: '无有效 GPU 功率测量',
    workload: '系统模型不支持此工作负载',
    interpolation: '请选择实际基准测试运行点；功率不做插值',
    missing: '缺少来源记录',
    unsupported: '系统功耗估算不可用',
    gpus: '张 GPU',
    deployments: '个部署',
    perDeployment: '每个部署',
    chassis: '机箱交流功率',
    facility: '设施功率',
    planning: '规划功率',
    revision: '模型版本',
  },
};

export default function MeasuredProfitComparison({
  comparisons,
  settings,
  labelFor,
  onSelectPoint,
}: {
  comparisons: Comparison[];
  settings: Record<string, unknown>;
  labelFor: (hwKey: string) => string;
  onSelectPoint: (interactivity: number) => void;
}) {
  const t = COPY[useLocale()];
  const payload = {
    settings,
    cooling: 'modeled-air-cooled; benchmark-site cooling unverified',
    costBoundary: 'Bundled TCO per GPU-hour is unchanged; no separate electricity adjustment.',
    comparisons,
  };
  const csv = () =>
    exportToCsv(
      'InferenceX_power_planning',
      [
        'Hardware',
        'Provisioned utility kW/GPU',
        'Status',
        'Reason',
        'Source observations JSON',
        'Provisioned revenue USD/year',
        'Provisioned profit USD/year',
        'Modeled revenue USD/year',
        'Modeled profit USD/year',
        'Capacity and power JSON',
        'Model revision',
        'Model path',
        'Model source SHA256',
        'PUE',
        'Headroom percent',
        'Settings JSON',
        'Model assumptions JSON',
      ],
      comparisons.map((c) => [
        c.baseline.hwKey,
        c.provisionedKwPerGpu,
        c.status,
        c.status === 'unavailable' ? c.reason : '',
        JSON.stringify(c.sourcePoints),
        c.status === 'supported'
          ? c.provisioned.revenue
          : isProfitEstimatorRow(c.baseline)
            ? c.baseline.revenue
            : null,
        c.status === 'supported'
          ? c.provisioned.profit
          : isProfitEstimatorRow(c.baseline)
            ? c.baseline.profit
            : null,
        c.status === 'supported' ? c.measured.revenue : null,
        c.status === 'supported' ? c.measured.profit : null,
        c.status === 'supported' ? JSON.stringify(c.capacity) : null,
        c.modelRevision,
        c.modelPath,
        c.modelSourceSha256,
        c.pue,
        c.headroomPct,
        JSON.stringify(settings),
        JSON.stringify(c.modelAssumptions),
      ]),
      [t.assumptions, t.cost],
    );
  return (
    <Card data-testid="power-planning-comparison" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Heading level="card" as="h3">
          {t.title}
        </Heading>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={csv}>
            CSV
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a
              download="InferenceX_power_planning.json"
              href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(payload, null, 2))}`}
            >
              JSON
            </a>
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{t.description}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b">
              {[t.hardware, t.source, t.provisioned, t.modeled].map((s) => (
                <th className="p-2 font-medium" key={s}>
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {comparisons.map((c) => {
              const provisioned = c.status === 'supported' ? c.provisioned : c.baseline;
              const source = c.sourcePoints;
              const reason =
                c.status === 'supported'
                  ? ''
                  : c.reason === 'workload'
                    ? t.workload
                    : c.reason === 'interpolated-operating-point'
                      ? t.interpolation
                      : c.reason === 'missing-source'
                        ? t.missing
                        : `${t.unsupported} (${c.reason})`;
              return (
                <tr key={c.baseline.resultKey} className="border-b align-top">
                  <th scope="row" className="p-2 font-medium">
                    {labelFor(c.baseline.hwKey)}
                  </th>
                  <td className="p-2">
                    {source.length === 0 && t.missing}
                    {source.map((p) => (
                      <div key={p.id} className="mb-2">
                        <div>
                          {p.measuredGpuWattsPerGpu === null
                            ? t.missingPower
                            : `${p.measuredGpuWattsPerGpu.toFixed(1)} W/GPU`}
                        </div>
                        <Button
                          variant="link"
                          size="sm"
                          className="h-auto p-0"
                          onClick={() => onSelectPoint(p.interactivity)}
                        >
                          {t.usePoint}: {p.interactivity.toFixed(2)} tok/s/user
                        </Button>
                        <div className="text-xs text-muted-foreground">
                          #{p.id} · C{p.concurrency} · {p.date}
                        </div>
                      </div>
                    ))}
                  </td>
                  <td className="p-2">
                    {isProfitEstimatorRow(provisioned) ? (
                      <>
                        <div>
                          {t.revenue}: {formatUsdCompact(provisioned.revenue)}
                        </div>
                        <div>
                          {t.profit}: {formatUsdCompact(provisioned.profit)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {c.provisionedKwPerGpu?.toFixed(2)} kW/GPU
                          {c.status === 'unavailable' &&
                            ` · ≈${Math.floor(provisioned.gpuHours / HOURS_PER_YEAR).toLocaleString()} ${t.gpus}`}
                        </div>
                        {c.status === 'supported' && (
                          <div className="text-xs text-muted-foreground">
                            {c.capacity.provisionedDeployments.toLocaleString()} {t.deployments} ·{' '}
                            {c.capacity.provisionedGpus.toLocaleString()} {t.gpus}
                          </div>
                        )}
                      </>
                    ) : (
                      t.unavailable
                    )}
                  </td>
                  <td className="p-2">
                    {c.status === 'supported' ? (
                      <>
                        <div>
                          {t.revenue}: {formatUsdCompact(c.measured.revenue)}
                        </div>
                        <div>
                          {t.profit}: {formatUsdCompact(c.measured.profit)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {c.capacity.modeledDeployments.toLocaleString()} {t.deployments} ·{' '}
                          {c.capacity.modeledGpus.toLocaleString()} {t.gpus}
                        </div>
                        <div className="mt-1 text-xs">
                          {t.perDeployment}: {t.chassis} {c.capacity.chassisAcWattsPerDeployment} W
                          → {t.facility} {c.capacity.facilityWattsPerDeployment} W → {t.planning}{' '}
                          {c.capacity.planningWattsPerDeployment.toFixed(1)} W
                        </div>
                      </>
                    ) : (
                      <>
                        <div>{t.unavailable}</div>
                        <div className="text-xs text-muted-foreground">{reason}</div>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">{t.details}</summary>
        <p className="mt-2">{t.assumptions}</p>
        <p className="mt-2">{t.cost}</p>
        <p className="mt-2">
          {t.revision}:{' '}
          <a
            className="underline break-all"
            href={`https://github.com/SemiAnalysisAI/inferencex_power_model/tree/${comparisons[0]?.modelRevision}`}
          >
            {comparisons[0]?.modelRevision}
          </a>
        </p>
      </details>
    </Card>
  );
}
