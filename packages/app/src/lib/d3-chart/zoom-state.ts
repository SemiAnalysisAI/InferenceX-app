import { useSyncExternalStore } from 'react';

/**
 * Charts that are zoomed or panned away from their default view, keyed by the zoom-reset event
 * name that their reset button fires. A name can be shared by several charts, so each chart
 * registers under its own token.
 */
const zoomedCharts = new Map<string, Set<symbol>>();
const listeners = new Set<() => void>();

export function setChartZoomed(resetEventName: string, chart: symbol, zoomed: boolean): void {
  const charts = zoomedCharts.get(resetEventName);
  if (zoomed === (charts?.has(chart) ?? false)) return;
  if (zoomed) {
    if (charts) charts.add(chart);
    else zoomedCharts.set(resetEventName, new Set([chart]));
  } else if (charts) {
    charts.delete(chart);
    if (charts.size === 0) zoomedCharts.delete(resetEventName);
  }
  for (const listener of listeners) listener();
}

export function isChartZoomed(resetEventName: string): boolean {
  return zoomedCharts.has(resetEventName);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Whether any chart answering `resetEventName` is away from its default zoom. */
export function useChartZoomed(resetEventName: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => isChartZoomed(resetEventName),
    () => false,
  );
}
