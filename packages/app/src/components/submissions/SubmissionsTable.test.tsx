// @test-environment jsdom
import { describe, expect, it } from 'bun:test';

import type { SubmissionSummaryRow } from '@/lib/submissions/submissions-types';
import { $, $$, click, contains, eventually, get, isVisible, render, type } from '@/test/dom';

import SubmissionsTable from './SubmissionsTable';

const baseRow: Omit<SubmissionSummaryRow, 'spec_method' | 'hardware' | 'date'> = {
  model: 'dsr1',
  framework: 'vllm',
  precision: 'fp8',
  disagg: false,
  is_multinode: false,
  num_prefill_gpu: 4,
  num_decode_gpu: 4,
  prefill_tp: 4,
  prefill_ep: 1,
  decode_tp: 4,
  decode_ep: 1,
  total_datapoints: 10,
  distinct_sequences: 2,
  distinct_concurrencies: 5,
  max_concurrency: 64,
  image: null,
};

const rows: SubmissionSummaryRow[] = [
  { ...baseRow, hardware: 'h200', spec_method: 'mtp', date: '2026-05-13' },
  { ...baseRow, hardware: 'b300', spec_method: 'eagle', date: '2026-05-12' },
  { ...baseRow, hardware: 'mi355x', spec_method: 'none', date: '2026-05-11' },
];

const bodyRows = () => $$('tbody tr');
const visible = (element: Element) => expect(isVisible(element)).toBe(true);

describe('SubmissionsTable — Spec Method column', () => {
  it('renders canonical spec_method labels and shows an em-dash for "none"', () => {
    render(<SubmissionsTable data={rows} />);
    visible(contains('td', 'MTP'));
    visible(contains('td', 'EAGLE'));
    visible(contains('—', undefined, contains('tbody tr', 'MI355X')));
  });

  it('sorts by spec_method when the header is clicked', async () => {
    render(<SubmissionsTable data={rows} />);
    click(get('button', contains('th', 'Spec Method')));
    await eventually(() => {
      expect(bodyRows()[0].textContent).toContain('MI355X');
      expect(bodyRows().at(-1)!.textContent).toContain('B300');
    });
    click(get('button', contains('th', 'Spec Method')));
    await eventually(() => {
      expect(bodyRows()[0].textContent).toContain('B300');
      expect(bodyRows().at(-1)!.textContent).toContain('MI355X');
    });
  });

  it('filters rows when the search query matches a spec_method', async () => {
    render(<SubmissionsTable data={rows} />);
    type(get('input[placeholder="Search configs"]'), 'eagle');
    await eventually(() => {
      expect(bodyRows()).toHaveLength(1);
      expect(bodyRows()[0].textContent).toContain('B300');
    });
  });
});

describe('SubmissionsTable — Image diff in expanded row', () => {
  const OLD = 'lmsysorg/sglang:v0.5.9-cu130';
  const NEW = 'lmsysorg/sglang:v0.5.11-cu130';
  const diffRows: SubmissionSummaryRow[] = [
    { ...baseRow, hardware: 'h200', spec_method: 'mtp', date: '2026-05-12', image: OLD },
    { ...baseRow, hardware: 'h200', spec_method: 'mtp', date: '2026-05-13', image: NEW },
    {
      ...baseRow,
      hardware: 'b300',
      spec_method: 'eagle',
      date: '2026-05-13',
      image: 'rocm/sgl-dev:rocm720',
    },
  ];

  it('shows previous → current image on the bump-day row', async () => {
    render(<SubmissionsTable data={diffRows} />);
    click(bodyRows()[0]);
    const diff = await eventually(() => get('[data-testid="submissions-image-diff"]'));
    visible(diff);
    visible(contains(OLD, undefined, diff));
    visible(contains('→', undefined, diff));
    visible(contains(NEW, undefined, diff));
  });

  it('renders just the current image when there is no preceding run', async () => {
    render(<SubmissionsTable data={diffRows} />);
    click(contains('tbody tr', 'B300'));
    await eventually(() => {
      const expanded = contains('tbody tr', 'B300').nextElementSibling!;
      expect($('[data-testid="submissions-image-diff"]', expanded)).toBeNull();
      visible(contains('rocm/sgl-dev:rocm720', undefined, expanded));
    });
  });
});
