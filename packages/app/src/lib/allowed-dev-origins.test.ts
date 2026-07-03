import { describe, expect, it } from 'vitest';

import { allowedDevOriginsFromEnv } from './allowed-dev-origins';

describe('allowedDevOriginsFromEnv', () => {
  it('returns an empty list for unset or blank values', () => {
    expect(allowedDevOriginsFromEnv(undefined)).toEqual([]);
    expect(allowedDevOriginsFromEnv('')).toEqual([]);
    expect(allowedDevOriginsFromEnv('   ')).toEqual([]);
  });

  it('trims whitespace and removes empty entries', () => {
    expect(
      allowedDevOriginsFromEnv(' dev-machine.local , , local-origin.dev , *.local-origin.dev '),
    ).toEqual(['dev-machine.local', 'local-origin.dev', '*.local-origin.dev']);
  });
});
