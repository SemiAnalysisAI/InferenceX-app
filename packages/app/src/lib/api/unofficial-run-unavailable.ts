/** Why `/api/unofficial-run` has no data for a run that the caller can do nothing about. */
export const UNOFFICIAL_RUN_UNAVAILABLE_CODES = [
  'RUN_NOT_FOUND',
  'ARTIFACTS_EXPIRED',
  'NO_RESULTS',
  'RUN_IN_PROGRESS',
] as const;

export type UnofficialRunUnavailableCode = (typeof UNOFFICIAL_RUN_UNAVAILABLE_CODES)[number];

export function isUnofficialRunUnavailableCode(
  value: unknown,
): value is UnofficialRunUnavailableCode {
  return (UNOFFICIAL_RUN_UNAVAILABLE_CODES as readonly unknown[]).includes(value);
}
