import { NextResponse } from 'next/server';

import { PUBLIC_API_ERRORS, publicApiError } from '@/lib/api/public-api-errors';
import { ViewsUpstreamError } from './upstream-error';

export { ViewsUpstreamError } from './upstream-error';

export class ViewsApiParamError extends Error {
  readonly param: string;
  readonly allowed?: readonly string[];

  constructor(param: string, message: string, allowed?: readonly string[]) {
    super(message);
    this.name = 'ViewsApiParamError';
    this.param = param;
    this.allowed = allowed;
  }
}

export async function runViewsRoute(
  logLabel: string,
  handler: () => Promise<Response>,
): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof ViewsUpstreamError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status, headers: { 'Cache-Control': 'private, no-store' } },
      );
    }
    if (error instanceof ViewsApiParamError) {
      return NextResponse.json(
        {
          error: error.message,
          param: error.param,
          ...(error.allowed ? { allowed: error.allowed } : {}),
        },
        { status: 400 },
      );
    }
    console.error(`Error building ${logLabel} view:`, error);
    return publicApiError(PUBLIC_API_ERRORS.internal, 500);
  }
}
