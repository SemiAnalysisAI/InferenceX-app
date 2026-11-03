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
    expect(operation.responses['200'].content).toHaveProperty('application/json');
    expect(operation.responses['200'].content).toHaveProperty('text/csv');
    expect(operation.responses['200'].content['text/csv']).toMatchObject({
      example: toCsv([], RESULT_CSV_COLUMNS),
    });
  });
  it('distinguishes native diagnostic media from its original CI context', () => {
    const document = buildOpenApiDocument('https://api-docs.test');
    const schema = Object.values(document.components.schemas).find(
      (value) => 'properties' in value && value.properties?.clipQuality,
    )!;
    expect(schema).toMatchObject({
      properties: {
        overlayCells: { type: 'array' },
        overlayDeploymentCells: { type: 'array' },
        clipQuality: {
          properties: {
            groups: {
              items: {
                properties: {
                  scope: { enum: ['ci', 'matched-noise-diagnostic'] },
                  take: { type: ['integer', 'null'] },
                  clips: {
                    items: {
                      properties: {
                        pointId: { type: ['string', 'null'] },
                        contextPointId: { type: ['string', 'null'] },
                        slotId: { type: ['string', 'null'] },
                        quality: {
                          properties: {
                            status: { enum: ['measured', 'identical', 'incompatible'] },
                            psnrDb: { type: ['number', 'null'] },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
  });
});
