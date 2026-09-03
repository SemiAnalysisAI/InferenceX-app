import { describe, expect, it } from 'vitest';

import { localizeThroughputSeriesName } from './server-metric-cards';
import { offloadHaloLabel } from '../ui/OffloadHaloLegendKey';

describe('localizeThroughputSeriesName', () => {
  it('localizes every generated throughput legend series in Chinese', () => {
    expect(localizeThroughputSeriesName('Input (avg n=50)', 'zh')).toBe('输入（50 点均值）');
    expect(localizeThroughputSeriesName('Decode (avg n=50)', 'zh')).toBe('解码（50 点均值）');
    expect(localizeThroughputSeriesName('Total running avg (60s burn-in)', 'zh')).toBe(
      '总吞吐量平均值（剔除前 60 秒）',
    );
  });

  it('preserves the generated English series names byte-for-byte', () => {
    expect(localizeThroughputSeriesName('Input (avg n=50)', 'en')).toBe('Input (avg n=50)');
    expect(localizeThroughputSeriesName('Decode (avg n=50)', 'en')).toBe('Decode (avg n=50)');
    expect(localizeThroughputSeriesName('Total running avg (60s burn-in)', 'en')).toBe(
      'Total running avg (60s burn-in)',
    );
  });

  it('localizes the offload halo key while preserving the exact English label', () => {
    expect(offloadHaloLabel('en')).toBe('KV offload ON');
    expect(offloadHaloLabel('zh')).toBe('KV offload 已开启');
  });
});
