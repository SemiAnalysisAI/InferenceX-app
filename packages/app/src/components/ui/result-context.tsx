import type { ReactNode } from 'react';

import type { Locale } from '@/lib/i18n';

/**
 * Trigger styling for a select that sits inside the caption's Cost Tier
 * line: sized to the caption's text line rather than a form control, with a
 * visible outline so readers can tell the tier is a control, not a label.
 */
export const captionControlTriggerClassName =
  'h-6 md:h-6 w-auto gap-1 rounded-sm border-input bg-transparent px-1.5 py-0 text-xs font-medium text-foreground shadow-none hover:bg-muted/60 dark:bg-transparent dark:hover:bg-muted/60 [&_svg]:size-3';

export interface ResultContextProps {
  locale: Locale;
  /** Omitted when the chart heading already names the model. */
  model?: string;
  workload?: string;
  precision?: string;
  metric?: string;
  /** Pricing basis of a cost or purchasing-power metric (e.g. "Owning at Large Hyperscaler Volume"). */
  costTier?: string;
  /**
   * Interactive replacement for the `costTier` text, e.g. the inline Cost
   * Tier selector on the inference dashboard. The plain `costTier` label is
   * still rendered as an `export-only` twin so PNG exports keep the text
   * while the control itself stays `no-export`.
   */
  costTierControl?: ReactNode;
  /** Fleet utilization the revenue figures assume (e.g. "60%"). */
  utilization?: string;
  /** Inline editor for `utilization`; rendered like `costTierControl`. */
  utilizationControl?: ReactNode;
  /** Id of the input inside `utilizationControl`, so the caption label names it. */
  utilizationControlId?: string;
  /** Share of revenue paid to the model lab (e.g. "30%"). */
  licenseFee?: string;
  /** Inline editor for `licenseFee`; rendered like `costTierControl`. */
  licenseFeeControl?: ReactNode;
  /** Id of the input inside `licenseFeeControl`, so the caption label names it. */
  licenseFeeControlId?: string;
  target?: string;
  date?: string;
  dates?: readonly string[];
  dateRange?: { start: string; end: string };
  source?: string;
  costBasis?: string;
  costBasisTestId?: string;
}

/**
 * One caption entry. With a `control`, the interactive element renders in a
 * `.no-export` span and the plain `value` stays as an `export-only` twin, so
 * PNG exports print the text the control stands for. `controlId` turns the
 * term into a `<label>` for the control's input.
 */
function CaptionField({
  label,
  value,
  control,
  controlId,
  testId,
}: {
  label: string;
  value: string;
  control?: ReactNode;
  controlId?: string;
  testId: string;
}) {
  if (!control) {
    return (
      <div>
        <dt className="inline font-medium text-foreground">{label}:</dt>{' '}
        <dd className="inline" data-testid={testId}>
          {value}
        </dd>
      </div>
    );
  }
  return (
    <div className="inline-flex flex-wrap items-center gap-x-1">
      {/* The space keeps textContent identical to the plain-text variant. */}
      <dt className="font-medium text-foreground">
        {controlId ? <label htmlFor={controlId}>{label}:</label> : <>{label}:</>}
      </dt>{' '}
      <dd className="inline-flex items-center" data-testid={testId}>
        <span className="no-export inline-flex items-center">{control}</span>
        <span className="export-only hidden">{value}</span>
      </dd>
    </div>
  );
}

/** Compact, reusable context for the values shown in a result chart. */
export function ResultContext({
  locale,
  model,
  workload,
  precision,
  metric,
  costTier,
  costTierControl,
  utilization,
  utilizationControl,
  utilizationControlId,
  licenseFee,
  licenseFeeControl,
  licenseFeeControlId,
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
      className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"
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
        <CaptionField
          label={labels.costTier}
          value={costTier}
          control={costTierControl}
          testId="result-context-cost-tier"
        />
      )}
      {utilization && (
        <CaptionField
          label={labels.utilization}
          value={utilization}
          control={utilizationControl}
          controlId={utilizationControlId}
          testId="result-context-utilization"
        />
      )}
      {licenseFee && (
        <CaptionField
          label={labels.licenseFee}
          value={licenseFee}
          control={licenseFeeControl}
          controlId={licenseFeeControlId}
          testId="result-context-license-fee"
        />
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
