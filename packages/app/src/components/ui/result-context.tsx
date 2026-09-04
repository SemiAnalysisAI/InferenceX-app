import type { Locale } from '@/lib/i18n';

export interface ResultContextProps {
  locale: Locale;
  /** Omitted when the chart heading already names the model. */
  model?: string;
  workload?: string;
  precision?: string;
  metric?: string;
  /** Pricing basis of a cost or purchasing-power metric (e.g. "Owning Hyperscaler"). */
  costTier?: string;
  /** Fleet utilization the revenue figures assume (e.g. "60%"). */
  utilization?: string;
  /** Share of revenue paid to the model lab (e.g. "30%"). */
  licenseFee?: string;
  target?: string;
  date?: string;
  dates?: readonly string[];
  dateRange?: { start: string; end: string };
  source?: string;
  costBasis?: string;
  costBasisTestId?: string;
}

/** Compact, reusable context for the values shown in a result chart. */
export function ResultContext({
  locale,
  model,
  workload,
  precision,
  metric,
  costTier,
  utilization,
  licenseFee,
  target,
  date,
  dates,
  dateRange,
  source,
  costBasis,
  costBasisTestId,
}: ResultContextProps) {
  const labels =
    locale === 'zh'
      ? {
          model: '模型',
          workload: '工作负载',
          precision: '精度',
          metric: '指标',
          target: '目标',
          date: '日期',
          range: '日期范围',
          source: '来源',
          cost: '成本口径',
          costTier: '成本层级',
          utilization: '利用率',
          licenseFee: '模型许可费假设',
        }
      : {
          model: 'Model',
          workload: 'Workload',
          precision: 'Precision',
          metric: 'Metric',
          target: 'Target',
          date: 'Date',
          range: 'Date range',
          source: 'Source',
          cost: 'Cost basis',
          costTier: 'Cost Tier',
          utilization: 'Utilization',
          licenseFee: 'Model License Fee Assumption',
        };
  const hasRange = Boolean(dateRange?.start && dateRange.end);
  const selectedDates = dates && dates.length > 1 ? dates.join(', ') : date;
  const dateValue = hasRange ? `${dateRange!.start} → ${dateRange!.end}` : selectedDates;
  const dateLabel = hasRange
    ? labels.range
    : dates && dates.length > 1
      ? locale === 'zh'
        ? '日期'
        : 'Dates'
      : labels.date;

  return (
    <dl
      data-testid="result-context"
      className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
    >
      {model && (
        <div>
          <dt className="inline font-medium text-foreground">{labels.model}:</dt>{' '}
          <dd className="inline">{model}</dd>
        </div>
      )}
      {workload && (
        <div>
          <dt className="inline font-medium text-foreground">{labels.workload}:</dt>{' '}
          <dd className="inline">{workload}</dd>
        </div>
      )}
      {precision && (
        <div>
          <dt className="inline font-medium text-foreground">{labels.precision}:</dt>{' '}
          <dd className="inline">{precision}</dd>
        </div>
      )}
      {metric && (
        <div>
          <dt className="inline font-medium text-foreground">{labels.metric}:</dt>{' '}
          <dd className="inline">{metric}</dd>
        </div>
      )}
      {costTier && (
        <div>
          <dt className="inline font-medium text-foreground">{labels.costTier}:</dt>{' '}
          <dd className="inline" data-testid="result-context-cost-tier">
            {costTier}
          </dd>
        </div>
      )}
      {utilization && (
        <div>
          <dt className="inline font-medium text-foreground">{labels.utilization}:</dt>{' '}
          <dd className="inline" data-testid="result-context-utilization">
            {utilization}
          </dd>
        </div>
      )}
      {licenseFee && (
        <div>
          <dt className="inline font-medium text-foreground">{labels.licenseFee}:</dt>{' '}
          <dd className="inline" data-testid="result-context-license-fee">
            {licenseFee}
          </dd>
        </div>
      )}
      {target && (
        <div>
          <dt className="inline font-medium text-foreground">{labels.target}:</dt>{' '}
          <dd className="inline">{target}</dd>
        </div>
      )}
      {dateValue && (
        <div>
          <dt className="inline font-medium text-foreground">
            {hasRange || (dates && dates.length > 1)
              ? dateLabel
              : locale === 'zh'
                ? '更新时间'
                : 'Updated'}
            :
          </dt>{' '}
          <dd className="inline">{dateValue}</dd>
        </div>
      )}
      {source && (
        <div>
          <dt className="inline font-medium text-foreground">{labels.source}:</dt>{' '}
          <dd className="inline">{source}</dd>
        </div>
      )}
      {costBasis && (
        <div>
          <dt className="inline font-medium text-foreground">{labels.cost}:</dt>{' '}
          <dd className="inline" data-testid={costBasisTestId}>
            {costBasis}
          </dd>
        </div>
      )}
    </dl>
  );
}
