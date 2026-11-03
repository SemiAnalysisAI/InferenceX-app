import type { ReactNode } from 'react';

export interface ChartHoverCardMetricItem {
  value: ReactNode;
  label: ReactNode;
  color?: string;
}

/** React twin of `chartHoverCard` for charts that render their own tooltip surface. */
export function ChartHoverCardBody({
  title,
  subtitle,
  color,
  metrics,
  summary,
  warning,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  color?: string;
  metrics: ChartHoverCardMetricItem[];
  summary?: ReactNode;
  warning?: ReactNode;
}) {
  return (
    <div className="max-w-[min(280px,calc(100vw-16px))] text-xs">
      {warning && <div className="mb-1 text-2xs font-semibold text-warning">{warning}</div>}
      {(title || subtitle) && (
        <div className="mb-2 flex items-center gap-1.5 font-semibold text-foreground">
          {color && <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />}
          <span className="min-w-0">
            {title}
            {subtitle && <span className="font-normal text-muted-foreground"> {subtitle}</span>}
          </span>
        </div>
      )}
      {metrics.length > 0 && (
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          {metrics.map((m, i) => (
            <div key={i} className="min-w-0">
              <div className="text-base leading-tight font-semibold tabular-nums whitespace-nowrap text-foreground">
                {m.value}
              </div>
              <div className="flex items-center gap-1 text-2xs leading-[14px] text-muted-foreground">
                {m.color && (
                  <span
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ background: m.color }}
                  />
                )}
                {m.label}
              </div>
            </div>
          ))}
        </div>
      )}
      {summary && (
        <div className="mt-1.5 text-2xs leading-[14px] tabular-nums text-muted-foreground">
          {summary}
        </div>
      )}
    </div>
  );
}
