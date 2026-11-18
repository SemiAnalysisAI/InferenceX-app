// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { InferenceData } from '@/components/inference/types';
import type * as PowerXSurface from '@/components/inference/ui/powerx-surface';
import {
  clearPowerTraceFocus,
  peekPowerTraceFocus,
} from '@/components/inference/utils/powerTimeline';
import { writeUrlParams } from '@/lib/routing/url-state';

import { PowerXPinnedStrip } from './PowerXPinnedStrip';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  point: null as InferenceData | null,
  details: undefined as ((close: () => void) => ReactNode) | undefined,
  setSelectedYAxisMetric: vi.fn(),
  setActivePoint: vi.fn(),
}));
vi.mock('@/lib/analytics/analytics', () => ({ track: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/pwx' }));
vi.mock('@/components/inference/InferenceContext', () => ({
  useInferenceActions: () => ({ setSelectedYAxisMetric: mocks.setSelectedYAxisMetric }),
}));
vi.mock('@/components/inference/ui/powerx-surface', async (importOriginal) => ({
  ...(await importOriginal<typeof PowerXSurface>()),
  usePowerXActivePoint: () =>
    mocks.point ? { point: mocks.point, source: 'pinned', details: mocks.details } : null,
  useSetPowerXActivePoint: () => mocks.setActivePoint,
}));

const RUN_URL = 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/34716669498';
const AUDIT_NAME =
  'dsv4_8k1k_fp4_sglang_tp8-pp1-dcp1-pcp1-ep1-dpafalse_disagg-false_spec-none_conc64_b200-host-0123';

const pinned = {
  id: 980001,
  hwKey: 'gb300_dynamo-vllm',
  precision: 'fp4',
  x: 45,
  y: 0.82,
  conc: 48,
  tp: 8,
  disagg: true,
  num_prefill_gpu: 16,
  num_decode_gpu: 16,
  run_url: RUN_URL,
  power_audit: { source: `power_validation_${AUDIT_NAME}.json` },
  measuredAvgPower: { y: 900, roof: false },
  measuredPrefillAvgPower: { y: 700, roof: false },
  measuredDecodeAvgPower: { y: 1000, roof: false },
} as unknown as InferenceData;

function mountStrip(role: 'all' | 'decode') {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <PowerXPinnedStrip
        tab="draw"
        role={role}
        metric="y_measuredAvgPower"
        formatValue={(point) => String(point.y)}
        onSeeBreakdown={vi.fn()}
      />,
    ),
  );
  return {
    host,
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

describe('PowerX pinned strip', () => {
  afterEach(() => {
    mocks.point = null;
    mocks.details = undefined;
    const pending = peekPowerTraceFocus();
    if (pending) clearPowerTraceFocus(pending);
  });

  it('opens the power trace focused on the point, keeping the GPU role', () => {
    window.history.replaceState(null, '', '/pwx?g_model=Kimi-K3&i_role=decode&i_ptconc=1');
    writeUrlParams({ i_role: 'decode', i_metric: 'y_measuredAvgPower', i_ptconc: '1' });
    mocks.point = pinned;
    const { host, unmount } = mountStrip('decode');
    const link = host.querySelector<HTMLAnchorElement>('[data-testid="powerx-pinned-trace"]')!;
    const url = new URL(link.href);
    expect(url.searchParams.get('i_metric')).toBe('y_measuredPowerTimeline');
    expect(url.searchParams.get('i_role')).toBe('decode');
    expect(url.searchParams.get('i_ptfocus')).toBe(`34716669498:${AUDIT_NAME}`);
    expect(url.searchParams.has('i_ptconc')).toBe(false);

    act(() => link.click());
    expect(peekPowerTraceFocus()).toBe(`34716669498:${AUDIT_NAME}`);
    expect(mocks.setSelectedYAxisMetric).toHaveBeenCalledWith('y_measuredPowerTimeline');
    // Under a role a disaggregated point shows each pool's W per GPU.
    expect(host.querySelector('[data-testid="powerx-pinned-decode"]')?.textContent).toContain(
      '1,000',
    );
    unmount();
  });

  it('reads an aggregated point under a role as aggregated, with no pool figures', () => {
    mocks.point = { ...pinned, disagg: false } as InferenceData;
    const { host, unmount } = mountStrip('decode');
    expect(host.querySelector('[data-testid="powerx-pinned-pools"]')?.textContent).toContain(
      'aggregated',
    );
    expect(host.querySelector('[data-testid="powerx-pinned-decode"]')).toBeNull();
    unmount();
  });

  it('opens the point details beside the ranking from Details, and Unpin clears the pin', () => {
    mocks.point = pinned;
    const { host, unmount } = mountStrip('all');
    // No details renderer (the old legend holds the details panel): no Details action.
    expect(host.querySelector('[data-testid="powerx-pinned-details"]')).toBeNull();
    unmount();

    const close = vi.fn();
    mocks.details = (onClose) => (
      <button type="button" data-testid="details-panel" onClick={() => (close(), onClose())}>
        Run 34716669498
      </button>
    );
    const second = mountStrip('all');
    const details = second.host.querySelector<HTMLButtonElement>(
      '[data-testid="powerx-pinned-details"]',
    )!;
    expect(details.textContent).toBe('Details');
    act(() => details.click());
    const panel = document.querySelector<HTMLButtonElement>('[data-testid="details-panel"]')!;
    expect(panel.textContent).toContain('34716669498');
    act(() => panel.click());
    expect(close).toHaveBeenCalled();
    expect(document.querySelector('[data-testid="details-panel"]')).toBeNull();

    act(() =>
      second.host.querySelector<HTMLButtonElement>('[data-testid="powerx-pinned-unpin"]')!.click(),
    );
    expect(mocks.setActivePoint).toHaveBeenCalledWith('clear');
    second.unmount();
  });
});
