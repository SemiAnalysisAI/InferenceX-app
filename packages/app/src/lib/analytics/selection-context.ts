/**
 * Dashboard state attached to chart events (PNG, CSV and MP4 exports, zoom reset) and to the
 * `inference_*_selected` events, so they can be split by what the user was looking at. Keys use the
 * canonical property names. Missing values are left out instead of being sent empty.
 */
export interface SelectionAnalyticsContext {
  model?: string;
  sequence?: string;
  /** Comma-joined when several precisions are selected. */
  precision?: string;
  gpu_count?: number;
}

export function selectionAnalyticsContext(selection: {
  model?: string | null;
  sequence?: string | null;
  precisions?: readonly string[] | null;
  gpuCount?: number | null;
}): SelectionAnalyticsContext {
  const context: SelectionAnalyticsContext = {};
  if (selection.model) context.model = selection.model;
  if (selection.sequence) context.sequence = selection.sequence;
  if (selection.precisions?.length) context.precision = selection.precisions.join(',');
  if (typeof selection.gpuCount === 'number') context.gpu_count = selection.gpuCount;
  return context;
}
