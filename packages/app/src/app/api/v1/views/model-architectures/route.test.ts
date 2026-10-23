import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { Model } from '@/lib/catalog/data-mappings';
import { MODEL_ARCHITECTURES } from '@/lib/catalog/model-architectures';
import { COMPARE_MODEL_SLUGS } from '@/lib/compare/compare-slug';
import { GET } from './route';

const request = (query = '') =>
  new NextRequest(`http://localhost/api/v1/views/model-architectures${query}`);

describe('GET /api/v1/views/model-architectures', () => {
  it('returns the complete UI architecture registry without rounding or dropping optional facts', async () => {
    const response = await GET(request());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=0, s-maxage=300');
    expect(body).toEqual({
      view: 'model-architectures',
      apiVersion: 'v1',
      params: { model: null },
      models: Object.values(MODEL_ARCHITECTURES).map((architecture) => ({
        slug:
          COMPARE_MODEL_SLUGS.find((entry) => entry.displayName === architecture.model)?.slug ??
          null,
        architecture,
      })),
    });
    expect(
      body.models.find((entry: { slug: string }) => entry.slug === 'kimi-k3').architecture,
    ).toMatchObject({ numLayers: 93, hiddenSize: 7168, numExperts: 898, activeExperts: 16 });
  });

  it('resolves a canonical slug and exact display name to the same single model', async () => {
    const slugResponse = await GET(request('?model=kimi-k3'));
    const slug = await slugResponse.json();
    const nameResponse = await GET(request(`?model=${encodeURIComponent(Model.Kimi_K3)}`));
    const name = await nameResponse.json();
    expect(slug).toEqual(name);
    expect(slug.params).toEqual({ model: Model.Kimi_K3 });
    expect(slug.models).toEqual([
      { slug: 'kimi-k3', architecture: MODEL_ARCHITECTURES[Model.Kimi_K3] },
    ]);
  });

  it('includes registry models without a canonical content slug', async () => {
    const response = await GET(request(`?model=${encodeURIComponent(Model.Llama3_1_70B)}`));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.models).toEqual([
      { slug: null, architecture: MODEL_ARCHITECTURES[Model.Llama3_1_70B] },
    ]);
  });

  it.each([
    ['?model=missing', 'model'],
    ['?model=', 'model'],
    ['?model=kimi', 'model'],
    ['?model=kimi-k3&model=deepseek-r1', 'model'],
    ['?format=csv', 'format'],
    ['?unofficialrun=123', 'unofficialrun'],
    ['?runId=123', 'runId'],
  ])('rejects unsupported selection %s instead of widening its scope', async (query, param) => {
    const response = await GET(request(query));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ param, error: expect.any(String) });
  });
});
