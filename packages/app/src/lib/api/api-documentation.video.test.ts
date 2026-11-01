import { describe, expect, it } from 'vitest';
import { buildOpenApiDocument } from './api-documentation';
import { RESULT_CSV_COLUMNS } from '@/components/video-benchmark/results-csv';
import { toCsv } from '@/lib/views-api/csv';

describe('VideoGenX overview API documentation', () => {
  it('documents the overview-only CSV representation and format selector', () => {
    const document = buildOpenApiDocument('https://api-docs.test');
    const operation = (document.paths['/api/v1/views/video'] as Record<string, unknown>).get as {
      parameters: { name: string; schema: unknown; description: string }[];
      responses: Record<string, { content: Record<string, unknown> }>;
    };
    const format = operation.parameters.find((parameter) => parameter.name === 'format');
    expect(format?.schema).toEqual({ type: 'string', enum: ['json', 'csv'], default: 'json' });
    expect(format?.description).toContain('only with view=overview');
    expect(operation.responses['200'].content).toHaveProperty('application/json');
    expect(operation.responses['200'].content).toHaveProperty('text/csv');
    expect(operation.responses['200'].content['text/csv']).toMatchObject({
      example: toCsv([], RESULT_CSV_COLUMNS),
    });
  });
});
