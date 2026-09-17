import { describe, expect, it } from 'vitest';
import { apiOperations, buildOpenApiDocument, getApiDocumentation } from './api-documentation';
import { PARETO_PARAMETERS, parseParetoRequest } from './pareto-api';

describe('Pareto public contract', () => {
  it('documents the exact accepted parameters and a runnable example', () => {
    const operation = apiOperations.find((item) => item.id === 'get-pareto')!;
    expect(operation.parameters.map((item) => item.name)).toEqual([...PARETO_PARAMETERS]);
    expect(parseParetoRequest(new URL(operation.curlUrl).searchParams).selection.rawModel).toBe(
      'dsr1',
    );
    expect(operation.responses.map((item) => item.status)).toEqual(['200', '400', '500']);
  });
  it('publishes both boundaries with typed source observations in OpenAPI', () => {
    const document = buildOpenApiDocument();
    expect(document.paths['/api/v1/pareto']).toBeDefined();
    const schema = document.components.schemas.ParetoBoundaries;
    expect(schema.required).toEqual([
      'source_url',
      'selection',
      'counts',
      'frontier',
      'hinterland',
    ]);
    for (const boundary of ['frontier', 'hinterland']) {
      const point = schema.properties![boundary].items!;
      expect(point.required).toEqual(['x', 'y', 'observations']);
      expect(point.properties!.observations.items!.properties).toHaveProperty('run_url');
      expect(point.properties!.observations.items!.properties).toHaveProperty('date');
    }
  });
  it.each(['en', 'zh'] as const)(
    'renders %s scope, caveats, and chart share parameters',
    (locale) => {
      const operation = getApiDocumentation(locale)
        .groups.flatMap((group) => group.operations)
        .find((item) => item.id === 'get-pareto')!;
      expect(operation.summary).toContain('Pareto');
      expect(operation.description).toContain('i_frontier/i_hinterland=1');
      expect(operation.description).toContain('powerValid=strictV2');
      expect(operation.description).toContain('Optimal Only');
      if (locale === 'zh') expect(operation.description).toMatch(/[㐀-鿿]/u);
    },
  );
});
