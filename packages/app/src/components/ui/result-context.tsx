import type { ReactNode } from 'react';

import type { Locale } from '@/lib/i18n/i18n';
import { formatDisplayDate } from '@/lib/shared/display-date';
import { cn } from '@/lib/shared/utils';

export const captionControlTriggerClassName =
  'h-6 md:h-6 w-auto gap-1 rounded-sm border-input bg-transparent px-1.5 py-0 text-xs font-medium text-foreground shadow-none hover:bg-muted/60 dark:bg-transparent dark:hover:bg-muted/60 [&_svg]:size-3';

export const sourceLinkClassName = 'text-brand hover:underline';

export interface ResultContextProps {
  locale: Locale;
  model?: string;
  workload?: string;
  scenario?: ReactNode;
  precision?: string;
  metric?: string;
  costTier?: string;
  costTierControl?: ReactNode;
  tcoBasis?: ReactNode;
  chipBasis?: ReactNode;
  utilization?: string;
  utilizationControl?: ReactNode;
  utilizationControlId?: string;
  licenseFee?: string;
  licenseFeeControl?: ReactNode;
  licenseFeeControlId?: string;
  target?: string;
  date?: string;
  dates?: readonly string[];
  dateRange?: { start: string; end: string };
  source?: string;
  deprecated?: boolean;
  costBasis?: string;
  costBasisTestId?: string;
  layout?: 'footer';
  controlsEnd?: ReactNode;
  markers?: ReactNode;
  metaEnd?: ReactNode;
}

const META_ITEM = "after:ml-2 after:text-muted-foreground/60 after:content-['·']";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;

const metaDate = (value: string, locale: Locale) =>
  ISO_DATE.test(value) ? formatDisplayDate(value, locale) : value;

export function CaptionField({
  label,
  value,
  control,
  controlId,
  testId,
  hideLabel = false,
}: {
  label: string;
  value: string;
  control?: ReactNode;
  controlId?: string;
  testId: string;
  hideLabel?: boolean;
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
      {hideLabel ? (
        <dt>
          {controlId ? (
            <label htmlFor={controlId} className="sr-only">
              {label}
            </label>
          ) : (
            <span className="sr-only">{label}</span>
          )}
          <span aria-hidden className="export-only hidden font-medium text-foreground">
            {label}:
          </span>
        </dt>
      ) : (
        <dt className="font-medium text-foreground">
          {controlId ? <label htmlFor={controlId}>{label}:</label> : <>{label}:</>}
        </dt>
      )}{' '}
      <dd className="inline" data-testid={testId}>
        <span className="no-export inline-flex items-center align-middle">{control}</span>
        <span className="export-only hidden">{value}</span>
      </dd>
    </div>
  );
}

export function ResultContext({
  locale,
  model,
  workload,
  scenario,
  precision,
  metric,
  costTier,
  costTierControl,
  tcoBasis,
  chipBasis,
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
  deprecated = false,
  costBasis,
  costBasisTestId,
  layout,
  controlsEnd,
  markers,
  metaEnd,
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
          costTier: 'Cost tier',
          utilization: 'Utilization',
          licenseFee: 'Model license fee assumption',
        };
  const hasRange = Boolean(dateRange?.start && dateRange.end);
  const selectedDates =
    dates && dates.length > 1 ? dates.map((d) => metaDate(d, locale)).join(', ') : date;
  const dateValue = hasRange
    ? `${metaDate(dateRange!.start, locale)} → ${metaDate(dateRange!.end, locale)}`
    : selectedDates && metaDate(selectedDates, locale);
  const dateLabel = hasRange
    ? labels.range
    : dates && dates.length > 1
      ? locale === 'zh'
        ? '日期'
        : 'Dates'
      : labels.date;

  if (layout === 'footer') {
    const singleDate = !hasRange && !(dates && dates.length > 1);
    return (
      <div data-testid="result-context" className="mb-2 text-xs text-muted-foreground">
        {(scenario ||
          costTier ||
          utilization ||
          licenseFee ||
          tcoBasis ||
          chipBasis ||
          controlsEnd) && (
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            <dl className="contents">
              {scenario}
              {precision && (
                <div>
                  <dt className="inline font-medium text-foreground">{labels.precision}:</dt>{' '}
                  <dd className="inline">{precision}</dd>
                </div>
              )}
              {costTier && (
                <CaptionField
                  label={labels.costTier}
                  value={costTier}
                  control={costTierControl}
                  testId="result-context-cost-tier"
                  hideLabel
                />
              )}
              {utilization && (
                <CaptionField
                  label={labels.utilization}
                  value={utilization}
                  control={utilizationControl}
                  controlId={utilizationControlId}
                  testId="result-context-utilization"
                  hideLabel
                />
              )}
              {licenseFee && (
                <CaptionField
                  label={labels.licenseFee}
                  value={licenseFee}
                  control={licenseFeeControl}
                  controlId={licenseFeeControlId}
                  testId="result-context-license-fee"
                  hideLabel
                />
              )}
              {tcoBasis}
              {chipBasis}
            </dl>
            {controlsEnd && <div className="ml-auto max-w-full min-w-0">{controlsEnd}</div>}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <dl className={cn('contents', !markers && '[&>:last-child]:after:content-none')}>
            {dateValue && (
              <div className={META_ITEM}>
                <dt className="inline">
                  {singleDate ? (locale === 'zh' ? '更新时间' : 'Updated') : `${dateLabel}:`}
                </dt>{' '}
                <dd className="inline tabular-nums">{dateValue}</dd>
              </div>
            )}
            {source && (
              <div className={META_ITEM}>
                <dt className="sr-only">{labels.source}</dt>
                <dd className="inline">
                  {source}
                  {deprecated && (locale === 'zh' ? ' (已弃用)' : ' (deprecated)')}
                </dd>
              </div>
            )}
            {costBasis && (
              <div className={META_ITEM}>
                <dt className="inline">{labels.cost}:</dt>{' '}
                <dd className="inline" data-testid={costBasisTestId}>
                  {costBasis}
                </dd>
              </div>
            )}
          </dl>
          {markers && (
            <div data-testid="result-context-markers" className="inline-flex items-center">
              {markers}
            </div>
          )}
          {metaEnd && <div className="ml-auto">{metaEnd}</div>}
        </div>
      </div>
    );
  }

  return (
    <dl
      data-testid="result-context"
      className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"
    >
      {scenario}
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
      {tcoBasis}
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
          <dd className="inline">
            {source}
            {deprecated && (locale === 'zh' ? ' (已弃用)' : ' (Deprecated)')}
          </dd>
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
