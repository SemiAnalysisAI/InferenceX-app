/**
 * Shared geometry for the paired charts under the frontier chart, so side-by-side panels
 * have the same plot height and their x axes line up.
 */
export const PANEL_HEIGHT = 240;
export const PANEL_MARGIN = { top: 16, right: 16, bottom: 36, left: 56 } as const;

/**
 * A panel spans two rows of its parent grid (header, chart) through `subgrid`, so headers of
 * different lengths still start both charts at the same height.
 */
export const PANEL_SECTION_CLASS =
  'grid grid-rows-[auto_1fr] gap-2 lg:row-span-2 lg:grid-rows-subgrid';
export const PANEL_HEADER_CLASS = 'flex flex-col gap-1';

/**
 * The grid the panels sit in: two equal columns that never grow to fit a wide child, such as a
 * table spanning both, so the paired charts always split the width evenly.
 */
export const PANEL_GRID_CLASS =
  'grid gap-x-6 gap-y-2 px-1 pt-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]';

/** Horizontal room an x-axis date label gets on a panel, so labels never crowd each other. */
const DATE_LABEL_PX = 72;
/** Horizontal room an interactivity label (at most three digits) gets on a bar panel. */
const BUCKET_LABEL_PX = 44;

/** How many date labels fit across a panel's plot width. */
export const panelLabelCount = (width: number) => Math.max(2, Math.floor(width / DATE_LABEL_PX));

/** Every nth bucket, from the first, so bar-panel labels fit the plot width. */
export function labeledBuckets(buckets: readonly number[], width: number): number[] {
  const step = Math.ceil(buckets.length / Math.max(2, Math.floor(width / BUCKET_LABEL_PX)));
  return buckets.filter((_, index) => index % step === 0);
}
