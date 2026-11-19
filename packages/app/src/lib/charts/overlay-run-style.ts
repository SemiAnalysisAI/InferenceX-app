const RUN_PALETTE_SIZE = 8;

export function overlayRunColor(runIndex: number): string {
  const slot = ((runIndex % RUN_PALETTE_SIZE) + RUN_PALETTE_SIZE) % RUN_PALETTE_SIZE;
  return `var(--overlay-run-${slot})`;
}

const ROOFLINE_DASH_BY_RUN: readonly string[] = [
  '6 3',
  '2 3',
  '10 3 2 3',
  '5 3 2 3 2 3',
  '12 2',
  '3 1',
];
export function overlayRooflineDasharray(runIndex: number): string {
  return ROOFLINE_DASH_BY_RUN[
    ((runIndex % ROOFLINE_DASH_BY_RUN.length) + ROOFLINE_DASH_BY_RUN.length) %
      ROOFLINE_DASH_BY_RUN.length
  ];
}

export function overlayRunIndex(
  runUrl: string | null | undefined,
  map: Record<string, number>,
): number {
  if (!runUrl) return 0;
  if (runUrl in map) return map[runUrl];
  const idMatch = runUrl.match(/\/runs\/(?<runId>\d+)/u);
  if (idMatch && idMatch[1] in map) return map[idMatch[1]];
  return 0;
}
