// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  writeUrlParams: vi.fn(),
  refreshUrlParamsOnNavigation: vi.fn(() => true),
  readUrlParams: vi.fn(() => ({}) as Record<string, string>),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/model/test-model',
}));

vi.mock('@/lib/url-state', () => ({
  readUrlParams: mocks.readUrlParams,
  refreshUrlParamsOnNavigation: mocks.refreshUrlParamsOnNavigation,
  writeUrlParams: mocks.writeUrlParams,
}));

import { EphemeralUrlStateContext, useEphemeralUrlState, useUrlState } from './useUrlState';

let root: Root | undefined;
let container: HTMLDivElement | undefined;
let hookValue: ReturnType<typeof useUrlState> | undefined;
let ephemeralValue: boolean | undefined;

function Probe() {
  hookValue = useUrlState();
  ephemeralValue = useEphemeralUrlState();
  return null;
}

function mount(ui: React.ReactElement): void {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(ui));
}

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.writeUrlParams.mockClear();
  mocks.readUrlParams.mockReturnValue({});
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  hookValue = undefined;
  ephemeralValue = undefined;
});

describe('useUrlState outside an ephemeral scope', () => {
  it('writes params to the shared store', () => {
    mount(<Probe />);
    expect(ephemeralValue).toBe(false);

    act(() => hookValue?.setUrlParam('i_gpus', 'B200_vllm'));
    expect(mocks.writeUrlParams).toHaveBeenCalledWith({ i_gpus: 'B200_vllm' });

    act(() => hookValue?.setUrlParams({ g_model: 'Kimi-K3', i_seq: 'agentic-traces' }));
    expect(mocks.writeUrlParams).toHaveBeenCalledWith({
      g_model: 'Kimi-K3',
      i_seq: 'agentic-traces',
    });
  });
});

describe('useUrlState inside an ephemeral scope', () => {
  // The /model/[slug] embed reuses the dashboard providers, whose URL-sync
  // effects write every state change (auto-selected chip configs included)
  // into the module-scoped share-link store. Inside the ephemeral scope those
  // writes must be dropped, or Back-navigating to a bare /inference rebuilds
  // with the embed's auto-populated state instead of the user's own.
  it('drops writes so embed state cannot leak into the dashboard', () => {
    mount(
      <EphemeralUrlStateContext.Provider value={true}>
        <Probe />
      </EphemeralUrlStateContext.Provider>,
    );
    expect(ephemeralValue).toBe(true);

    act(() => hookValue?.setUrlParam('i_gpus', 'B200_vllm,GB200_dynamo'));
    act(() => hookValue?.setUrlParams({ g_model: 'Kimi-K3' }));
    expect(mocks.writeUrlParams).not.toHaveBeenCalled();
  });

  it('still reads params (share links into the embed keep working)', () => {
    mocks.readUrlParams.mockReturnValue({ i_gpus: 'MI355X_atom' });
    mount(
      <EphemeralUrlStateContext.Provider value={true}>
        <Probe />
      </EphemeralUrlStateContext.Provider>,
    );

    expect(hookValue?.getUrlParam('i_gpus')).toBe('MI355X_atom');
    expect(hookValue?.hasUrlParam('i_gpus')).toBe(true);
  });
});
