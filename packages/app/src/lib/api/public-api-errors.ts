import { NextResponse } from 'next/server';

/** Stable error strings exposed by public read endpoints and documented in OpenAPI. */
export const PUBLIC_API_ERRORS = {
  internal: 'Internal server error',
  notFound: 'Not found',
  unknownModel: 'Unknown model',
  invalidDate: 'Invalid date format (YYYY-MM-DD required)',
  benchmarkHistoryParameters: 'model, isl, and osl are required',
  idRequired: 'id is required (benchmark_result_id)',
  idsRequired: 'ids query param is required',
  noValidIds: 'no valid ids provided',
} as const;

/** Names the rejected query parameter and the values it accepts, as the views API does. */
export interface PublicApiErrorDetail {
  param: string;
  allowed: readonly string[];
}

export function publicApiError(
  error: string,
  status: number,
  detail?: PublicApiErrorDetail,
): NextResponse {
  return NextResponse.json({ error, ...detail }, { status });
}

export function tooManyIdsError(maxIds: number): string {
  return `too many ids (max ${maxIds})`;
}
