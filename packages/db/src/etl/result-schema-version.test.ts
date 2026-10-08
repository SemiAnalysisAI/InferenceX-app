import { describe, expect, it } from 'vitest';

import { hasSupportedResultSchemaVersion } from './result-schema-version';

describe('hasSupportedResultSchemaVersion', () => {
  it('accepts unstamped rows from producers that predate the contract', () => {
    expect(hasSupportedResultSchemaVersion({ hw: 'h200-nv', conc: 64 })).toBe(true);
  });

  it('accepts version 1', () => {
    expect(hasSupportedResultSchemaVersion({ result_schema_version: 1, hw: 'h200-nv' })).toBe(true);
  });

  it.each([2, 0, '1', null, true, 1.5])('refuses result_schema_version %j', (version) => {
    expect(hasSupportedResultSchemaVersion({ result_schema_version: version })).toBe(false);
  });
});
