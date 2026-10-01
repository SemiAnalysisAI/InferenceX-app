'use client';

import { useEffect, useMemo, useState } from 'react';

import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { track } from '@/lib/analytics';
import { useLocale } from '@/lib/use-locale';
import type { AggDataEntry, InferenceData } from '../types';
import {
  buildEqualServiceComparison,
  getEqualServiceRange,
  getEqualServiceSources,
  type EqualServiceReason,
} from '../utils/equal-service-comparison';
import {
  buildMatchedConcurrencyTable,
  type MatchedConcurrencyRow,
  type MatchedConcurrencySide,
} from '../utils/matched-concurrency';

const STRINGS = {
  en: {
    baseline: 'Baseline',
    comparator: 'Compare with',
    match: 'Match by',
    concurrency: 'Same concurrency',
    service: 'Same speed / latency',
    target: 'Target',
    metric: 'Metric',
    difference: 'Difference',
    load: 'Concurrency',
    power: 'Mean GPU power (W/GPU)',
    energy: 'GPU energy (J/output token)',
    units: 'Measured GPU power and output-token energy. Differences are relative to the baseline.',
    loadNote: 'The same concurrency can have different response speeds.',
    interpolated: 'Interpolated',
    missing: 'Not measured',
    ambiguous: 'Conflicting measurements',
    choose: 'Choose two configurations from the current dashboard selection.',
    unavailable: 'Selection no longer visible',
    empty:
      'These configurations have no comparable power or energy measurements at the same concurrency.',
    noRange:
      'These configurations have no overlapping speed / latency range. Try another pair or compare at the same concurrency.',
    range: 'Shared range',
  },
  zh: {
    baseline: '基准配置',
    comparator: '对比配置',
    match: '匹配条件',
    concurrency: '相同并发数',
    service: '相同速度 / 延迟',
    target: '目标值',
    metric: '指标',
    difference: '差值',
    load: '并发数',
    power: '平均 GPU 功耗（W/GPU）',
    energy: 'GPU 能耗（J/output token）',
    units: '比较实测 GPU 功耗和每输出 token 能耗，差值均相对于基准配置计算。',
    loadNote: '相同并发数不代表相同响应速度。',
    interpolated: '插值估算',
    missing: '未测得',
    ambiguous: '观测值冲突',
    choose: '请从当前仪表板筛选出的配置中选择两个进行比较。',
    unavailable: '所选配置已不可见',
    empty: '这两个配置在相同并发数下没有可比较的功耗或能耗数据。',
    noRange: '这两个配置的速度 / 延迟范围没有交集。请选择其他配置，或改为按相同并发数比较。',
    range: '共同范围',
  },
};
const REASONS: Record<EqualServiceReason, [string, string]> = {
  'unsupported-axis': ['Choose a speed or latency X-axis.', '请选择速度或延迟横轴。'],
  'invalid-target': ['Enter a positive target.', '请输入大于零的目标值。'],
  'same-source': ['Choose two different configurations.', '请选择两个不同的配置。'],
  'unknown-source': [
    'A selected configuration is no longer visible.',
    '所选配置已不在当前可见数据中。',
  ],
  'out-of-range': ['Target is outside the shared range.', '目标值超出共同范围。'],
  'ambiguous-x': [
    'Conflicting measurements at this speed / latency.',
    '该速度 / 延迟下的观测值冲突。',
  ],
  'missing-metric': ['A required measurement is unavailable.', '缺少计算所需的实测值。'],
};
const format = (value: number) =>
  new Intl.NumberFormat('en-US', { maximumSignificantDigits: 4 }).format(value);
const signed = (value: number) => `${value > 0 ? '+' : ''}${format(value)}`;
const difference = (a: number | null, b: number | null, percent: number | null, unit: string) =>
  a === null || b === null || percent === null
    ? '—'
    : `${signed(b - a)} ${unit} (${signed(percent)}%)`;

