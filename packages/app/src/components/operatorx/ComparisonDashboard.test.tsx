// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { OperatorXRawBundle } from '@semianalysisai/inferencex-db/operatorx/bundle';
import {
  buildComparison,
  type ComparisonView,
  comparisonView,
} from '@semianalysisai/inferencex-db/operatorx/compare';
import { normalizeBundle } from '@semianalysisai/inferencex-db/operatorx/normalize';
import { replaceClientSearch } from '@/lib/routing/client-navigation';

import type { ComparisonModel } from './compare/model';
import type { VizDefinition } from './viz/types';

const state = vi.hoisted(() => ({
  views: new Map<string | null, ComparisonView>(),
  models: [] as ComparisonModel[],
}));

vi.mock('next/navigation', () => ({ usePathname: () => '/operatorx' }));
vi.mock('@/hooks/api/use-operatorx', () => ({
  useOperatorXComparison: (_op: string, workload: string | null) => ({
    data: state.views.get(workload),
    error: null,
    isLoading: false,
    isPlaceholderData: false,
    refetch: () => undefined,
  }),
  prefetchOperatorXTimelines: () => undefined,
}));
vi.mock('./CaseDetail', () => ({ CaseDetail: () => null }));
// One eager card that records every model it renders.
vi.mock('./viz', () => ({
  VISUALIZATIONS: [
    {
      id: 'probe',
      title: 'Probe',
      ops: ['gemm'],
      Component: ({ model }) => {
        state.models.push(model);
        return null;
      },
    } satisfies VizDefinition,
  ],
}));

import { ComparisonDashboard } from './ComparisonDashboard';

const shape = (m: number, source: string) => ({
  type: 'gemm',
  args: { m, n: 64, k: 128, a: { dtype: 'bf16' }, b: { dtype: 'bf16' } },
  sources: [source],
});

function bundle(id: string, runner: string, sources: string[]): OperatorXRawBundle {
  const shapes = sources.map((source, i) => shape(64 * (i + 1), source));
  return {
    run: {
      run_id: id,
      run_attempt: 1,
      source_sha: 'a'.repeat(40),
      source_branch: 'main',
      generated_at: '2026-09-26T00:00:00Z',
      conclusion: 'success',
    },
    manifest: {
      include: [
        {
          id: 's1',
          runner: `cluster:${runner}`,
          mode: 'timing',
          backends: ['vllm'],
          cases: shapes.map((s) => ({ testlist: 'gemm', shape: s })),
        },
      ],
    },
    shards: [
      {
        id: 's1',
        attempt: 1,
        docs: [
          {
            run: { cluster: runner },
            rows: shapes.map((s) => ({
              testlist: 'gemm',
              op: { ...s, backend: 'vllm' },
              status: 'ok',
              metrics: { latency_us: 10 },
            })),
          },
        ],
      },
    ],
  };
}

// The gpt-oss workload runs on two GPUs and the DeepSeek workload on one, so switching
// workloads changes the GPU list the controls offer.
const comparison = buildComparison('gemm', [
  {
    runner: 'h200-dgxc',
    dataset: normalizeBundle(
      bundle('101', 'h200-dgxc', ['openai/gpt-oss-120b/k_proj', 'deepseek-ai/DeepSeek-V4-Pro/mlp']),
    ),
  },
  {
    runner: 'b200-nscale',
    dataset: normalizeBundle(bundle('102', 'b200-nscale', ['openai/gpt-oss-120b/k_proj'])),
  },
]);
const [shared, single] = comparison.workloads;
const sharedView = comparisonView(comparison, shared.id);
const singleView = comparisonView(comparison, single.id);

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  state.views = new Map([
    [null, sharedView],
    [shared.id, sharedView],
    [single.id, singleView],
  ]);
  state.models = [];
  window.history.replaceState(null, '', '/operatorx');
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const client = new QueryClient();
  act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <ComparisonDashboard op="gemm" />
      </QueryClientProvider>,
    ),
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('ComparisonDashboard deferred charts', () => {
  it('keeps the chart model until the deferred workload snapshot commits', () => {
    expect(shared.hardware).toHaveLength(2);
    expect(single.hardware).toHaveLength(1);
    expect(state.models).toHaveLength(1);
    expect(state.models[0].view).toBe(sharedView);

    act(() => replaceClientSearch(new URLSearchParams({ workload: single.id })));

    // The urgent render only updates the controls. The chart sees one new model, built from
    // the new view and its own GPU list, never the old view paired with the new GPU list.
    expect(state.models).toHaveLength(2);
    expect(state.models[1].view).toBe(singleView);
    expect(state.models[1].available).toEqual(single.hardware);
    expect(state.models[1].hardware).toEqual(single.hardware);
  });

  it('toggles legend GPUs within the GPU list the charts show', () => {
    const [first, second] = state.models[0].available;

    act(() => state.models.at(-1)!.toggle(first));
    expect(state.models.at(-1)!.hardware).toEqual([second]);

    // The last selected GPU stays selected, so the chart does not rebuild.
    const rendered = state.models.length;
    act(() => state.models.at(-1)!.toggle(second));
    expect(state.models).toHaveLength(rendered);

    act(() => state.models.at(-1)!.toggle(first));
    expect(state.models.at(-1)!.hardware).toEqual([first, second]);
  });
});
