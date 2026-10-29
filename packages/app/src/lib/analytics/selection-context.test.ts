import { describe, expect, it } from 'vitest';

import { selectionAnalyticsContext } from './selection-context';

describe('selectionAnalyticsContext', () => {
  it('maps the selection to canonical keys and joins precisions', () => {
    expect(
      selectionAnalyticsContext({
        model: 'DeepSeek-R1-0528',
        sequence: '8k/1k',
        precisions: ['fp4', 'fp8'],
        gpuCount: 3,
      }),
    ).toEqual({ model: 'DeepSeek-R1-0528', sequence: '8k/1k', precision: 'fp4,fp8', gpu_count: 3 });
  });

  it('leaves out missing or empty values but keeps a zero GPU count', () => {
    expect(
      selectionAnalyticsContext({ model: '', sequence: null, precisions: [], gpuCount: 0 }),
    ).toEqual({ gpu_count: 0 });
    expect(selectionAnalyticsContext({})).toEqual({});
  });
});
