'use client';

import { Button } from '@/components/ui/button';
import { powerMetricState } from '@/components/inference/utils/power-metric-availability';
import { track } from '@/lib/analytics';
import { exportToCsv } from '@/lib/csv-export';
import { getInferenceHardwareConfig } from '@/lib/inference-labels';
import { overlayRunColor } from '@/lib/overlay-run-style';
import { useLocale } from '@/lib/use-locale';
import { getDisplayLabel } from '@/lib/utils';
import type { RenderedIsoRow } from './rendered-iso';
import { getPowerXMetric } from './powerx-data';
import { POWERX_STRINGS } from './powerx-copy';

const STRINGS = {
  en: {
    title: 'Compare at equal interactivity / latency',
    scope:
      'Uses the visible chart curves and current filters, including unofficial runs. Curve estimates follow the plotted power boundary or Pareto frontier; they are not additional measurements. No extrapolation.',
    target: 'Enter a positive target for the current X axis.',
    iso: 'ISO target',
    config: 'Configuration',
    status: 'Result',
    sources: 'Source points',
    official: 'Official',
    unofficial: 'Unofficial',
    csv: 'Export ISO CSV',
    updating: 'Updating comparison…',
    empty: 'No visible curve can be compared for this selection.',
    statuses: {
      exact: 'Chart point',
      curve: 'Curve estimate',
      'outside-range': 'Outside tested range',
      missing: 'No rendered curve',
      ambiguous: 'Multiple points at the same X',
    },
    derivedPoint: 'Derived point',
    evidence: {
      strict: 'Validated · schema 2',
      validated: 'Validated · other schema',
      unverified: 'No validation verdict',
      invalid: 'Validation failed',
      inapplicable: 'No separate worker pools',
      ambiguous: 'Energy schema unavailable',
      missing: 'Metric not reported',
    },
  },
  zh: {
    title: '在相同交互性或延迟下比较',
    scope:
      '沿用当前筛选条件与已显示曲线，包含非官方运行。曲线估值取自图中的功耗边界或 Pareto 前沿，并非额外测量结果。不进行外推。',
    target: '请输入当前 X 轴下大于零的目标值。',
    iso: 'ISO 目标值',
    config: '配置',
    status: '结果',
    sources: '来源数据点',
    official: '官方',
    unofficial: '非官方',
    csv: '导出 ISO CSV',
    updating: '正在更新比较结果…',
    empty: '当前选择下没有可比较的已显示曲线。',
    statuses: {
      exact: '图表数据点',
      curve: '曲线估值',
      'outside-range': '超出测试范围',
      missing: '无已绘制曲线',
      ambiguous: '相同 X 值对应多个数据点',
    },
    derivedPoint: '计算数据点',
    evidence: {
      strict: '已验证 · schema 2',
      validated: '已验证 · 其他 schema',
      unverified: '未提供验证结论',
      invalid: '验证失败',
      inapplicable: '无独立 worker 池',
      ambiguous: '缺少能耗 schema',
      missing: '未提供此指标',
    },
  },
} as const;

