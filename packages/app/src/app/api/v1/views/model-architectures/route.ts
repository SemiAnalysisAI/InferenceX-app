import type { NextRequest } from 'next/server';

import { Model } from '@/lib/catalog/data-mappings';
import { MODEL_ARCHITECTURES } from '@/lib/catalog/model-architectures';
import { COMPARE_MODEL_SLUGS } from '@/lib/compare/compare-slug';
import { runViewsRoute, ViewsApiParamError } from '@/lib/views-api/errors';
import { validateParams } from '@/lib/views-api/params';
import { VIEW_QUERY_PARAMS } from '@/lib/views-api/registry';

export const dynamic = 'force-dynamic';

/** Compiled architecture facts shared with the model pages; no benchmark or run reads. */
export function GET(request: NextRequest): Promise<Response> {
  return runViewsRoute('model-architectures', () => {
    const search = request.nextUrl.searchParams;
    validateParams(search, VIEW_QUERY_PARAMS['model-architectures']);
    const requested = search.get('model');
    const model =
      requested === null
        ? null
        : (Object.values(Model).find((value) => value === requested) ??
          COMPARE_MODEL_SLUGS.find((entry) => entry.slug === requested)?.displayName);
    if (requested !== null && !model) {
      throw new ViewsApiParamError('model', `Unknown model: ${requested}`, [
        ...Object.values(Model),
        ...COMPARE_MODEL_SLUGS.map((entry) => entry.slug),
      ]);
    }

    const models = Object.values(MODEL_ARCHITECTURES)
      .filter((architecture) => model === null || architecture.model === model)
      .map((architecture) => ({
        slug:
          COMPARE_MODEL_SLUGS.find((entry) => entry.displayName === architecture.model)?.slug ??
          null,
        architecture,
      }));

    return Promise.resolve(
      Response.json(
        { view: 'model-architectures', apiVersion: 'v1', params: { model }, models },
        { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=300' } },
      ),
    );
  });
}
