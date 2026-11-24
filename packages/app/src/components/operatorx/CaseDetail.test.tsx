// @test-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

import { buildComparison, comparisonView } from '@semianalysisai/inferencex-db/operatorx/compare';
import { normalizeBundle } from '@semianalysisai/inferencex-db/operatorx/normalize';
import type { OperatorXTimeline } from '@semianalysisai/inferencex-db/operatorx/timeline';

import { settle } from '@/test/helpers';

import { caseRefs } from './compare/model';

const tracked: [string, Record<string, unknown>][] = [];
const timelines: Record<string, OperatorXTimeline> = {};

mock.module('@/lib/analytics/analytics', () => ({
  track: (event: string, properties: Record<string, unknown>) => {
    tracked.push([event, properties]);
  },
}));
mock.module('@/hooks/api/use-operatorx', () => ({
  useOperatorXTimelines: () => ({
    data: timelines,
    error: null,
    isLoading: false,
    refetch: () => undefined,
  }),
}));

import { CaseDetail } from './CaseDetail';

// The table shows `cutlass::Kernel2<…>`; the tooltip and the expanded row show all of it.
const LONG =
  'cutlass::Kernel2<cutlass_80_tensorop_bf16_s16816gemm_relu_bf16_64x64_64x4_tn_align8>(cutlass_80_tensorop_bf16_s16816gemm_relu_bf16_64x64_64x4_tn_align8::Params)';

const view = comparisonView(
  buildComparison('gemm', [
    {
      runner: 'h200-dgxc',
      dataset: normalizeBundle({
        run: {
          run_id: '101',
          run_attempt: 1,
          source_sha: 'a'.repeat(40),
          source_branch: 'main',
          generated_at: '2026-09-26T00:00:00Z',
          conclusion: 'success',
        },
        manifest: { include: [] },
        shards: [
          {
            id: 's1',
            attempt: 1,
            docs: [
              {
                run: { cluster: 'h200-dgxc' },
                rows: [
                  {
                    testlist: 'gemm',
                    op: {
                      type: 'gemm',
                      args: { m: 64, n: 64, k: 128, a: { dtype: 'bf16' }, b: { dtype: 'bf16' } },
                      backend: 'vllm',
                    },
                    status: 'ok',
                    metrics: { latency_us: 20 },
                  },
                ],
              },
            ],
          },
        ],
      }),
    },
  ]),
  null,
);
const hardware = view.hardware.map((h) => h.id);

let root: Root;
let container: HTMLDivElement;

const dialog = () => document.querySelector<HTMLElement>('[data-testid="operatorx-case-detail"]')!;
const toggle = () => dialog().querySelector<HTMLButtonElement>('tbody button')!;
const tooltip = () => document.querySelector('[role="tooltip"]');

beforeEach(() => {
  tracked.length = 0;
  const [{ ref }] = caseRefs(view, hardware, 0);
  timelines[ref] = {
    spanUs: 20,
    busyUs: 20,
    gapUs: 0,
    overlapUs: 0,
    lanes: ['7'],
    names: [LONG, 'elementwise_kernel'],
    categories: ['gemm', 'memory'],
    events: [
      [0, 0, 0, 15],
      [1, 0, 15, 5],
    ],
    kernels: [0, 1].map((name) => ({
      name,
      usPerCall: 10,
      countPerCall: 1,
      grid: null,
      block: null,
      regs: null,
      smemBytes: null,
      occupancyPct: null,
    })),
    truncated: false,
    ranks: null,
  };
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root.render(
      <CaseDetail
        op="gemm"
        view={view}
        hardware={hardware}
        colors={{}}
        caseIndex={0}
        onClose={() => undefined}
      />,
    ),
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('CaseDetail kernel names', () => {
  it('opens on the dialog itself, so no kernel name tooltip pops up', () => {
    expect(toggle().textContent).toBe('cutlass::Kernel2<…>');
    expect(document.activeElement).toBe(dialog());
    expect(tooltip()).toBeNull();
  });

  it('shows the full name in a tooltip on keyboard focus', async () => {
    act(() => toggle().focus());
    await settle();
    expect(tooltip()?.textContent).toBe(LONG);
  });

  it('expands the full, selectable name when the row is tapped and collapses it again', () => {
    const row = toggle().closest('tr')!;
    act(() => row.lastElementChild!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    const full = dialog().querySelector('[data-testid="operatorx-kernel-name"]');
    expect(full?.textContent).toBe(LONG);
    expect(full?.closest('button')).toBeNull();
    expect(toggle().getAttribute('aria-expanded')).toBe('true');

    act(() => toggle().click());
    expect(dialog().querySelector('[data-testid="operatorx-kernel-name"]')).toBeNull();
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(tracked).toEqual([
      ['operatorx_kernel_name_toggled', { op: 'gemm', gpu: hardware[0], enabled: true }],
      ['operatorx_kernel_name_toggled', { op: 'gemm', gpu: hardware[0], enabled: false }],
    ]);
  });

  it('shows the hovered timeline bar’s full name', async () => {
    const bar = dialog().querySelector('[data-testid="operatorx-timeline"] .h-5 > span')!;
    act(() => bar.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
    await settle();
    expect(tooltip()?.textContent).toBe(LONG);
  });
});
