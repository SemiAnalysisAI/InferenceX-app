import { POWER_METRIC_KEYS } from '@semianalysisai/inferencex-constants';
import { describe, expect, it } from 'vitest';

import { apiOperations, buildOpenApiDocument, getApiDocumentation } from './api-documentation';
import { POWER_VALIDITY_FILTERS } from './benchmark-power-validity';

const listBenchmarks = apiOperations.find((operation) => operation.id === 'list-benchmarks');
const benchmarkRowSchema = listBenchmarks?.responses.find((response) => response.status === '200')
  ?.schema.items;

describe('measured-power API documentation', () => {
  it('types every power metric key in the benchmarks metrics schema', () => {
    const metricsSchema = benchmarkRowSchema?.properties?.metrics;
    expect(metricsSchema).toBeDefined();
    expect(metricsSchema?.additionalProperties).toEqual({ type: 'number' });
    for (const key of POWER_METRIC_KEYS) {
      const property = metricsSchema?.properties?.[key];
      expect(property?.type, `${key} must be a typed number property`).toBe('number');
      expect(
        property?.description?.trim(),
        `${key} must carry a nonempty description`,
      ).toBeTruthy();
    }
  });

  it('documents optional power_invalid_reasons and power_audit row fields', () => {
    const reasons = benchmarkRowSchema?.properties?.power_invalid_reasons;
    expect(reasons?.type).toBe('array');
    expect(reasons?.items).toEqual({ type: 'string' });
    expect(reasons?.description).not.toMatch(/reserved|forthcoming/iu);

    const audit = benchmarkRowSchema?.properties?.power_audit;
    expect(audit?.description).not.toMatch(/reserved|forthcoming/iu);
    expect(Object.keys(audit?.properties ?? {}).toSorted()).toEqual(
      [
        'window_start_unix',
        'window_end_unix',
        'expected_gpu_count',
        'observed_gpu_count',
        'sample_count',
        'max_sample_gap_s',
        'producer_sha',
        'exporter_image_sha256',
      ].toSorted(),
    );
    expect(audit?.required).toBeUndefined();

    expect(benchmarkRowSchema?.required).not.toContain('power_invalid_reasons');
    expect(benchmarkRowSchema?.required).not.toContain('power_audit');
  });

  it('documents strictV2 as the only optional power filter without changing ordinary requests', () => {
    const document = buildOpenApiDocument('https://api-docs.test');
    const operation = (document.paths['/api/v1/benchmarks'] as Record<string, unknown>).get as {
      parameters: readonly { name: string; required: boolean; schema: unknown }[];
    };
    const names = operation.parameters.map((parameter) => parameter.name);
    expect(names).toContain('view');
    expect(names).toContain('sequence');

    const powerValid = operation.parameters.find((parameter) => parameter.name === 'powerValid');
    expect(powerValid?.schema).toEqual({
      type: 'string',
      enum: ['strictV2'],
    });
    expect(powerValid?.required).toBe(false);
    expect([...POWER_VALIDITY_FILTERS]).toEqual(['strictV2']);
    expect(listBenchmarks?.curlUrl).toBe(
      'https://inferencex.semianalysis.com/api/v1/benchmarks?model=DeepSeek-R1-0528',
    );
  });

  it('renders a bilingual measured-power schema note', () => {
    for (const locale of ['en', 'zh'] as const) {
      const note = getApiDocumentation(locale).schemaNotes.find(
        (candidate) => candidate.id === 'measured-power',
      );
      expect(note, `${locale} must expose a measured-power schema note`).toBeDefined();
      expect(note?.title.trim()).toBeTruthy();
      expect(note?.description.trim()).toBeTruthy();
      expect(note?.description).toContain('powerValid=strictV2');
      expect(note?.description).toContain('power_valid == 1');
      expect(note?.description).toContain('power_metric_schema_version == 2');
    }
    const zhNote = getApiDocumentation('zh').schemaNotes.find(
      (candidate) => candidate.id === 'measured-power',
    );
    expect(zhNote?.description).toMatch(/[㐀-鿿]/u);
  });
});
