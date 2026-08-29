import { describe, expect, it } from 'vitest';

import { workflowRunCountLabel } from './WorkflowInfoDisplay';

describe('workflow run count label', () => {
  it('preserves the English label and uses natural Chinese counting syntax', () => {
    expect(workflowRunCountLabel(2, 5, 'en')).toBe('Run 2/5');
    expect(workflowRunCountLabel(2, 5, 'zh')).toBe('第 2 次运行（共 5 次）');
  });
});