export default function PowerXComparison({
  rows,
  pending = false,
  metric,
  xField,
  xLabel,
  yLabel,
  chartId,
  target,
  onTargetChange,
}: {
  rows: readonly RenderedIsoRow[];
  pending?: boolean;
  metric: string;
  xField: string;
  xLabel: string;
  yLabel: string;
  chartId: string;
  target: string;
  onTargetChange: (target: string) => void;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const spec = getPowerXMetric(metric);
  const boundaryNote =
    spec?.basis === 'utility-modeled'
      ? POWERX_STRINGS[locale].model
      : spec
        ? POWERX_STRINGS[locale].provisioned
        : '';
  const measured = metric.startsWith('y_measured');
  const validTarget = Number.isFinite(Number(target)) && Number(target) > 0;
  const evidence = (row: RenderedIsoRow) =>
    measured || spec?.basis === 'utility-modeled'
      ? [...new Set(row.sources.map((point) => powerMetricState(point, metric)))]
      : [];
  const exportIso = () => {
    exportToCsv(
      `${chartId}-powerx-iso`,
      [
        'Metric',
        'Y Axis',
        'X Field',
        'ISO Target',
        'Hardware',
        'Precision',
        'Date',
        'Provenance',
        'Overlay Index',
        'Series',
        'Status',
        'Value',
        'Validation',
        'Source Point IDs',
        'Source Concurrency',
        'Source X',
        'Run URLs',
        'Source Dates',
        'Source Frameworks',
        'Power Boundary',
        'Model Revision',
        'PUE',
        'Chassis Basis',
        'Recipe Fingerprints',
        'Images',
        'Power Validation',
        'Power Schema',
      ],
      rows.map((row) => {
        const source = row.points[0];
        return [
          metric,
          yLabel,
          xField,
          target,
          source?.hwKey,
          source?.precision,
          source?.date,
          row.overlayIndex === undefined ? 'official' : 'unofficial',
          row.overlayIndex,
          row.key,
          row.status,
          row.value,
          evidence(row).join(';'),
          row.sources.map((point) => point.id ?? '').join(';'),
          row.sources.map((point) => point.conc).join(';'),
          row.sources.map((point) => point.x).join(';'),
          [...new Set(row.sources.map((point) => point.run_url).filter(Boolean))].join(';'),
          [
            ...new Set(row.sources.map((point) => point.actualDate ?? point.date).filter(Boolean)),
          ].join(';'),
          [...new Set(row.sources.map((point) => point.framework).filter(Boolean))].join(';'),
          spec?.basis ?? 'gpu-measured',
          [
            ...new Set(
              row.sources
                .map((point) =>
                  spec?.basis === 'utility-modeled'
                    ? point.modeledSystemPower?.modelRevision
                    : undefined,
                )
                .filter(Boolean),
            ),
          ].join(';'),
          [
            ...new Set(
              row.sources.flatMap((point) =>
                spec?.basis === 'utility-modeled' &&
                point.modeledSystemPower?.status === 'supported'
                  ? [point.modeledSystemPower.pue]
                  : [],
              ),
            ),
          ].join(';'),
          [
            ...new Set(
              row.sources.flatMap((point) =>
                spec?.basis === 'utility-modeled' &&
                point.modeledSystemPower?.status === 'supported'
                  ? [point.modeledSystemPower.chassisBasis]
                  : [],
              ),
            ),
          ].join(';'),
          [...new Set(row.sources.map((point) => point.recipe_fingerprint).filter(Boolean))].join(
            ';',
          ),
          [...new Set(row.sources.map((point) => point.image).filter(Boolean))].join(';'),
          row.sources.map((point) => point.power_valid ?? '').join(';'),
          row.sources.map((point) => point.power_metric_schema_version ?? '').join(';'),
        ];
      }),
      [t.scope, boundaryNote].filter(Boolean),
    );
    track('inference_powerx_iso_exported', { metric, xField });
  };
  return (
    <section className="mt-3 space-y-2 text-sm" data-testid="powerx-comparison">
      <details
        className="rounded-md border p-3"
        onToggle={(event) => {
          if (event.currentTarget.open) track('inference_powerx_iso_opened', { metric });
        }}
      >
        <summary className="cursor-pointer font-medium">{t.title}</summary>
        <div className="mt-3 space-y-3">
          <p className="text-xs text-muted-foreground">{t.scope}</p>
          {boundaryNote && <p className="text-xs text-muted-foreground">{boundaryNote}</p>}
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1 text-xs" htmlFor={`${chartId}-powerx-iso`}>
              <span className="block">
                {t.iso} · {xLabel}
              </span>
              <input
                id={`${chartId}-powerx-iso`}
                data-testid="powerx-iso"
                type="number"
                min="0"
                step="any"
                className="w-44 rounded-md border bg-background px-3 py-2 text-sm"
                value={target}
                onChange={(event) => onTargetChange(event.target.value)}
                onBlur={() => track('inference_powerx_iso_changed', { xField, target })}
              />
            </label>
            <Button
              variant="outline"
              size="sm"
              data-testid="powerx-iso-csv"
              disabled={pending || !validTarget || rows.length === 0}
              onClick={exportIso}
            >
              {t.csv}
            </Button>
          </div>
          {!validTarget && <p className="text-xs text-muted-foreground">{t.target}</p>}
          {(pending || rows.length === 0) && (
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {pending ? t.updating : t.empty}
            </p>
          )}
          <div className="overflow-x-auto">
            <table
              className="w-full min-w-[36rem] text-left text-xs"
              data-testid="powerx-iso-table"
            >
              <caption className="sr-only">
                {t.title} · {yLabel}
              </caption>
              <thead>
                <tr>
                  {[t.config, yLabel, t.status, t.sources].map((label) => (
                    <th key={label} className="p-2" scope="col">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const source = row.points[0];
                  if (!source) return null;
                  return (
                    <tr
                      key={row.key}
                      className="border-t"
                      data-iso-status={row.status}
                      data-iso-value={row.value ?? undefined}
                    >
                      <th className="p-2 font-normal" scope="row">
                        {getDisplayLabel(
                          getInferenceHardwareConfig(
                            String(source.hwKey),
                            source.model,
                            row.points,
                          ),
                        )}
                        <span
                          className="ml-1"
                          style={
                            row.overlayIndex === undefined
                              ? undefined
                              : { color: overlayRunColor(row.overlayIndex) }
                          }
                        >
                          ·{' '}
                          {row.overlayIndex === undefined
                            ? t.official
                            : `${t.unofficial} ${row.overlayIndex + 1}`}
                        </span>
                        <div className="text-muted-foreground">
                          {source.precision} · {source.date}
                        </div>
                      </th>
                      <td className="p-2 tabular-nums">
                        {row.value === null ? '—' : row.value.toFixed(3)}
                      </td>
                      <td className="p-2">
                        {row.status === 'exact' && !measured
                          ? t.derivedPoint
                          : t.statuses[row.status]}
                        {evidence(row).map((state) => (
                          <div key={state} className="text-muted-foreground">
                            {t.evidence[state]}
                          </div>
                        ))}
                      </td>
                      <td className="p-2">
                        {row.sources.map((point, index) => (
                          <span key={index} className="mr-2 inline-block">
                            {point.run_url &&
                            /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/actions\/runs\/\d+(?:\/attempts\/\d+)?$/u.test(
                              point.run_url,
                            ) ? (
                              <a
                                className="underline"
                                href={point.run_url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                c{point.conc} · #{point.id ?? '—'}
                              </a>
                            ) : (
                              `c${point.conc} · #${point.id ?? '—'}`
                            )}
                          </span>
                        ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </details>
    </section>
  );
}
