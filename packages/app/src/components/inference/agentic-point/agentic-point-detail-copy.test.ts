import { describe, expect, it } from 'vitest';

import { AGENTIC_POINT_DETAIL_STRINGS } from './agentic-point-detail';

describe('agentic point detail copy', () => {
  it('composes the Chinese warmup note without repeating warmup', () => {
    const copy = AGENTIC_POINT_DETAIL_STRINGS.zh;
    const note = `${copy.warmupNotePrefix}${copy.warmupWord}${copy.warmupNoteBody}`;

    expect(note).toMatch(/^当前显示 warmup 阶段/u);
    expect(note).not.toContain('warmup warmup');
  });
});
