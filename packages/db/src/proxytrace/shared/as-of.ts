export const SNAPSHOT_START_ISO = '2026-06-08T20:12:49Z';

export const AS_OF_ISO = '2026-09-26T08:07:23Z';

export const SNAPSHOT_START_MS = Date.parse(SNAPSHOT_START_ISO);
export const AS_OF_MS = Date.parse(AS_OF_ISO);

export function asOfDate(): Date {
  return new Date(AS_OF_MS);
}
