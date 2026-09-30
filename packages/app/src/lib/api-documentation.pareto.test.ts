import { describe, expect, it } from 'vitest';
import { apiOperations, buildOpenApiDocument, getApiDocumentation } from './api-documentation';
import { PARETO_PARAMETERS, parseParetoRequest } from './pareto-api';

describe('Pareto public contract', () => {
  it('documents the accepted parameters and a parseable example URL', () => {
    const operation = apiOperations.find((item) => item.id === 'get-pareto')!;
    expect(operation.parameters.map((item) => item.name)).toEqual([...PARETO_PARAMETERS]);
    expect(parseParetoRequest(new URL(operation.curlUrl).searchParams).selection).toMatchObject({
      rawModel: 'dsr1',
      sequence: '1k/1k',
      xDirection: 'max',
      yDirection: 'max',
    });
    expect(operation.responses.map((item) => item.status)).toEqual(['200', '400', '500']);
  });

  it('publishes frontier and hinterland observation schemas and rejects chart share params', () => {
    const document = buildOpenApiDocument();
    const path = document.paths['/api/v1/pareto'] as
      | { get?: { parameters?: readonly { name: string }[] } }
      | undefined;
    expect(path?.get).toBeDefined();
    const parameterNames = (path?.get?.parameters ?? []).map((item) => item.name);
    expect(parameterNames).not.toContain('i_frontier');
    expect(parameterNames).not.toContain('i_hinterland');

    const schema = document.components.schemas.ParetoBoundaries;
    expect(schema.required).toEqual([
      'source_url',
      'selection',
      'counts',
      'frontier',
      'hinterland',
    ]);
    for (const boundary of ['frontier', 'hinterland'] as const) {
      const point = schema.properties![boundary].items!;
      expect(point.required).toEqual(['x', 'y', 'observations']);
      expect(point.properties!.observations.items!.properties).toHaveProperty('run_url');
      expect(point.properties!.observations.items!.properties).toHaveProperty('date');
    }
  });

  it.each(['en', 'zh'] as const)(
    'keeps %s docs from advertising chart share params as API inputs',
    (locale) => {
      const operation = getApiDocumentation(locale)
        .groups.flatMap((group) => group.operations)
        .find((item) => item.id === 'get-pareto')!;
      expect(operation.parameters.map((item) => item.name)).not.toContain('i_frontier');
      expect(operation.parameters.map((item) => item.name)).not.toContain('i_hinterland');
      // Prose must still name the retired share keys so agents do not invent them as query params.
      expect(operation.description).toMatch(/i_hinterland/u);
      expect(operation.description).toMatch(/i_frontier=1/u);
      if (locale === 'zh') expect(operation.description).toMatch(/[㐀-鿿]/u);
    },
  );
});
