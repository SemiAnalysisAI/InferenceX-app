import { describe, expect, it } from 'vitest';

import { resolveRunDate } from './run-date';

describe('resolveRunDate', () => {
  it('replaces a stale single-turn date with the latest agentic date', () => {
    expect(resolveRunDate(['2026-07-09', '2026-07-10'], '2026-07-04', true)).toBe('2026-07-10');
  });

  it('preserves an available date chosen by the user', () => {
    expect(resolveRunDate(['2026-07-09', '2026-07-10'], '2026-07-09', true)).toBe('2026-07-09');
  });
});
