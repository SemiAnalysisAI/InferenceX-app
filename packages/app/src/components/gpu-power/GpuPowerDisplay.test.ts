import { describe, expect, it } from 'vitest';

import { getGpuRunConclusionLabel } from './GpuPowerDisplay';

describe('getGpuRunConclusionLabel', () => {
  it.each([
    ['success', '成功'],
    ['failure', '失败'],
    ['cancelled', '已取消'],
    ['skipped', '已跳过'],
    ['timed_out', '超时'],
    ['startup_failure', '启动失败'],
    ['action_required', '需要处理'],
    ['neutral', '中立'],
    ['stale', '已过期'],
  ])('localizes the %s conclusion in Chinese', (conclusion, expected) => {
    expect(getGpuRunConclusionLabel(conclusion, 'zh')).toBe(expected);
  });

  it('preserves the exact English conclusion', () => {
    expect(getGpuRunConclusionLabel('success', 'en')).toBe('success');
  });

  it('preserves an unknown conclusion in either locale', () => {
    expect(getGpuRunConclusionLabel('future_status', 'zh')).toBe('future_status');
    expect(getGpuRunConclusionLabel('future_status', 'en')).toBe('future_status');
  });
});