export default function PowerComparisonTable({
  data,
  xField,
  xLabel,
  interactivityField,
}: {
  data: InferenceData[];
  xField: keyof AggDataEntry;
  xLabel: string;
  interactivityField: keyof AggDataEntry;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const sources = useMemo(() => getEqualServiceSources(data, locale), [data, locale]);
  const [baseline, setBaseline] = useState(() => sources[0]?.key ?? '');
  const [comparator, setComparator] = useState(() => sources[1]?.key ?? '');
  const [match, setMatch] = useState('concurrency');
  const [target, setTarget] = useState<string | null>(null);
  const validPair =
    baseline !== comparator &&
    sources.some((s) => s.key === baseline) &&
    sources.some((s) => s.key === comparator);
  const service = match === 'service' && xField !== 'conc';
  useEffect(() => setTarget(null), [xField]);
  const range = useMemo(
    () => getEqualServiceRange(data, { baseline, comparator, xField }),
    [data, baseline, comparator, xField],
  );
  const resolvedTarget = target ?? (range ? String(range.min + (range.max - range.min) / 2) : '');
  const comparison = useMemo(
    () =>
      buildEqualServiceComparison(data, {
        baseline,
        comparator,
        xField,
        target: Number(resolvedTarget),
      }),
    [data, baseline, comparator, xField, resolvedTarget],
  );
  const matched = useMemo(
    () => buildMatchedConcurrencyTable(data, { baseline, comparator, interactivityField }),
    [data, baseline, comparator, interactivityField],
  );
  const reason = (value?: EqualServiceReason) =>
    value ? REASONS[value][locale === 'zh' ? 1 : 0] : t.missing;
  const reading = (side: MatchedConcurrencySide) => {
    if (side.status !== 'observed') return side.status === 'missing' ? t.missing : t.ambiguous;
    const { meanWattsPerGpu: watts, joulesPerOutputToken: energy } = side.values;
    return (
      <div className="space-y-1 whitespace-nowrap">
        <div>{watts === null ? t.missing : `${format(watts)} W/GPU`}</div>
        <div>{energy === null ? t.missing : `${format(energy)} J/output token`}</div>
      </div>
    );
  };
  const columns: DataTableColumn<MatchedConcurrencyRow>[] = [
    {
      header: t.load,
      cell: (row) => row.concurrency,
      sortValue: (row) => row.concurrency,
    },
    { header: t.baseline, cell: (row) => reading(row.baseline) },
    { header: t.comparator, cell: (row) => reading(row.comparator) },
    {
      header: t.difference,
      cell: (row) => {
        if (row.baseline.status !== 'observed' || row.comparator.status !== 'observed') return '—';
        return (
          <div className="space-y-1 whitespace-nowrap">
            <div>
              {difference(
                row.baseline.values.meanWattsPerGpu,
                row.comparator.values.meanWattsPerGpu,
                row.changePercent.meanWattsPerGpu,
                'W/GPU',
              )}
            </div>
            <div>
              {difference(
                row.baseline.values.joulesPerOutputToken,
                row.comparator.values.joulesPerOutputToken,
                row.changePercent.joulesPerOutputToken,
                'J/output token',
              )}
            </div>
          </div>
        );
      },
    },
  ];
  const hasMatchedRows = matched.rows.some(
    (row) =>
      row.changePercent.meanWattsPerGpu !== null ||
      row.changePercent.joulesPerOutputToken !== null ||
      row.baseline.status === 'ambiguous' ||
      row.comparator.status === 'ambiguous',
  );
  const selectClass = 'w-full min-w-0 rounded-md border bg-background px-3 py-2 text-sm';
  const selectSource = (
    value: string,
    setValue: (value: string) => void,
    label: string,
    id: string,
  ) => (
    <label className="min-w-0 space-y-1 text-sm">
      <span>{label}</span>
      <select
        className={selectClass}
        value={value}
        aria-label={label}
        data-testid={id}
        onChange={(event) => {
          setValue(event.target.value);
          setTarget(null);
          track('inference_table_power_source_changed', { role: id });
        }}
      >
        {!sources.some((s) => s.key === value) && (
          <option value={value}>{value ? t.unavailable : '—'}</option>
        )}
        {sources.map((source) => (
          <option key={source.key} value={source.key}>
            {source.label}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="min-w-0 space-y-3" data-testid="power-comparison-table">
      <div className="grid min-w-0 gap-3 md:grid-cols-2">
        {selectSource(baseline, setBaseline, t.baseline, 'power-table-baseline')}
        {selectSource(comparator, setComparator, t.comparator, 'power-table-comparator')}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 space-y-1 text-sm">
          <span>{t.match}</span>
          <select
            className={selectClass}
            value={service ? 'service' : 'concurrency'}
            aria-label={t.match}
            data-testid="power-table-match"
            onChange={(event) => {
              setMatch(event.target.value);
              track('inference_table_power_match_changed', { mode: event.target.value });
            }}
          >
            <option value="concurrency">{t.concurrency}</option>
            <option value="service" disabled={xField === 'conc'}>
              {t.service}
            </option>
          </select>
        </label>
        {service && range && (
          <label className="w-full min-w-0 space-y-1 text-sm md:w-auto md:flex-1">
            <span>
              {t.target} · {xLabel}
            </span>
            <input
              className={selectClass}
              type="number"
              min={range.min}
              max={range.max}
              step="any"
              aria-label={`${t.target} · ${xLabel}`}
              data-testid="power-table-target"
              value={resolvedTarget}
              onChange={(event) => setTarget(event.target.value)}
            />
            <span className="block text-xs text-muted-foreground">
              {t.range}: {format(range.min)}–{format(range.max)}
            </span>
          </label>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        {t.units} {!service && t.loadNote}
      </p>
      {validPair ? (
        service ? (
          range ? (
            <DataTable
              data={(['meanWattsPerGpu', 'joulesPerOutputToken'] as const).map((key) => ({
                key,
                ...comparison.metrics[key],
              }))}
              columns={[
                {
                  header: t.metric,
                  cell: (row) => (row.key === 'meanWattsPerGpu' ? t.power : t.energy),
                },
                {
                  header: t.baseline,
                  cell: (row) =>
                    row.baseline ? (
                      <>
                        {format(row.baseline.value)}
                        {row.baseline.interpolated && (
                          <span className="block text-xs text-muted-foreground">
                            {t.interpolated}
                          </span>
                        )}
                      </>
                    ) : (
                      reason(row.reason)
                    ),
                },
                {
                  header: t.comparator,
                  cell: (row) =>
                    row.comparator ? (
                      <>
                        {format(row.comparator.value)}
                        {row.comparator.interpolated && (
                          <span className="block text-xs text-muted-foreground">
                            {t.interpolated}
                          </span>
                        )}
                      </>
                    ) : (
                      reason(row.reason)
                    ),
                },
                {
                  header: t.difference,
                  cell: (row) =>
                    difference(
                      row.baseline?.value ?? null,
                      row.comparator?.value ?? null,
                      row.changePercent,
                      row.key === 'meanWattsPerGpu' ? 'W/GPU' : 'J/output token',
                    ),
                },
              ]}
              searchable={false}
              testId="power-service-results"
              analyticsPrefix="inference_table_power_service"
            />
          ) : (
            <p role="status" className="text-sm">
              {t.noRange}
            </p>
          )
        ) : hasMatchedRows ? (
          <DataTable
            data={matched.rows}
            columns={columns}
            searchable={false}
            testId="power-concurrency-results"
            analyticsPrefix="inference_table_power_concurrency"
          />
        ) : (
          <p role="status" className="text-sm">
            {t.empty}
          </p>
        )
      ) : (
        <p role="status" className="text-sm">
          {t.choose}
        </p>
      )}
    </div>
  );
}
