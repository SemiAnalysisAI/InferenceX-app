import { describe, expect, it } from 'bun:test';

import { metricChartTitle, metricLabel } from '@/lib/charts/chart-utils';

import { chartDefinitions } from '../metric-registry';
import { inferenceTableHeaderLabels } from '../ui/InferenceTable';
import { powerXGpuWording, surfaceMetricText } from './powerx-gpu-wording';

const chart = chartDefinitions.find((definition) => definition.chartType === 'interactivity')!;

describe('PowerX GPU wording', () => {
  it('titles and labels Power draw per GPU on PowerX and per Chip on /infx', () => {
    const title = metricChartTitle(chart, 'y_measuredAvgPower', 'en');
    const label = metricLabel(chart, 'y_measuredAvgPower', 'en');
    expect(surfaceMetricText(title, true, 'en')).toBe('Measured Average Power per GPU');
    expect(surfaceMetricText(label, true, 'en')).toBe('Measured Avg Power per GPU (W)');
    expect(surfaceMetricText(title, false, 'en')).toBe('Measured Average Power per Chip');
    expect(surfaceMetricText(label, false, 'en')).toBe('Measured Avg Power per Chip (W)');

    const zhLabel = metricLabel(chart, 'y_measuredAvgPower', 'zh');
    expect(surfaceMetricText(zhLabel, true, 'zh')).toBe('每 GPU 实测平均功耗（W）');
    expect(surfaceMetricText(zhLabel, false, 'zh')).toBe('每芯片实测平均功耗（W）');
  });

  it('renames units with the words and leaves other words alone', () => {
    expect(powerXGpuWording('Token Throughput per Chip (tok/s/chip)', 'en')).toBe(
      'Token Throughput per GPU (tok/s/GPU)',
    );
    expect(powerXGpuWording('每芯片 token 吞吐量（tok/s/chip）', 'zh')).toBe(
      '每 GPU token 吞吐量（tok/s/GPU）',
    );
    expect(powerXGpuWording('Physical Chips', 'en')).toBe('Physical GPUs');
    expect(powerXGpuWording('Microchip chipset', 'en')).toBe('Microchip chipset');
    expect(powerXGpuWording('实测整组 GPU P75 功耗（按芯片均摊，W）', 'zh')).toBe(
      '实测整组 GPU P75 功耗（按 GPU 均摊，W）',
    );
  });

  it('says GPU in PowerX table headers and keeps /infx headers', () => {
    const infx = inferenceTableHeaderLabels(chart, 'y_measuredAvgPower', 'en');
    const powerX = inferenceTableHeaderLabels(chart, 'y_measuredAvgPower', 'en', true);
    expect(infx).toMatchObject({ chip: 'Chip', yMetric: 'Measured Avg Power per Chip (W)' });
    expect(powerX).toMatchObject({
      chip: 'GPU',
      physicalChips: 'Physical GPUs',
      throughput: 'Throughput/GPU (tok/s)',
      measuredGpuPower: 'Measured GPU Power (W/GPU)',
      yMetric: 'Measured Avg Power per GPU (W)',
    });
    expect(inferenceTableHeaderLabels(chart, 'y_measuredAvgPower', 'zh', true)).toMatchObject({
      chip: 'GPU',
      physicalChips: '物理 GPU 数',
      measuredGpuPower: 'GPU 实测功耗 (W/GPU)',
    });
  });
});
