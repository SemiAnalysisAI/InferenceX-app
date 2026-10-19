import { describe, expect, it } from 'vitest';

import {
  CACHE_BASES,
  CACHE_OVERALL_SOURCES,
  CACHE_STATUS_CLASSES,
  CACHE_VALIDITY_METRIC_KEYS,
  cacheCoreSchemaVersion,
  cacheVocabularyCode,
  cacheVocabularyName,
  strictBooleanCode,
} from './cache-validity';
import { METRIC_KEYS } from './metric-keys';

describe('cache-validity vocabularies', () => {
  it('keeps the producer status classes in code order', () => {
    // Codes are stored in the DB; reordering would silently remap ingested rows.
    expect(
      CACHE_STATUS_CLASSES.map((name) => cacheVocabularyCode(CACHE_STATUS_CLASSES, name)),
    ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(cacheVocabularyCode(CACHE_STATUS_CLASSES, 'NOT_EVALUATED')).toBe(9);
    expect(cacheVocabularyCode(CACHE_BASES, 'combined')).toBe(2);
    expect(cacheVocabularyCode(CACHE_OVERALL_SOURCES, 'router_estimate')).toBe(3);
  });

  it('drops absent values and marks unrecognised ones as 0', () => {
    expect(cacheVocabularyCode(CACHE_STATUS_CLASSES, undefined)).toBeUndefined();
    expect(cacheVocabularyCode(CACHE_STATUS_CLASSES, null)).toBeUndefined();
    expect(cacheVocabularyCode(CACHE_STATUS_CLASSES, 'VALID_COMPLETE_V2')).toBe(0);
    expect(cacheVocabularyCode(CACHE_BASES, 1)).toBe(0);
  });

  it('decodes only codes it issued', () => {
    expect(cacheVocabularyName(CACHE_STATUS_CLASSES, 2)).toBe('VALID_ZERO');
    for (const code of [undefined, 0, -1, 1.5, 10]) {
      expect(cacheVocabularyName(CACHE_STATUS_CLASSES, code)).toBeUndefined();
    }
  });

  it('reads the core version and refuses detail schemas as cores', () => {
    expect(cacheCoreSchemaVersion('infx-cache-validity-core/1')).toBe(1);
    expect(cacheCoreSchemaVersion('infx-cache-validity-core/2')).toBe(2);
    expect(cacheCoreSchemaVersion('atom-cache-validity/1')).toBe(0);
    expect(cacheCoreSchemaVersion('infx-cache-validity-core/x')).toBe(0);
    for (const loose of ['01', '1.0', '1e0', ' 1', '']) {
      expect(cacheCoreSchemaVersion(`infx-cache-validity-core/${loose}`)).toBe(0);
    }
    expect(cacheCoreSchemaVersion(1)).toBe(0);
    expect(cacheCoreSchemaVersion(undefined)).toBeUndefined();
  });

  it('accepts only JSON booleans for eligibility flags and marks other values invalid', () => {
    expect(strictBooleanCode(true)).toBe(1);
    expect(strictBooleanCode(false)).toBe(0);
    for (const value of ['true', 1, 0, 'yes']) {
      expect(strictBooleanCode(value)).toBe(-1);
    }
    for (const value of [null, undefined]) {
      expect(strictBooleanCode(value)).toBeUndefined();
    }
  });

  it('registers every key ETL writes', () => {
    for (const key of CACHE_VALIDITY_METRIC_KEYS) expect(METRIC_KEYS.has(key)).toBe(true);
  });
});
