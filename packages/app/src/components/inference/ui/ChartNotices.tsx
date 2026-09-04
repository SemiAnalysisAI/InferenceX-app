import type { ReactNode } from 'react';

/** Keep operational notes for the visible official and overlay series below the chart. */
export default function ChartNotices({
  chartId,
  notices,
}: {
  chartId: string;
  notices?: ReactNode;
}) {
  if (!notices) return null;
  return (
    <div
      className="no-export mt-4 space-y-2 border-t border-border/60 py-2.5"
      data-testid={`chart-notices-${chartId}`}
    >
      {notices}
    </div>
  );
}
