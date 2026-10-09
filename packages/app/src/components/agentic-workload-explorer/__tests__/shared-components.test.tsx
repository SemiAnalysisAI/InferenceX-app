// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TrendsLineChart, TrendsStackedChart, type LineSeries } from '../trends-charts';
import { buildHistogram, DistributionHistogram } from '../distribution-histogram';
import { DAY_RANGES, RangeToggle } from '../range-toggle';
import { ModelFilter } from '../model-filter';

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));
vi.mock('@/lib/use-locale', () => ({ useLocale: () => 'en' }));
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => false }));
vi.mock('@/hooks/useResponsiveChartDimensions', () => ({
  useResponsiveChartDimensions: ({ height }: { height: number }) => ({
    dimensions: { width: 640, height },
    setContainerRef: () => {},
  }),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const SERIES: LineSeries[] = [
  {
    key: 'model/<unsafe>',
    label: '<script>not markup</script>',
    color: '#ff0000',
    points: [
      { day: '2026-09-23', value: 5 },
      { day: '2026-09-25', value: 15 },
    ],
  },
  {
    key: 'other',
    label: 'Other',
    color: '#0000ff',
    points: [{ day: '2026-09-24', value: 10 }],
  },
];

describe('shared D3 explorer charts', () => {
  it('renders shared line/point layers and keeps missing-day gaps', () => {
    act(() => root.render(<TrendsLineChart title="Trend" series={SERIES} filename="trend.png" />));
    const lines = container.querySelectorAll('.line-path');
    expect(lines).toHaveLength(2);
    expect(lines[0].getAttribute('d')?.match(/M/g)).toHaveLength(2);
    expect(lines[0].getAttribute('stroke')).toBe('#ff0000');
    expect(lines[1].getAttribute('stroke')).toBe('#0000ff');
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('[data-testid="d3-chart-svg"]')).not.toBeNull();
    expect(container.querySelectorAll('.point')).toHaveLength(3);
  });

  it('sorts non-ISO Date strings before plotting and does not turn zero into a gap', () => {
    act(() =>
      root.render(
        <TrendsLineChart
          title="Dates"
          filename="dates.png"
          series={[
            {
              key: 'dates',
              label: 'Dates',
              color: '#123456',
              points: [
                { day: new Date('2026-09-25').toString(), value: 5 },
                { day: new Date('2026-09-23').toString(), value: 0 },
              ],
            },
          ]}
        />,
      ),
    );
    const path = container.querySelector('.line-path')!.getAttribute('d')!;
    expect(path).not.toContain('NaN');
    expect(path.match(/M/g)).toHaveLength(1);
    expect(path).toContain('L');
  });

  it('has finite geometry for single-point and empty line series', () => {
    act(() =>
      root.render(<TrendsLineChart title="Single" filename="single.png" series={[SERIES[1]]} />),
    );
    expect(container.querySelector('.line-path')!.getAttribute('d')).not.toContain('NaN');
    act(() =>
      root.render(
        <TrendsLineChart
          title="Empty"
          filename="empty.png"
          series={[]}
          emptyLabel="Nothing here"
        />,
      ),
    );
    expect(container.textContent).toContain('Nothing here');
    expect(container.querySelectorAll('.line-path')).toHaveLength(0);
  });

  it('normalizes each stacked day to 100% and keeps zero-total days finite', () => {
    act(() =>
      root.render(
        <TrendsStackedChart
          title="Share"
          filename="share.png"
          mode="share"
          days={[
            { day: '2026-09-23', values: { a: 1, b: 3 } },
            { day: '2026-09-24', values: { a: 0, b: 0 } },
          ]}
          seriesKeys={['a', 'b']}
          labelFor={(key) => key}
          colorFor={(key) => (key === 'a' ? '#ff0000' : '#0000ff')}
        />,
      ),
    );
    const bars = [...container.querySelectorAll('.stacked-segment')];
    expect(bars).toHaveLength(4);
    expect(Number(bars[1].getAttribute('height'))).toBeCloseTo(
      Number(bars[0].getAttribute('height')) * 3,
    );
    expect(Number(bars[2].getAttribute('height'))).toBe(0);
    expect(Number(bars[3].getAttribute('height'))).toBe(0);
    expect(container.innerHTML).not.toContain('NaN');
    expect(container.textContent).toContain('100%');
    act(() => bars[0].dispatchEvent(new MouseEvent('mouseenter', { bubbles: true })));
    expect(bars[0].getAttribute('opacity')).toBe('1');
    expect(bars[1].getAttribute('opacity')).toBe('0.2');
    act(() => bars[0].dispatchEvent(new MouseEvent('mouseleave', { bubbles: true })));
    expect(bars[1].getAttribute('opacity')).toBe('1');
  });

  it('updates stack geometry when switching to count mode', () => {
    const props = {
      title: 'Counts',
      filename: 'counts.png',
      days: [{ day: '2026-09-23', values: { a: 3, b: 7 } }],
      seriesKeys: ['a', 'b'],
      labelFor: (key: string) => key,
      colorFor: () => '#123456',
    };
    act(() => root.render(<TrendsStackedChart {...props} mode="share" />));
    const percentHeight = Number(
      container.querySelector('.stacked-segment')!.getAttribute('height'),
    );
    act(() => root.render(<TrendsStackedChart {...props} mode="count" />));
    expect(Number(container.querySelector('.stacked-segment')!.getAttribute('height'))).not.toBe(
      percentHeight,
    );
    expect(container.textContent).not.toContain('100%');
  });

  it('renders localized empty-stack copy without invalid SVG coordinates', () => {
    act(() =>
      root.render(
        <TrendsStackedChart
          title="Empty"
          filename="empty.png"
          mode="share"
          days={[]}
          seriesKeys={[]}
          labelFor={(key) => key}
          colorFor={() => '#123456'}
          emptyLabel="No samples"
        />,
      ),
    );
    expect(container.textContent).toContain('No samples');
    expect(container.innerHTML).not.toContain('NaN');
  });
});

describe('shared histogram renderer', () => {
  it('preserves the p95 cutoff and reports omitted samples', () => {
    const entries = Array.from({ length: 100 }, (_, request) => ({
      request,
      value: request === 99 ? 100000 : request,
    }));
    const buckets = buildHistogram(entries, 10);
    expect(buckets.reduce((sum, bucket) => sum + bucket.entries.length, 0)).toBe(99);
    act(() =>
      root.render(
        <DistributionHistogram
          buckets={buckets}
          percentiles={[{ label: 'p50', value: 50 }]}
          total={100}
          format={String}
          axisLabel="Tokens"
        />,
      ),
    );
    expect(container.textContent).toContain('+1 above');
    expect(container.querySelectorAll('.histogram-guide')).toHaveLength(1);
    expect(container.querySelectorAll('.histogram-bar')).toHaveLength(10);
  });

  it('keeps an identical-value histogram narrow and preserves bucket selection', () => {
    const onBucketClick = vi.fn();
    const buckets = buildHistogram(
      [
        { request: 0, value: 5 },
        { request: 1, value: 5 },
      ],
      10,
    );
    act(() =>
      root.render(
        <DistributionHistogram
          buckets={buckets}
          percentiles={[]}
          format={String}
          axisLabel="Tokens"
          selectedIdx={0}
          onBucketClick={onBucketClick}
        />,
      ),
    );
    const bar = container.querySelector('.histogram-bar')!;
    expect(bar.getAttribute('width')).toBe('32');
    expect(bar.getAttribute('opacity')).toBe('0.9');
    act(() => bar.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onBucketClick).toHaveBeenCalledWith(0);
  });

  it('renders an empty histogram without indexing missing buckets', () => {
    expect(buildHistogram([], 10)).toEqual([]);
    act(() =>
      root.render(
        <DistributionHistogram buckets={[]} percentiles={[]} format={String} axisLabel="Tokens" />,
      ),
    );
    expect(container.textContent).toContain('No data');
    expect(container.querySelectorAll('.histogram-bar')).toHaveLength(0);
  });
});

describe('shared controls', () => {
  it('keeps range selection, titles and pressed semantics through SegmentedToggle', () => {
    const onChange = vi.fn();
    act(() => root.render(<RangeToggle value="7d" options={DAY_RANGES} onChange={onChange} />));
    const buttons = container.querySelectorAll('button');
    expect(container.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe(
      'Time range',
    );
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[1].title).toBe("Snapshot's final 14 days");
    act(() => buttons[1].click());
    expect(onChange).toHaveBeenCalledWith('14d');
  });

  it('renders the shared accessible model selector and omits it without models', () => {
    act(() =>
      root.render(
        <ModelFilter
          models={['all', 'model:<unsafe>']}
          selectedModel={null}
          onModelChange={() => {}}
        />,
      ),
    );
    expect(container.querySelector('[role="combobox"]')?.getAttribute('aria-label')).toBe(
      'All models',
    );
    expect(container.textContent).toContain('All models');
    act(() =>
      root.render(<ModelFilter models={[]} selectedModel={null} onModelChange={() => {}} />),
    );
    expect(container.innerHTML).toBe('');
  });
});
