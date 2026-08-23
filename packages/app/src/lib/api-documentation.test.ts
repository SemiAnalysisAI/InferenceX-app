import { describe, expect, it } from 'vitest';

import { getApiDocumentation } from './api-documentation';

describe('Chinese API documentation copy', () => {
  it('uses the established evaluation and speculative-decoding terminology', () => {
    const documentation = getApiDocumentation('zh');
    const availability = documentation.groups
      .flatMap((group) => group.operations)
      .find((operation) => operation.id === 'get-availability');
    const evaluations = documentation.groups
      .flatMap((group) => group.operations)
      .find((operation) => operation.id === 'list-evaluations');

    expect(availability?.description).toContain('投机解码方式');
    expect(evaluations?.summary).toContain('评估');
    expect(evaluations?.description).toContain('评估结果');
  });
});
