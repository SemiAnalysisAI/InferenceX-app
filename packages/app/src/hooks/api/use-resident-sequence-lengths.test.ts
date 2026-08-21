import { describe, expect, it } from 'vitest';

import { chunkResidentPointIds } from './use-resident-sequence-lengths';

describe('chunkResidentPointIds', () => {
  it('keeps resident-point requests within the API limit', () => {
    const chunks = chunkResidentPointIds(Array.from({ length: 451 }, (_, index) => index + 1));
    expect(chunks.map((chunk) => chunk.length)).toEqual([200, 200, 51]);
  });
});
