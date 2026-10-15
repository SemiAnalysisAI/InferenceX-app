export type EvalSampleFilter = 'all' | 'passed' | 'failed';

export interface EvalSampleWindow {
  readonly filter: EvalSampleFilter;
  readonly offset: number;
  readonly limit: number;
}

export const EVAL_SAMPLE_FILTER_ERROR = 'filter must be one of: all, passed, failed';

const ALLOWED_FILTERS: Readonly<Record<EvalSampleFilter, true>> = {
  all: true,
  passed: true,
  failed: true,
};
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

/** Parse the pagination/filter contract shared by stored and live evaluation samples. */
export function parseEvalSampleWindow(
  params: URLSearchParams,
): EvalSampleWindow | { readonly error: string } {
  const filterParam = params.get('filter') ?? 'all';
  if (!Object.hasOwn(ALLOWED_FILTERS, filterParam)) {
    return { error: EVAL_SAMPLE_FILTER_ERROR };
  }

  const parsedOffset = Math.trunc(Number(params.get('offset') ?? '0'));
  const offset = Number.isFinite(parsedOffset) ? Math.max(0, parsedOffset) : 0;
  const parsedLimit = Math.trunc(Number(params.get('limit') ?? String(DEFAULT_LIMIT)));
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(MAX_LIMIT, Math.max(1, parsedLimit || DEFAULT_LIMIT))
    : DEFAULT_LIMIT;

  return { filter: filterParam as EvalSampleFilter, offset, limit };
}
