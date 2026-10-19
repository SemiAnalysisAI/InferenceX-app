import { describe, expect, it } from 'vitest';
import { pointRunLink } from './run-link';

const url = 'https://github.com/SemiAnalysisAI/InferenceX-Private-TPU/actions/runs/1';
describe('TPU result links', () => {
  it.each(['en', 'zh'] as const)(
    'opens localized logs without changing producer identity (%s)',
    (locale) => {
      const prefix = locale === 'zh' ? '/zh' : '';
      const point = { id: 123, hwKey: 'tpuv7_vllm', run_url: url };
      expect(pointRunLink(url, point, locale)).toEqual({
        href: `${prefix}/inference/logs/123`,
        isLog: true,
      });
      expect(pointRunLink(url, { ...point, benchmark_type: 'agentic_traces' }, locale)).toEqual({
        href: `${prefix}/inference/agentic/123?view=logs`,
        isLog: true,
      });
      expect(point.run_url).toBe(url);
    },
  );
  it('omits links for unpersisted TPU overlays and preserves other hardware links', () => {
    expect(pointRunLink(url, { hwKey: 'tpuv7_vllm' })).toBeNull();
    expect(pointRunLink(url, { id: NaN, hardware: 'tpuv7' })).toBeNull();
    expect(pointRunLink(url, { hwKey: 'b200' })).toEqual({ href: url, isLog: false });
    expect(pointRunLink(null, { id: 123, hardware: 'tpuv7' })).toBeNull();
  });
});
