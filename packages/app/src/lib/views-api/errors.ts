import { NextResponse } from 'next/server';

import { PUBLIC_API_ERRORS, publicApiError } from '@/lib/public-api-errors';

/**
 * Typed parameter-validation failure for the views API.
 *
 * Thrown by the parsers in `params.ts`; converted into a stable 400 JSON body
 * (`{ error, param, allowed? }`) by `runViewsRoute` so every views endpoint
 * reports invalid options the same way and documents its allowed values.
 */
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

/** Standard handler wrapper: param errors → 400 with allowed values, anything else → 500. */
export async function runViewsRoute(
  logLabel: string,
  handler: () => Promise<Response>,
): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
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
