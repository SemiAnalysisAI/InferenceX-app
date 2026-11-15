'use client';

import type { SlaConfigView } from '@/lib/sla-targets/view';

import { formatUsd } from './sla-format';
import type { SlaStrings } from './sla-strings';

/**
 * Qualifying configurations by estimated cost per 1,000 compliant requests,
 * cheapest first. Configurations without a verdict, exploratory ones included,
 * are never listed.
 */
export function SlaCostComparison({
  t,
  rows,
  colors,
}: {
  t: SlaStrings;
  rows: SlaConfigView[];
  colors: Record<string, string>;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="sla-cost-empty">
        {t.costEmpty}
      </p>
    );
  }
  const costs = rows.map((row) => row.selections.lowestCost?.result?.costPer1kCompliantUsd ?? null);
  const highest = Math.max(...costs.map((cost) => cost ?? 0));
  return (
    <ol className="flex flex-col gap-3" data-testid="sla-cost-list">
      {rows.map((row, index) => {
        const cost = costs[index];
        const point = row.selections.lowestCost;
        return (
          <li key={row.config.key} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1">
            <span className="min-w-0 text-sm">
              <span className="font-medium">{row.hardwareLabel}</span>{' '}
              <span className="text-muted-foreground">{row.servingLabel}</span>
            </span>
            <span className="text-right text-sm tabular-nums">
              {cost === null ? (
                <span className="text-muted-foreground">{t.costNoPrice}</span>
              ) : (
                <>
                  <span className="font-medium">{formatUsd(cost)}</span>{' '}
                  <span className="text-muted-foreground">
                    {point ? t.at(t.load(row.config.loadKind, point.concurrency)) : ''}
                    {' · '}
                    {t.perGpuHour(formatUsd(row.gpuHourUsd))}
                  </span>
                </>
              )}
            </span>
            <span className="col-span-full h-1.5 rounded-full bg-muted" aria-hidden="true">
              {cost !== null && highest > 0 && (
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${Math.max(2, (cost / highest) * 100)}%`,
                    backgroundColor: colors[row.config.key],
                  }}
                />
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
