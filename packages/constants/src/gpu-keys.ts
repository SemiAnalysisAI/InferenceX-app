/** Canonical set of GPU key strings used across all packages. */
export const GPU_KEYS = new Set([
  'h100',
  'h200',
  'b200',
  'b300',
  'gb200',
  'gb300',
  'mi300x',
  'mi325x',
  'mi355x',
]);

/** Maps each GPU key to its vendor for display grouping. */
export const GPU_VENDORS: Record<string, string> = {
  h100: 'NVIDIA',
  h200: 'NVIDIA',
  b200: 'NVIDIA',
  b300: 'NVIDIA',
  gb200: 'NVIDIA',
  gb300: 'NVIDIA',
  mi300x: 'AMD',
  mi325x: 'AMD',
  mi355x: 'AMD',
};
