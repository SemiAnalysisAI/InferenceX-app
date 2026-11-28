/**
 * Whether Historical Trends requests its trend history. The availability index resolves the
 * sequence early, so the request starts alongside the model's benchmark rows instead of after
 * them. Once those rows have loaded without an interactivity chart there is nothing to draw, so
 * the request stops and the page shows its no-data state rather than a trend skeleton or error.
 */
export function shouldRequestTrendHistory({
  scenarioResolved,
  chartDataLoading,
  hasInteractivityChart,
}: {
  scenarioResolved: boolean;
  chartDataLoading: boolean;
  hasInteractivityChart: boolean;
}): boolean {
  return scenarioResolved && (chartDataLoading || hasInteractivityChart);
}
